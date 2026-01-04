<script lang="ts">
  import CodeMirror from "svelte-codemirror-editor";
  import { EditorView } from "@codemirror/view";
  import {
    createDarkModeObserver,
    getInitialDarkMode,
    createTheme,
    editorHeightExtension,
  } from "../../lib/codemirror.js";

  let mode = $state<"encode" | "decode">("encode");
  let encodeMode = $state<"component" | "full">("component");
  let error = $state("");
  let copied = $state(false);
  let isDark = $state(getInitialDarkMode());

  let inputValue = $state("");
  let outputValue = $state("");

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

    if (!inputValue.trim()) {
      outputValue = "";
      return;
    }

    try {
      let result: string;
      if (mode === "encode") {
        result = encodeUrl(inputValue);
      } else {
        result = decodeUrl(inputValue);
      }
      outputValue = result;
    } catch (e) {
      error = e instanceof Error ? e.message : "Conversion failed";
      outputValue = "";
    }
  };

  // Extensions for input editor
  let inputExtensions = $derived([
    ...createTheme(isDark),
    editorHeightExtension,
    EditorView.lineWrapping,
  ]);

  // Extensions for output editor (read-only)
  let outputExtensions = $derived([
    ...createTheme(isDark),
    editorHeightExtension,
    EditorView.lineWrapping,
    EditorView.editable.of(false),
    EditorView.contentAttributes.of({ "aria-readonly": "true" }),
  ]);

  $effect(() => {
    isDark = getInitialDarkMode();

    const cleanup = createDarkModeObserver((newIsDark) => {
      if (newIsDark !== isDark) isDark = newIsDark;
    });

    return cleanup;
  });

  // React to input value changes
  $effect(() => {
    inputValue;
    convert();
  });

  // Re-convert when mode or options change
  $effect(() => {
    mode;
    encodeMode;
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

  let inputPlaceholder = $derived(
    mode === "encode" 
      ? "Enter URL or text to encode (e.g., https://example.com/path?query=hello world)..." 
      : "Enter URL-encoded text to decode (e.g., hello%20world)..."
  );
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
      <div class="flex-1 border border-(--color-border) overflow-hidden">
        <CodeMirror
          bind:value={inputValue}
          placeholder={inputPlaceholder}
          extensions={inputExtensions}
        />
      </div>
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
      <div class="flex-1 border border-(--color-border) overflow-hidden bg-(--color-bg)">
        <CodeMirror
          bind:value={outputValue}
          placeholder="Result will appear here..."
          extensions={outputExtensions}
        />
      </div>
    </div>
  </div>
</div>
