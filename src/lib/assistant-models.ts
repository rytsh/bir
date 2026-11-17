export type ModelTask = "text-generation" | "text2text-generation" | "token-classification";

export interface ModelOption {
  value: string;
  label: string;
  supportedDtypes: string[];
  defaultDtype: string;
  task: ModelTask;
}

export const DEFAULT_LOCAL_MODEL = "onnx-community/Qwen3-0.6B-ONNX";
export const DEFAULT_LOCAL_DTYPE = "q4";

// Public Transformers.js ONNX repositories; keep older entries for saved settings.
export const MODELS: ModelOption[] = [
  {
    value: DEFAULT_LOCAL_MODEL,
    label: "Qwen3 0.6B (Multilingual, Recommended)",
    supportedDtypes: ["fp32", "fp16", "q8", "q4", "q4f16"],
    defaultDtype: DEFAULT_LOCAL_DTYPE,
    task: "text-generation",
  },
  {
    value: "onnx-community/Qwen3-1.7B-ONNX",
    label: "Qwen3 1.7B (Multilingual, More Memory)",
    supportedDtypes: ["fp32", "fp16", "q8", "q4", "q4f16"],
    defaultDtype: "q4",
    task: "text-generation",
  },
  {
    value: "onnx-community/LFM2.5-350M-ONNX",
    label: "LFM2.5 350M (Lightweight, Fast)",
    supportedDtypes: ["fp32", "fp16", "q8", "q4", "q4f16"],
    defaultDtype: "q4",
    task: "text-generation",
  },
  {
    value: "onnx-community/Qwen2.5-Coder-1.5B-Instruct",
    label: "Qwen2.5 Coder 1.5B (Code, More Memory)",
    supportedDtypes: ["fp32", "fp16", "q8", "q4", "q4f16"],
    defaultDtype: "q4",
    task: "text-generation",
  },
  {
    value: "HuggingFaceTB/SmolLM2-135M-Instruct",
    label: "SmolLM2-135M (Instruct, Fast, ~140MB)",
    supportedDtypes: ["fp32", "fp16", "q8", "q4", "q4f16"],
    defaultDtype: "q4f16",
    task: "text-generation",
  },
  {
    value: "HuggingFaceTB/SmolLM2-1.7B-Instruct",
    label: "SmolLM2-1.7B (Instruct, ~1.7GB)",
    supportedDtypes: ["fp32", "fp16", "q8", "q4", "q4f16"],
    defaultDtype: "q4f16",
    task: "text-generation",
  },
  {
    value: "Xenova/Phi-3-mini-4k-instruct",
    label: "Phi-3 Mini 4k (Instruct, ~2.5GB)",
    supportedDtypes: ["q4"],
    defaultDtype: "q4",
    task: "text-generation",
  },
  {
    value: "openai/privacy-filter",
    label: "OpenAI Privacy Filter (PII Detection, ~1B)",
    supportedDtypes: ["q4"],
    defaultDtype: "q4",
    task: "token-classification",
  },
];
