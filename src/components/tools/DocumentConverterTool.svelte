<script lang="ts">
  import { loadPandoc, type ConvertResult } from "../../lib/pandoc";

  type DocFormat = {
    id: string;
    label: string;
    ext: string;
    binary: boolean;
  };

  const formats: DocFormat[] = [
    { id: "markdown", label: "Markdown", ext: "md", binary: false },
    { id: "html", label: "HTML", ext: "html", binary: false },
    { id: "docx", label: "Word (DOCX)", ext: "docx", binary: true },
    { id: "rtf", label: "Rich Text (RTF)", ext: "rtf", binary: false },
    { id: "epub", label: "EPUB", ext: "epub", binary: true },
    { id: "odt", label: "OpenDocument (ODT)", ext: "odt", binary: true },
    { id: "rst", label: "reStructuredText", ext: "rst", binary: false },
    { id: "latex", label: "LaTeX", ext: "tex", binary: false },
    { id: "docbook", label: "DocBook XML", ext: "xml", binary: false },
    { id: "plain", label: "Plain Text", ext: "txt", binary: false },
    { id: "asciidoc", label: "AsciiDoc", ext: "adoc", binary: false },
    { id: "org", label: "Org Mode", ext: "org", binary: false },
    { id: "mediawiki", label: "MediaWiki", ext: "wiki", binary: false },
  ];

  let sourceFormat = $state("markdown");
  let targetFormat = $state("html");
  let inputText = $state("");
  let inputFile = $state<File | null>(null);
  let inputFileName = $state("");
  let outputText = $state("");
  let outputBlob = $state<Blob | null>(null);
  let errorMessage = $state("");
  let isConverting = $state(false);
  let isLoadingWasm = $state(false);
  let wasmLoaded = $state(false);
  let loadProgress = $state("");
  let dragOver = $state(false);

  // Pandoc convert function (lazy-loaded)
  let pandocConvert: ((options: Record<string, unknown>, stdin: string | null, files: Record<string, string | Blob>) => Promise<ConvertResult>) | null = null;

  const sourceFormatObj = $derived(formats.find((f) => f.id === sourceFormat)!);
  const targetFormatObj = $derived(formats.find((f) => f.id === targetFormat)!);
  const hasInput = $derived(sourceFormatObj.binary ? inputFile !== null : inputText.trim().length > 0);

  async function loadPandocWasm() {
    if (pandocConvert) return;
    isLoadingWasm = true;
    loadProgress = "Downloading Pandoc WASM (~56 MB)...";
    try {
      pandocConvert = await loadPandoc((msg) => {
        loadProgress = msg;
      });
      wasmLoaded = true;
      loadProgress = "";
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : "Failed to load Pandoc WASM";
      loadProgress = "";
    } finally {
      isLoadingWasm = false;
    }
  }

  function handleFileChange(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      setFile(target.files[0]);
    }
  }

  function setFile(f: File) {
    inputFile = f;
    inputFileName = f.name;
    errorMessage = "";

    // For text formats, also read text content
    if (!sourceFormatObj.binary) {
      const reader = new FileReader();
      reader.onload = () => {
        inputText = reader.result as string;
      };
      reader.readAsText(f);
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0]);
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragOver = true;
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  }

  async function convert() {
    if (!hasInput) return;
    errorMessage = "";
    outputText = "";
    outputBlob = null;
    isConverting = true;

    try {
      await loadPandocWasm();
      if (!pandocConvert) return;

      const options: Record<string, unknown> = {
        from: sourceFormat,
        to: targetFormat,
      };

      // For binary output formats, use output-file
      if (targetFormatObj.binary) {
        options["output-file"] = `output.${targetFormatObj.ext}`;
      }

      let stdin: string | null = null;
      const files: Record<string, string | Blob> = {};

      if (sourceFormatObj.binary && inputFile) {
        // Binary input: pass as file
        const filename = `input.${sourceFormatObj.ext}`;
        files[filename] = inputFile;
        options["input-files"] = [filename];
      } else {
        // Text input: pass as stdin
        stdin = inputText;
      }

      const result = await pandocConvert(options, stdin, files);

      if (result.stderr) {
        console.warn("Pandoc stderr:", result.stderr);
      }

      if (targetFormatObj.binary) {
        const outputFileName = `output.${targetFormatObj.ext}`;
        if (result.files[outputFileName]) {
          outputBlob = result.files[outputFileName];
        } else {
          throw new Error("Conversion produced no output file");
        }
      } else {
        outputText = result.stdout;
        if (!outputText && !result.stderr) {
          throw new Error("Conversion produced no output");
        }
      }
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : "Conversion failed";
    } finally {
      isConverting = false;
    }
  }

  function downloadOutput() {
    const baseName = inputFileName
      ? inputFileName.replace(/\.[^.]+$/, "")
      : "converted";
    const filename = `${baseName}.${targetFormatObj.ext}`;

    let blob: Blob;
    if (outputBlob) {
      blob = outputBlob;
    } else {
      blob = new Blob([outputText], { type: "text/plain;charset=utf-8" });
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function copyOutput() {
    if (outputText) {
      navigator.clipboard.writeText(outputText);
    }
  }

  function clear() {
    inputText = "";
    inputFile = null;
    inputFileName = "";
    outputText = "";
    outputBlob = null;
    errorMessage = "";
  }

  function swapFormats() {
    const tmp = sourceFormat;
    sourceFormat = targetFormat;
    targetFormat = tmp;
    clear();
  }

  // Accepted file extensions for file input
  const acceptExts = $derived(
    formats.map((f) => `.${f.ext}`).join(",")
  );
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Convert documents between formats using Pandoc WASM. Runs entirely in your browser.
    </p>
  </header>

  {#if errorMessage}
    <div class="mb-4 p-3 border border-red-500 bg-red-500/10 text-red-500 text-sm">
      {errorMessage}
    </div>
  {/if}

  <!-- Format selectors -->
  <div class="mb-4 flex items-center gap-3 flex-wrap">
    <div class="flex-1 min-w-[140px]">
      <label class="block text-xs text-(--color-text-muted) mb-1">From</label>
      <select
        bind:value={sourceFormat}
        onchange={() => clear()}
        class="w-full px-3 py-2 text-sm bg-(--color-bg) border border-(--color-border) text-(--color-text) focus:border-(--color-accent) focus:outline-none"
      >
        {#each formats as fmt}
          <option value={fmt.id}>{fmt.label}</option>
        {/each}
      </select>
    </div>

    <button
      onclick={swapFormats}
      class="mt-4 px-3 py-2 text-sm border border-(--color-border) text-(--color-text) hover:bg-(--color-bg-alt) transition-colors"
      title="Swap formats"
    >
      &#8644;
    </button>

    <div class="flex-1 min-w-[140px]">
      <label class="block text-xs text-(--color-text-muted) mb-1">To</label>
      <select
        bind:value={targetFormat}
        class="w-full px-3 py-2 text-sm bg-(--color-bg) border border-(--color-border) text-(--color-text) focus:border-(--color-accent) focus:outline-none"
      >
        {#each formats.filter((f) => f.id !== sourceFormat) as fmt}
          <option value={fmt.id}>{fmt.label}</option>
        {/each}
      </select>
    </div>
  </div>

  <!-- Input area -->
  <div class="flex-1 flex flex-col min-h-0 gap-4 lg:flex-row">
    <!-- Source panel -->
    <div class="flex-1 flex flex-col min-h-[200px]">
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs font-medium text-(--color-text-muted) uppercase tracking-wide">Input ({sourceFormatObj.label})</span>
        {#if inputFileName}
          <span class="text-xs text-(--color-text-muted)">
            {inputFileName} ({inputFile ? formatFileSize(inputFile.size) : ""})
          </span>
        {/if}
      </div>

      {#if sourceFormatObj.binary}
        <!-- File upload for binary formats -->
        <div
          ondrop={handleDrop}
          ondragover={handleDragOver}
          ondragleave={handleDragLeave}
          class="flex-1 border-2 border-dashed {dragOver ? 'border-(--color-accent)' : 'border-(--color-border)'} flex flex-col items-center justify-center p-4 hover:border-(--color-accent) transition-colors cursor-pointer"
        >
          <input
            type="file"
            accept={`.${sourceFormatObj.ext}`}
            onchange={handleFileChange}
            class="hidden"
            id="doc-input"
          />
          <label for="doc-input" class="cursor-pointer text-center">
            {#if inputFile}
              <div class="text-3xl mb-2">&#128196;</div>
              <p class="text-sm text-(--color-text)">{inputFileName}</p>
              <p class="text-xs text-(--color-text-muted) mt-1">{formatFileSize(inputFile.size)}</p>
            {:else}
              <div class="text-3xl mb-2">&#128196;</div>
              <p class="text-sm text-(--color-text)">Drop a .{sourceFormatObj.ext} file or click to select</p>
              <p class="text-xs text-(--color-text-muted) mt-1">{sourceFormatObj.label} files</p>
            {/if}
          </label>
        </div>
      {:else}
        <!-- Text input with file option -->
        <div class="flex-1 flex flex-col min-h-0">
          <div class="flex gap-2 mb-2">
            <label class="px-2 py-1 text-xs border border-(--color-border) text-(--color-text-muted) hover:bg-(--color-bg-alt) cursor-pointer transition-colors">
              Upload File
              <input
                type="file"
                accept={acceptExts}
                onchange={handleFileChange}
                class="hidden"
              />
            </label>
            {#if inputFileName}
              <button onclick={() => { inputFile = null; inputFileName = ""; }} class="px-2 py-1 text-xs text-(--color-text-muted) hover:text-(--color-text)">
                Clear file
              </button>
            {/if}
          </div>
          <textarea
            bind:value={inputText}
            placeholder="Paste your {sourceFormatObj.label} content here..."
            class="flex-1 w-full p-3 text-sm font-mono bg-(--color-bg) border border-(--color-border) text-(--color-text) resize-none focus:border-(--color-accent) focus:outline-none"
          ></textarea>
        </div>
      {/if}
    </div>

    <!-- Output panel -->
    <div class="flex-1 flex flex-col min-h-[200px]">
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs font-medium text-(--color-text-muted) uppercase tracking-wide">Output ({targetFormatObj.label})</span>
        {#if outputText || outputBlob}
          <div class="flex gap-2">
            {#if !targetFormatObj.binary}
              <button onclick={copyOutput} class="px-2 py-1 text-xs border border-(--color-border) text-(--color-text-muted) hover:bg-(--color-bg-alt) transition-colors">
                Copy
              </button>
            {/if}
            <button onclick={downloadOutput} class="px-2 py-1 text-xs border border-(--color-border) text-(--color-text-muted) hover:bg-(--color-bg-alt) transition-colors">
              Download .{targetFormatObj.ext}
            </button>
          </div>
        {/if}
      </div>

      {#if targetFormatObj.binary && outputBlob}
        <div class="flex-1 border border-(--color-border) flex items-center justify-center">
          <div class="text-center">
            <div class="text-3xl mb-2">&#128196;</div>
            <p class="text-sm text-(--color-text)">Conversion complete</p>
            <p class="text-xs text-(--color-text-muted) mt-1">{formatFileSize(outputBlob.size)}</p>
            <button onclick={downloadOutput} class="mt-3 px-4 py-2 text-sm bg-(--color-accent) text-white hover:opacity-90 transition-opacity">
              Download .{targetFormatObj.ext}
            </button>
          </div>
        </div>
      {:else}
        <textarea
          value={outputText}
          readonly
          placeholder="Converted output will appear here..."
          class="flex-1 w-full p-3 text-sm font-mono bg-(--color-bg-alt) border border-(--color-border) text-(--color-text) resize-none"
        ></textarea>
      {/if}
    </div>
  </div>

  <!-- Action bar -->
  <div class="mt-4 flex items-center gap-3">
    <button
      onclick={convert}
      disabled={!hasInput || isConverting || isLoadingWasm}
      class="px-6 py-2 text-sm font-medium bg-(--color-accent) text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {#if isLoadingWasm}
        Loading...
      {:else if isConverting}
        Converting...
      {:else}
        Convert
      {/if}
    </button>

    {#if loadProgress}
      <span class="text-xs text-(--color-text-muted)">{loadProgress}</span>
    {/if}

    {#if wasmLoaded}
      <span class="text-xs text-green-500">Pandoc ready</span>
    {/if}

    <button
      onclick={clear}
      class="ml-auto px-3 py-2 text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
    >
      Clear
    </button>
  </div>
</div>
