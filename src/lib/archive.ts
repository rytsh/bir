import { AsyncGunzip, gzip, unzip, zip } from "fflate";

export interface ArchiveEntry {
  name: string;
  data: Uint8Array;
}

export const ARCHIVE_LIMIT: number = 256 * 1024 * 1024;
export const ENTRY_LIMIT: number = 5000;

export function safeArchivePath(name: string): string {
  const path: string = name.replace(/\\/g, "/");
  if (!path || path.startsWith("/") || /^[a-z]:/i.test(path) || path.split("/").some((part) => part === "..") || /[\x00-\x1f\x7f]/.test(path)) {
    throw new Error(`Unsafe archive path: ${JSON.stringify(name)}. Absolute paths and parent traversal are not allowed.`);
  }
  const clean: string = path.split("/").filter((part) => part && part !== ".").join("/");
  if (!clean || ["__proto__", "constructor", "prototype"].includes(clean)) throw new Error("Please use a different file path.");
  return clean;
}

function verifyEntries(entries: ArchiveEntry[]): ArchiveEntry[] {
  if (entries.length > ENTRY_LIMIT) throw new Error(`Archives are limited to ${ENTRY_LIMIT} files.`);
  if (entries.reduce((sum, entry) => sum + entry.data.length, 0) > ARCHIVE_LIMIT) throw new Error("Expanded data exceeds the 256 MB safety limit.");
  const names: Set<string> = new Set();
  for (const entry of entries) {
    entry.name = safeArchivePath(entry.name);
    if (names.has(entry.name)) throw new Error(`Duplicate archive path: ${entry.name}`);
    names.add(entry.name);
  }
  return entries;
}

