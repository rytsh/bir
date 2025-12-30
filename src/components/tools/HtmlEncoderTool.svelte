<script lang="ts">
  import { onMount, tick } from "svelte";
  import { html } from "@codemirror/lang-html";
  import {
    EditorView,
    createEditor,
    createDarkModeObserver,
    getInitialDarkMode,
    updateEditorContent,
    getEditorContent,
  } from "../../lib/codemirror.js";

  let mode = $state<"encode" | "decode">("encode");
  let encodeAllChars = $state(false);
  let error = $state("");
  let copied = $state(false);
  let isDark = $state(false);

  let inputEditorContainer: HTMLDivElement;
  let outputEditorContainer: HTMLDivElement;
  let inputEditor: EditorView;
  let outputEditor: EditorView;

  const htmlEntities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };

  const reverseHtmlEntities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&#x27;": "'",
    "&apos;": "'",
    "&nbsp;": " ",
  };

  const encodeHtml = (str: string): string => {
    if (encodeAllChars) {
      return str
        .split("")
        .map((char) => {
          if (htmlEntities[char]) {
            return htmlEntities[char];
          }
          const code = char.charCodeAt(0);
          if (code > 127) {
            return `&#${code};`;
          }
          return char;
        })
        .join("");
    }
    return str.replace(/[&<>"']/g, (char) => htmlEntities[char] || char);
  };

  const decodeHtml = (str: string): string => {
    let result = str;
    for (const [entity, char] of Object.entries(reverseHtmlEntities)) {
      result = result.split(entity).join(char);
    }
    result = result.replace(/&#(\d+);/g, (_, code) =>
      String.fromCharCode(parseInt(code, 10))
    );
    result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, code) =>
      String.fromCharCode(parseInt(code, 16))
    );
    return result;
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
        result = encodeHtml(input);
      } else {
        result = decodeHtml(input);
      }
      updateEditorContent(outputEditor, result);
    } catch (e) {
      error = e instanceof Error ? e.message : "Conversion failed";
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
        language: html(),
        placeholderText: mode === "encode" 
          ? "Enter text with special characters like <div>, \"quotes\", & ampersands..." 
          : "Enter HTML entities like &lt;div&gt;, &quot;quotes&quot;, &amp; ampersands...",
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
        language: html(),
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

  // Re-convert when mode or options change
  $effect(() => {
    mode;
    encodeAllChars;
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
      HTML Encoder / Decoder
    </h1>
    <p class="text-sm text-(--color-text-muted)">
      Encode special characters to HTML entities or decode HTML entities back to text.
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
      <label class="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          bind:checked={encodeAllChars}
          class="w-4 h-4 accent-(--color-text)"
        />
        <span class="text-sm text-(--color-text-muted)">Encode all non-ASCII characters</span>
      </label>
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
          {mode === "encode" ? "Text to Encode" : "HTML to Decode"}
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
          {mode === "encode" ? "Encoded HTML" : "Decoded Text"}
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
