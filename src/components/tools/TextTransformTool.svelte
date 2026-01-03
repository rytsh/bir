<script lang="ts">
  import {
    EditorView,
    createEditor,
    createDarkModeObserver,
    getInitialDarkMode,
    updateEditorContent,
    getEditorContent,
    createBaseExtensions,
    EditorState,
    initEditorsWithRetry,
  } from "../../lib/codemirror.js";

  let text = $state("");
  let originalText = $state("");
  let copied = $state(false);
  let isDark = $state(false);

  // Selection state
  let cursorLine = $state(1);
  let cursorCol = $state(1);
  let selectionLength = $state(0);

  let editorContainer: HTMLDivElement;
  let editor: EditorView;

  const hasText = $derived(text.length > 0);

  // Statistics
  interface TextStats {
    characters: number;
    charactersNoSpaces: number;
    words: number;
    lines: number;
    sentences: number;
    paragraphs: number;
    bytes: number;
    wordFreq: Map<string, number>;
    charFreq: Map<string, number>;
  }

  const computeStats = (t: string): TextStats => {
    const chars = t.length;
    const charsNoSpaces = t.replace(/\s/g, "").length;
    const words = t.trim() ? t.trim().split(/\s+/).length : 0;
    const lines = t ? t.split("\n").length : 0;
    const sentences = t ? (t.match(/[.!?]+(\s|$)/g) || []).length : 0;
    const paragraphs = t ? t.split(/\n\s*\n/).filter((p) => p.trim()).length || (t.trim() ? 1 : 0) : 0;
    const bytes = new Blob([t]).size;

    // Word frequency
    const wordFreq = new Map<string, number>();
    if (t.trim()) {
      const wordList = t.toLowerCase().match(/\b[a-z]+\b/g) || [];
      for (const word of wordList) {
        wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
      }
    }

    // Character frequency (letters only)
    const charFreq = new Map<string, number>();
    const letters = t.toLowerCase().match(/[a-z]/g) || [];
    for (const char of letters) {
      charFreq.set(char, (charFreq.get(char) || 0) + 1);
    }

    return {
      characters: chars,
      charactersNoSpaces: charsNoSpaces,
      words,
      lines,
      sentences,
      paragraphs,
      bytes,
      wordFreq,
      charFreq,
    };
  };

  const stats = $derived(computeStats(text));

  // Get top N items from frequency map
  const getTopFrequencies = (freq: Map<string, number>, n: number): [string, number][] => {
    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n);
  };

  // Line operations
  const alphabetize = () => {
    const lines = text.split("\n");
    const sorted = lines.sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
    updateText(sorted.join("\n"));
  };

  const reverseAlphabetize = () => {
    const lines = text.split("\n");
    const sorted = lines.sort((a, b) =>
      b.localeCompare(a, undefined, { sensitivity: "base" }),
    );
    updateText(sorted.join("\n"));
  };

  const reverseLines = () => {
    const lines = text.split("\n");
    updateText(lines.reverse().join("\n"));
  };

  const randomizeLines = () => {
    const lines = text.split("\n");
    for (let i = lines.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [lines[i], lines[j]] = [lines[j], lines[i]];
    }
    updateText(lines.join("\n"));
  };

  // Case conversions
  const toUpperCase = () => {
    updateText(text.toUpperCase());
  };

  const toLowerCase = () => {
    updateText(text.toLowerCase());
  };

  const toSnakeCase = () => {
    const result = text
      .replace(/([a-z])([A-Z])/g, "$1_$2")
      .replace(/[\s\-]+/g, "_")
      .toLowerCase();
    updateText(result);
  };

  const toTitleCase = () => {
    const result = text.replace(/\w\S*/g, (txt) => {
      return txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase();
    });
    updateText(result);
  };

  const toCamelCase = () => {
    const result = text
      .replace(/(?:^\w|[A-Z]|\b\w)/g, (letter, index) => {
        return index === 0 ? letter.toLowerCase() : letter.toUpperCase();
      })
      .replace(/[\s\-_]+/g, "");
    updateText(result);
  };

  const toKebabCase = () => {
    const result = text
      .replace(/([a-z])([A-Z])/g, "$1-$2")
      .replace(/[\s_]+/g, "-")
      .toLowerCase();
    updateText(result);
  };

  const toPascalCase = () => {
    const result = text
      .replace(/(?:^\w|[A-Z]|\b\w)/g, (letter) => letter.toUpperCase())
      .replace(/[\s\-_]+/g, "");
    updateText(result);
  };

  const toConstantCase = () => {
    const result = text
      .replace(/([a-z])([A-Z])/g, "$1_$2")
      .replace(/[\s\-]+/g, "_")
      .toUpperCase();
    updateText(result);
  };

  // Format operations
  const wrapSingleQuotes = () => {
    const lines = text.split("\n");
    const result = lines.map(line => `'${line}'`).join("\n");
    updateText(result);
  };

  const wrapDoubleQuotes = () => {
    const lines = text.split("\n");
    const result = lines.map(line => `"${line}"`).join("\n");
    updateText(result);
  };

  const wrapBackticks = () => {
    const lines = text.split("\n");
    const result = lines.map(line => `\`${line}\``).join("\n");
    updateText(result);
  };

  const addCommas = () => {
    const lines = text.split("\n");
    const result = lines.map((line, i) => i < lines.length - 1 ? `${line},` : line).join("\n");
    updateText(result);
  };

  const singleQuotesWithCommas = () => {
    const lines = text.split("\n");
    const result = lines.map((line, i) => {
      const quoted = `'${line}'`;
      return i < lines.length - 1 ? `${quoted},` : quoted;
    }).join("\n");
    updateText(result);
  };

  const doubleQuotesWithCommas = () => {
    const lines = text.split("\n");
    const result = lines.map((line, i) => {
      const quoted = `"${line}"`;
      return i < lines.length - 1 ? `${quoted},` : quoted;
    }).join("\n");
    updateText(result);
  };

  const uniqueLines = () => {
    const lines = text.split("\n");
    const unique = [...new Set(lines)];
    updateText(unique.join("\n"));
  };

  const removeDuplicateLines = () => {
    const lines = text.split("\n");
    const seen = new Set<string>();
    const result = lines.filter(line => {
      if (seen.has(line)) return false;
      seen.add(line);
      return true;
    });
    updateText(result.join("\n"));
  };

  const removeEmptyLines = () => {
    const lines = text.split("\n");
    const result = lines.filter(line => line.trim() !== "");
    updateText(result.join("\n"));
  };

  const trimLines = () => {
    const lines = text.split("\n");
    const result = lines.map(line => line.trim());
    updateText(result.join("\n"));
  };

  const trimAllWhitespace = () => {
    const result = text.replace(/\s+/g, " ").trim();
    updateText(result);
  };

  const addLineNumbers = () => {
    const lines = text.split("\n");
    const padWidth = String(lines.length).length;
    const result = lines.map((line, i) => `${String(i + 1).padStart(padWidth, " ")}. ${line}`);
    updateText(result.join("\n"));
  };

  const removeLineNumbers = () => {
    const lines = text.split("\n");
    const result = lines.map(line => line.replace(/^\s*\d+[\.\)\-:\s]+/, ""));
    updateText(result.join("\n"));
  };

  const addPrefix = (prefix: string) => {
    const lines = text.split("\n");
    const result = lines.map(line => `${prefix}${line}`);
    updateText(result.join("\n"));
  };

  const addSuffix = (suffix: string) => {
    const lines = text.split("\n");
    const result = lines.map(line => `${line}${suffix}`);
    updateText(result.join("\n"));
  };

  const joinLines = (separator: string) => {
    const lines = text.split("\n");
    updateText(lines.join(separator));
  };

  const splitToLines = (separator: string) => {
    const result = text.split(separator).join("\n");
    updateText(result);
  };

  const sortByLength = () => {
    const lines = text.split("\n");
    const sorted = lines.sort((a, b) => a.length - b.length);
    updateText(sorted.join("\n"));
  };

  const sortByLengthDesc = () => {
    const lines = text.split("\n");
    const sorted = lines.sort((a, b) => b.length - a.length);
    updateText(sorted.join("\n"));
  };

  const sortNumeric = () => {
    const lines = text.split("\n");
    const sorted = lines.sort((a, b) => {
      const numA = parseFloat(a) || 0;
      const numB = parseFloat(b) || 0;
      return numA - numB;
    });
    updateText(sorted.join("\n"));
  };

  const reverseEachLine = () => {
    const lines = text.split("\n");
    const result = lines.map(line => line.split("").reverse().join(""));
    updateText(result.join("\n"));
  };

  const encodeUri = () => {
    updateText(encodeURIComponent(text));
  };

  const decodeUri = () => {
    try {
      updateText(decodeURIComponent(text));
    } catch {
      // Invalid URI, do nothing
    }
  };

  const escapeHtml = () => {
    const result = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
    updateText(result);
  };

  const unescapeHtml = () => {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = text;
    updateText(textarea.value);
  };

  // Prefix/suffix input state
  let prefixValue = $state("");
  let suffixValue = $state("");
  let joinSeparator = $state(", ");
  let splitSeparator = $state(", ");

  // Helper to update text and sync with editor
  const updateText = (newText: string) => {
    text = newText;
    updateEditorContent(editor, newText);
  };

  // Store original and update text
  const setTextWithOriginal = (newText: string) => {
    if (!originalText) {
      originalText = newText;
    }
    text = newText;
    updateEditorContent(editor, newText);
  };

  const setOriginal = () => {
    if (text) {
      originalText = text;
    }
  };

  const restoreOriginal = () => {
    if (originalText) {
      text = originalText;
      updateEditorContent(editor, originalText);
    }
  };

  const createTextEditor = (): boolean => {
    if (!editorContainer) return false;
    const content = getEditorContent(editor);
    if (editor) editor.destroy();

    const baseConfig = {
      dark: isDark,
      placeholderText: "Enter or paste text here...",
      onUpdate: (content: string) => {
        if (!originalText && content) {
          originalText = content;
        }
        text = content;
      },
    };

    const selectionListener = EditorView.updateListener.of((update) => {
      const state = update.state;
      const selection = state.selection.main;
      const pos = selection.head;
      const line = state.doc.lineAt(pos);
      cursorLine = line.number;
      cursorCol = pos - line.from + 1;
      selectionLength = Math.abs(selection.to - selection.from);
    });

    editor = new EditorView({
      state: EditorState.create({
        doc: content ?? "",
        extensions: [...createBaseExtensions(baseConfig), selectionListener],
      }),
      parent: editorContainer,
    });
    return true;
  };

  $effect(() => {
    isDark = getInitialDarkMode();

    const cleanup = createDarkModeObserver((newIsDark) => {
      if (newIsDark !== isDark) {
        isDark = newIsDark;
        createTextEditor();
      }
    });

    initEditorsWithRetry([createTextEditor]);

    return () => {
      cleanup();
      editor?.destroy();
    };
  });

  const handleCopy = () => {
    if (text) {
      navigator.clipboard.writeText(text);
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 2000);
    }
  };

  const handlePaste = () => {
    navigator.clipboard.readText().then((clipText) => {
      setTextWithOriginal(clipText);
    });
  };

  const handleClear = () => {
    text = "";
    originalText = "";
    updateEditorContent(editor, "");
  };

  const handleFileLoad = (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setTextWithOriginal(content);
      };
      reader.readAsText(file);
      input.value = "";
    }
  };

  let fileInput: HTMLInputElement;
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Inspect and transform text with various operations: sort lines, change
      case, and more.
    </p>
  </header>

  <!-- Action Buttons -->
  <div class="mb-4 flex flex-wrap gap-2">
    <input
      type="file"
      accept=".txt,.md,.json,.xml,.csv,.log,text/*"
      onchange={handleFileLoad}
      bind:this={fileInput}
      class="hidden"
    />
    <button
      onclick={() => fileInput.click()}
      class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors"
    >
      Load File
    </button>
    <button
      onclick={handlePaste}
      class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors"
    >
      Paste
    </button>
    <button
      onclick={handleCopy}
      disabled={!hasText}
      class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
    <button
      onclick={handleClear}
      disabled={!hasText}
      class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      Clear
    </button>
    <div class="border-l border-(--color-border) pl-4 ml-2 flex gap-2">
      <button
        onclick={setOriginal}
        disabled={!hasText}
        class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Set Original
      </button>
      <button
        onclick={restoreOriginal}
        disabled={!originalText || originalText === text}
        class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Restore Original
      </button>
    </div>
  </div>

  <!-- Line Operations -->
  <div class="mb-4">
    <div
      class="text-xs tracking-wider text-(--color-text-light) font-medium mb-2"
    >
      Line Operations
    </div>
    <div class="flex flex-wrap gap-2">
      <button
        onclick={alphabetize}
        class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors"
      >
        Alphabetize
      </button>
      <button
        onclick={reverseAlphabetize}
        class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors"
      >
        Reverse Alphabetize
      </button>
      <button
        onclick={reverseLines}
        class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors"
      >
        Reverse
      </button>
      <button
        onclick={randomizeLines}
        class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors"
      >
        Randomize
      </button>
      <button
        onclick={uniqueLines}
        class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors"
      >
        Unique Lines
      </button>
      <button
        onclick={removeEmptyLines}
        class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors"
      >
        Remove Empty
      </button>
      <button
        onclick={trimLines}
        class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors"
      >
        Trim Lines
      </button>
      <button
        onclick={trimAllWhitespace}
        class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors"
      >
        Trim All Whitespace
      </button>
      <button
        onclick={addLineNumbers}
        class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors"
      >
        Add Line Numbers
      </button>
      <button
        onclick={removeLineNumbers}
        class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors"
      >
        Remove Line Numbers
      </button>
      <button
        onclick={sortByLength}
        class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors"
      >
        Sort by Length
      </button>
      <button
        onclick={sortByLengthDesc}
        class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors"
      >
        Sort by Length (Desc)
      </button>
      <button
        onclick={sortNumeric}
        class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors"
      >
        Numeric Sort
      </button>
      <button
        onclick={reverseEachLine}
        class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors"
      >
        Reverse Each Line
      </button>
    </div>
  </div>

  <!-- Case Conversions -->
  <div class="mb-4">
    <div
      class="text-xs tracking-wider text-(--color-text-light) font-medium mb-2"
    >
      Case Conversions
    </div>
    <div class="flex flex-wrap gap-2">
      <button
        onclick={toUpperCase}
        class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors"
      >
        UPPERCASE
      </button>
      <button
        onclick={toLowerCase}
        class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors"
      >
        lowercase
      </button>
      <button
        onclick={toTitleCase}
        class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors"
      >
        Title Case
      </button>
      <button
        onclick={toSnakeCase}
        class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors"
      >
        snake_case
      </button>
      <button
        onclick={toCamelCase}
        class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors"
      >
        camelCase
      </button>
      <button
        onclick={toKebabCase}
        class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors"
      >
        kebab-case
      </button>
      <button
        onclick={toPascalCase}
        class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors"
      >
        PascalCase
      </button>
      <button
        onclick={toConstantCase}
        class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors"
      >
        CONSTANT_CASE
      </button>
    </div>
  </div>

  <!-- Format Operations -->
  <div class="mb-4">
    <div
      class="text-xs tracking-wider text-(--color-text-light) font-medium mb-2"
    >
      Format Operations
    </div>
    <div class="flex flex-wrap gap-2">
      <button
        onclick={wrapSingleQuotes}
        class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors"
      >
        'Single Quotes'
      </button>
      <button
        onclick={wrapDoubleQuotes}
        class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors"
      >
        "Double Quotes"
      </button>
      <button
        onclick={wrapBackticks}
        class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors"
      >
        `Backticks`
      </button>
      <button
        onclick={addCommas}
        class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors"
      >
        Add Commas
      </button>
      <button
        onclick={singleQuotesWithCommas}
        class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors"
      >
        'Quotes' + Commas
      </button>
      <button
        onclick={doubleQuotesWithCommas}
        class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors"
      >
        "Quotes" + Commas
      </button>
    </div>
  </div>

  <!-- Prefix/Suffix/Join/Split -->
  <div class="mb-4">
    <div
      class="text-xs tracking-wider text-(--color-text-light) font-medium mb-2"
    >
      Prefix / Suffix / Join / Split
    </div>
    <div class="flex flex-wrap gap-2 items-center">
      <div class="flex items-center gap-1">
        <input
          type="text"
          bind:value={prefixValue}
          placeholder="Prefix"
          class="w-24 px-2 py-1.5 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text) placeholder:text-(--color-text-muted)"
        />
        <button
          onclick={() => addPrefix(prefixValue)}
          disabled={!prefixValue}
          class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Add Prefix
        </button>
      </div>
      <div class="flex items-center gap-1">
        <input
          type="text"
          bind:value={suffixValue}
          placeholder="Suffix"
          class="w-24 px-2 py-1.5 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text) placeholder:text-(--color-text-muted)"
        />
        <button
          onclick={() => addSuffix(suffixValue)}
          disabled={!suffixValue}
          class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Add Suffix
        </button>
      </div>
      <div class="flex items-center gap-1">
        <input
          type="text"
          bind:value={joinSeparator}
          placeholder="Separator"
          class="w-24 px-2 py-1.5 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text) placeholder:text-(--color-text-muted)"
        />
        <button
          onclick={() => joinLines(joinSeparator)}
          class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors"
        >
          Join Lines
        </button>
      </div>
      <div class="flex items-center gap-1">
        <input
          type="text"
          bind:value={splitSeparator}
          placeholder="Separator"
          class="w-24 px-2 py-1.5 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text) placeholder:text-(--color-text-muted)"
        />
        <button
          onclick={() => splitToLines(splitSeparator)}
          class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors"
        >
          Split to Lines
        </button>
      </div>
    </div>
  </div>

  <!-- Encode/Decode -->
  <div class="mb-4">
    <div
      class="text-xs tracking-wider text-(--color-text-light) font-medium mb-2"
    >
      Encode / Decode
    </div>
    <div class="flex flex-wrap gap-2">
      <button
        onclick={encodeUri}
        class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors"
      >
        URI Encode
      </button>
      <button
        onclick={decodeUri}
        class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors"
      >
        URI Decode
      </button>
      <button
        onclick={escapeHtml}
        class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors"
      >
        HTML Escape
      </button>
      <button
        onclick={unescapeHtml}
        class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors"
      >
        HTML Unescape
      </button>
    </div>
  </div>

  <!-- Text Editor and Stats Panel -->
  <div class="flex-1 flex flex-col lg:flex-row gap-4 min-h-auto">
    <!-- Editor -->
    <div class="flex-1 flex flex-col min-w-0">
      <div class="flex justify-between items-center mb-2">
        <span class="text-xs tracking-wider text-(--color-text-light) font-medium">Text</span>
        <span class="text-xs text-(--color-text-muted)">
          Ln {cursorLine}, Col {cursorCol}
          <span class="border-l border-(--color-border) px-2 ml-2">{selectionLength} selected</span>
        </span>
      </div>
      <div
        bind:this={editorContainer}
        class="flex-1 border border-(--color-border)"
      ></div>
    </div>

    <!-- Statistics Panel -->
    <div class="w-full lg:w-72 flex flex-col border border-(--color-border) bg-(--color-bg-alt)">
      <div class="p-1 border-b border-(--color-border)">
        <span class="text-xs tracking-wider text-(--color-text-light) font-medium">Statistics</span>
      </div>
      <div class="flex-1">
        <!-- Basic Stats -->
        <div class="text-xs border-b border-(--color-border)">
          <div class="flex justify-between py-1.5 px-2 bg-(--color-bg)">
            <span class="text-(--color-text-muted)">Characters:</span>
            <span class="text-(--color-text) font-medium">{stats.characters.toLocaleString()}</span>
          </div>
          <div class="flex justify-between py-1.5 px-2">
            <span class="text-(--color-text-muted)">Spaces:</span>
            <span class="text-(--color-text) font-medium">{(stats.characters - stats.charactersNoSpaces).toLocaleString()}</span>
          </div>
          <div class="flex justify-between py-1.5 px-2 bg-(--color-bg)">
            <span class="text-(--color-text-muted)">No spaces:</span>
            <span class="text-(--color-text) font-medium">{stats.charactersNoSpaces.toLocaleString()}</span>
          </div>
          <div class="flex justify-between py-1.5 px-2">
            <span class="text-(--color-text-muted)">Words:</span>
            <span class="text-(--color-text) font-medium">{stats.words.toLocaleString()}</span>
          </div>
          <div class="flex justify-between py-1.5 px-2 bg-(--color-bg)">
            <span class="text-(--color-text-muted)">Lines:</span>
            <span class="text-(--color-text) font-medium">{stats.lines.toLocaleString()}</span>
          </div>
          <div class="flex justify-between py-1.5 px-2">
            <span class="text-(--color-text-muted)">Sentences:</span>
            <span class="text-(--color-text) font-medium">{stats.sentences.toLocaleString()}</span>
          </div>
          <div class="flex justify-between py-1.5 px-2 bg-(--color-bg)">
            <span class="text-(--color-text-muted)">Paragraphs:</span>
            <span class="text-(--color-text) font-medium">{stats.paragraphs.toLocaleString()}</span>
          </div>
          <div class="flex justify-between py-1.5 px-2">
            <span class="text-(--color-text-muted)">Bytes:</span>
            <span class="text-(--color-text) font-medium">{stats.bytes.toLocaleString()}</span>
          </div>
        </div>

        <!-- Word Distribution -->
        {#if stats.wordFreq.size > 0}
          <div class="border-b border-(--color-border)">
            <div class="px-1 py-2 text-xs text-(--color-text-light) font-medium">Top Words</div>
            <div>
              {#each getTopFrequencies(stats.wordFreq, 10) as [word, count], i}
                <div class="flex items-center gap-2 text-xs py-1.5 px-2 {i % 2 === 0 ? 'bg-(--color-bg)' : ''}">
                  <span class="text-(--color-text) truncate flex-1">{word}</span>
                  <div class="flex-1 h-1.5 bg-(--color-border) rounded">
                    <div
                      class="h-full bg-(--color-accent)"
                      style="width: {(count / getTopFrequencies(stats.wordFreq, 1)[0][1]) * 100}%"
                    ></div>
                  </div>
                  <span class="text-(--color-text-muted) w-8 text-right">{count}</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Character Distribution -->
        {#if stats.charFreq.size > 0}
          <div class="p-1 py-2">
            <div class="text-xs text-(--color-text-light) font-medium mb-2">Character Distribution</div>
            <div class="flex flex-wrap gap-1">
              {#each getTopFrequencies(stats.charFreq, 26) as [char, count]}
                {@const maxCount = getTopFrequencies(stats.charFreq, 1)[0][1]}
                {@const intensity = Math.round((count / maxCount) * 100)}
                <div
                  class="w-6 h-6 flex items-center justify-center text-xs font-mono border border-(--color-border) rounded relative"
                  title="{char.toUpperCase()}: {count}"
                >
                  <div
                    class="absolute inset-0 bg-(--color-accent)"
                    style="opacity: {intensity / 100}"
                  ></div>
                  <span class="relative z-10 font-medium" style="color: {intensity > 40 ? (isDark ? '#000' : '#fff') : 'var(--color-text)'}">{char.toUpperCase()}</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
