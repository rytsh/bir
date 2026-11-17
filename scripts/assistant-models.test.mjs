import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_LOCAL_DTYPE,
  DEFAULT_LOCAL_MODEL,
  MODELS,
} from "../src/lib/assistant-models.ts";

test("the default assistant uses Qwen3 with portable 4-bit weights", () => {
  const model = MODELS.find((entry) => entry.value === DEFAULT_LOCAL_MODEL);
  assert.equal(model?.value, "onnx-community/Qwen3-0.6B-ONNX");
  assert.equal(model.task, "text-generation");
  assert.equal(model.defaultDtype, DEFAULT_LOCAL_DTYPE);
  assert.equal(DEFAULT_LOCAL_DTYPE, "q4");
});

test("all model IDs are unique and default quantizations are supported", () => {
  assert.equal(new Set(MODELS.map((model) => model.value)).size, MODELS.length);
  for (const model of MODELS) {
    assert.ok(model.supportedDtypes.includes(model.defaultDtype), model.value);
    assert.ok(model.label);
  }
});

test("saved legacy model selections remain available", () => {
  for (const id of [
    "HuggingFaceTB/SmolLM2-135M-Instruct",
    "HuggingFaceTB/SmolLM2-1.7B-Instruct",
    "Xenova/Phi-3-mini-4k-instruct",
    "openai/privacy-filter",
  ]) {
    assert.ok(MODELS.some((model) => model.value === id), id);
  }
  assert.equal(MODELS.find((model) => model.value === "openai/privacy-filter").task, "token-classification");
});
