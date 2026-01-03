<script lang="ts">
  import {
    EditorView,
    createEditor,
    createDarkModeObserver,
    getInitialDarkMode,
    updateEditorContent,
    getEditorContent,
    initEditorsWithRetry,
  } from "../../lib/codemirror.js";

  let mode = $state<"encode" | "decode">("encode");
  let encodeMode = $state<"component" | "full">("component");
  let error = $state("");
  let copied = $state(false);
  let isDark = $state(false);

  let inputEditorContainer: HTMLDivElement;
  let outputEditorContainer: HTMLDivElement;
  let inputEditor: EditorView;
  let outputEditor: EditorView;

  const encodeUrl = (str: string): string => {
    if (encodeMode === "full") {
      // Encode all characters except alphanumeric and -_.~
      return encodeURIComponent(str);
    } else {
      // encodeURI preserves URL structure characters like :/?#[]@!$&'()*+,;=
      return encodeURI(str);
    }
  };

  const decodeUrl = (str: string): string => {
    // decodeURIComponent handles both encodeURI and encodeURIComponent encoded strings
    return decodeURIComponent(str);
  };

  const convert = () => {
    error = "";
    const input = getEditorContent(inputEditor);

    if (!input.trim()) {
      updateEditorContent(outputEditor, "");
      return;
    }

    try {
      let result: string;
      if (mode === "encode") {
        result = encodeUrl(input);
      } else {
        result = decodeUrl(input);
      }
      updateEditorContent(outputEditor, result);
    } catch (e) {
      error = e instanceof Error ? e.message : "Conversion failed";
      updateEditorContent(outputEditor, "");
    }
  };

  const createInputEditor = (): boolean => {
    if (!inputEditorContainer) return false;
    const content = getEditorContent(inputEditor);
    if (inputEditor) inputEditor.destroy();

    inputEditor = createEditor({
      container: inputEditorContainer,
      config: {
        dark: isDark,
        placeholderText: mode === "encode" 
          ? "Enter URL or text to encode (e.g., https://example.com/path?query=hello world)..." 
          : "Enter URL-encoded text to decode (e.g., hello%20world)...",
        onUpdate: () => convert(),
      },
      initialContent: content,
    });
    return true;
  };

  const createOutputEditor = (): boolean => {
    if (!outputEditorContainer) return false;
    const content = getEditorContent(outputEditor);
    if (outputEditor) outputEditor.destroy();

    outputEditor = createEditor({
      container: outputEditorContainer,
      config: {
        dark: isDark,
        placeholderText: "Result will appear here...",
        readOnly: true,
      },
      initialContent: content,
    });
    return true;
  };

  $effect(() => {
    isDark = getInitialDarkMode();

    const cleanup = createDarkModeObserver((newIsDark) => {
      if (newIsDark !== isDark) {
        isDark = newIsDark;
        createInputEditor();
        createOutputEditor();
      }
    });

    initEditorsWithRetry([createInputEditor, createOutputEditor]);

    return () => {
      cleanup();
      inputEditor?.destroy();
      outputEditor?.destroy();
    };
  });

  // Re-convert when mode or options change
  $effect(() => {
    mode;
    encodeMode;
    convert();
  });

  const handleSwap = () => {
    const output = getEditorContent(outputEditor);
    if (output) {
      updateEditorContent(inputEditor, output);
      mode = mode === "encode" ? "decode" : "encode";
      error = "";
    }
  };

  const handleClear = () => {
    updateEditorContent(inputEditor, "");
    error = "";
  };

  const handleCopy = () => {
    const output = getEditorContent(outputEditor);
    if (output) {
      navigator.clipboard.writeText(output);
      copied = true;
      setTimeout(() => { copied = false; }, 2000);
    }
  };

  const handlePaste = () => {
    navigator.clipboard.readText().then((text) => {
      updateEditorContent(inputEditor, text);
    });
  };
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Encode special characters for URLs or decode URL-encoded text back to readable format.
    </p>
  </header>

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

    {#if mode === "encode"}
      <div class="flex items-center gap-2 h-full">
        <span class="text-sm text-(--color-text-muted)">Mode:</span>
        <div class="p-1 bg-(--color-border) inline-flex gap-1 h-full">
          <button
            class="px-2 py-0.5 text-xs font-medium transition-colors {encodeMode === 'component'
              ? 'bg-(--color-text) text-(--color-btn-text)'
              : 'text-(--color-text-muted) hover:text-(--color-text)'}"
            onclick={() => (encodeMode = "component")}
            title="Preserves URL structure characters (:/?#[]@!$&'()*+,;=)"
          >
            URL
          </button>
          <button
            class="px-2 py-0.5 text-xs font-medium transition-colors {encodeMode === 'full'
              ? 'bg-(--color-text) text-(--color-btn-text)'
              : 'text-(--color-text-muted) hover:text-(--color-text)'}"
            onclick={() => (encodeMode = "full")}
            title="Encodes all special characters (for query parameters)"
          >
            Component
          </button>
        </div>
      </div>
    {/if}
  </div>

  <!-- Error -->
  {#if error}
    <div class="mb-4 p-3 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm">
      {error}
    </div>
  {/if}

  <!-- Editors - Side by Side -->
  <div class="flex-1 flex flex-col lg:flex-row gap-4">
    <!-- Input Editor -->
    <div class="flex-1 flex flex-col min-h-[200px]">
      <div class="flex justify-between items-center mb-2">
        <span class="text-xs tracking-wider text-(--color-text-light) font-medium">
          {mode === "encode" ? "Text to Encode" : "URL to Decode"}
        </span>
        <div class="flex gap-3">
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
      <div
        bind:this={inputEditorContainer}
        class="flex-1 border border-(--color-border) overflow-hidden"
      ></div>
    </div>

    <!-- Output Editor -->
    <div class="flex-1 flex flex-col min-h-[200px]">
      <div class="flex justify-between items-center mb-2">
        <span class="text-xs tracking-wider text-(--color-text-light) font-medium">
          {mode === "encode" ? "Encoded URL" : "Decoded Text"}
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
      <div
        bind:this={outputEditorContainer}
        class="flex-1 border border-(--color-border) overflow-hidden bg-(--color-bg)"
      ></div>
    </div>
  </div>
</div>
