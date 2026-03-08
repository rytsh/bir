import {
  ConsoleStdout,
  File,
  OpenFile,
  PreopenDirectory,
  WASI,
} from "@bjorn3/browser_wasi_shim";

const PANDOC_WASM_URL = `${import.meta.env.BASE_URL}wasm/pandoc.wasm`;

export interface ConvertResult {
  stdout: string;
  stderr: string;
  files: Record<string, Blob>;
}

type ConvertFn = (
  options: Record<string, unknown>,
  stdin: string | null,
  files: Record<string, string | Blob>,
) => Promise<ConvertResult>;

let cachedConvert: ConvertFn | null = null;

export async function loadPandoc(
  onProgress?: (msg: string) => void,
): Promise<ConvertFn> {
  if (cachedConvert) return cachedConvert;

  onProgress?.("Downloading Pandoc WASM (~56 MB)...");
  const response = await fetch(PANDOC_WASM_URL);
  if (!response.ok) throw new Error(`Failed to fetch pandoc.wasm: ${response.status}`);

  let wasmBinary: ArrayBuffer;
  const reader = response.body?.getReader();
  const contentLength = Number(response.headers.get("content-length")) || 0;

  if (reader && contentLength) {
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      const pct = ((received / contentLength) * 100).toFixed(0);
      const mb = (received / 1024 / 1024).toFixed(1);
      const total = (contentLength / 1024 / 1024).toFixed(1);
      onProgress?.(`Downloading Pandoc WASM... ${mb} / ${total} MB (${pct}%)`);
    }
    const merged = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    wasmBinary = merged.buffer;
  } else {
    wasmBinary = await response.arrayBuffer();
  }

  onProgress?.("Initializing Pandoc...");
  cachedConvert = await createPandocInstance(wasmBinary);
  onProgress?.("");
  return cachedConvert;
}

async function createPandocInstance(wasmBinary: ArrayBuffer): Promise<ConvertFn> {
  const args = ["pandoc.wasm", "+RTS", "-H64m", "-RTS"];
  const env: string[] = [];
  const fileSystem = new Map<string, File>();
  const fds = [
    new OpenFile(new File(new Uint8Array(), { readonly: true })),
    ConsoleStdout.lineBuffered((msg: string) => console.log(`[pandoc stdout] ${msg}`)),
    ConsoleStdout.lineBuffered((msg: string) => console.warn(`[pandoc stderr] ${msg}`)),
    new PreopenDirectory("/", fileSystem),
  ];
  const wasi = new WASI(args, env, fds, { debug: false });

  const { instance } = await WebAssembly.instantiate(wasmBinary, {
    wasi_snapshot_preview1: wasi.wasiImport,
  });

  wasi.initialize(instance);
  (instance.exports as Record<string, CallableFunction>).__wasm_call_ctors();

  const exports = instance.exports as Record<string, CallableFunction> & {
    memory: WebAssembly.Memory;
    malloc: (size: number) => number;
    convert: (ptr: number, len: number) => void;
  };

  function memoryView() {
    return new DataView(exports.memory.buffer);
  }

  // Initialize Haskell RTS
  const argc_ptr = exports.malloc(4);
  memoryView().setUint32(argc_ptr, args.length, true);
  const argv = exports.malloc(4 * (args.length + 1));
  for (let i = 0; i < args.length; i++) {
    const arg = exports.malloc(args[i].length + 1);
    new TextEncoder().encodeInto(
      args[i],
      new Uint8Array(exports.memory.buffer, arg, args[i].length),
    );
    memoryView().setUint8(arg + args[i].length, 0);
    memoryView().setUint32(argv + 4 * i, arg, true);
  }
  memoryView().setUint32(argv + 4 * args.length, 0, true);
  const argv_ptr = exports.malloc(4);
  memoryView().setUint32(argv_ptr, argv, true);
  (exports as Record<string, CallableFunction>).hs_init_with_rtsopts(argc_ptr, argv_ptr);

  async function addFile(filename: string, data: string | Blob, readonly: boolean) {
    let uint8Array: Uint8Array;
    if (typeof data === "string") {
      uint8Array = new TextEncoder().encode(data);
    } else {
      uint8Array = new Uint8Array(await data.arrayBuffer());
    }
    fileSystem.set(filename, new File(uint8Array, { readonly }));
  }

  async function convert(
    options: Record<string, unknown>,
    stdin: string | null,
    files: Record<string, string | Blob>,
  ): Promise<ConvertResult> {
    const optsStr = JSON.stringify(options);
    const encoded = new TextEncoder().encode(optsStr);
    const optsPtr = exports.malloc(encoded.length);
    new TextEncoder().encodeInto(
      optsStr,
      new Uint8Array(exports.memory.buffer, optsPtr, encoded.length),
    );

    // Clone files
    files = { ...files };

    // Setup filesystem
    fileSystem.clear();
    const inFile = new File(new Uint8Array(), { readonly: true });
    const outFile = new File(new Uint8Array(), { readonly: false });
    const errFile = new File(new Uint8Array(), { readonly: false });
    const warningsFile = new File(new Uint8Array(), { readonly: false });
    fileSystem.set("stdin", inFile);
    fileSystem.set("stdout", outFile);
    fileSystem.set("stderr", errFile);
    fileSystem.set("warnings", warningsFile);

    const knownFiles = new Set(["stdin", "stdout", "stderr", "warnings"]);

    for (const filename in files) {
      await addFile(filename, files[filename], true);
      knownFiles.add(filename);
    }

    const outputFileName = (options["output-file"] as string) || null;
    if (outputFileName) {
      await addFile(outputFileName, new Blob(), false);
      knownFiles.add(outputFileName);
    }

    if (stdin) {
      inFile.data = new TextEncoder().encode(stdin);
    }

    exports.convert(optsPtr, encoded.length);

    // Collect output
    if (outputFileName) {
      const f = fileSystem.get(outputFileName);
      if (f && f.data && f.data.length > 0) {
        files[outputFileName] = new Blob([f.data]);
      }
    }

    // Collect new files
    for (const [name, fileData] of fileSystem.entries()) {
      if (!knownFiles.has(name) && fileData?.data?.length > 0) {
        files[name] = new Blob([fileData.data]);
      }
    }

    const decoder = new TextDecoder("utf-8", { fatal: true });
    return {
      stdout: decoder.decode(outFile.data),
      stderr: decoder.decode(errFile.data),
      files,
    };
  }

  return convert;
}
