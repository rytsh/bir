<script lang="ts">
  import initWasm, {
    process_file as processFile,
    export_csv as exportCsv,
    clear_csv_store as clearCsvStore,
  } from "luwi";

  // Result interface
  interface ProcessResult {
    count1: number;
    count2: number;
    total: number;
    message: string;
    resp: string[];
  }

  // WASM initialization state
  let wasmReady = $state(false);
  let wasmError = $state("");

  // File state
  let fileContent = $state("");
  let filePath = $state("");
  let luaScript = $state("");
  let luaScriptPath = $state("");

  // Input fields
  let tag1 = $state("");
  let tag2 = $state("");
  let luaFunction = $state("parse_line");

  // Result state
  let result = $state<ProcessResult | null>(null);
  let processing = $state(false);
  let error = $state("");

  // File input refs
  let fileInputRef: HTMLInputElement;
  let luaInputRef: HTMLInputElement;

  // Info panel state
  let showInfo = $state(true);

  // Initialize WASM module on component mount
  $effect(() => {
    initWasm("https://cdn.jsdelivr.net/npm/luwi@0.1.0/luwi_bg.wasm")
      .then(() => {
        wasmReady = true;
      })
      .catch((err: Error) => {
        wasmError = `Failed to initialize Luwi WASM module: ${err.message}`;
      });
  });

  // Read file helper
  function readFile(file: File, callback: (content: string) => void) {
    const reader = new FileReader();
    reader.onload = (e) => callback((e.target?.result as string) ?? "");
    reader.readAsText(file);
  }

  // File selection handlers
  function handleFileSelectClick() {
    fileInputRef?.click();
  }

  function handleLuaSelectClick() {
    luaInputRef?.click();
  }

  function handleFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    filePath = file.name;
    readFile(file, (content) => {
      fileContent = content;
    });
  }

  function handleLuaChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    luaScriptPath = file.name;
    readFile(file, (content) => {
      luaScript = content;
    });
  }

  // Process file
  async function handleProcessFile() {
    error = "";

    if (!wasmReady) {
      error = "WASM module not initialized yet. Please wait...";
      return;
    }
    if (!fileContent) {
      error = "Please select a file to parse.";
      return;
    }
    if (!luaScript) {
      error = "Please select a Lua script.";
      return;
    }
    if (!tag1 && !tag2) {
      error = "At least one tag (Tag1 or Tag2) is required.";
      return;
    }

    processing = true;

    try {
      // Clear previous CSV data
      clearCsvStore();

      // Call WASM function
      const response = processFile(
        fileContent,
        tag1,
        tag2,
        luaFunction,
        luaScript
      );

      // Extract data from response object
      if (response && typeof response === "object") {
        result = {
          count1: response.count1 ?? 0,
          count2: response.count2 ?? 0,
          total: response.total ?? 0,
          message: response.message ?? "",
          resp: response.resp ?? [],
        };
      } else {
        result = null;
      }
    } catch (e) {
      const err = e as Error;
      error = `Processing error: ${err.message}`;
      result = null;
    } finally {
      processing = false;
    }
  }

  // Download CSV
  function handleDownloadCsv() {
    if (!wasmReady) {
      error = "WASM module not initialized yet.";
      return;
    }

    try {
      const csvText = exportCsv();
      if (!csvText) {
        error = "No CSV data available to download. Process a file first.";
        return;
      }

      const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "parsed_results.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      const err = e as Error;
      error = `CSV export error: ${err.message}`;
    }
  }

  // Clear all
  function handleClear() {
    fileContent = "";
    filePath = "";
    luaScript = "";
    luaScriptPath = "";
    tag1 = "";
    tag2 = "";
    luaFunction = "parse_line";
    result = null;
    error = "";
    if (wasmReady) {
      clearCsvStore();
    }
  }

  // Derived states for UI
  let fileLineCount = $derived(fileContent ? fileContent.split("\n").length : 0);
  let luaLineCount = $derived(luaScript ? luaScript.split("\n").length : 0);
</script>

