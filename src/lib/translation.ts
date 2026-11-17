export type TranslationModelId = "auto" | "opus" | "hymt2" | "Xenova/m2m100_418M";

export interface TranslationModel {
  value: TranslationModelId;
  label: string;
  description: string;
  languages?: string[];
}

export interface TranslationRuntime {
  modelId: string;
  task: "translation" | "text-generation";
  device: "wasm" | "webgpu";
  dtype: "q8" | "q4f16";
  revision?: string;
  download: string;
}

export interface TranslationRequest {
  model: TranslationModelId;
  source: string;
  target: string;
  targetName: string;
  text: string;
}

export interface TranslationChunk {
  text: string;
  separator: string;
}

export const TRANSLATION_MODELS: TranslationModel[] = [
  {
    value: "auto",
    label: "Automatic (OPUS for Turkish → English)",
    description: "Uses OPUS-MT for Turkish → English and M2M-100 for other pairs. Models download only when you translate.",
  },
  {
    value: "opus",
    label: "OPUS-MT (Turkish → English · 110 MB)",
    description: "Dedicated Turkish → English model. About 110 MB, plus runtime/tokenizer files. Apache-2.0; download size is not memory usage. Use Automatic for other directions.",
    languages: ["en", "tr"],
  },
  {
    value: "hymt2",
    label: "Hy-MT2 1.8B (Experimental · WebGPU)",
    description: "New community ONNX conversion, pinned to a reviewed revision. About 1.1 GB plus runtime/tokenizer files; requires WebGPU with shader-f16 and substantial free memory. Apache-2.0. Not benchmarked here.",
    languages: ["zh", "en", "fr", "pt", "es", "ja", "tr", "ru", "ar", "ko", "th", "it", "de", "vi", "ms", "id", "tl", "hi", "pl", "cs", "nl", "km", "my", "fa", "gu", "ur", "te", "mr", "he", "bn", "ta", "uk", "kk", "mn"],
  },
  {
    value: "Xenova/m2m100_418M",
    label: "M2M-100 (Original · 100 languages)",
    description: "Original multilingual fallback. About 632 MB q8, plus runtime/tokenizer files. MIT license. Runs on the CPU without WebGPU.",
  },
];

export function restoreTranslationModel(value: unknown): TranslationModelId {
  return TRANSLATION_MODELS.find((model) => model.value === value)?.value ?? "auto";
}

export function resolveTranslationRuntime(model: TranslationModelId, source: string, target: string): TranslationRuntime {
  const option = TRANSLATION_MODELS.find((entry) => entry.value === model);
  if (!option) throw new Error("Select a supported translation model.");
  if (option.languages && (!option.languages.includes(source) || !option.languages.includes(target))) {
    throw new Error("This model does not support the selected languages. Choose Automatic or M2M-100.");
  }
  if (model === "opus" && (source !== "tr" || target !== "en")) {
    throw new Error("This OPUS model only translates Turkish to English. Choose Automatic for other directions.");
  }
  if (model === "hymt2") {
    return {
      modelId: "konstbet/Hy-MT2-1.8B-ONNX",
      revision: "9d50f9ce17f93215187afb0409e76fd23d241b09",
      task: "text-generation",
      device: "webgpu",
      dtype: "q4f16",
      download: "about 1.1 GB",
    };
  }
  if ((model === "auto" || model === "opus") && source === "tr" && target === "en") {
    return {
      modelId: "Xenova/opus-mt-tr-en",
      revision: "78247f41f354af036d24e6f0f8a3d02c6806f96e",
      task: "translation", device: "wasm", dtype: "q8", download: "about 110 MB",
    };
  }
  return {
    modelId: "Xenova/m2m100_418M",
    task: "translation", device: "wasm", dtype: "q8", download: "about 632 MB",
  };
}

export function buildTranslationMessages(text: string, targetName: string): { role: "user"; content: string }[] {
  return [{
    role: "user",
    content: `Translate the following text into ${targetName}. Note that you should only output the translated result without any additional explanation:\n\n${text}`,
  }];
}

// Use the selected tokenizer, not character counts, to respect each model's context.
// Boundary whitespace is kept outside the model so paragraphs survive chunking.
export function splitTranslationText(text: string, countTokens: (text: string) => number, maxTokens: number = 256): TranslationChunk[] {
  const chunks: TranslationChunk[] = [];
  for (const part of text.split(/(\n[\t ]*\n(?:[\t ]*\n)*)/u)) {
    if (!part) continue;
    if (!part.trim()) {
      chunks.push({ text: "", separator: part });
      continue;
    }
    let remaining = part;
    while (remaining) {
      if (countTokens(remaining) <= maxTokens) {
        chunks.push({ text: remaining, separator: "" });
        break;
      }
      const characters = Array.from(remaining);
      let low = 1;
      let high = characters.length;
      let length = 0;
      while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        if (countTokens(characters.slice(0, middle).join("")) <= maxTokens) {
          length = middle;
          low = middle + 1;
        } else {
          high = middle - 1;
        }
      }
      if (!length) throw new Error("The translation prompt exceeds this model's input limit.");
      const prefix = characters.slice(0, length).join("");
      const boundary = Math.max(prefix.lastIndexOf(" "), prefix.lastIndexOf("\n"), prefix.lastIndexOf("\t"));
      const end = boundary > 0 ? boundary : prefix.length;
      const content = remaining.slice(0, end);
      remaining = remaining.slice(end);
      const separator = remaining.match(/^\s*/u)?.[0] ?? "";
      remaining = remaining.slice(separator.length);
      chunks.push({ text: content, separator });
    }
  }
  return chunks;
}

export function extractTranslation(output: unknown, task: TranslationRuntime["task"]): string {
  const result = Array.isArray(output) ? output[0] : undefined;
  if (!result || typeof result !== "object") throw new Error("The model returned no translation. Try a shorter passage or M2M-100.");
  let text: unknown;
  if (task === "translation") {
    text = result.translation_text;
  } else {
    const generated = result.generated_text;
    text = Array.isArray(generated) ? generated.at(-1)?.content : generated;
  }
  if (typeof text !== "string" || !text.trim()) throw new Error("The model returned an empty translation. Try M2M-100.");
  return text.trim();
}
