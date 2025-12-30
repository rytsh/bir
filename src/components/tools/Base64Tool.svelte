<script lang="ts">
  import { onMount, tick } from "svelte";
  import {
    EditorView,
    createEditor,
    createDarkModeObserver,
    getInitialDarkMode,
    updateEditorContent,
    getEditorContent,
  } from "../../lib/codemirror.js";

  let mode = $state<"encode" | "decode">("encode");
  let error = $state("");
  let copied = $state(false);
  let isDark = $state(false);

  let inputEditorContainer: HTMLDivElement;
  let outputEditorContainer: HTMLDivElement;
  let inputEditor: EditorView;
  let outputEditor: EditorView;

  const utf8ToBase64 = (str: string): string => {
    const bytes = new TextEncoder().encode(str);
    const binString = Array.from(bytes, (byte) =>
      String.fromCodePoint(byte),
    ).join("");
    return btoa(binString);
  };

  const base64ToUtf8 = (base64: string): string => {
    const binString = atob(base64);
    const bytes = Uint8Array.from(binString, (char) => char.codePointAt(0)!);
    return new TextDecoder().decode(bytes);
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
        result = utf8ToBase64(input);
      } else {
        result = base64ToUtf8(input);
      }
      updateEditorContent(outputEditor, result);
    } catch (e) {
      error = mode === "decode" ? "Invalid Base64 string" : "Failed to encode string";
      updateEditorContent(outputEditor, "");
    }
  };

  const createInputEditor = () => {
    if (!inputEditorContainer) return;
    const content = getEditorContent(inputEditor);
    if (inputEditor) inputEditor.destroy();

    inputEditor = createEditor({
      container: inputEditorContainer,
      config: {
        dark: isDark,
        placeholderText: mode === "encode" ? "Enter text to encode..." : "Enter Base64 string to decode...",
        onUpdate: () => convert(),
      },
      initialContent: content,
    });
  };

  const createOutputEditor = () => {
    if (!outputEditorContainer) return;
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
  };

  onMount(() => {
    isDark = getInitialDarkMode();

    const cleanup = createDarkModeObserver((newIsDark) => {
      if (newIsDark !== isDark) {
        isDark = newIsDark;
        createInputEditor();
        createOutputEditor();
      }
    });

    tick().then(() => {
      createInputEditor();
      createOutputEditor();
    });

    return () => {
      cleanup();
      inputEditor?.destroy();
      outputEditor?.destroy();
    };
  });

  // Re-convert when mode changes
  $effect(() => {
    mode;
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
      setTimeout(() => (copied = false), 2000);
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
    <h1 class="text-xl font-medium text-(--color-text) mb-2">
      Base64 Encoder / Decoder
    </h1>
    <p class="text-sm text-(--color-text-muted)">
      Encode text to Base64 or decode Base64 strings back to text.
    </p>
  </header>

  <!-- Mode Toggle -->
  <div class="mb-4 p-1 bg-(--color-border) inline-flex gap-1">
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
          {mode === "encode" ? "Text to Encode" : "Base64 to Decode"}
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
      <div
        bind:this={outputEditorContainer}
        class="flex-1 border border-(--color-border) overflow-hidden bg-(--color-bg)"
      ></div>
    </div>
  </div>
</div>
