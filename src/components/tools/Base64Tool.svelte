<script lang="ts">
  import CodeMirror from "svelte-codemirror-editor";
  import { EditorView } from "@codemirror/view";
  import { createDarkModeObserver, getInitialDarkMode, createTheme, editorHeightExtension } from "../../lib/codemirror.js";
  import { onMount } from "svelte";

  let mode = $state<"encode" | "decode">("encode");
  let urlSafe = $state(false);
  let error = $state("");
  let copied = $state(false);
  let isDark = $state(getInitialDarkMode());
  let urlInput = $state("");
  let urlLoading = $state(false);
  let showUrlInput = $state(false);
  let downloadFilename = $state("decoded-file");
  let fileMode = $state(false);

  let inputValue = $state("");
  let outputValue = $state("");
  let fileInput: HTMLInputElement;

  // CodeMirror extensions based on dark mode
  let inputExtensions = $derived([
    ...createTheme(isDark),
    editorHeightExtension,
    EditorView.lineWrapping,
  ]);

  let outputExtensions = $derived([
    ...createTheme(isDark),
    editorHeightExtension,
    EditorView.lineWrapping,
    EditorView.editable.of(false),
    EditorView.contentAttributes.of({ "aria-readonly": "true" }),
  ]);

  // Standard Base64 to URL-safe Base64
  const toUrlSafe = (base64: string): string => {
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };

  // URL-safe Base64 to Standard Base64
  const fromUrlSafe = (urlSafeBase64: string): string => {
    let base64 = urlSafeBase64.replace(/-/g, "+").replace(/_/g, "/");
    // Add padding if needed
    const padding = base64.length % 4;
    if (padding) {
      base64 += "=".repeat(4 - padding);
    }
    return base64;
  };

  const utf8ToBase64 = (str: string): string => {
    const bytes = new TextEncoder().encode(str);
    const binString = Array.from(bytes, (byte) =>
      String.fromCodePoint(byte),
    ).join("");
    const base64 = btoa(binString);
    return urlSafe ? toUrlSafe(base64) : base64;
  };

  const base64ToUtf8 = (base64: string): string => {
    const standardBase64 = urlSafe ? fromUrlSafe(base64) : base64;
    const binString = atob(standardBase64);
    const bytes = Uint8Array.from(binString, (char) => char.codePointAt(0)!);
    return new TextDecoder().decode(bytes);
  };

  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    const binString = Array.from(bytes, (byte) =>
      String.fromCodePoint(byte),
    ).join("");
    const base64 = btoa(binString);
    return urlSafe ? toUrlSafe(base64) : base64;
  };

  const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
    const standardBase64 = urlSafe ? fromUrlSafe(base64) : base64;
    const binString = atob(standardBase64);
    const bytes = new Uint8Array(binString.length);
    for (let i = 0; i < binString.length; i++) {
      bytes[i] = binString.charCodeAt(i);
    }
    return bytes.buffer;
  };

  const convert = () => {
    error = "";

    if (!inputValue.trim()) {
      outputValue = "";
      return;
    }

    // Skip text conversion in file mode (decode mode)
    if (mode === "decode" && fileMode) {
      outputValue = "";
      return;
    }

    try {
      let result: string;
      if (mode === "encode") {
        result = utf8ToBase64(inputValue);
      } else {
        result = base64ToUtf8(inputValue);
      }
      outputValue = result;
    } catch (e) {
      error =
        mode === "decode" ? "Invalid Base64 string" : "Failed to encode string";
      outputValue = "";
    }
  };

  $effect(() => {
    // Re-check on mount in case SSR value was wrong
    isDark = getInitialDarkMode();

    const cleanup = createDarkModeObserver((newIsDark) => {
      if (newIsDark !== isDark) {
        isDark = newIsDark;
      }
    });

    return cleanup;
  });

  // Re-convert when input changes
  $effect(() => {
    inputValue;
    convert();
  });

  // Re-convert when mode changes
  $effect(() => {
    mode;
    convert();
  });

  // Re-convert when urlSafe changes
  $effect(() => {
    urlSafe;
    convert();
  });

  // Re-convert when fileMode changes
  $effect(() => {
    fileMode;
    convert();
  });

  const handleSwap = () => {
    if (outputValue) {
      inputValue = outputValue;
      mode = mode === "encode" ? "decode" : "encode";
      error = "";
    }
  };

  const handleClear = () => {
    inputValue = "";
    error = "";
  };

  const handleCopy = () => {
    if (outputValue) {
      navigator.clipboard.writeText(outputValue);
      copied = true;
      setTimeout(() => { copied = false; }, 2000);
    }
  };

  const handlePaste = () => {
    navigator.clipboard.readText().then((text) => {
      inputValue = text;
    });
  };

  const handleFileSelect = (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    // Set suggested filename for download
    downloadFilename = file.name;

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as ArrayBuffer;
      const base64 = arrayBufferToBase64(result);

      // When loading a file, switch to encode mode and show the base64
      mode = "encode";
      inputValue = `[Binary file: ${file.name}]`;
      outputValue = base64;
      error = "";
    };
    reader.onerror = () => {
      error = "Failed to read file";
    };
    reader.readAsArrayBuffer(file);

    // Reset file input
    input.value = "";
  };

  const handleFromFile = () => {
    fileInput?.click();
  };

  const handleFromUrl = async () => {
    if (!urlInput.trim()) {
      error = "Please enter a URL";
      return;
    }

    urlLoading = true;
    error = "";

    try {
      const response = await fetch(urlInput);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const buffer = await response.arrayBuffer();
      const base64 = arrayBufferToBase64(buffer);

      // Extract filename from URL
      const urlPath = new URL(urlInput).pathname;
      const filename = urlPath.split("/").pop() || "downloaded-file";
      downloadFilename = filename;

      mode = "encode";
      inputValue = `[Content from URL: ${urlInput}]`;
      outputValue = base64;
      showUrlInput = false;
      urlInput = "";
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to fetch URL";
    } finally {
      urlLoading = false;
    }
  };

  const handleDownloadAsFile = () => {
    if (!inputValue.trim()) {
      error = "No Base64 content to decode";
      return;
    }

    try {
      const buffer = base64ToArrayBuffer(inputValue);
      const blob = new Blob([buffer], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = downloadFilename || "decoded-file";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      error = "Invalid Base64 string - cannot decode to file";
    }
  };
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Encode text or files to Base64, decode Base64 strings, or download decoded
      content as a file.
    </p>
  </header>

  <!-- Hidden file input -->
  <input
    type="file"
    bind:this={fileInput}
    onchange={handleFileSelect}
    class="hidden"
  />

  <!-- Mode Toggle -->
  <div class="mb-4 flex flex-wrap items-center gap-4">
    <div class="p-1 bg-(--color-border) inline-flex gap-1">
      <button
        class="px-3 py-1 text-sm font-medium transition-colors {mode === 'encode'
          ? 'bg-(--color-text) text-(--color-btn-text)'
          : 'text-(--color-text-muted) hover:text-(--color-text)'}"
        onclick={() => {
          mode = "encode";
          error = "";
        }}
      >
        Encode
      </button>
      <button
        class="px-3 py-1 text-sm font-medium transition-colors {mode === 'decode'
          ? 'bg-(--color-text) text-(--color-btn-text)'
          : 'text-(--color-text-muted) hover:text-(--color-text)'}"
        onclick={() => {
          mode = "decode";
          error = "";
        }}
      >
        Decode
      </button>
    </div>
    <label class="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        bind:checked={urlSafe}
        class="w-4 h-4 accent-(--color-accent)"
      />
      <span class="text-sm text-(--color-text)">URL-safe</span>
    </label>
  </div>

  <!-- URL Input -->
  {#if showUrlInput}
    <div class="mb-4 flex gap-2 items-center">
      <input
        type="url"
        bind:value={urlInput}
        placeholder="Enter URL to fetch..."
        class="flex-1 px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
        onkeydown={(e) => e.key === "Enter" && handleFromUrl()}
      />
      <button
        onclick={handleFromUrl}
        disabled={urlLoading}
        class="px-3 py-1.5 text-sm font-medium bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50"
      >
        {urlLoading ? "Loading..." : "Fetch"}
      </button>
      <button
        onclick={() => {
          showUrlInput = false;
          urlInput = "";
        }}
        class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
      >
        Cancel
      </button>
    </div>
  {/if}

  <!-- Download filename input (shown in decode mode) -->
  {#if mode === "decode"}
    <div class="mb-4 flex flex-wrap gap-4 items-center">
      <label class="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          bind:checked={fileMode}
          class="w-4 h-4 accent-(--color-accent)"
        />
        <span class="text-sm text-(--color-text)">File mode</span>
      </label>
      <div class={`flex gap-2 items-center ${fileMode ? "" : "invisible"}`}>
        <span class="text-xs text-(--color-text-muted)">Filename:</span>
        <input
          type="text"
          bind:value={downloadFilename}
          placeholder="filename"
          class="px-2 py-1 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
        />
        <button
          onclick={handleDownloadAsFile}
          class="px-3 py-1 text-sm font-medium bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) transition-colors"
        >
          Download
        </button>
      </div>
    </div>
  {/if}

  <!-- Error -->
  {#if error}
    <div
      class="mb-4 p-3 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm"
    >
      {error}
    </div>
  {/if}

  <!-- Editors - Side by Side -->
  <div class="flex-1 flex flex-col lg:flex-row gap-4">
    <!-- Input Editor -->
    <div class="flex-1 flex flex-col min-h-[200px]">
      <div class="flex justify-between items-center mb-2">
        <span
          class="text-xs tracking-wider text-(--color-text-light) font-medium"
        >
          {mode === "encode" ? "Text to Encode" : "Base64 to Decode"}
        </span>
        <div class="flex gap-3">
          {#if mode === "encode"}
            <button
              onclick={handleFromFile}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              From File
            </button>
            <button
              onclick={() => {
                showUrlInput = !showUrlInput;
              }}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              From URL
            </button>
          {/if}
          <button
            onclick={handlePaste}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            Paste
          </button>
          <button
            onclick={handleClear}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            Clear
          </button>
        </div>
      </div>
      <div class="flex-1 border border-(--color-border) overflow-hidden">
        <CodeMirror
          bind:value={inputValue}
          placeholder={mode === "encode"
            ? "Enter text to encode..."
            : "Enter Base64 string to decode..."}
          extensions={inputExtensions}
        />
      </div>
    </div>

    <!-- Output Editor -->
    {#if !(mode === "decode" && fileMode)}
      <div class="flex-1 flex flex-col min-h-[200px]">
        <div class="flex justify-between items-center mb-2">
          <span
            class="text-xs tracking-wider text-(--color-text-light) font-medium"
          >
            {mode === "encode" ? "Encoded Base64" : "Decoded Text"}
          </span>
          <div class="flex gap-3">
            <button
              onclick={handleSwap}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              title="Use output as new input"
            >
              Swap
            </button>
            <button
              onclick={handleCopy}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
        <div class="flex-1 border border-(--color-border) overflow-hidden bg-(--color-bg)">
          <CodeMirror
            bind:value={outputValue}
            placeholder="Result will appear here..."
            extensions={outputExtensions}
          />
        </div>
      </div>
    {/if}
  </div>
</div>