export function parseTar(data: Uint8Array): ArchiveEntry[] {
  const decoder: TextDecoder = new TextDecoder();
  const entries: ArchiveEntry[] = [];
  const text = (start: number, length: number): string => decoder.decode(data.subarray(start, start + length)).split("\0")[0];
  let offset: number = 0;
  while (offset + 512 <= data.length) {
    const header: Uint8Array = data.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const expected: number = parseInt(text(offset + 148, 8).trim(), 8);
    const actual: number = header.reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0);
    if (expected !== actual) throw new Error("Invalid TAR header checksum. The archive may be corrupted.");
    const size: number = parseInt(text(offset + 124, 12).trim() || "0", 8);
    if (!Number.isSafeInteger(size) || size < 0 || offset + 512 + size > data.length) throw new Error("Truncated or unsupported TAR entry.");
    const type: number = data[offset + 156];
    const prefix: string = text(offset + 345, 155);
    const name: string = `${prefix ? `${prefix}/` : ""}${text(offset, 100)}`;
    if (type === 0 || type === 48) {
      entries.push({ name: safeArchivePath(name), data: data.slice(offset + 512, offset + 512 + size) });
      if (entries.length > ENTRY_LIMIT) throw new Error("Too many files in this archive.");
    } else if (type !== 53) {
      throw new Error("This TAR contains links, PAX, or GNU extended entries. Only regular USTAR files and folders are supported; re-export as ZIP or USTAR.");
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (!entries.length) throw new Error("No regular files found. Choose a ZIP, USTAR TAR, or GZIP file.");
  return verifyEntries(entries);
}

export function createTar(input: ArchiveEntry[]): Uint8Array {
  const entries: ArchiveEntry[] = verifyEntries(input);
  const length: number = entries.reduce((sum, entry) => sum + 512 + Math.ceil(entry.data.length / 512) * 512, 1024);
  if (length > ARCHIVE_LIMIT) throw new Error("TAR output exceeds 256 MB. Select fewer files.");
  const output: Uint8Array = new Uint8Array(length);
  const encoder: TextEncoder = new TextEncoder();
  let offset: number = 0;
  const put = (value: string, at: number, max: number): void => {
    const encoded: Uint8Array = encoder.encode(value);
    if (encoded.length > max) throw new Error("A path is too long for USTAR. Use ZIP instead.");
    output.set(encoded, at);
  };
  for (const entry of entries) {
    let name: string = entry.name;
    let prefix: string = "";
    if (encoder.encode(name).length > 100) {
      const split: number = name.lastIndexOf("/");
      if (split < 0) throw new Error("A filename is too long for TAR. Use ZIP instead.");
      prefix = name.slice(0, split);
      name = name.slice(split + 1);
    }
    put(name, offset, 100);
    put("0000644\0", offset + 100, 8);
    put("0000000\0", offset + 108, 8);
    put("0000000\0", offset + 116, 8);
    put(`${entry.data.length.toString(8).padStart(11, "0")}\0`, offset + 124, 12);
    put("00000000000\0", offset + 136, 12);
    output.fill(32, offset + 148, offset + 156);
    output[offset + 156] = 48;
    put("ustar\0", offset + 257, 6);
    put("00", offset + 263, 2);
    put(prefix, offset + 345, 155);
    const checksum: number = output.subarray(offset, offset + 512).reduce((sum, byte) => sum + byte, 0);
    put(`${checksum.toString(8).padStart(6, "0")}\0 `, offset + 148, 8);
    output.set(entry.data, offset + 512);
    offset += 512 + Math.ceil(entry.data.length / 512) * 512;
  }
  return output;
}

export async function readArchive(data: Uint8Array, name: string): Promise<ArchiveEntry[]> {
  if (data.length > 128 * 1024 * 1024) throw new Error("Choose an archive smaller than 128 MB.");
  if (data[0] === 0x50 && data[1] === 0x4b) {
    let size: number = 0;
    let count: number = 0;
    let issue: string = "";
    const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) => unzip(data, {
      filter: (file) => {
        try { safeArchivePath(file.name); } catch (error) { issue = (error as Error).message; return false; }
        if (file.name.endsWith("/")) return false;
        size += file.originalSize;
        count++;
        if (size > ARCHIVE_LIMIT || count > ENTRY_LIMIT) { issue = "ZIP exceeds the 256 MB / 5000 file safety limit."; return false; }
        return true;
      },
    }, (error, result) => error ? reject(error) : resolve(result)));
    if (issue) throw new Error(issue);
    return verifyEntries(Object.entries(files).map(([path, bytes]) => ({ name: path, data: bytes })));
  }
  if (data[0] === 0x1f && data[1] === 0x8b) {
    if (data.length < 18) throw new Error("Truncated GZIP file.");
    const expanded: number = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(data.length - 4, true);
    if (expanded > ARCHIVE_LIMIT) throw new Error("GZIP expands beyond the 256 MB safety limit.");
    // Feed small compressed chunks to bound individual decompression allocations,
    // and enforce the cumulative limit independently of the untrusted trailer.
    const result: Uint8Array = await new Promise((resolve, reject) => {
      const chunks: Uint8Array[] = [];
      let total: number = 0;
      let offset: number = 0;
      const stream: AsyncGunzip = new AsyncGunzip((error, bytes, final) => {
        if (error) { stream.terminate(); reject(error); return; }
        total += bytes.length;
        if (total > ARCHIVE_LIMIT) { stream.terminate(); reject(new Error("GZIP expands beyond the 256 MB safety limit.")); return; }
        chunks.push(bytes);
        if (final) {
          const output: Uint8Array = new Uint8Array(total);
          let at: number = 0;
          chunks.forEach((chunk) => { output.set(chunk, at); at += chunk.length; });
          stream.terminate(); resolve(output);
        }
      });
      const feed = (): void => {
        const end: number = Math.min(offset + 16_384, data.length);
        const chunk: Uint8Array = data.slice(offset, end); offset = end;
        stream.push(chunk, offset === data.length);
      };
      stream.ondrain = (): void => { if (offset < data.length) feed(); };
      feed();
    });
    if (/\.(tar\.gz|tgz)$/i.test(name)) return parseTar(result);
    return [{ name: safeArchivePath(name.replace(/\.gz$/i, "") || "file"), data: result }];
  }
  return parseTar(data);
}

export async function writeArchive(entries: ArchiveEntry[], format: "zip" | "tar" | "tar.gz", level: number): Promise<Uint8Array> {
  verifyEntries(entries);
  if (format === "zip") {
    const files: Record<string, Uint8Array> = Object.create(null);
    for (const entry of entries) files[entry.name] = entry.data;
    return new Promise((resolve, reject) => zip(files, { level: level as 0 | 6 | 9 }, (error, bytes) => error ? reject(error) : resolve(bytes)));
  }
  const tar: Uint8Array = createTar(entries);
  if (format === "tar") return tar;
  return new Promise((resolve, reject) => gzip(tar, { level: level as 0 | 6 | 9 }, (error, bytes) => error ? reject(error) : resolve(bytes)));
}
