import { env, pipeline } from "@huggingface/transformers";
import { createTranslationEngine, type TranslationPipelineLike } from "../lib/translation-engine.ts";
import type { TranslationRequest } from "../lib/translation.ts";

env.allowLocalModels = false;
env.useBrowserCache = true;

const translate = createTranslationEngine(async (runtime, progress) => {
  if (runtime.device === "webgpu") {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ features: Set<string> } | null> } }).gpu;
    const adapter = await gpu?.requestAdapter();
    if (!adapter?.features.has("shader-f16")) {
      throw new Error("Hy-MT2 requires WebGPU with shader-f16. Use a supported desktop browser or select Automatic/M2M-100.");
    }
  }
  const files: Record<string, number> = {};
  const model = await pipeline(runtime.task, runtime.modelId, {
    device: runtime.device,
    dtype: runtime.dtype,
    revision: runtime.revision,
    progress_callback: (event) => {
      if (event.status === "progress") {
        files[event.file] = event.progress;
        const values = Object.values(files);
        progress({
          status: `Downloading ${event.file.split("/").pop()} (${Math.round(event.progress)}%)`,
          progress: values.reduce((sum, value) => sum + value, 0) / values.length,
        });
      }
    },
  });
  return model as unknown as TranslationPipelineLike;
});

let busy = false;
self.onmessage = async (event: MessageEvent<TranslationRequest>): Promise<void> => {
  if (busy) return;
  busy = true;
  try {
    const text = await translate(event.data, (status) => self.postMessage({ type: "progress", ...status }));
    self.postMessage({ type: "result", text });
  } catch (error) {
    self.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
  } finally {
    busy = false;
  }
};