<div class="h-full flex flex-col gap-4">
  <!-- Header -->
  <header>
    <p class="text-sm text-(--color-text-muted)">
      Parse text files using custom Lua scripts powered by WebAssembly. Define flexible parsing rules with tag-based filtering.
    </p>
  </header>

  <!-- WASM Loading/Error -->
  {#if wasmError}
    <div class="p-3 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm">
      {wasmError}
    </div>
  {:else if !wasmReady}
    <div class="p-3 bg-(--color-bg-alt) border border-(--color-border) text-(--color-text-muted) text-sm flex items-center gap-2">
      <span class="inline-block w-4 h-4 border-2 border-(--color-text-muted) border-t-transparent rounded-full animate-spin"></span>
      Loading Luwi WASM module...
    </div>
  {/if}

  <!-- Error Display -->
  {#if error}
    <div class="p-3 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm">
      {error}
    </div>
  {/if}

  <!-- Hidden file inputs -->
  <input
    bind:this={fileInputRef}
    type="file"
    accept=".txt,.log,.csv,.dat"
    class="hidden"
    onchange={handleFileChange}
  />
  <input
    bind:this={luaInputRef}
    type="file"
    accept=".lua,.txt"
    class="hidden"
    onchange={handleLuaChange}
  />

  <!-- Main Content with Info Panel -->
  <div class="flex flex-col lg:flex-row gap-4 flex-1">
    <!-- Left Side - Main Content -->
    <div class="flex-1 flex flex-col gap-4">
      <!-- Clear Button - Top Right -->
      <div class="flex justify-end">
        <button
          onclick={handleClear}
          class="text-sm text-(--color-text-muted) hover:text-(--color-text) transition-colors"
        >
          Clear
        </button>
      </div>

      <!-- Input File & Lua Script Side by Side -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- Input File Card -->
        <button
          onclick={handleFileSelectClick}
          disabled={!wasmReady}
          class="group p-6 bg-(--color-bg-alt) border-2 border-dashed border-(--color-border) hover:border-(--color-primary) hover:bg-(--color-bg) disabled:opacity-50 disabled:cursor-not-allowed transition-all text-left"
        >
          <div class="flex items-start gap-4">
            <div class="w-12 h-12 flex items-center justify-center bg-(--color-bg) border border-(--color-border) group-hover:border-(--color-primary) transition-colors">
              <span class="text-2xl">📄</span>
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="text-sm font-medium text-(--color-text) mb-1">Input File</h3>
              {#if filePath}
                <p class="text-sm text-(--color-primary) font-mono truncate">{filePath}</p>
                <p class="text-xs text-(--color-text-muted) mt-1">{fileLineCount.toLocaleString()} lines</p>
              {:else}
                <p class="text-sm text-(--color-text-muted)">Click to select a text file</p>
                <p class="text-xs text-(--color-text-muted) mt-1">.txt, .log, .csv, .dat</p>
              {/if}
            </div>
          </div>
        </button>

        <!-- Lua Script Card -->
        <button
          onclick={handleLuaSelectClick}
          disabled={!wasmReady}
          class="group p-6 bg-(--color-bg-alt) border-2 border-dashed border-(--color-border) hover:border-(--color-primary) hover:bg-(--color-bg) disabled:opacity-50 disabled:cursor-not-allowed transition-all text-left"
        >
          <div class="flex items-start gap-4">
            <div class="w-12 h-12 flex items-center justify-center bg-(--color-bg) border border-(--color-border) group-hover:border-(--color-primary) transition-colors">
              <span class="text-2xl">🌙</span>
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="text-sm font-medium text-(--color-text) mb-1">Lua Script</h3>
              {#if luaScriptPath}
                <p class="text-sm text-(--color-primary) font-mono truncate">{luaScriptPath}</p>
                <p class="text-xs text-(--color-text-muted) mt-1">{luaLineCount.toLocaleString()} lines</p>
              {:else}
                <p class="text-sm text-(--color-text-muted)">Click to select a Lua script</p>
                <p class="text-xs text-(--color-text-muted) mt-1">.lua, .txt</p>
              {/if}
            </div>
          </div>
        </button>
      </div>

      <!-- Tag Filters & Actions Bar -->
      <div class="p-4 bg-(--color-bg-alt) border border-gray-400 dark:border-gray-600">
        <!-- Row 1: Tag Filters -->
        <div class="grid grid-cols-3 gap-3 mb-4">
          <div>
            <label for="tag1" class="block text-xs text-(--color-text-muted) mb-1.5 uppercase tracking-wider">
              Tag 1
            </label>
            <input
              id="tag1"
              type="text"
              bind:value={tag1}
              placeholder="e.g., 008"
              class="w-full px-3 py-2 bg-(--color-bg) border border-gray-400 dark:border-gray-600 text-(--color-text) font-mono text-sm focus:border-black dark:focus:border-white outline-none placeholder:text-(--color-text-light)"
            />
          </div>
          <div>
            <label for="tag2" class="block text-xs text-(--color-text-muted) mb-1.5 uppercase tracking-wider">
              Tag 2
            </label>
            <input
              id="tag2"
              type="text"
              bind:value={tag2}
              placeholder="e.g., 034"
              class="w-full px-3 py-2 bg-(--color-bg) border border-gray-400 dark:border-gray-600 text-(--color-text) font-mono text-sm focus:border-black dark:focus:border-white outline-none placeholder:text-(--color-text-light)"
            />
          </div>
          <div>
            <label for="luaFunction" class="block text-xs text-(--color-text-muted) mb-1.5 uppercase tracking-wider">
              Function
            </label>
            <input
              id="luaFunction"
              type="text"
              bind:value={luaFunction}
              placeholder="parse_line"
              class="w-full px-3 py-2 bg-(--color-bg) border border-gray-400 dark:border-gray-600 text-(--color-text) font-mono text-sm focus:border-black dark:focus:border-white outline-none placeholder:text-(--color-text-light)"
            />
          </div>
        </div>

        <!-- Row 2: Action Buttons -->
        <div class="flex justify-end gap-2">
          <button
            onclick={handleProcessFile}
            disabled={!wasmReady || processing}
            class="px-6 py-2 bg-(--color-accent) hover:bg-(--color-accent-hover) text-(--color-btn-text) font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {#if processing}
              <span class="inline-block w-4 h-4 border-2 border-(--color-btn-text) border-t-transparent rounded-full animate-spin"></span>
              Processing...
            {:else}
              Process File
            {/if}
          </button>
          <button
            onclick={handleDownloadCsv}
            disabled={!wasmReady || !result}
            class="px-4 py-2 bg-(--color-bg) hover:bg-(--color-border) text-(--color-text) disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-gray-400 dark:border-gray-600"
          >
            Download CSV
          </button>
        </div>
      </div>

      <!-- Results Section -->
      {#if result}
        <div class="flex-1 flex flex-col gap-4">
          <!-- Stats Cards -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
              <div class="text-xs text-(--color-text-muted) mb-1 uppercase tracking-wider">Tag1 Count</div>
              <div class="text-2xl font-mono text-(--color-text)">{result.count1.toLocaleString()}</div>
            </div>
            <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
              <div class="text-xs text-(--color-text-muted) mb-1 uppercase tracking-wider">Tag2 Count</div>
              <div class="text-2xl font-mono text-(--color-text)">{result.count2.toLocaleString()}</div>
            </div>
            <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
              <div class="text-xs text-(--color-text-muted) mb-1 uppercase tracking-wider">Total Parsed</div>
              <div class="text-2xl font-mono text-(--color-text)">{result.total.toLocaleString()}</div>
            </div>
            <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
              <div class="text-xs text-(--color-text-muted) mb-1 uppercase tracking-wider">Output Lines</div>
              <div class="text-2xl font-mono text-(--color-text)">{result.resp.length.toLocaleString()}</div>
            </div>
          </div>

          {#if result.message}
            <div class="p-3 bg-(--color-bg-alt) border border-(--color-border) text-sm text-(--color-text)">
              <span class="font-medium text-(--color-text-muted)">Message:</span> {result.message}
            </div>
          {/if}

          <!-- Parsed Lines -->
          {#if result.resp && result.resp.length > 0}
            <div class="flex-1 flex flex-col bg-(--color-bg-alt) border border-(--color-border) overflow-hidden">
              <div class="px-4 py-3 border-b border-(--color-border) flex justify-between items-center">
                <h3 class="text-sm font-medium text-(--color-text)">
                  Parsed Lines <span class="text-(--color-text-muted)">({result.resp.length.toLocaleString()})</span>
                </h3>
              </div>
              <div class="flex-1 overflow-y-auto max-h-80">
                {#each result.resp as line, idx}
                  <div class="flex px-4 py-2 border-b border-(--color-border) last:border-b-0 odd:bg-(--color-bg-alt) even:bg-(--color-bg) hover:brightness-95 dark:hover:brightness-110 transition-all">
                    <span class="text-xs text-(--color-text-muted) w-12 flex-shrink-0 font-mono">{idx + 1}</span>
                    <span class="text-sm text-(--color-text) font-mono break-all">{line}</span>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Right Side - Info Panel -->
    <div class="lg:w-72 flex-shrink-0">
      <div class="p-4 bg-(--color-bg-alt) border border-(--color-border) sticky top-4">
        <div class="flex justify-between items-center mb-3">
          <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium">
            How It Works
          </h2>
          <button
            onclick={() => showInfo = !showInfo}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            {showInfo ? "Hide" : "Show"}
          </button>
        </div>

        {#if showInfo}
          <div class="text-sm text-(--color-text-muted) space-y-3">
            <div>
              <h3 class="font-medium text-(--color-text) mb-1">What is Luwi?</h3>
              <p>Luwi is a file parser written in Rust and compiled to WebAssembly. It uses Lua scripts to define custom parsing rules.</p>
            </div>

            <div>
              <h3 class="font-medium text-(--color-text) mb-1">Tag Filtering</h3>
              <p>Tag1 and Tag2 filter lines. Lines matching these tags are processed by your Lua function. Use both for AND logic.</p>
            </div>

            <div>
              <h3 class="font-medium text-(--color-text) mb-1">Lua Function</h3>
              <p>Your Lua script should define a function (default: <code class="px-1 bg-(--color-bg) text-(--color-text-light)">parse_line</code>) that receives each matching line.</p>
            </div>

            <div>
              <h3 class="font-medium text-(--color-text) mb-1">Example Script</h3>
              <pre class="p-2 bg-(--color-bg) border border-(--color-border) text-xs font-mono overflow-x-auto">function parse_line(line)
  local f1 = line:sub(1, 10)
  local f2 = line:sub(11, 20)
  return f1 .. "," .. f2
end</pre>
            </div>

            <div>
              <h3 class="font-medium text-(--color-text) mb-1">Output</h3>
              <p>Results show tag counts and parsed lines. Use "Download CSV" to export.</p>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
