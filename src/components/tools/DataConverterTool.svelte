<script lang="ts">
  import { onMount, tick } from "svelte";
  import * as YAML from "yaml";
  import * as TOML from "smol-toml";
  import * as TOON from "@toon-format/toon";
  import { EditorView, basicSetup } from "codemirror";
  import { EditorState } from "@codemirror/state";
  import { placeholder } from "@codemirror/view";
  import { json } from "@codemirror/lang-json";
  import { yaml as yamlLang } from "@codemirror/lang-yaml";
  import { oneDark } from "@codemirror/theme-one-dark";

  type Format = "json" | "yaml" | "toml" | "toon";
  type IndentType = "2" | "4" | "tab";

  let sourceFormat = $state<Format>("json");
  let outputFormat = $state<Format>("yaml");
  let indentType = $state<IndentType>("2");
  let sortKeys = $state(false);
  let error = $state("");
  let copied = $state(false);
  let isDark = $state(false);

  let sourceChars = $state(0);
  let sourceTokens = $state(0);
  let outputChars = $state(0);
  let outputTokens = $state(0);

  let sourceEditorContainer: HTMLDivElement;
  let outputEditorContainer: HTMLDivElement;
  let sourceEditor: EditorView;
  let outputEditor: EditorView;
  let convertTimeout: ReturnType<typeof setTimeout> | null = null;

  const formatLabels: Record<Format, string> = {
    json: "JSON",
    yaml: "YAML",
    toml: "TOML",
    toon: "TOON",
  };

  // Simple token estimation based on GPT tokenization patterns
  // This approximates cl100k_base tokenizer behavior without the heavy library
  const countTokens = (text: string): number => {
    if (!text) return 0;
    // Split on whitespace, punctuation, and common token boundaries
    // GPT tokenizers typically split on: spaces, punctuation, numbers, and merge common words
    const tokens = text
      .split(/(\s+|[{}[\]:,."'`();<>!=+\-*/%&|^~@#$\\]|\d+)/g)
      .filter((t) => t && t.length > 0);
    // Adjust for subword tokenization: longer words get split into ~4 char chunks
    let count = 0;
    for (const token of tokens) {
      if (/^\s+$/.test(token)) {
        count += 1; // whitespace is usually 1 token
      } else if (token.length <= 4) {
        count += 1;
      } else {
        count += Math.ceil(token.length / 4);
      }
    }
    return count;
  };

  const updateSourceStats = () => {
    const text = sourceEditor?.state.doc.toString() || "";
    sourceChars = text.length;
    sourceTokens = countTokens(text);
  };

  const updateOutputStats = () => {
    const text = outputEditor?.state.doc.toString() || "";
    outputChars = text.length;
    outputTokens = countTokens(text);
  };

  const tokenDiffPercent = $derived(() => {
    if (sourceTokens === 0) return 0;
    const diff = ((outputTokens - sourceTokens) / sourceTokens) * 100;
    return diff;
  });

  const getIndent = (): string | number => {
    if (indentType === "tab") return "\t";
    return parseInt(indentType);
  };

  const sortObjectKeys = (obj: unknown): unknown => {
    if (obj === null || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(sortObjectKeys);

    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(obj as Record<string, unknown>).sort();
    for (const key of keys) {
      sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
    }
    return sorted;
  };

  const parse = (text: string, format: Format): unknown => {
    switch (format) {
      case "json":
        return JSON.parse(text);
      case "yaml":
        return YAML.parse(text);
      case "toml":
        return TOML.parse(text);
      case "toon":
        return TOON.decode(text);
    }
  };

  const stringify = (data: unknown, format: Format): string => {
    const indent = getIndent();
    const processedData = sortKeys ? sortObjectKeys(data) : data;

    switch (format) {
      case "json":
        return JSON.stringify(processedData, null, indent);
      case "yaml":
        return YAML.stringify(processedData, {
          indent: typeof indent === "string" ? 2 : indent,
        });
      case "toml":
        // TOML requires a root object, not arrays or primitives
        if (processedData === null) {
          throw new Error(
            "Cannot convert null to TOML. TOML requires an object at the root level.",
          );
        }
        if (typeof processedData !== "object") {
          throw new Error(
            `Cannot convert ${typeof processedData} to TOML. TOML requires an object at the root level (e.g., {"key": "value"}).`,
          );
        }
        if (Array.isArray(processedData)) {
          throw new Error(
            "Cannot convert array to TOML. TOML requires an object at the root level, not an array.",
          );
        }
        return TOML.stringify(processedData as Record<string, unknown>);
      case "toon":
        return TOON.encode(processedData);
    }
  };

  const getLanguageExtension = (format: Format) => {
    switch (format) {
      case "json":
        return json();
      case "yaml":
      case "toml":
      case "toon":
        // TOON is YAML-like, so use YAML highlighting
        return yamlLang();
    }
  };

  const createTheme = (dark: boolean) => {
    if (dark) {
      return [
        oneDark,
        EditorView.theme({
          ".cm-placeholder": {
            color: "var(--color-text-light)",
            fontStyle: "italic",
          },
        }),
      ];
    }
    return EditorView.theme({
      "&": {
        backgroundColor: "var(--color-bg-alt)",
        color: "var(--color-text)",
      },
      ".cm-content": {
        caretColor: "var(--color-text)",
      },
      ".cm-cursor": {
        borderLeftColor: "var(--color-text)",
      },
      ".cm-gutters": {
        backgroundColor: "var(--color-bg)",
        color: "var(--color-text-light)",
        border: "none",
      },
      ".cm-activeLineGutter": {
        backgroundColor: "var(--color-border)",
      },
      ".cm-activeLine": {
        backgroundColor: "rgba(0, 0, 0, 0.05)",
      },
      ".cm-placeholder": {
        color: "var(--color-text-light)",
        fontStyle: "italic",
      },
    });
  };

  const convert = () => {
    error = "";
    const input = sourceEditor?.state.doc.toString() || "";
    updateSourceStats();

    if (!input.trim()) {
      if (outputEditor) {
        outputEditor.dispatch({
          changes: {
            from: 0,
            to: outputEditor.state.doc.length,
            insert: "",
          },
        });
        updateOutputStats();
      }
      return;
    }

    try {
      const parsed = parse(input, sourceFormat);
      const result = stringify(parsed, outputFormat);
      if (outputEditor) {
        outputEditor.dispatch({
          changes: {
            from: 0,
            to: outputEditor.state.doc.length,
            insert: result,
          },
        });
        updateOutputStats();
      }
    } catch (e) {
      error =
        e instanceof Error
          ? e.message
          : `Invalid ${formatLabels[sourceFormat]} input`;
      updateOutputStats();
    }
  };

  const debouncedConvert = () => {
    if (convertTimeout) {
      clearTimeout(convertTimeout);
    }
    convertTimeout = setTimeout(() => {
      convert();
    }, 150);
  };

  const createSourceEditor = () => {
    if (!sourceEditorContainer) return false;
    const content = sourceEditor?.state.doc.toString() || "";
    if (sourceEditor) {
      sourceEditor.destroy();
    }

    sourceEditor = new EditorView({
      state: EditorState.create({
        doc: content,
        extensions: [
          basicSetup,
          getLanguageExtension(sourceFormat),
          createTheme(isDark),
          placeholder(
            `Paste or type your ${formatLabels[sourceFormat]} here...`,
          ),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              debouncedConvert();
            }
          }),
          EditorView.theme({
            "&": { height: "100%" },
            ".cm-scroller": { overflow: "auto" },
          }),
        ],
      }),
      parent: sourceEditorContainer,
    });
    return true;
  };

  const createOutputEditor = () => {
    if (!outputEditorContainer) return false;
    const content = outputEditor?.state.doc.toString() || "";
    if (outputEditor) {
      outputEditor.destroy();
    }

    outputEditor = new EditorView({
      state: EditorState.create({
        doc: content,
        extensions: [
          basicSetup,
          getLanguageExtension(outputFormat),
          createTheme(isDark),
          placeholder("Converted output will appear here..."),
          EditorState.readOnly.of(true),
          EditorView.theme({
            "&": { height: "100%" },
            ".cm-scroller": { overflow: "auto" },
          }),
        ],
      }),
      parent: outputEditorContainer,
    });
    return true;
  };

  onMount(() => {
    isDark = document.documentElement.classList.contains("dark");

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === "class") {
          const newIsDark = document.documentElement.classList.contains("dark");
          if (newIsDark !== isDark) {
            isDark = newIsDark;
            // createSourceEditor and createOutputEditor already preserve content internally
            createSourceEditor();
            createOutputEditor();
          }
        }
      });
    });

    observer.observe(document.documentElement, { attributes: true });

    const initEditors = () => {
      const sourceOk = createSourceEditor();
      const outputOk = createOutputEditor();
      if (sourceOk && outputOk) {
        mounted = true;
      } else {
        requestAnimationFrame(initEditors);
      }
    };
    tick().then(initEditors);

    return () => {
      observer.disconnect();
      if (convertTimeout) {
        clearTimeout(convertTimeout);
      }
      sourceEditor?.destroy();
      outputEditor?.destroy();
    };
  });

  let mounted = $state(false);
  let prevSourceFormat = $state<Format>(sourceFormat);
  let prevOutputFormat = $state<Format>(outputFormat);

  // Recreate editors when format changes
  $effect(() => {
    if (mounted && sourceFormat !== prevSourceFormat) {
      prevSourceFormat = sourceFormat;
      // createSourceEditor already preserves content internally
      createSourceEditor();
    }
  });

  $effect(() => {
    if (mounted && outputFormat !== prevOutputFormat) {
      prevOutputFormat = outputFormat;
      // createOutputEditor already preserves content internally
      createOutputEditor();
      convert();
    }
  });

  // Re-convert when options change
  $effect(() => {
    indentType;
    sortKeys;
    if (mounted) {
      convert();
    }
  });

  const handleCopy = () => {
    const output = outputEditor?.state.doc.toString() || "";
    if (output) {
      navigator.clipboard.writeText(output);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    }
  };

  const handlePaste = () => {
    navigator.clipboard.readText().then((text) => {
      if (sourceEditor) {
        sourceEditor.dispatch({
          changes: {
            from: 0,
            to: sourceEditor.state.doc.length,
            insert: text,
          },
        });
      }
    });
  };

  const handleClear = () => {
    if (sourceEditor) {
      sourceEditor.dispatch({
        changes: {
          from: 0,
          to: sourceEditor.state.doc.length,
          insert: "",
        },
      });
    }
    error = "";
  };

  const handleSwap = () => {
    const output = outputEditor?.state.doc.toString() || "";
    if (output && sourceEditor) {
      sourceEditor.dispatch({
        changes: {
          from: 0,
          to: sourceEditor.state.doc.length,
          insert: output,
        },
      });
      const temp = sourceFormat;
      sourceFormat = outputFormat;
      outputFormat = temp;
    }
  };
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <h1 class="text-xl font-medium text-(--color-text) mb-2">
      Data Format Converter
    </h1>
    <p class="text-sm text-(--color-text-muted)">
      Convert between JSON, YAML, TOML, and TOON data formats with customizable
      options.
    </p>
  </header>

  <!-- Configuration -->
  <div
    class="mb-4 py-1 px-2 bg-(--color-bg-alt) border border-(--color-border)"
  >
    <div class="flex flex-wrap items-center gap-3">
      <!-- Source Format -->
      <div class="flex items-center gap-2">
        <label
          for="source-format"
          class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium"
        >
          Source
        </label>
        <select
          id="source-format"
          bind:value={sourceFormat}
          class="px-2 py-1 text-sm bg-(--color-bg) border border-(--color-border) text-(--color-text) focus:border-(--color-text-light) outline-none hover:cursor-pointer"
        >
          <option value="json">JSON</option>
          <option value="yaml">YAML</option>
          <option value="toml">TOML</option>
          <option value="toon">TOON</option>
        </select>
      </div>

      <span class="text-(--color-text-light)">→</span>

      <!-- Output Format -->
      <div class="flex items-center gap-2">
        <label
          for="output-format"
          class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium"
        >
          Output
        </label>
        <select
          id="output-format"
          bind:value={outputFormat}
          class="px-2 py-1 text-sm bg-(--color-bg) border border-(--color-border) text-(--color-text) focus:border-(--color-text-light) outline-none hover:cursor-pointer"
        >
          <option value="json">JSON</option>
          <option value="yaml">YAML</option>
          <option value="toml">TOML</option>
          <option value="toon">TOON</option>
        </select>
      </div>

      <div class="hidden sm:block w-px h-6 bg-(--color-border)"></div>

      <!-- Indentation -->
      <div class="flex items-center gap-2">
        <label
          for="indent"
          class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium"
        >
          Indent
        </label>
        <select
          id="indent"
          bind:value={indentType}
          class="px-2 py-1 text-sm bg-(--color-bg) border border-(--color-border) text-(--color-text) focus:border-(--color-text-light) outline-none hover:cursor-pointer"
        >
          <option value="2">2 spaces</option>
          <option value="4">4 spaces</option>
          <option value="tab">Tabs</option>
        </select>
      </div>

      <div class="hidden sm:block w-px h-6 bg-(--color-border)"></div>

      <!-- Sort Keys -->
      <label class="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          bind:checked={sortKeys}
          class="w-4 h-4 accent-(--color-text) hover:cursor-pointer"
        />
        <span class="text-sm text-(--color-text-muted)">Sort keys</span>
      </label>
    </div>
  </div>

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
    <!-- Source Editor -->
    <div class="flex-1 flex flex-col min-h-[300px]">
      <div class="flex justify-between items-center mb-2">
        <div class="flex items-center gap-3">
          <span
            class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium"
          >
            Source ({formatLabels[sourceFormat]})
          </span>
          <span
            class="text-xs text-(--color-text-muted) bg-(--color-border) px-2"
          >
            {sourceChars} chars {sourceTokens}
            tokens
          </span>
        </div>
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
        bind:this={sourceEditorContainer}
        class="flex-1 border border-(--color-border) overflow-hidden"
      ></div>
    </div>

    <!-- Output Editor -->
    <div class="flex-1 flex flex-col min-h-[300px]">
      <div class="flex justify-between items-center mb-2">
        <div class="flex items-center gap-3">
          <span
            class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium"
          >
            Output ({formatLabels[outputFormat]})
          </span>
          <span class="text-xs bg-(--color-border) px-2">
            <span class="text-(--color-text-muted)">
              {outputChars} chars {outputTokens} tokens
            </span>
            <span
              class="text-xs {tokenDiffPercent()! < 0
                ? 'text-green-600 dark:text-green-400'
                : tokenDiffPercent()! > 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-(--color-text-muted)'}"
            >
              ({tokenDiffPercent()! > 0 ? "+" : ""}{tokenDiffPercent()!.toFixed(
                1,
              )}%)
            </span>
          </span>
        </div>
        <div class="flex gap-3">
          <button
            onclick={handleSwap}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            title="Use output as new source"
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
