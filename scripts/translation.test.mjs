import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTranslationMessages,
  extractTranslation,
  resolveTranslationRuntime,
  restoreTranslationModel,
  splitTranslationText,
  TRANSLATION_MODELS,
} from "../src/lib/translation.ts";
import { createTranslationEngine } from "../src/lib/translation-engine.ts";

const request = { model: "auto", source: "tr", target: "en", targetName: "English", text: "Merhaba dünya." };
const ignoreProgress = () => {};

function fakeModel(task, calls = []) {
  const model = async (input, options) => {
    calls.push({ input, options });
    return task === "translation"
      ? [{ translation_text: `translated:${input}` }]
      : [{ generated_text: [...input, { role: "assistant", content: "Hello world." }] }];
  };
  model.tokenizer = {
    encode: (text) => Array.from(text),
    apply_chat_template: (messages) => messages[0].content,
  };
  model.dispose = async () => { model.disposed = true; };
  return model;
}

test("automatic mode selects the correct directional OPUS model and falls back for other languages", () => {
  assert.equal(resolveTranslationRuntime("auto", "tr", "en").modelId, "Xenova/opus-mt-tr-en");
  assert.equal(resolveTranslationRuntime("auto", "en", "tr").modelId, "Xenova/m2m100_418M");
  assert.equal(resolveTranslationRuntime("auto", "de", "en").modelId, "Xenova/m2m100_418M");
  assert.equal(resolveTranslationRuntime("Xenova/m2m100_418M", "tr", "en").dtype, "q8");
});

test("restricted models reject unsupported language pairs", () => {
  assert.throws(() => resolveTranslationRuntime("opus", "de", "en"), /does not support/);
  assert.throws(() => resolveTranslationRuntime("opus", "en", "tr"), /only translates/);
  assert.throws(() => resolveTranslationRuntime("hymt2", "fi", "tr"), /does not support/);
  assert.equal(TRANSLATION_MODELS.find((model) => model.value === "hymt2").languages.includes("tr"), true);
});

test("Hy-MT2 uses a pinned generation model with the export's WebGPU quantization", () => {
  const runtime = resolveTranslationRuntime("hymt2", "tr", "en");
  assert.equal(runtime.task, "text-generation");
  assert.equal(runtime.device, "webgpu");
  assert.equal(runtime.dtype, "q4f16");
  assert.match(runtime.revision, /^[a-f0-9]{40}$/);
  assert.match(buildTranslationMessages("Merhaba", "English")[0].content, /into English[\s\S]*Merhaba$/);
});

test("stored model settings are preserved or restored safely", () => {
  assert.equal(restoreTranslationModel("Xenova/m2m100_418M"), "Xenova/m2m100_418M");
  assert.equal(restoreTranslationModel("removed-model"), "auto");
  assert.equal(restoreTranslationModel(undefined), "auto");
});

test("token-aware chunking preserves paragraphs, whitespace, and Unicode without losing text", () => {
  const text = "Birinci paragraf.\n\nİkinci paragraf: " + "你好🌍".repeat(30) + "\n \nSon.";
  const count = (value) => Array.from(value).length;
  const chunks = splitTranslationText(text, count, 24);
  assert.equal(chunks.map((chunk) => chunk.text + chunk.separator).join(""), text);
  assert.ok(chunks.every((chunk) => count(chunk.text) <= 24));
  assert.ok(chunks.some((chunk) => chunk.separator.includes("\n\n")));
  assert.equal(splitTranslationText("", count).length, 0);
  assert.throws(() => splitTranslationText("text", () => 1000, 10), /input limit/);
});

test("output extraction accepts seq2seq and chat outputs but rejects empty results", () => {
  assert.equal(extractTranslation([{ translation_text: " Hello " }], "translation"), "Hello");
  assert.equal(extractTranslation([{ generated_text: [{ role: "assistant", content: "Hi" }] }], "text-generation"), "Hi");
  assert.equal(extractTranslation([{ generated_text: "Hi" }], "text-generation"), "Hi");
  assert.throws(() => extractTranslation([], "translation"), /no translation/);
  assert.throws(() => extractTranslation([{ translation_text: "" }], "translation"), /empty translation/);
});

test("same-language and blank requests avoid model downloads", async () => {
  const translate = createTranslationEngine(async () => { throw new Error("Unexpected download"); });
  assert.equal(await translate({ ...request, target: "tr" }, ignoreProgress), request.text);
  assert.equal(await translate({ ...request, text: "\n " }, ignoreProgress), "\n ");
});

test("the engine reuses a model and disposes it when direction changes", async () => {
  const models = [];
  const runtimes = [];
  const calls = [];
  const translate = createTranslationEngine(async (runtime) => {
    runtimes.push(runtime);
    const model = fakeModel(runtime.task, calls);
    models.push(model);
    return model;
  });
  await translate(request, ignoreProgress);
  await translate(request, ignoreProgress);
  assert.equal(models.length, 1);
  assert.equal(calls[0].options.src_lang, undefined, "OPUS must not use M2M language options");
  await translate({ ...request, source: "en", target: "tr" }, ignoreProgress);
  assert.equal(models.length, 2);
  assert.equal(models[0].disposed, true);
  assert.equal(runtimes[1].modelId, "Xenova/m2m100_418M");
});

test("M2M retains ISO language arguments; Hy-MT2 uses a chat prompt", async () => {
  const calls = [];
  const translate = createTranslationEngine(async (runtime) => fakeModel(runtime.task, calls));
  await translate({ ...request, model: "Xenova/m2m100_418M" }, ignoreProgress);
  assert.equal(calls[0].options.src_lang, "tr");
  assert.equal(calls[0].options.tgt_lang, "en");
  assert.equal(await translate({ ...request, model: "hymt2" }, ignoreProgress), "Hello world.");
  assert.equal(calls[1].input[0].role, "user");
  assert.equal(calls[1].options.do_sample, false);
  assert.equal(calls[1].options.return_full_text, false);
});

test("a failed model load can be retried", async () => {
  let attempts = 0;
  const translate = createTranslationEngine(async (runtime) => {
    if (++attempts === 1) throw new Error("Network unavailable");
    return fakeModel(runtime.task);
  });
  await assert.rejects(translate(request, ignoreProgress), /Network unavailable/);
  assert.match(await translate(request, ignoreProgress), /translated:/);
  assert.equal(attempts, 2);
});

test("long input is translated in bounded parts with paragraph separators retained", async () => {
  const calls = [];
  const translate = createTranslationEngine(async (runtime) => fakeModel(runtime.task, calls));
  const text = "Merhaba ".repeat(80).trim() + "\n\nSon.";
  const result = await translate({ ...request, text }, ignoreProgress);
  assert.ok(calls.length > 2);
  assert.ok(calls.every((call) => Array.from(call.input).length + 8 <= 256));
  assert.match(result, /\n\ntranslated:Son\.$/);
});
