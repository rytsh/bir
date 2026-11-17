import {
  buildTranslationMessages,
  extractTranslation,
  resolveTranslationRuntime,
  splitTranslationText,
  type TranslationRequest,
  type TranslationRuntime,
} from "./translation.ts";

export interface TranslationPipelineLike {
  (input: string | { role: "user"; content: string }[], options: Record<string, unknown>): Promise<unknown>;
  tokenizer: {
    encode(text: string): number[];
    apply_chat_template(messages: { role: "user"; content: string }[], options: Record<string, unknown>): string;
  };
  dispose(): Promise<void>;
}

export interface TranslationStatus {
  status: string;
  progress?: number;
  loaded?: boolean;
}

export type TranslationFactory = (runtime: TranslationRuntime, progress: (status: TranslationStatus) => void) => Promise<TranslationPipelineLike>;

export function createTranslationEngine(factory: TranslationFactory) {
  let pipeline: TranslationPipelineLike | undefined;
  let pipelineKey = "";

  return async (request: TranslationRequest, progress: (status: TranslationStatus) => void): Promise<string> => {
    if (!request.text.trim() || request.source === request.target) return request.text;
    const runtime = resolveTranslationRuntime(request.model, request.source, request.target);
    const key = JSON.stringify(runtime);
    if (!pipeline || pipelineKey !== key) {
      if (pipeline) await pipeline.dispose();
      pipeline = undefined;
      pipelineKey = "";
      progress({ status: `Loading ${runtime.modelId}...`, loaded: false });
      pipeline = await factory(runtime, progress);
      pipelineKey = key;
    }
    progress({ status: "Model ready", progress: 100, loaded: true });
    const model = pipeline;
    const countTokens = (text: string): number => {
      const input = runtime.task === "text-generation"
        ? model.tokenizer.apply_chat_template(buildTranslationMessages(text, request.targetName), { tokenize: false, add_generation_prompt: true })
        : text;
      // Leave room for source/target and other special tokens in seq2seq models.
      return model.tokenizer.encode(input).length + 8;
    };
    const chunks = splitTranslationText(request.text, countTokens);
    let result = "";
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (chunk.text.trim()) {
        progress({ status: `Translating part ${i + 1} of ${chunks.length}...`, loaded: true });
        const input = runtime.task === "text-generation" ? buildTranslationMessages(chunk.text, request.targetName) : chunk.text;
        const options: Record<string, unknown> = {
          max_new_tokens: runtime.task === "text-generation" ? 1024 : 512,
          do_sample: false,
        };
        if (runtime.task === "text-generation") {
          options.return_full_text = false;
        } else if (runtime.modelId === "Xenova/m2m100_418M") {
          options.src_lang = request.source;
          options.tgt_lang = request.target;
        }
        const output = await model(input, options);
        result += extractTranslation(output, runtime.task);
      } else {
        result += chunk.text;
      }
      result += chunk.separator;
    }
    return result;
  };
}
