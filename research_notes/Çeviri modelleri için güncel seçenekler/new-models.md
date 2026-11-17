# Dedicated translation models and cloud alternatives — 2026-11-17

## Which models belong on the actionable shortlist?

### Takeaway
Prioritize **Hy-MT2-1.8B** for a local feasibility spike, **Hy-MT2-7B** for self-hosted quality, and **Qwen-MT Flash/Plus or Google Translation LLM** for managed translation. TranslateGemma is an important comparison, but none of these is established here as a drop-in browser replacement or a proven Turkish winner.

### Cited Findings
| Exact identifier | Size / languages | License | Deployment and recommendation |
|---|---|---|---|
| `tencent/Hy-MT2-1.8B` | Nominal 1.8B; 33 languages, explicitly English and Turkish `tr`, plus minority/dialect variants | Apache-2.0 in publisher model-card metadata | **Best new small-model candidate**. Released May 21, 2026; official FP8 and GGUF variants. Publisher documents Python/server and native llama.cpp deployment, not a verified browser package. [Publisher card](https://huggingface.co/tencent/Hy-MT2-1.8B) |
| `tencent/Hy-MT2-1.8B-GGUF`; `tencent/Hy-MT2-1.8B-1.25Bit-GGUF` | Same nominal 1.8B family; latter advertised as 440 MB storage | Apache-2.0 in respective publisher metadata | **Local experimental**. Tiny download does not mean tiny peak runtime memory. 1.25-bit card explicitly requires its STQ kernel, links llama.cpp PR #22836; do not assume ONNX/Transformers.js/WebGPU compatibility. Collection capitalization uses `1.25Bit`; some README links use `1.25bit`. [Collection](https://huggingface.co/collections/tencent/hy-mt2), [quantized card](https://huggingface.co/tencent/Hy-MT2-1.8B-1.25Bit-GGUF) |
| `tencent/Hy-MT2-7B`; `tencent/Hy-MT2-30B-A3B` | Nominal 7B dense; 30B total / 3B active MoE; same language family | Apache-2.0 declared for family | **Server/native workstation**, not default browser. MoE active parameters do not remove the storage requirement for all experts. Publisher collection rounds 7B checkpoint tensor count to 8B and 1.8B to 2B: these are nominal model names, not audited exact counts. [Card](https://huggingface.co/tencent/Hy-MT2-1.8B), [collection](https://huggingface.co/collections/tencent/hy-mt2) |
| `google/translategemma-4b-it`, `google/translategemma-12b-it`, `google/translategemma-27b-it` | 4B / 12B / 27B; 55 evaluated languages; text and text-in-image translation | **Gemma terms**, not Apache/MIT; HF access requires acknowledgement | Jan 15, 2026 release. 4B is edge-oriented; 12B laptop/workstation; 27B server/cloud. Card specifies **2K input tokens** and a special source/target-language chat template. Turkish membership was **not independently extracted from the report/template in this pass**; do not label Turkish verified from the 55-language headline alone. [Google announcement](https://blog.google/innovation-and-ai/technology/developers-tools/translategemma/), [publisher card](https://huggingface.co/google/translategemma-4b-it/blob/main/README.md), [27B](https://huggingface.co/google/translategemma-27b-it) |
| `google/madlad400-3b-mt` | 3B T5 encoder-decoder; 400+/450+ language coverage, Turkish `tr` listed | Apache-2.0 | **Older broad-coverage reference**, not a 2026 release (paper 2023). Card documents 1.65 GB Q4 Candle model versus 11.8 GB original file, but no verified browser delivery. Larger family sizes 7.2B and 10.7B. HF card says it was converted/written by Juarez Bochi rather than the original researchers. [Card and original research links](https://huggingface.co/google/madlad400-3b-mt) |
| `tencent/HY-MT1.5-1.8B`, `tencent/HY-MT1.5-7B` | 1.8B / 7B; 33 languages including Turkish and English | **Tencent HY Community License**, territorially excludes EU, UK, South Korea; additional restrictions | Dec 30, 2025 predecessor. Prefer researching **MT2**, whose publisher declares Apache-2.0, rather than inadvertently shipping the restrictive old model. Do not apply the old license to MT2 or an AngelSlim code license to model weights. [Card](https://huggingface.co/tencent/HY-MT1.5-1.8B), [actual MT1.5 license](https://raw.githubusercontent.com/Tencent-Hunyuan/Hy-MT/main/License.txt) |
| `facebook/m2m100_418M` | 418M; 100 languages / 9,900 directions; Turkish supported | MIT | Useful small legacy baseline, introduced by 2020 paper. Modern candidates are materially larger unless aggressively quantized. [Publisher card](https://huggingface.co/facebook/m2m100_418M) |

### Inferences
- For this static tool, shortlist **Hy-MT2-1.8B first**, not MT1.5: newer capabilities, smaller than TranslateGemma 4B, explicitly Turkish, and less restrictive declared license. This is a prioritization judgment based on the publisher evidence above, **not proof it runs acceptably in browsers**.
- Keep server/native and browser modes distinct. A local HTTP llama.cpp endpoint still requires installed native software; it is not “runs inside the browser.” A Python `transformers` example is not Transformers.js support.
- Rough raw-weight-only 4-bit arithmetic is 0.9 GB for 1.8B, 2 GB for 4B, 3.5 GB for 7B; metadata, unquantized tensors, activations, KV cache and runtime overhead add to that. These are arithmetic estimates, not tested downloads/VRAM figures.

### Gaps
- No browser runtime, ONNX export, WebGPU/WASM kernel compatibility, startup latency or peak-memory measurements were performed. Treat every new local option as an engineering evaluation, not a promised replacement.
- Coordinator/integration-researcher handoff: `konstbet/Hy-MT2-1.8B-ONNX`, reportedly published Nov 17, 2026 with ~1.075 GB q4f16 weights. **Community conversion, not the upstream Tencent model ID; not independently inspected or run in this research assignment.** Browser integration verification belongs to that parallel research. Upstream identity, Apache-2.0 declaration, and explicit Turkish support are independently verified above; those do not validate the conversion's runtime behavior or translation fidelity.
- Full MT2 license file was not retrieved (guessed LICENSE path returned 404); Apache-2.0 is verified from publisher metadata, not an independent legal review. Pin and inspect actual checkpoint license before distribution.
- TranslateGemma Turkish inclusion remains a specific verification gap: raw/tokenizer files were gated, PDF could be downloaded but available text extraction tools failed. Report: https://arxiv.org/pdf/2601.09012.

## Which cloud/server alternatives are strongest and what are the Qwen variants?

### Takeaway
For a managed dedicated translation API, evaluate **`qwen-mt-flash`** and **`qwen-mt-plus`** against **Google `general/translation-llm`**. They avoid multi-GB browser inference but require authenticated network service, billing, privacy disclosure and credential protection.

### Cited Findings
- Alibaba docs **updated Nov 12, 2026** recommend `qwen-mt-flash` for general use, `qwen-mt-plus` for highest professional-domain quality, and `qwen-mt-lite` for latency-sensitive work. Flash/Plus support **92 languages**, Lite **31**; supports term intervention, domain prompts, translation memory and automatic source detection. These are service model IDs; **parameter counts and an open-weight license are not disclosed on this API page**. [Current primary documentation](https://www.alibabacloud.com/help/en/model-studio/machine-translation)
- Qwen team's July 24, 2025 launch calls the earlier service **`qwen-mt-turbo`**, Qwen3-based lightweight MoE, explicitly lists **Turkish**, and provides API rather than weights. Do not confuse that historical alias with current Flash/Plus/Lite or assume their parameter counts equal general-purpose Qwen3 models. [Qwen launch](https://qwenlm.github.io/blog/qwen-mt/)
- Google dedicated managed model ID is **`general/translation-llm`**, full resource `projects/{project}/locations/{region}/models/general/translation-llm`; credentials and a Cloud project with Translation API are required. Turkish `tr` and English `en` are explicitly **officially supported** with any-to-any translation in the listed language set. This is not the same product as downloading TranslateGemma. Parameter count/open weights not provided by these service docs. [TLLM guide](https://docs.cloud.google.com/translate/docs/translation-llm), [language list](https://docs.cloud.google.com/translate/docs/languages)
- New open Qwen-derived **`ATH-MaaS/Qwen-MT-Lumen`** (older URL alias `ATH-MaaS/Lumen_wmt26`) declares **Apache-2.0**, **14.77B** parameters (rounded 14.8B), Qwen3-14B architecture, ~29.5 GB BF16 and **4096-token context**. Its 23 documented WMT26 directions **do not include Turkish**. Therefore interesting 2026 specialist research, **not a Turkish recommendation**, and not the Alibaba managed Qwen-MT service. [Publisher card](https://huggingface.co/ATH-MaaS/Qwen-MT-Lumen/raw/main/README.md)

### Inferences
- Recommended managed comparison: **Qwen Flash for interactive latency/cost**, **Qwen Plus and Google TLLM for quality**. No evidence here justifies declaring one the Turkish winner.
- A shared paid API secret cannot be protected in a public static JavaScript bundle. Use a controlled backend/proxy or consciously designed user-owned endpoint/credentials; API usage means text leaves the device. This is an architectural implication of the services' authenticated-call requirements, not an implementation undertaken here.
- Do not recommend Qwen Lite for Turkish until its smaller 31-language support list is verified separately.

### Gaps
- Exact region availability, current unit pricing, quotas, retention/residency policies and Turkish-specific service comparisons were not established; check account/region-specific docs before selecting.
- DeepL was checked, but its current supported-language page returned a client-rendered empty table; no model-specific Turkish capability claim is inferred from that page.

## What do benchmarks actually establish versus M2M100?

### Takeaway
There is credible primary-source evidence of modern multilingual translation progress, but **no comparable Turkish↔English head-to-head against M2M100 418M was established here**. Multilingual averages, Chinese-English human tests, and WMT ranks must not be presented as Turkish superiority.

### Cited Findings
- TranslateGemma publisher card reports WMT24++ 55-language averages: **MetricX (lower better) 5.32 / 3.60 / 3.09** and **COMET (higher better) 81.6 / 83.5 / 84.4** for 4B / 12B / 27B. Google says 12B beats baseline Gemma 3 27B and 4B rivals baseline Gemma 3 12B. These comparisons are **to general Gemma**, not M2M100, and aggregate rather than Turkish-specific. [Card](https://huggingface.co/google/translategemma-4b-it/blob/main/README.md), [announcement](https://blog.google/innovation-and-ai/technology/developers-tools/translategemma/)
- MT2 report Table 2 uses FLORES-200 **1,056 directions across 33 languages**, XCOMET-XXL/CometKiwi/GEMBA multiplied by 100. English-centric XCOMET scores: **90.00 (MT2-1.8B), 93.52 (MT2-7B), 93.85 (MT2-30B-A3B)** vs **89.42 (MT1.5-1.8B), 90.93 (MT1.5-7B)**. These are **publisher-run English-centric averages**, not isolated EN↔TR or independent leaderboard rankings. [MT2 report, Tables 2–3](https://arxiv.org/html/2605.22064v1)
- Important nuance: MT2-1.8B does **not** improve every metric: WMT25 XCOMET is **50.30** vs **53.08** for MT1.5-1.8B, though its CometKiwi/GEMBA improve. The paper's headline “consistent improvements” needs this qualification. MT2 report also gives IFMTBench as 7,344 samples with instructions in seven languages **not including Turkish**. [Report](https://arxiv.org/html/2605.22064v1)
- MT1.5 report's expert human evaluation is **ZH→EN / EN→ZH**, not Turkish. Its standard INT4 checkpoint loses English-centric XCOMET from **0.8942 to 0.8665**, whereas FP8 gets **0.8905**; “quantized” does not guarantee quality preservation. Later 1.25-bit QAT is a distinct checkpoint/training method, not that same INT4 result. [MT1.5 report, Tables 2 and 4](https://arxiv.org/html/2512.24092v1), [later 1.25-bit release](https://huggingface.co/tencent/Hy-MT1.5-1.8B-1.25bit)
- Qwen launch's human testing covers Chinese, English, Japanese, Korean, Thai, Arabic, Italian, Russian, Spanish and French: **not Turkish**. Its automatic claims include WMT24 and Chinese-English/English-German; do not turn these into EN↔TR results. [Primary launch evaluation](https://qwenlm.github.io/blog/qwen-mt/)
- MADLAD card explicitly warns quality varies by language/domain, evaluated only 204 supported languages, and research models had not been assessed for production. [Model card](https://huggingface.co/google/madlad400-3b-mt)

### Inferences
- Decision order: (1) feasibility of **Hy-MT2-1.8B** in the actual browser runtime; (2) blinded Turkish↔English comparison against current M2M100 and managed Qwen/TLLM; (3) only then choose default model. Include idioms, Turkish casing/diacritics, morphology, technical text, names/numbers, omissions/hallucinations and preservation of placeholders/code.
- Server budget permitting, compare **Hy-MT2-7B** with **TranslateGemma-12B/27B**, but only after TranslateGemma Turkish support is explicitly verified. No cross-paper metric subtraction is valid when evaluation sets/prompts/metrics differ.

### Gaps
- No independent Turkish-only scores, human judgments, quantized Turkish regression measurements or apples-to-apples M2M100 comparison found in this pass. The shortlist is actionable for evaluation, not a quality guarantee.
