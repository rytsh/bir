import sevenZipWasmUrl from "7z-wasm/7zz.wasm?url";
import { type ArchiveEntry, type ArchiveOptions } from "./archive.ts";

interface ArchiveResponse {
  entries?: ArchiveEntry[];
  error?: string;
  passwordRequired?: boolean;
}

export class ArchiveUnlockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArchiveUnlockError";
  }
}

export function readExtendedArchive(file: File, password: string, options: ArchiveOptions, signal: AbortSignal): Promise<ArchiveEntry[]> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException("Cancelled", "AbortError")); return; }
    const worker: Worker = new Worker(new URL("./archive-engine.worker.ts", import.meta.url), { type: "module" });
    const cleanup = (): void => { worker.terminate(); signal.removeEventListener("abort", abort); };
    const abort = (): void => { cleanup(); reject(new DOMException("Cancelled", "AbortError")); };
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event: MessageEvent<ArchiveResponse>): void => {
      cleanup();
      if (event.data.error) reject(event.data.passwordRequired ? new ArchiveUnlockError(event.data.error) : new Error(event.data.error));
      else resolve(event.data.entries ?? []);
    };
    worker.onerror = (): void => { cleanup(); reject(new Error("Archive engine could not start. Reload the page and try again.")); };
    worker.postMessage({ file, options: { ...options, password, wasmUrl: new URL(sevenZipWasmUrl, window.location.href).href } });
  });
}
