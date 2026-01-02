<script lang="ts">
  import { onMount, tick } from "svelte";
  import {
    EditorView,
    createEditor,
    createDarkModeObserver,
    getInitialDarkMode,
    getEditorContent,
  } from "../../lib/codemirror.js";
  import CryptoJS from "crypto-js";

  type InputMode = "text" | "file" | "url";
  type OutputFormat = "hex" | "base64";

  let inputMode = $state<InputMode>("text");
  let textInput = $state("");
  let fileInput = $state<File | null>(null);
  let urlInput = $state("");
  let hmacEnabled = $state(false);
  let hmacSecret = $state("");
  let outputFormat = $state<OutputFormat>("hex");
  let isProcessing = $state(false);
  let copied = $state<string | null>(null);
  let isDark = $state(false);
  let errorMessage = $state("");

  let inputEditorContainer: HTMLDivElement;
  let inputEditor: EditorView;

  interface HashResult {
    md5: string;
    sha1: string;
    sha256: string;
    sha512: string;
  }

  let hashResults = $state<HashResult>({
    md5: "",
    sha1: "",
    sha256: "",
    sha512: "",
  });

  const createInputEditor = () => {
    if (!inputEditorContainer) return;
    const content = getEditorContent(inputEditor);
    if (inputEditor) inputEditor.destroy();

    inputEditor = createEditor({
      container: inputEditorContainer,
      config: {
        dark: isDark,
        placeholderText: "Enter text to hash...",
        onUpdate: (content) => {
          textInput = content;
        },
      },
      initialContent: content || textInput,
    });
  };

  const arrayBufferToWordArray = (
    arrayBuffer: ArrayBuffer,
  ): CryptoJS.lib.WordArray => {
    const uint8Array = new Uint8Array(arrayBuffer);
    const words: number[] = [];
    for (let i = 0; i < uint8Array.length; i += 4) {
      words.push(
        (uint8Array[i] << 24) |
          (uint8Array[i + 1] << 16) |
          (uint8Array[i + 2] << 8) |
          uint8Array[i + 3],
      );
    }
    return CryptoJS.lib.WordArray.create(words, uint8Array.length);
  };

  const formatHash = (hash: CryptoJS.lib.WordArray): string => {
    return outputFormat === "hex"
      ? hash.toString(CryptoJS.enc.Hex)
      : hash.toString(CryptoJS.enc.Base64);
  };

  const getDataFromInput = async (): Promise<
    string | CryptoJS.lib.WordArray
  > => {
    if (inputMode === "text") {
      return textInput;
    } else if (inputMode === "file") {
      if (!fileInput) {
        throw new Error("No file selected");
      }
      const buffer = await fileInput.arrayBuffer();
      return arrayBufferToWordArray(buffer);
    } else if (inputMode === "url") {
      if (!urlInput.trim()) {
        throw new Error("No URL provided");
      }
      const response = await fetch(urlInput.trim());
      if (!response.ok) {
        throw new Error(
          `Failed to fetch URL: ${response.status} ${response.statusText}`,
        );
      }
      const buffer = await response.arrayBuffer();
      return arrayBufferToWordArray(buffer);
    }

    throw new Error("Invalid input mode");
  };

  const handleHash = async () => {
    isProcessing = true;
    errorMessage = "";
    hashResults = { md5: "", sha1: "", sha256: "", sha512: "" };

    try {
      const data = await getDataFromInput();

      if (hmacEnabled) {
        if (!hmacSecret) {
          throw new Error("HMAC secret is required");
        }
        hashResults = {
          md5: formatHash(CryptoJS.HmacMD5(data, hmacSecret)),
          sha1: formatHash(CryptoJS.HmacSHA1(data, hmacSecret)),
          sha256: formatHash(CryptoJS.HmacSHA256(data, hmacSecret)),
          sha512: formatHash(CryptoJS.HmacSHA512(data, hmacSecret)),
        };
      } else {
        hashResults = {
          md5: formatHash(CryptoJS.MD5(data)),
          sha1: formatHash(CryptoJS.SHA1(data)),
          sha256: formatHash(CryptoJS.SHA256(data)),
          sha512: formatHash(CryptoJS.SHA512(data)),
        };
      }
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : "Hashing failed";
    } finally {
      isProcessing = false;
    }
  };

  const handleCopy = (type: keyof HashResult) => {
    const value = hashResults[type];
    if (value) {
      navigator.clipboard.writeText(value);
      copied = type;
      setTimeout(() => (copied = null), 2000);
    }
  };

  const handleFileChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      fileInput = target.files[0];
    }
  };

  const handleClear = () => {
    textInput = "";
    fileInput = null;
    urlInput = "";
    hashResults = { md5: "", sha1: "", sha256: "", sha512: "" };
    errorMessage = "";
    if (inputEditor) {
      inputEditor.dispatch({
        changes: { from: 0, to: inputEditor.state.doc.length, insert: "" },
      });
    }
  };

  onMount(() => {
    isDark = getInitialDarkMode();

    const cleanup = createDarkModeObserver((newIsDark) => {
      if (newIsDark !== isDark) {
        isDark = newIsDark;
        createInputEditor();
      }
    });

    tick().then(() => {
      createInputEditor();
    });

    return () => {
      cleanup();
      inputEditor?.destroy();
    };
  });

  const hashTypes: { key: keyof HashResult; label: string }[] = [
    { key: "md5", label: "MD5" },
    { key: "sha1", label: "SHA-1" },
    { key: "sha256", label: "SHA-256" },
    { key: "sha512", label: "SHA-512" },
  ];

  // Recreate editor when switching back to text mode
  $effect(() => {
    if (inputMode === "text") {
      tick().then(() => {
        createInputEditor();
      });
    }
  });

  // Auto-hash with debouncing
  let debounceTimer: ReturnType<typeof setTimeout>;
  let lastTextInput = "";
  let lastFile: File | null = null;
  let lastOutputFormat: OutputFormat = "hex";
  let lastHmacEnabled = false;
  let lastHmacSecret = "";

  const triggerAutoHash = (immediate = false) => {
    clearTimeout(debounceTimer);
    if (immediate) {
      handleHash();
    } else {
      debounceTimer = setTimeout(() => {
        handleHash();
      }, 300);
    }
  };

  // Watch text input changes
  $effect(() => {
    const currentText = textInput;
    if (inputMode === "text" && currentText !== lastTextInput) {
      lastTextInput = currentText;
      if (currentText === "") {
        hashResults = { md5: "", sha1: "", sha256: "", sha512: "" };
        errorMessage = "";
      } else if (!hmacEnabled || hmacSecret) {
        triggerAutoHash();
      }
    }
  });

  // Watch file changes
  $effect(() => {
    const currentFile = fileInput;
    if (inputMode === "file" && currentFile && currentFile !== lastFile) {
      lastFile = currentFile;
      triggerAutoHash(true);
    }
  });

  // Watch output format changes
  $effect(() => {
    const currentFormat = outputFormat;
    if (currentFormat !== lastOutputFormat) {
      const hadResults = hashResults.sha256 !== "";
      lastOutputFormat = currentFormat;
      if (hadResults) {
        if (
          (inputMode === "text" && textInput) ||
          (inputMode === "file" && fileInput)
        ) {
          triggerAutoHash(true);
        }
      }
    }
  });

  // Watch HMAC changes
  $effect(() => {
    const currentHmacEnabled = hmacEnabled;
    const currentHmacSecret = hmacSecret;
    if (
      currentHmacEnabled !== lastHmacEnabled ||
      currentHmacSecret !== lastHmacSecret
    ) {
      lastHmacEnabled = currentHmacEnabled;
      lastHmacSecret = currentHmacSecret;
      if (
        (inputMode === "text" && textInput) ||
        (inputMode === "file" && fileInput)
      ) {
        if (!currentHmacEnabled || currentHmacSecret) {
          triggerAutoHash();
        }
      }
    }
  });
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Generate MD5, SHA-1, SHA-256, and SHA-512 hashes from text, files, or
      URLs. Supports HMAC mode.
    </p>
  </header>

  <!-- Controls -->
  <div class="mb-4 flex flex-col gap-4">
    <div class="flex flex-wrap gap-4 items-end">
      <!-- Input Mode Selection -->
      <div>
        <label
          for="input-mode"
          class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-2"
        >
          Input
        </label>
        <select
          id="input-mode"
          bind:value={inputMode}
          class="w-32 px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer"
        >
          <option value="text">Text</option>
          <option value="file">File</option>
          <option value="url">URL</option>
        </select>
      </div>

      <!-- Output Format Selection -->
      <div>
        <label
          for="output-format"
          class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-2"
        >
          Output
        </label>
        <select
          id="output-format"
          bind:value={outputFormat}
          class="w-28 px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer"
        >
          <option value="hex">Hex</option>
          <option value="base64">Base64</option>
        </select>
      </div>

      <!-- Generate Button -->
      <button
        onclick={handleHash}
        disabled={isProcessing}
        class="px-6 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50"
      >
        {isProcessing ? "Processing..." : "Hash"}
      </button>

      <!-- Clear Button -->
      <button
        onclick={handleClear}
        class="px-4 py-2 border border-(--color-border) text-(--color-text) text-sm font-medium hover:bg-(--color-bg-alt) transition-colors"
      >
        Clear
      </button>
    </div>
  </div>

  <div class="flex flex-row mb-1 bg-(--color-border)">
    <!-- HMAC Toggle -->
    <div class="flex items-center gap-2">
      <input
        type="checkbox"
        id="hmac-toggle"
        bind:checked={hmacEnabled}
        class="w-4 h-4 cursor-pointer accent-(--color-accent)"
      />
      <label
        for="hmac-toggle"
        class="text-sm text-(--color-text) cursor-pointer"
      >
        HMAC
      </label>
    </div>

    <!-- HMAC Secret -->
    <div class={`flex-1 min-w-48 ml-1 ${hmacEnabled ? "" : "invisible"}`}>
      <input
        id="hmac-secret"
        type="text"
        bind:value={hmacSecret}
        placeholder="Enter HMAC secret..."
        class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)"
      />
    </div>
  </div>

  <!-- Input Area -->
  <div class="mb-4 min-h-[150px] flex flex-col">
    <span
      class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2"
    >
      {inputMode === "text"
        ? "Text Input"
        : inputMode === "file"
          ? "File Input"
          : "URL Input"}
    </span>

    {#if inputMode === "text"}
      <div
        bind:this={inputEditorContainer}
        class="flex-1 border border-(--color-border) overflow-hidden bg-(--color-bg)"
      ></div>
    {:else if inputMode === "file"}
      <div class="flex items-center border border-(--color-border) bg-(--color-bg) py-2 px-4">
        <input
          type="file"
          id="file-input"
          onchange={handleFileChange}
          class="hidden"
        />
        <label
          for="file-input"
          class="px-6 py-3 bg-(--color-bg-alt) border border-(--color-border) text-(--color-text) text-sm cursor-pointer hover:bg-(--color-border) transition-colors"
        >
          {fileInput ? fileInput.name : "Choose a file..."}
        </label>
        {#if fileInput}
          <p class="ml-2 text-xs text-(--color-text-muted)">
            Size: {(fileInput.size / 1024).toFixed(2)} KB
          </p>
        {/if}
      </div>
    {:else if inputMode === "url"}
      <div class="border border-(--color-border) bg-(--color-bg) p-4">
        <input
          type="text"
          bind:value={urlInput}
          placeholder="Enter URL to fetch and hash..."
          class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)"
        />
        <p class="mt-2 text-xs text-(--color-text-muted)">
          Enter a URL to fetch its content and compute hashes. Note: CORS
          restrictions may apply.
        </p>
      </div>
    {/if}
  </div>

  <!-- Error Message -->
  {#if errorMessage}
    <div
      class="mb-4 p-3 border border-red-500 bg-red-500/10 text-red-500 text-sm"
    >
      {errorMessage}
    </div>
  {/if}

  <!-- Hash Results -->
  <div class="flex flex-col gap-2">
    <span
      class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium"
    >
      Hash Results
    </span>
    <div class="grid gap-2">
      {#each hashTypes as { key, label }}
        <div
          class="flex items-center gap-2 p-2 border border-(--color-border) bg-(--color-bg-alt)"
        >
          <span class="w-20 text-xs font-medium text-(--color-text-light)"
            >{label}</span
          >
          <input
            type="text"
            readonly
            value={hashResults[key]}
            placeholder="—"
            class="flex-1 px-2 py-1 bg-transparent text-(--color-text) text-sm font-mono focus:outline-none"
          />
          <button
            onclick={() => handleCopy(key)}
            disabled={!hashResults[key]}
            class="px-3 py-1 text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {copied === key ? "Copied!" : "Copy"}
          </button>
        </div>
      {/each}
    </div>
  </div>
</div>
