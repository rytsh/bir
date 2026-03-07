<script lang="ts">
  import CodeMirror from "svelte-codemirror-editor";
  import { EditorView } from "@codemirror/view";
  import { createDarkModeObserver, getInitialDarkMode, createTheme, editorHeightExtension } from "../../lib/codemirror.js";

  let text = $state("");
  let originalText = $state("");
  let copied = $state(false);
  let isDark = $state(getInitialDarkMode());

  // Editor view reference
  let editorView = $state<EditorView | undefined>(undefined);

  // Selection state
  let cursorLine = $state(1);
  let cursorCol = $state(1);
  let selectionLength = $state(0);

  const hasText = $derived(text.length > 0);
  const hasSelection = $derived(selectionLength > 0);

  // Selection tracking extension
  const selectionTracker = EditorView.updateListener.of((update) => {
    if (!editorView) {
      editorView = update.view;
    }
    const state = update.state;
    const selection = state.selection.main;
    const pos = selection.head;
    const line = state.doc.lineAt(pos);
    cursorLine = line.number;
    cursorCol = pos - line.from + 1;
    selectionLength = Math.abs(selection.to - selection.from);
  });

  // CodeMirror extensions based on dark mode
  let editorExtensions = $derived([
    ...createTheme(isDark),
    editorHeightExtension,
    EditorView.lineWrapping,
    selectionTracker,
  ]);

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
    applyLineTransform((lines) =>
      lines.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    );
  };

  const reverseAlphabetize = () => {
    applyLineTransform((lines) =>
      lines.sort((a, b) => b.localeCompare(a, undefined, { sensitivity: "base" })),
    );
  };

  const reverseLines = () => {
    applyLineTransform((lines) => lines.reverse());
  };

  const randomizeLines = () => {
    applyLineTransform((lines) => {
      for (let i = lines.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [lines[i], lines[j]] = [lines[j], lines[i]];
      }
      return lines;
    });
  };

  // Case conversions
  const toUpperCase = () => {
    applyTransform((t) => t.toUpperCase());
  };

  const toLowerCase = () => {
    applyTransform((t) => t.toLowerCase());
  };

  const toSnakeCase = () => {
    applyTransform((t) =>
      t.replace(/([a-z])([A-Z])/g, "$1_$2")
        .replace(/[\s\-]+/g, "_")
        .toLowerCase(),
    );
  };

  const toTitleCase = () => {
    applyTransform((t) =>
      t.replace(/\w\S*/g, (txt) =>
        txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase(),
      ),
    );
  };

  const toCamelCase = () => {
    applyTransform((t) =>
      t.replace(/(?:^\w|[A-Z]|\b\w)/g, (letter, index) =>
        index === 0 ? letter.toLowerCase() : letter.toUpperCase(),
      ).replace(/[\s\-_]+/g, ""),
    );
  };

  const toKebabCase = () => {
    applyTransform((t) =>
      t.replace(/([a-z])([A-Z])/g, "$1-$2")
        .replace(/[\s_]+/g, "-")
        .toLowerCase(),
    );
  };

  const toPascalCase = () => {
    applyTransform((t) =>
      t.replace(/(?:^\w|[A-Z]|\b\w)/g, (letter) => letter.toUpperCase())
        .replace(/[\s\-_]+/g, ""),
    );
  };

  const toConstantCase = () => {
    applyTransform((t) =>
      t.replace(/([a-z])([A-Z])/g, "$1_$2")
        .replace(/[\s\-]+/g, "_")
        .toUpperCase(),
    );
  };

  // Format operations
  const wrapSingleQuotes = () => {
    applyLineTransform((lines) => lines.map((line) => `'${line}'`));
  };

  const wrapDoubleQuotes = () => {
    applyLineTransform((lines) => lines.map((line) => `"${line}"`));
  };

  const wrapBackticks = () => {
    applyLineTransform((lines) => lines.map((line) => `\`${line}\``));
  };

  const addCommas = () => {
    applyLineTransform((lines) =>
      lines.map((line, i) => (i < lines.length - 1 ? `${line},` : line)),
    );
  };

  const singleQuotesWithCommas = () => {
    applyLineTransform((lines) =>
      lines.map((line, i) => {
        const quoted = `'${line}'`;
        return i < lines.length - 1 ? `${quoted},` : quoted;
      }),
    );
  };

  const doubleQuotesWithCommas = () => {
    applyLineTransform((lines) =>
      lines.map((line, i) => {
        const quoted = `"${line}"`;
        return i < lines.length - 1 ? `${quoted},` : quoted;
      }),
    );
  };

  const uniqueLines = () => {
    applyLineTransform((lines) => [...new Set(lines)]);
  };

  const removeEmptyLines = () => {
    applyLineTransform((lines) => lines.filter((line) => line.trim() !== ""));
  };

  const trimLines = () => {
    applyLineTransform((lines) => lines.map((line) => line.trim()));
  };

  const trimAllWhitespace = () => {
    applyTransform((t) => t.replace(/\s+/g, " ").trim());
  };

  const addLineNumbers = () => {
    applyLineTransform((lines) => {
      const padWidth = String(lines.length).length;
      return lines.map((line, i) => `${String(i + 1).padStart(padWidth, " ")}. ${line}`);
    });
  };

  const removeLineNumbers = () => {
    applyLineTransform((lines) =>
      lines.map((line) => line.replace(/^\s*\d+[\.\)\-:\s]+/, "")),
    );
  };

  const addPrefix = (prefix: string) => {
    applyLineTransform((lines) => lines.map((line) => `${prefix}${line}`));
  };

  const addSuffix = (suffix: string) => {
    applyLineTransform((lines) => lines.map((line) => `${line}${suffix}`));
  };

  const joinLines = (separator: string) => {
    applyTransform((t) => t.split("\n").join(separator));
  };

  const splitToLines = (separator: string) => {
    applyTransform((t) => t.split(separator).join("\n"));
  };

  const sortByLength = () => {
    applyLineTransform((lines) => lines.sort((a, b) => a.length - b.length));
  };

  const sortByLengthDesc = () => {
    applyLineTransform((lines) => lines.sort((a, b) => b.length - a.length));
  };

  const sortNumeric = () => {
    applyLineTransform((lines) =>
      lines.sort((a, b) => {
        const numA = parseFloat(a) || 0;
        const numB = parseFloat(b) || 0;
        return numA - numB;
      }),
    );
  };

  const reverseEachLine = () => {
    applyLineTransform((lines) =>
      lines.map((line) => line.split("").reverse().join("")),
    );
  };

  const encodeUri = () => {
    applyTransform((t) => encodeURIComponent(t));
  };

  const decodeUri = () => {
    applyTransform((t) => {
      try {
        return decodeURIComponent(t);
      } catch {
        return t;
      }
    });
  };

  const escapeHtml = () => {
    applyTransform((t) =>
      t.replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;"),
    );
  };

  const unescapeHtml = () => {
    applyTransform((t) => {
      const textarea = document.createElement("textarea");
      textarea.innerHTML = t;
      return textarea.value;
    });
  };

  // Remove specific characters
  let removeCharsValue = $state("");
  const removeCharacters = (chars: string) => {
    if (!chars) return;
    const escaped = chars.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`[${escaped}]`, "g");
    applyTransform((t) => t.replace(regex, ""));
  };

  // Remove spaces operations
  const removeAllSpaces = () => {
    applyTransform((t) => t.replace(/ /g, ""));
  };

  const removeLeadingSpaces = () => {
    applyLineTransform((lines) => lines.map((line) => line.replace(/^ +/, "")));
  };

  const removeTrailingSpaces = () => {
    applyLineTransform((lines) => lines.map((line) => line.replace(/ +$/, "")));
  };

  const removeExtraSpaces = () => {
    applyTransform((t) => t.replace(/ {2,}/g, " "));
  };

  const removeAllWhitespace = () => {
    applyTransform((t) => t.replace(/\s/g, ""));
  };

  const removeNewLines = () => {
    applyTransform((t) => t.replace(/\n/g, ""));
  };

  // Prefix/suffix input state
  let prefixValue = $state("");
  let suffixValue = $state("");
  let joinSeparator = $state(", ");
  let splitSeparator = $state(", ");

  // Helper to apply a text transform (selection-aware)
  // Prefer dispatching CodeMirror transactions when the view is available,
  // so selection and undo/redo behave naturally.
  const applyTransform = (transformFn: (input: string) => string) => {
    if (!editorView) {
      text = transformFn(text);
      return;
    }

    const state = editorView.state;
    const selection = state.selection.main;
    const from = selection.from;
    const to = selection.to;
    const isSelection = !selection.empty;

    if (isSelection) {
      const selected = state.doc.sliceString(from, to);
      const transformed = transformFn(selected);
      editorView.dispatch({
        changes: { from, to, insert: transformed },
        selection: { anchor: from, head: from + transformed.length },
      });
      return;
    }

    const full = state.doc.toString();
    const transformed = transformFn(full);
    const head = selection.head;
    const newHead = Math.min(head, transformed.length);
    editorView.dispatch({
      changes: { from: 0, to: state.doc.length, insert: transformed },
      selection: { anchor: newHead, head: newHead },
    });
  };

  // Helper to apply a line-based transform (selection-aware)
  const applyLineTransform = (transformFn: (lines: string[]) => string[]) => {
    applyTransform((t) => transformFn(t.split("\n")).join("\n"));
  };

  // Simple update (no selection awareness, for backward compat)
  const updateText = (newText: string) => {
    text = newText;
  };

  // Store original and update text
  const setTextWithOriginal = (newText: string) => {
    if (!originalText) {
      originalText = newText;
    }
    text = newText;
  };

  const setOriginal = () => {
    if (text) {
      originalText = text;
    }
  };

  const restoreOriginal = () => {
    if (originalText) {
      text = originalText;
    }
  };

  $effect(() => {
    isDark = getInitialDarkMode();

    const cleanup = createDarkModeObserver((newIsDark) => {
      if (newIsDark !== isDark) {
        isDark = newIsDark;
      }
    });

    return cleanup;
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

<div class="h-full min-h-0 flex flex-col">
  <header class="mb-4 shrink-0">
    <p class="text-sm text-(--color-text-muted)">
      Inspect and transform text with various operations: sort lines, change
      case, and more.
    </p>
  </header>

  <!-- Action Buttons -->
  <div class="mb-4 flex flex-wrap gap-2 shrink-0">
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

  <!-- Main Content: Editor (left) + Functions Panel (right) -->
  <div class="grid grid-cols-1 lg:grid-cols-[1fr_20rem] gap-4 items-stretch">

    <!-- Left: Statistics + Editor (height matches functions panel via grid row) -->
    <div class="flex flex-col min-w-0 min-h-0 h-full">
      <!-- Statistics (collapsible) -->
      <details class="group mb-3 border border-(--color-border) bg-(--color-bg-alt)">
        <summary class="p-2 cursor-pointer select-none text-xs tracking-wider text-(--color-text-light) font-medium hover:bg-(--color-border) transition-colors flex items-center gap-2">
          <span class="text-[10px] transition-transform group-open:rotate-90">&#9654;</span>
          Statistics
          <span class="text-(--color-text-muted) font-normal ml-auto">{stats.characters.toLocaleString()} chars, {stats.words.toLocaleString()} words, {stats.lines.toLocaleString()} lines</span>
        </summary>
        <div class="border-t border-(--color-border)">
          <div class="flex flex-col lg:flex-row">
            <!-- Basic Stats -->
            <div class="text-xs flex-1 lg:border-r border-b lg:border-b-0 border-(--color-border)">
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
              {@const topWords = getTopFrequencies(stats.wordFreq, 10)}
              {@const maxWordCount = topWords[0]?.[1] ?? 1}
              <div class="flex-1 lg:border-r border-b lg:border-b-0 border-(--color-border)">
                <div class="px-2 py-2 text-xs text-(--color-text-light) font-medium">Top Words</div>
                <div>
                  {#each topWords as [word, count], i}
                    <div class="flex items-center gap-2 text-xs py-1.5 px-2 {i % 2 === 0 ? 'bg-(--color-bg)' : ''}">
                      <span class="text-(--color-text) truncate flex-1">{word}</span>
                      <div class="flex-1 h-1.5 bg-(--color-border) rounded">
                        <div
                          class="h-full bg-(--color-accent)"
                          style="width: {(count / maxWordCount) * 100}%"
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
              {@const topChars = getTopFrequencies(stats.charFreq, 26)}
              {@const maxCharCount = topChars[0]?.[1] ?? 1}
              <div class="flex-1 p-2">
                <div class="text-xs text-(--color-text-light) font-medium mb-2">Character Distribution</div>
                <div class="flex flex-wrap gap-1">
                  {#each topChars as [char, count]}
                    {@const intensity = Math.round((count / maxCharCount) * 100)}
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
      </details>

      <div class="flex justify-between items-center mb-2 shrink-0">
        <span class="text-xs tracking-wider text-(--color-text-light) font-medium flex items-center gap-2">
          Text
          {#if hasSelection}
            <span class="text-[10px] px-1.5 py-0.5 bg-(--color-accent) text-white font-medium rounded">Selection Mode</span>
          {/if}
        </span>
        <span class="text-xs text-(--color-text-muted)">
          Ln {cursorLine}, Col {cursorCol}
          <span class="border-l border-(--color-border) px-2 ml-2">{selectionLength} selected</span>
        </span>
      </div>
      <div class="flex-1 border border-(--color-border) overflow-hidden min-h-[16rem] lg:min-h-0">
        <CodeMirror
          bind:value={text}
          placeholder="Enter or paste text here..."
          extensions={editorExtensions}
        />
      </div>
    </div>

    <!-- Right: Functions Panel -->
    <div class="flex flex-col min-h-0 border border-(--color-border) bg-(--color-bg-alt) self-start lg:sticky lg:top-3 lg:max-h-[calc(100vh-6rem)]">
      <div class="p-2 border-b border-(--color-border) flex items-center justify-between shrink-0">
        <span class="text-xs tracking-wider text-(--color-text-light) font-medium">Functions</span>
        {#if hasSelection}
          <span class="text-[10px] text-(--color-accent) font-medium">Applies to selection</span>
        {/if}
      </div>
      <div class="p-3 space-y-3 overflow-auto min-h-0">

        <details open class="group border border-(--color-border) bg-(--color-bg)">
          <summary class="px-2 py-1.5 cursor-pointer select-none text-xs tracking-wider text-(--color-text-light) font-medium hover:bg-(--color-border) transition-colors flex items-center gap-2">
            <span class="text-[10px] transition-transform group-open:rotate-90">&#9654;</span>
            Line Operations
          </summary>
          <div class="p-2 pt-1">
            <div class="flex flex-wrap gap-1.5">
              <button onclick={alphabetize} class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors">Alphabetize</button>
              <button onclick={reverseAlphabetize} class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors">Reverse Alphabetize</button>
              <button onclick={reverseLines} class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors">Reverse</button>
              <button onclick={randomizeLines} class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors">Randomize</button>
              <button onclick={uniqueLines} class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors">Unique Lines</button>
              <button onclick={removeEmptyLines} class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors">Remove Empty</button>
              <button onclick={trimLines} class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors">Trim Lines</button>
              <button onclick={trimAllWhitespace} class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors">Trim All Whitespace</button>
              <button onclick={addLineNumbers} class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors">Add Line Numbers</button>
              <button onclick={removeLineNumbers} class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors">Remove Line Numbers</button>
              <button onclick={sortByLength} class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors">Sort by Length</button>
              <button onclick={sortByLengthDesc} class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors">Sort by Length (Desc)</button>
              <button onclick={sortNumeric} class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors">Numeric Sort</button>
              <button onclick={reverseEachLine} class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors">Reverse Each Line</button>
            </div>
          </div>
        </details>

        <details open class="group border border-(--color-border) bg-(--color-bg)">
          <summary class="px-2 py-1.5 cursor-pointer select-none text-xs tracking-wider text-(--color-text-light) font-medium hover:bg-(--color-border) transition-colors flex items-center gap-2">
            <span class="text-[10px] transition-transform group-open:rotate-90">&#9654;</span>
            Case Conversions
          </summary>
          <div class="p-2 pt-1">
            <div class="flex flex-wrap gap-1.5">
              <button onclick={toUpperCase} class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors">UPPERCASE</button>
              <button onclick={toLowerCase} class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors">lowercase</button>
              <button onclick={toTitleCase} class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors">Title Case</button>
              <button onclick={toSnakeCase} class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors">snake_case</button>
              <button onclick={toCamelCase} class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors">camelCase</button>
              <button onclick={toKebabCase} class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors">kebab-case</button>
              <button onclick={toPascalCase} class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors">PascalCase</button>
              <button onclick={toConstantCase} class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors">CONSTANT_CASE</button>
            </div>
          </div>
        </details>

        <details class="group border border-(--color-border) bg-(--color-bg)">
          <summary class="px-2 py-1.5 cursor-pointer select-none text-xs tracking-wider text-(--color-text-light) font-medium hover:bg-(--color-border) transition-colors flex items-center gap-2">
            <span class="text-[10px] transition-transform group-open:rotate-90">&#9654;</span>
            Format Operations
          </summary>
          <div class="p-2 pt-1">
            <div class="flex flex-wrap gap-1.5">
              <button onclick={wrapSingleQuotes} class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors">'Single Quotes'</button>
              <button onclick={wrapDoubleQuotes} class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors">"Double Quotes"</button>
              <button onclick={wrapBackticks} class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors">`Backticks`</button>
              <button onclick={addCommas} class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors">Add Commas</button>
              <button onclick={singleQuotesWithCommas} class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors">'Quotes' + Commas</button>
              <button onclick={doubleQuotesWithCommas} class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors">"Quotes" + Commas</button>
            </div>
          </div>
        </details>

        <details class="group border border-(--color-border) bg-(--color-bg)">
          <summary class="px-2 py-1.5 cursor-pointer select-none text-xs tracking-wider text-(--color-text-light) font-medium hover:bg-(--color-border) transition-colors flex items-center gap-2">
            <span class="text-[10px] transition-transform group-open:rotate-90">&#9654;</span>
            Prefix / Suffix / Join / Split
          </summary>
          <div class="p-2 pt-1">
            <div class="space-y-1.5">
              <div class="flex items-center gap-1">
                <input type="text" bind:value={prefixValue} placeholder="Prefix" class="w-20 px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) placeholder:text-(--color-text-muted)" />
                <button onclick={() => addPrefix(prefixValue)} disabled={!prefixValue} class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors disabled:opacity-50 disabled:cursor-not-allowed">Add Prefix</button>
              </div>
              <div class="flex items-center gap-1">
                <input type="text" bind:value={suffixValue} placeholder="Suffix" class="w-20 px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) placeholder:text-(--color-text-muted)" />
                <button onclick={() => addSuffix(suffixValue)} disabled={!suffixValue} class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors disabled:opacity-50 disabled:cursor-not-allowed">Add Suffix</button>
              </div>
              <div class="flex items-center gap-1">
                <input type="text" bind:value={joinSeparator} placeholder="Separator" class="w-20 px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) placeholder:text-(--color-text-muted)" />
                <button onclick={() => joinLines(joinSeparator)} class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors">Join Lines</button>
              </div>
              <div class="flex items-center gap-1">
                <input type="text" bind:value={splitSeparator} placeholder="Separator" class="w-20 px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) placeholder:text-(--color-text-muted)" />
                <button onclick={() => splitToLines(splitSeparator)} class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors">Split to Lines</button>
              </div>
            </div>
          </div>
        </details>

        <details class="group border border-(--color-border) bg-(--color-bg)">
          <summary class="px-2 py-1.5 cursor-pointer select-none text-xs tracking-wider text-(--color-text-light) font-medium hover:bg-(--color-border) transition-colors flex items-center gap-2">
            <span class="text-[10px] transition-transform group-open:rotate-90">&#9654;</span>
            Encode / Decode
          </summary>
          <div class="p-2 pt-1">
            <div class="flex flex-wrap gap-1.5">
              <button onclick={encodeUri} class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors">URI Encode</button>
              <button onclick={decodeUri} class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors">URI Decode</button>
              <button onclick={escapeHtml} class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors">HTML Escape</button>
              <button onclick={unescapeHtml} class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors">HTML Unescape</button>
            </div>
          </div>
        </details>

        <details class="group border border-(--color-border) bg-(--color-bg)">
          <summary class="px-2 py-1.5 cursor-pointer select-none text-xs tracking-wider text-(--color-text-light) font-medium hover:bg-(--color-border) transition-colors flex items-center gap-2">
            <span class="text-[10px] transition-transform group-open:rotate-90">&#9654;</span>
            Character Remove
          </summary>
          <div class="p-2 pt-1">
            <div class="space-y-1.5">
              <div class="flex items-center gap-1">
                <input type="text" bind:value={removeCharsValue} placeholder="Characters to remove" class="flex-1 px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) placeholder:text-(--color-text-muted)" />
                <button onclick={() => removeCharacters(removeCharsValue)} disabled={!removeCharsValue} class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors disabled:opacity-50 disabled:cursor-not-allowed">Remove</button>
              </div>
            </div>
          </div>
        </details>

        <details class="group border border-(--color-border) bg-(--color-bg)">
          <summary class="px-2 py-1.5 cursor-pointer select-none text-xs tracking-wider text-(--color-text-light) font-medium hover:bg-(--color-border) transition-colors flex items-center gap-2">
            <span class="text-[10px] transition-transform group-open:rotate-90">&#9654;</span>
            Space Remove
          </summary>
          <div class="p-2 pt-1">
            <div class="flex flex-wrap gap-1.5">
              <button onclick={removeAllSpaces} class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors">All Spaces</button>
              <button onclick={removeLeadingSpaces} class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors">Leading Spaces</button>
              <button onclick={removeTrailingSpaces} class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors">Trailing Spaces</button>
              <button onclick={removeExtraSpaces} class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors">Extra Spaces</button>
              <button onclick={removeAllWhitespace} class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors">All Whitespace</button>
              <button onclick={removeNewLines} class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:bg-(--color-border) transition-colors">New Lines</button>
            </div>
          </div>
        </details>

      </div>
    </div>

  </div>
</div>
