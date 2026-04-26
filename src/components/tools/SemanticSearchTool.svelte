<script lang="ts">
  import { env, pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

  env.allowLocalModels = false;
  env.useBrowserCache = true;

  const MODELS = [
    { value: "Xenova/all-MiniLM-L6-v2", label: "all-MiniLM-L6-v2 (~25MB, 384 dim, fast)" },
    { value: "Xenova/bge-small-en-v1.5", label: "BGE Small EN (~33MB, 384 dim)" },
    { value: "Xenova/multilingual-e5-small", label: "Multilingual E5 Small (~118MB, 100+ langs)" },
    { value: "Xenova/all-mpnet-base-v2", label: "all-mpnet-base-v2 (~110MB, 768 dim, accurate)" },
  ];

  interface Doc {
    id: number;
    text: string;
    embedding?: Float32Array;
  }

  let selectedModel = $state(MODELS[0].value);
  let pipe: FeatureExtractionPipeline | null = null;
  let currentModelId = "";

  let isLoading = $state(false);
  let isProcessing = $state(false);
  let loadProgress = $state(0);
  let statusMessage = $state("");
  let errorMessage = $state("");

  let docsText = $state(`Cats are small carnivorous mammals often kept as pets.
Dogs are loyal companions and have been domesticated for thousands of years.
Photosynthesis converts sunlight into chemical energy in plants.
The Eiffel Tower is located in Paris, France.
JavaScript is a programming language used for web development.
Pizza originated in Italy and is now popular worldwide.
The speed of light is approximately 299,792 kilometers per second.
A hash table provides O(1) average-case lookups.
Coffee contains caffeine, a natural stimulant.
The Great Wall of China is over 13,000 miles long.`);

  let docs = $state<Doc[]>([]);
  let query = $state("a fast lookup data structure");
  let topK = $state(5);
  let results = $state<{ doc: Doc; score: number }[]>([]);
  let counter = 0;
  let indexedModelId = $state("");

  async function loadModel() {
    if (pipe && currentModelId === selectedModel) return pipe;
    isLoading = true;
    errorMessage = "";
    loadProgress = 0;
    statusMessage = "Loading embedding model…";

    try {
      const fileProgress: Record<string, number> = {};
      const instance = await pipeline("feature-extraction", selectedModel, {
        progress_callback: (p: { status: string; file?: string; progress?: number }) => {
          if (p.status === "progress" && p.file) {
            fileProgress[p.file] = p.progress ?? 0;
            const files = Object.values(fileProgress);
            loadProgress = files.reduce((a, b) => a + b, 0) / files.length;
            statusMessage = `Loading ${p.file.split("/").pop()} (${Math.round(p.progress ?? 0)}%)`;
          } else if (p.status === "ready") {
            loadProgress = 100;
            statusMessage = "Model ready!";
          } else if (p.status === "download" && p.file) {
            statusMessage = `Downloading ${p.file.split("/").pop()}…`;
          }
        },
      });
      pipe = instance as FeatureExtractionPipeline;
      currentModelId = selectedModel;
      isLoading = false;
      statusMessage = "";
      return pipe;
    } catch (e) {
      isLoading = false;
      errorMessage = `Failed to load model: ${(e as Error).message}`;
      throw e;
    }
  }

  async function embed(text: string): Promise<Float32Array> {
    const p = await loadModel();
    const out = await p(text, { pooling: "mean", normalize: true });
    // out is a Tensor; .data is a typed array (Float32Array)
    return Float32Array.from(out.data as Iterable<number>);
  }

  async function indexDocs() {
    errorMessage = "";
    const lines = docsText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      docs = [];
      return;
    }
    isProcessing = true;
    statusMessage = "Indexing documents…";
    try {
      const next: Doc[] = [];
      for (let i = 0; i < lines.length; i++) {
        statusMessage = `Embedding ${i + 1}/${lines.length}…`;
        const e = await embed(lines[i]);
        next.push({ id: ++counter, text: lines[i], embedding: e });
      }
      docs = next;
      indexedModelId = selectedModel;
      statusMessage = `Indexed ${docs.length} document(s).`;
    } catch (e) {
      errorMessage = `Indexing failed: ${(e as Error).message}`;
    } finally {
      isProcessing = false;
    }
  }

  function cosineSim(a: Float32Array, b: Float32Array): number {
    // both are L2-normalized → cosine = dot product
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }

  async function search() {
    errorMessage = "";
    if (docs.length === 0) {
      errorMessage = "Index your documents first.";
      return;
    }
    if (indexedModelId !== selectedModel) {
      errorMessage = "Document index was built with a different model. Re-index first.";
      return;
    }
    if (!query.trim()) {
      results = [];
      return;
    }
    isProcessing = true;
    statusMessage = "Embedding query…";
    try {
      const q = await embed(query);
      const scored = docs
        .map((d) => ({ doc: d, score: d.embedding ? cosineSim(q, d.embedding) : -1 }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
      results = scored;
      statusMessage = "";
    } catch (e) {
      errorMessage = `Search failed: ${(e as Error).message}`;
    } finally {
      isProcessing = false;
    }
  }

  function exportIndex() {
    const data = docs.map((d) => ({
      id: d.id,
      text: d.text,
      embedding: d.embedding ? Array.from(d.embedding) : null,
    }));
    const blob = new Blob([JSON.stringify({ model: indexedModelId, docs: data }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `embeddings-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="flex-1 overflow-auto bg-(--color-bg) text-(--color-text) p-6">
  <div class="max-w-5xl mx-auto space-y-6">

    <section class="border border-(--color-border) bg-(--color-bg-alt) p-4">
      <div class="flex flex-wrap gap-3 items-end">
        <div class="flex-1 min-w-[260px]">
          <label for="emb-model" class="block text-xs text-(--color-text-light) mb-1">Embedding model</label>
          <select id="emb-model" bind:value={selectedModel} disabled={isLoading || isProcessing}
            class="w-full px-2 py-1.5 bg-(--color-bg) border border-(--color-border) text-sm">
            {#each MODELS as m}<option value={m.value}>{m.label}</option>{/each}
          </select>
        </div>
        <div>
          <label for="topk" class="block text-xs text-(--color-text-light) mb-1">Top K</label>
          <input id="topk" type="number" min="1" max="50" bind:value={topK}
            class="w-20 px-2 py-1.5 bg-(--color-bg) border border-(--color-border) text-sm" />
        </div>
      </div>

      {#if isLoading}
        <div class="mt-3">
          <div class="text-xs text-(--color-text-light) mb-1">{statusMessage}</div>
          <div class="w-full h-2 bg-(--color-bg) rounded overflow-hidden">
            <div class="h-full bg-(--color-accent) transition-all" style="width: {loadProgress}%"></div>
          </div>
        </div>
      {/if}
    </section>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <!-- Documents -->
      <section class="border border-(--color-border) bg-(--color-bg-alt) flex flex-col">
        <div class="px-4 py-2 border-b border-(--color-border) flex items-center justify-between">
          <h3 class="font-medium">Documents (one per line)</h3>
          <span class="text-xs text-(--color-text-light)">{docs.length} indexed</span>
        </div>
        <textarea
          bind:value={docsText}
          disabled={isProcessing}
          class="flex-1 w-full p-3 bg-(--color-bg) text-sm font-mono resize-none min-h-[300px] border-0 focus:outline-none"
        ></textarea>
        <div class="p-3 border-t border-(--color-border) flex gap-2">
          <button onclick={indexDocs} disabled={isProcessing || isLoading}
            class="px-3 py-1.5 text-sm bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) disabled:opacity-40">
            {isProcessing ? "Working…" : "Index documents"}
          </button>
          {#if docs.length > 0}
            <button onclick={exportIndex} class="px-3 py-1.5 text-sm border border-(--color-border) hover:bg-(--color-bg)">Export JSON</button>
          {/if}
        </div>
      </section>

      <!-- Query -->
      <section class="border border-(--color-border) bg-(--color-bg-alt) flex flex-col">
        <div class="px-4 py-2 border-b border-(--color-border)">
          <h3 class="font-medium">Query</h3>
        </div>
        <div class="p-3">
          <textarea
            bind:value={query}
            placeholder="Ask a question or describe what you're looking for…"
            class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm min-h-[80px] resize-none"
          ></textarea>
          <button onclick={search} disabled={isProcessing || isLoading || docs.length === 0}
            class="mt-2 px-3 py-1.5 text-sm bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) disabled:opacity-40">
            Search
          </button>
        </div>

        {#if errorMessage}
          <div class="m-3 mt-0 border border-red-500/40 bg-red-500/10 text-red-500 p-2 text-sm">{errorMessage}</div>
        {/if}

        <div class="flex-1 overflow-auto p-3 space-y-2">
          {#if results.length === 0}
            <div class="text-center text-sm text-(--color-text-light) py-8">
              {docs.length === 0 ? "Index documents to start searching." : "Run a query to see results."}
            </div>
          {/if}
          {#each results as r, i}
            <div class="border border-(--color-border) bg-(--color-bg) p-2">
              <div class="flex items-center justify-between text-xs text-(--color-text-light) mb-1">
                <span>#{i + 1}</span>
                <span class="font-mono">score: {r.score.toFixed(4)}</span>
              </div>
              <div class="text-sm">{r.doc.text}</div>
            </div>
          {/each}
        </div>
      </section>
    </div>

    <div class="text-xs text-(--color-text-light)">
      Cosine similarity is used between L2-normalized embeddings. Re-index when changing models.
      Embeddings stay in memory for this page; use Export to save the JSON snapshot.
    </div>

  </div>
</div>
