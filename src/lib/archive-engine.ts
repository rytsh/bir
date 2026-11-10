import SevenZip from "7z-wasm";
import { ARCHIVE_LIMIT, ENTRY_LIMIT, safeArchivePath, type ArchiveEntry, type ArchiveOptions } from "./archive.ts";

export interface ArchiveEngineOptions extends ArchiveOptions {
  password?: string;
  wasmUrl?: string;
}

export class ArchivePasswordError extends Error {
  constructor(message: string = "This archive needs a password.") {
    super(message);
    this.name = "ArchivePasswordError";
  }
}

interface ListedEntry {
  name: string;
  originalName: string;
  size: number;
  encrypted: boolean;
}

export function parseArchiveListing(listing: string, options: ArchiveOptions = {}): ListedEntry[] {
  const entries: ListedEntry[] = [];
  const names: Set<string> = new Set();
  let total: number = 0;
  for (const block of listing.split(/\r?\n\r?\n/)) {
    if (!block.trim()) continue;
    const fields: Map<string, string> = new Map();
    for (const line of block.split(/\r?\n/)) {
      if (!line) continue;
      const separator: number = line.indexOf(" = ");
      if (separator <= 0 || fields.has(line.slice(0, separator))) throw new Error("Unsupported archive listing. File names containing line breaks cannot be opened.");
      fields.set(line.slice(0, separator), line.slice(separator + 3));
    }
    const originalName: string = fields.get("Path") ?? "";
    if (fields.get("Symbolic Link") || fields.get("Hard Link") || /\bl[rwx-]{9}\b/.test(fields.get("Attributes") ?? "")) {
      throw new Error("Symbolic and hard links cannot be opened. Re-export with links dereferenced as regular files.");
    }
    if (fields.get("Folder") === "+" || /^D/.test(fields.get("Attributes") ?? "")) continue;
    const name: string = safeArchivePath(originalName);
    const sizeText: string = fields.get("Size") ?? "";
    const size: number = Number(sizeText);
    if (!/^\d+$/.test(sizeText) || !Number.isSafeInteger(size)) throw new Error("Invalid archive entry size.");
    if (names.has(name)) throw new Error(`Duplicate archive path: ${name}`);
    names.add(name);
    total += size;
    if (options.enforceLimits !== false && (total > ARCHIVE_LIMIT || entries.length >= ENTRY_LIMIT)) {
      throw new Error("Memory protection is enabled: 256 MB expanded data / 5000 files. Disable it above to open larger archives.");
    }
    entries.push({ name, originalName, size, encrypted: fields.get("Encrypted") === "+" });
  }
  return entries;
}

// Run in a disposable worker in the browser. Extract to stdout, never to a filesystem:
// archive paths and link targets cannot write outside a sandbox or overwrite files.
export async function extractWithArchiveEngine(data: Uint8Array, options: ArchiveEngineOptions = {}): Promise<ArchiveEntry[]> {
  let listingBytes: number[] = [];
  let output: Uint8Array | null = null;
  let written: number = 0;
  let diagnostics: string = "";
  const engine = await SevenZip({
    ...(options.wasmUrl ? { locateFile: () => options.wasmUrl! } : {}),
    stdin: () => null as unknown as number,
    stdout: (byte: number) => {
      if (output) {
        if (written >= output.length) throw new Error("Archive entry exceeds its declared size.");
        output[written++] = byte;
      } else {
        if (options.enforceLimits !== false && listingBytes.length >= ARCHIVE_LIMIT) throw new Error("Archive metadata exceeds the memory protection limit.");
        listingBytes.push(byte);
      }
    },
    stderr: (byte: number) => { if (diagnostics.length < 16384) diagnostics += String.fromCharCode(byte); },
  });
  engine.FS.writeFile("/input.archive", data);
  const passwordArg: string = `-p${options.password ?? ""}`;
  const run = (args: string[]): void => {
    diagnostics = "";
    // The package types declare void, but the runtime returns the 7-Zip exit code.
    let code: unknown;
    try {
      code = engine.callMain(args);
    } catch (issue) {
      // Emscripten can throw a C++ exception pointer in browsers when an
      // encrypted header cannot be decoded, without writing diagnostics.
      if (typeof issue === "number") {
        throw new ArchivePasswordError(options.password
          ? "Incorrect password, or damaged encrypted data. Try again."
          : "Could not read the archive header. It may need a password, or the archive may be damaged.");
      }
      throw issue;
    }
    if (code !== 0) {
      if (/password|encrypted/i.test(diagnostics)) throw new ArchivePasswordError(options.password ? "Incorrect password, or damaged encrypted data. Try again." : undefined);
      throw new Error("Could not open this archive. It may be corrupted, incomplete, or use an unsupported compression method.");
    }
  };
  run(["l", "-slt", "-ba", "-bd", "-sccUTF-8", passwordArg, "/input.archive"]);
  const files: ListedEntry[] = parseArchiveListing(new TextDecoder().decode(new Uint8Array(listingBytes)), options);
  listingBytes = [];
  if (!options.password && files.some((file) => file.encrypted)) throw new ArchivePasswordError();
  const entries: ArchiveEntry[] = [];
  for (const file of files) {
    output = new Uint8Array(file.size);
    written = 0;
    run(["x", "-so", "-bd", "-bb0", "-bse2", "-spd", passwordArg, "/input.archive", "--", file.originalName]);
    if (written !== file.size) throw new Error("Truncated archive entry or inconsistent file size.");
    entries.push({ name: file.name, data: output });
  }
  return entries;
}
