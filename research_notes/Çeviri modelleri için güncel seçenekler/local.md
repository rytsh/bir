# Browser-local translation candidates — verified 2026-11-17

## Which models are practical replacements?

### Takeaway
For Turkish–English, prioritize directional OPUS-MT big models for the lowest-risk browser option; for newer multilingual quality, evaluate Hy-MT2-1.8B q4f16 on WebGPU first. NLLB-600M is a mature research-only multilingual alternative, while TranslateGemma-4B is a much heavier optional desktop tier—not an automatic default upgrade.

### Cited Findings
Sizes below are **decimal MB/GB of selected ONNX graph(s) and their external data**, calculated from public HF API `siblings.size`; exclude tokenizer/runtime. Seq2seq totals assume encoder + merged decoder, not every file in the repository. These are downloads, **not measured RAM**.

| Candidate / actual public repository | Selected weights download | Coverage / license / status |
|---|---:|---|
| `Xenova/m2m100_418M` baseline | q8 631.98 MB | Existing mature export. [API](https://huggingface.co/api/models/Xenova/m2m100_418M?blobs=true) |
| `Xenova/opus-mt-tr-en` | q8 110.43 MB | Turkish → English only; upstream Apache-2.0. [Files](https://huggingface.co/api/models/Xenova/opus-mt-tr-en?blobs=true), [upstream](https://huggingface.co/Helsinki-NLP/opus-mt-tr-en) |
| `Xenova/opus-mt-tc-big-tr-en` | q8 297.80 MB | Turkish → English only; upstream CC-BY-4.0. Strong small/quality compromise. [Files](https://huggingface.co/api/models/Xenova/opus-mt-tc-big-tr-en?blobs=true), [upstream](https://huggingface.co/Helsinki-NLP/opus-mt-tc-big-tr-en) |
| `onnx-community/opus-mt-tc-big-en-tr` | q8 531.45 MB; q4f16 507.14 MB | English → Turkish only; CC-BY-4.0. Real reverse-direction export exists; **do not invent `Xenova/opus-mt-en-tr`**. [Files](https://huggingface.co/api/models/onnx-community/opus-mt-tc-big-en-tr?blobs=true) |
| `Xenova/nllb-200-distilled-600M` | q8 894.63 MB; q4f16 1.254 GB | 200 languages, `tur_Latn` ↔ `eng_Latn`; CC-BY-NC-4.0. [Files](https://huggingface.co/api/models/Xenova/nllb-200-distilled-600M?blobs=true), [usage](https://huggingface.co/Xenova/nllb-200-distilled-600M) |
| `konstbet/Hy-MT2-1.8B-ONNX` | q4f16 1.07521 GB | New export uploaded **2026-11-17**; explicit Transformers.js WebGPU example; upstream Apache-2.0; Turkish included. Pin and smoke-test before depending on it. [API](https://huggingface.co/api/models/konstbet/Hy-MT2-1.8B-ONNX?blobs=true), [card](https://huggingface.co/konstbet/Hy-MT2-1.8B-ONNX), [actual upstream license](https://huggingface.co/tencent/Hy-MT2-1.8B/blob/main/LICENSE.txt) |
| `DavidLuong/Hy-MT2-1.8B-ONNX-q4f16` | q4f16 1.37344 GB | Older June 2026 public export; no README; `hunyuan_v1_dense` config. Mirror available, but mirror's license metadata is stale/ambiguous compared with current upstream Apache license. [Files](https://huggingface.co/api/models/DavidLuong/Hy-MT2-1.8B-ONNX-q4f16?blobs=true), [config](https://huggingface.co/DavidLuong/Hy-MT2-1.8B-ONNX-q4f16/blob/main/config.json), [mirror](https://huggingface.co/LunarOilRig/Hy-MT2-1.8B-ONNX-q4f16-mirror) |
| `onnx-community/translategemma-text-4b-it-ONNX` | q4f16 2.715 GB; q4 3.092 GB; fp16 7.896 GB | Real ungated text-only export; no README/license metadata supplied there. Original Google model is gated and Gemma-licensed. [Files](https://huggingface.co/api/models/onnx-community/translategemma-text-4b-it-ONNX?blobs=true), [Google API](https://huggingface.co/api/models/google/translategemma-4b-it) |
| `willopcbeta/translategemma-4b-it-Text-ONNX` | q4f16 2.19743 GB; q4 2.31867 GB | Alternative Gemma-licensed export with explicit Transformers.js usage and quantization warning. [Files](https://huggingface.co/api/models/willopcbeta/translategemma-4b-it-Text-ONNX?blobs=true), [card](https://huggingface.co/willopcbeta/translategemma-4b-it-Text-ONNX) |

- **Repository variants differ materially.** `onnx-community/opus-mt-tc-big-tr-en` q8 totals 531.45 MB, not Xenova's 297.80 MB despite the same upstream checkpoint. Never estimate from parameter count or assume quantization names mean identical tensor coverage. [Community API](https://huggingface.co/api/models/onnx-community/opus-mt-tc-big-tr-en?blobs=true), [Xenova API](https://huggingface.co/api/models/Xenova/opus-mt-tc-big-tr-en?blobs=true)
- Hy-MT2 upstream released May 21, 2026, lists Turkish, and claims its 1.8B beats Microsoft/Doubao APIs **overall**. Its advertised 440 MB format is **AngelSlim 1.25-bit / GGUF**, not the verified browser ONNX q4f16 artifacts above. [Primary card](https://huggingface.co/tencent/Hy-MT2-1.8B)
- NLLB explicitly targets research, not production deployment, document translation, or medical/legal texts; training inputs did not exceed 512 tokens. License is noncommercial even when inference happens on users' devices. [Primary card](https://huggingface.co/facebook/nllb-200-distilled-600M)

### Inferences
- Best deployment shortlist: directional Marian/OPUS for broad hardware; Hy-MT2 optional WebGPU quality tier; retain M2M as a broad-coverage permissive fallback rather than silently replacing it with noncommercial NLLB. Candidate recommendations follow artifact sizes and licenses above, **not measured quality wins over M2M**.
- RAM must exceed resident weights because runtime sessions, intermediate tensors, JS/download buffers and KV cache also consume memory; GPU and host copies may coexist. Treat 1.1–1.4 GB Hy and 2.2–2.7 GB TranslateGemma as desktop-oriented opt-ins and measure peak RAM on target browsers; no defensible fixed RAM minimum was established here.

### Gaps
- Research only: no actual browser load, throughput, memory profiling, or translated outputs were run. Same-day Hy export particularly needs validation. API sizes were verified, not downloaded multi-GB tensors.

## Does Transformers.js 4.3.0 actually support them?

### Takeaway
Yes at the architecture registry level for Marian, M2M/NLLB, Gemma3 text, Qwen3 and Hunyuan dense. Architecture support is necessary but does **not** validate an arbitrary ORT GenAI/CUDA/DirectML export or its tokenizer/cache settings.

### Cited Findings
- The **4.3.0 tag** registry maps `marian → MarianMTModel`, `m2m_100 → M2M100ForConditionalGeneration`, `gemma3_text → Gemma3ForCausalLM`, `qwen3 → Qwen3ForCausalLM`, and `hunyuan_v1_dense → HunYuanDenseV1ForCausalLM`. [Version-pinned registry](https://github.com/huggingface/transformers.js/blob/4.3.0/packages/transformers/src/models/registry.js)
- 4.3.0 maps `dtype: "q8"` to `_quantized`, **not** `_int8`; wasm defaults to q8 while otherwise fp32 is the fallback. q4f16 uses fp16 activations; WebGPU fp16 detection checks `shader-f16`. Explicit dtype prevents huge accidental fp32 downloads. [Version-pinned dtypes](https://github.com/huggingface/transformers.js/blob/4.3.0/packages/transformers/src/utils/dtypes.js)
- New Hy export includes static cache-head dimension repair (128), float16 cache dtype and external-data config, plus WebGPU-specific fused operators. Its documented usage is `pipeline("text-generation", ..., {device:"webgpu", dtype:"q4f16"})`, not the seq2seq translation pipeline. [Card](https://huggingface.co/konstbet/Hy-MT2-1.8B-ONNX), [config](https://huggingface.co/konstbet/Hy-MT2-1.8B-ONNX/blob/main/config.json)
- TranslateGemma community config explicitly declares `gemma3_text`, number of external ONNX data chunks per precision and float16 KV cache. Alternative willopcbeta card reports that int4 accuracy level 4/block size 128 caused severe quality failure in its experiments. This is an exporter warning, not an independently validated Turkish result. [Config](https://huggingface.co/onnx-community/translategemma-text-4b-it-ONNX/blob/main/config.json), [alternative card](https://huggingface.co/willopcbeta/translategemma-4b-it-Text-ONNX)

### Inferences
- Static Astro/Svelte does not require a model server for these exports; prefer lazy model downloads and a worker, choose explicit dtype/device, validate fp16 WebGPU capability, and dispose a directional model before loading another. These are recommendations, not implementation changes.
- TranslateGemma requires its translation-aware prompting/template; preserve the official source/target language semantics rather than assuming a generic chat prompt is equivalent. Text-only ONNX exports do not preserve Google's multimodal/image capability.

### Gaps
- No end-to-end compatibility certification for this project's exact lockfile/browser/ORT build. `^4.3.0` is a range; findings above intentionally inspect the actual 4.3.0 source, not only current-main documentation.

## What is known about quality, and which newer names should not be mistaken for ready alternatives?

### Takeaway
OPUS cards provide concrete Turkish-direction benchmark numbers. Newer families' aggregate superiority claims are not proof that their browser quantizations beat M2M for Turkish; run a common Turkish–English evaluation before selecting a new default.

### Cited Findings
- OPUS big Turkish→English reports FLORES101-devtest BLEU **37.6**, newstest2016 **29.3**, newstest2017 **29.7**, newstest2018 **30.7**. Small `opus-mt-tr-en` reports the corresponding news BLEU **25.2 / 24.7 / 27.0**. This supports evaluating big over small, but cross-card tokenization/scoring signatures and training differences mean it is not a controlled in-browser comparison. [Big primary card](https://huggingface.co/Helsinki-NLP/opus-mt-tc-big-tr-en), [small primary card](https://huggingface.co/Helsinki-NLP/opus-mt-tr-en)
- Reverse-direction OPUS big English→Turkish reports FLORES101-devtest BLEU **31.4**, newstest2016 **23.4**, newstest2017 **25.4**, newstest2018 **22.6**. These are upstream model benchmarks, not measured ONNX q8 results. [Primary card](https://huggingface.co/Helsinki-NLP/opus-mt-tc-big-en-tr)
- Google released TranslateGemma January 15, 2026 in 4B/12B/27B sizes; claims 12B beats Gemma3-27B on WMT24++ MetricX, and 4B rivals the **Gemma3-12B baseline**. This does **not** say 4B beats all 12B translators, NLLB, Hy-MT2, or M2M on Turkish. Official template metadata includes `tr: Turkish`. [Google announcement](https://blog.google/innovation-and-ai/technology/developers-tools/translategemma/), [official model API/template](https://huggingface.co/api/models/google/translategemma-4b-it), [technical report](https://arxiv.org/abs/2601.09012)
- **Newest small multilingual option found:** `TeamFlaxia/plamo-3-translate-0.8b-onnx`, uploaded November 7, 2026, q4f16 **705.70 MB**. Export relabels custom Plamo architecture as Qwen3; card documents tokenizer byte-fallback limitations. Upstream's supported language list **does not include Turkish**, and benchmark languages exclude Turkish. Good research candidate for other languages, **not a Turkish recommendation**. Custom PLaMo Community License, not Apache. [ONNX card](https://huggingface.co/TeamFlaxia/plamo-3-translate-0.8b-onnx), [files](https://huggingface.co/api/models/TeamFlaxia/plamo-3-translate-0.8b-onnx?blobs=true), [upstream](https://huggingface.co/pfnet/plamo-3-translate-0.8b)
- **Qwen naming trap:** `tonythethompson/Qwen3-4B-translation-onnx` exists (Nov 12), but its own README says it is a copied **base Qwen3-4B** ORT GenAI CPU int4 export. No translation fine-tuning/evaluation is documented; files are root `model.onnx(.data)` and `cuda-int4/`, not demonstrated Transformers.js packaging. Name alone is not evidence of a translation specialist or browser readiness. [Card](https://huggingface.co/tonythethompson/Qwen3-4B-translation-onnx), [metadata/files](https://huggingface.co/api/models/tonythethompson/Qwen3-4B-translation-onnx?blobs=true)
- Sarvam's real ONNX repo is Indic/English-focused, not Turkish; original Riva-Translate-4B's 12-language list also excludes Turkish and its community MIT tag should not override upstream NVIDIA license. These are poor default recommendations for this task. [Sarvam](https://huggingface.co/onnx-community/sarvam-translate-onnx), [original Riva primary card](https://huggingface.co/nvidia/Riva-Translate-4B-Instruct)

### Inferences
- Evaluate Turkish→English and English→Turkish separately on identical held-out material: FLORES plus informal Turkish, morphology/negation, named entities, idioms, developer text and placeholders. Score adequacy/omissions with Turkish-speaking review, alongside chrF/COMET, first-download bytes, warm speed and peak memory. Do not transfer full-precision paper rankings to q4 browser exports.
- Strongest order for practical investigation: **OPUS big directional models → Hy-MT2-1.8B WebGPU → TranslateGemma-4B optional desktop**. NLLB is a separate noncommercial/research decision. There is no verified universal quality winner in this research.

### Gaps
- No common-test Turkish M2M vs NLLB vs Hy-MT2 vs TranslateGemma ONNX quantization comparison verified. Google's gated card could not be fetched anonymously; public API/template and primary announcement were accessible. Hy report is linked, but no Turkish-specific numeric result was verified here.
- This was a targeted public-HF search, not proof that no other Turkish Qwen fine-tune or ONNX repo exists. No verified small translation-tuned Qwen ONNX candidate with Turkish benchmarks and demonstrated Transformers.js usage emerged.
