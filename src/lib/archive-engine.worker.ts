import { extractWithArchiveEngine, ArchivePasswordError, type ArchiveEngineOptions } from "./archive-engine.ts";

interface OpenRequest {
  file: File;
  options: ArchiveEngineOptions;
}

self.onmessage = async (event: MessageEvent<OpenRequest>): Promise<void> => {
  try {
    const entries = await extractWithArchiveEngine(new Uint8Array(await event.data.file.arrayBuffer()), event.data.options);
    self.postMessage({ entries }, { transfer: entries.map((entry) => entry.data.buffer as ArrayBuffer) });
  } catch (issue) {
    self.postMessage({ error: issue instanceof Error ? issue.message : "Could not open archive.", passwordRequired: issue instanceof ArchivePasswordError });
  }
};
