import { AsyncGunzip, gzip, unzip, zip } from "fflate";

export interface ArchiveEntry {
  name: string;
  data: Uint8Array;
}

export interface ArchiveOptions {
  enforceLimits?: boolean;
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

function verifyEntries(entries: ArchiveEntry[], options: ArchiveOptions = {}): ArchiveEntry[] {
  if (options.enforceLimits !== false && entries.length > ENTRY_LIMIT) throw new Error(`Archives are limited to ${ENTRY_LIMIT} files.`);
  if (options.enforceLimits !== false && entries.reduce((sum, entry) => sum + entry.data.length, 0) > ARCHIVE_LIMIT) throw new Error("Expanded data exceeds the 256 MB safety limit.");
  const names: Set<string> = new Set();
  for (const entry of entries) {
    entry.name = safeArchivePath(entry.name);
    if (names.has(entry.name)) throw new Error(`Duplicate archive path: ${entry.name}`);
    names.add(entry.name);
  }
  return entries;
}

export function parseTar(data: Uint8Array, options: ArchiveOptions = {}): ArchiveEntry[] {
  const decoder: TextDecoder = new TextDecoder();
  const entries: ArchiveEntry[] = [];
  const text = (start: number, length: number): string => decoder.decode(data.subarray(start, start + length)).split("\0")[0];
  const readPax = (payload: Uint8Array): Map<string, string> => {
    const fields: Map<string, string> = new Map();
    let at: number = 0;
    while (at < payload.length) {
      const space: number = payload.indexOf(32, at);
      const lengthText: string = decoder.decode(payload.subarray(at, space < 0 ? at : space));
      const length: number = Number(lengthText);
      if (!/^\d+$/.test(lengthText) || !Number.isSafeInteger(length) || length <= space - at + 1 || at + length > payload.length || payload[at + length - 1] !== 10) {
        throw new Error("Invalid PAX metadata record.");
      }
      const record: string = decoder.decode(payload.subarray(space + 1, at + length - 1));
      const equals: number = record.indexOf("=");
      if (equals <= 0) throw new Error("Invalid PAX metadata record.");
      const key: string = record.slice(0, equals);
      if (key.startsWith("GNU.sparse.") || (key === "SCHILY.filetype" && record.slice(equals + 1) === "sparse")) {
        throw new Error("Sparse TAR files are not supported. Re-export without sparse entries.");
      }
      fields.set(key, record.slice(equals + 1));
      at += length;
    }
    return fields;
  };
  const globalPax: Map<string, string> = new Map();
  let localPax: Map<string, string> = new Map();
  let longName: string | null = null;
  let total: number = 0;
  let offset: number = 0;
  while (offset + 512 <= data.length) {
    const header: Uint8Array = data.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const expected: number = parseInt(text(offset + 148, 8).trim(), 8);
    const actual: number = header.reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0);
    if (expected !== actual) throw new Error("Invalid TAR header checksum. The archive may be corrupted.");
    const type: number = data[offset + 156];
    const extended: boolean = type === 120 || type === 103 || type === 76 || type === 75;
    const fields: Map<string, string> = new Map([...globalPax, ...localPax]);
    const paxSize: string | undefined = extended ? undefined : fields.get("size");
    if (paxSize && !/^\d+$/.test(paxSize)) throw new Error("Invalid PAX entry size.");
    const size: number = paxSize ? Number(paxSize) : parseInt(text(offset + 124, 12).trim() || "0", 8);
    if (!Number.isSafeInteger(size) || size < 0 || offset + 512 + size > data.length) throw new Error("Truncated or unsupported TAR entry.");
    if (extended) {
      if (type === 120 || type === 103) {
        const parsed: Map<string, string> = readPax(data.subarray(offset + 512, offset + 512 + size));
        if (type === 103) {
          for (const [key, value] of parsed) {
            if (value === "") globalPax.delete(key);
            else globalPax.set(key, value);
          }
        } else {
          for (const [key, value] of parsed) localPax.set(key, value);
        }
      } else if (type === 76) {
        longName = text(offset + 512, size);
      }
      // GNU long-link targets (K) are metadata; actual links are rejected below.
      offset += 512 + Math.ceil(size / 512) * 512;
      continue;
    }
    // GNU headers reuse the USTAR prefix area for other metadata.
    const prefix: string = text(offset + 257, 6) === "ustar" && data[offset + 262] === 0 ? text(offset + 345, 155) : "";
    const name: string = fields.get("path") || longName || `${prefix ? `${prefix}/` : ""}${text(offset, 100)}`;
    if (type === 0 || type === 48) {
      total += size;
      if (options.enforceLimits !== false && total > ARCHIVE_LIMIT) throw new Error("Expanded data exceeds the 256 MB safety limit.");
      entries.push({ name: safeArchivePath(name), data: data.slice(offset + 512, offset + 512 + size) });
      if (options.enforceLimits !== false && entries.length > ENTRY_LIMIT) throw new Error("Too many files in this archive.");
    } else if (type === 49 || type === 50) {
      throw new Error("This TAR contains symbolic or hard links, which are not supported. Re-export with links dereferenced as regular files.");
    } else if (type !== 53) {
      throw new Error(`Unsupported TAR entry type ${JSON.stringify(String.fromCharCode(type))}. Only regular files and folders are supported.`);
    }
    localPax = new Map();
    longName = null;
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (!entries.length) throw new Error("No regular files found. Choose a ZIP, TAR, or GZIP file.");
  return verifyEntries(entries, options);
}

export function createTar(input: ArchiveEntry[], options: ArchiveOptions = {}): Uint8Array {
  const entries: ArchiveEntry[] = verifyEntries(input, options);
  const length: number = entries.reduce((sum, entry) => sum + 512 + Math.ceil(entry.data.length / 512) * 512, 1024);
  if (options.enforceLimits !== false && length > ARCHIVE_LIMIT) throw new Error("TAR output exceeds 256 MB. Select fewer files.");
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

export async function readArchive(data: Uint8Array, name: string, options: ArchiveOptions = {}): Promise<ArchiveEntry[]> {
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
         if (options.enforceLimits !== false && (size > ARCHIVE_LIMIT || count > ENTRY_LIMIT)) { issue = "ZIP exceeds the 256 MB / 5000 file safety limit."; return false; }
        return true;
      },
    }, (error, result) => error ? reject(error) : resolve(result)));
    if (issue) throw new Error(issue);
    return verifyEntries(Object.entries(files).map(([path, bytes]) => ({ name: path, data: bytes })), options);
  }
  if (data[0] === 0x1f && data[1] === 0x8b) {
    if (data.length < 18) throw new Error("Truncated GZIP file.");
    const expanded: number = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(data.length - 4, true);
    if (options.enforceLimits !== false && expanded > ARCHIVE_LIMIT) throw new Error("GZIP expands beyond the 256 MB safety limit.");
    // Feed small compressed chunks to bound individual decompression allocations,
    // and enforce the cumulative limit independently of the untrusted trailer.
    const result: Uint8Array = await new Promise((resolve, reject) => {
      const chunks: Uint8Array[] = [];
      let total: number = 0;
      let offset: number = 0;
      const stream: AsyncGunzip = new AsyncGunzip((error, bytes, final) => {
        if (error) { stream.terminate(); reject(error); return; }
        total += bytes.length;
        if (options.enforceLimits !== false && total > ARCHIVE_LIMIT) { stream.terminate(); reject(new Error("GZIP expands beyond the 256 MB safety limit.")); return; }
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
    if (/\.(tar\.gz|tgz)$/i.test(name)) return parseTar(result, options);
    return [{ name: safeArchivePath(name.replace(/\.gz$/i, "") || "file"), data: result }];
  }
  return parseTar(data, options);
}

export async function writeArchive(entries: ArchiveEntry[], format: "zip" | "tar" | "tar.gz", level: number, options: ArchiveOptions = {}): Promise<Uint8Array> {
  verifyEntries(entries, options);
  if (format === "zip") {
    const files: Record<string, Uint8Array> = Object.create(null);
    for (const entry of entries) files[entry.name] = entry.data;
    return new Promise((resolve, reject) => zip(files, { level: level as 0 | 6 | 9 }, (error, bytes) => error ? reject(error) : resolve(bytes)));
  }
  const tar: Uint8Array = createTar(entries, options);
  if (format === "tar") return tar;
  return new Promise((resolve, reject) => gzip(tar, { level: level as 0 | 6 | 9 }, (error, bytes) => error ? reject(error) : resolve(bytes)));
}
