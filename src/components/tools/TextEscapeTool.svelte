<script lang="ts">
  import CodeMirror from "svelte-codemirror-editor";
  import { EditorView } from "@codemirror/view";
  import {
    createDarkModeObserver,
    getInitialDarkMode,
    createTheme,
    editorHeightExtension,
  } from "../../lib/codemirror.js";

  type EscapeFormat = "json" | "html" | "url" | "regex" | "shell" | "sql" | "csv";
  type Mode = "escape" | "unescape";

  interface FormatOption {
    id: EscapeFormat;
    name: string;
    description: string;
  }

  const formats: FormatOption[] = [
    { id: "json", name: "JSON / JavaScript", description: "Escape for JSON strings (\\n, \\t, \\\", etc.)" },
    { id: "html", name: "HTML Entities", description: "Escape HTML special characters (&lt;, &gt;, &amp;, etc.)" },
    { id: "url", name: "URL / Percent", description: "Percent-encode for URLs" },
    { id: "regex", name: "Regex", description: "Escape special regex characters" },
    { id: "shell", name: "Shell / Bash", description: "Escape for shell commands" },
    { id: "sql", name: "SQL", description: "Escape single quotes for SQL strings" },
    { id: "csv", name: "CSV", description: "Escape for CSV fields" },
  ];

  let mode = $state<Mode>("escape");
  let format = $state<EscapeFormat>("json");
  let error = $state("");
  let copied = $state(false);
  let isDark = $state(getInitialDarkMode());

  let inputValue = $state("");
  let outputValue = $state("");

  // Escape functions
  // Control characters regex patterns (built dynamically to avoid lint errors)
  const formFeedRegex = new RegExp(String.fromCharCode(12), "g");
  const backspaceRegex = new RegExp(String.fromCharCode(8), "g");
  const controlCharsRegex = new RegExp("[\\x00-\\x1f\\x7f]", "g");

  const escapeJson = (str: string): string => {
    return str
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t")
      .replace(formFeedRegex, "\\f")
      .replace(backspaceRegex, "\\b")
      .replace(controlCharsRegex, (char) => {
        return "\\u" + char.charCodeAt(0).toString(16).padStart(4, "0");
      });
  };

  const unescapeJson = (str: string): string => {
    return str.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\\/"bfnrt])/g, (match) => {
      switch (match) {
        case "\\\\": return "\\";
        case '\\"': return '"';
        case "\\n": return "\n";
        case "\\r": return "\r";
        case "\\t": return "\t";
        case "\\f": return String.fromCharCode(12);
        case "\\b": return String.fromCharCode(8);
        case "\\/": return "/";
        default:
          if (match.startsWith("\\u")) {
            return String.fromCharCode(parseInt(match.slice(2), 16));
          }
          if (match.startsWith("\\x")) {
            return String.fromCharCode(parseInt(match.slice(2), 16));
          }
          return match;
      }
    });
  };

  const escapeHtml = (str: string): string => {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };

  const unescapeHtml = (str: string): string => {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = str;
    return textarea.value;
  };

  const escapeUrl = (str: string): string => {
    return encodeURIComponent(str);
  };

  const unescapeUrl = (str: string): string => {
    return decodeURIComponent(str);
  };

  const escapeRegex = (str: string): string => {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  };

  const unescapeRegex = (str: string): string => {
    return str.replace(/\\([.*+?^${}()|[\]\\])/g, "$1");
  };

  const escapeShell = (str: string): string => {
    // Use single quotes and escape single quotes within
    return "'" + str.replace(/'/g, "'\\''") + "'";
  };

  const unescapeShell = (str: string): string => {
    // Remove surrounding quotes and unescape
    let result = str;
    // Handle single-quoted strings
    if (result.startsWith("'") && result.endsWith("'")) {
      result = result.slice(1, -1).replace(/'\\''|'\\''/g, "'");
    }
    // Handle double-quoted strings
    else if (result.startsWith('"') && result.endsWith('"')) {
      result = result.slice(1, -1)
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\")
        .replace(/\\`/g, "`")
        .replace(/\\\$/g, "$");
    }
    // Handle backslash escapes without quotes
    else {
      result = result.replace(/\\(.)/g, "$1");
    }
    return result;
  };

  const escapeSql = (str: string): string => {
    return str.replace(/'/g, "''");
  };

  const unescapeSql = (str: string): string => {
    return str.replace(/''/g, "'");
  };

  const escapeCsv = (str: string): string => {
    // If contains comma, newline, or quote, wrap in quotes and escape quotes
    if (/[,"\n\r]/.test(str)) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };

  const unescapeCsv = (str: string): string => {
    // Remove surrounding quotes and unescape double quotes
    if (str.startsWith('"') && str.endsWith('"')) {
      return str.slice(1, -1).replace(/""/g, '"');
    }
    return str;
  };

  const convert = () => {
    error = "";

    if (!inputValue) {
      outputValue = "";
      return;
    }

    try {
      let result: string;

      if (mode === "escape") {
        switch (format) {
          case "json": result = escapeJson(inputValue); break;
          case "html": result = escapeHtml(inputValue); break;
          case "url": result = escapeUrl(inputValue); break;
          case "regex": result = escapeRegex(inputValue); break;
          case "shell": result = escapeShell(inputValue); break;
          case "sql": result = escapeSql(inputValue); break;
          case "csv": result = escapeCsv(inputValue); break;
          default: result = inputValue;
        }
      } else {
        switch (format) {
          case "json": result = unescapeJson(inputValue); break;
          case "html": result = unescapeHtml(inputValue); break;
          case "url": result = unescapeUrl(inputValue); break;
          case "regex": result = unescapeRegex(inputValue); break;
          case "shell": result = unescapeShell(inputValue); break;
          case "sql": result = unescapeSql(inputValue); break;
          case "csv": result = unescapeCsv(inputValue); break;
          default: result = inputValue;
        }
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

  // Re-convert when mode or format changes
  $effect(() => {
    mode;
    format;
    convert();
  });

  const handleSwap = () => {
    if (outputValue) {
      inputValue = outputValue;
      mode = mode === "escape" ? "unescape" : "escape";
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

  const currentFormat = $derived(formats.find((f) => f.id === format));

  let inputPlaceholder = $derived(
    mode === "escape" ? "Enter text to escape..." : "Enter escaped text to unescape..."
  );
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Escape or unescape text for various formats like JSON, HTML, URL, Regex, Shell, SQL, and CSV.
    </p>
  </header>

  <!-- Mode Toggle -->
  <div class="mb-4 flex flex-wrap gap-4 items-center">
    <div class="p-1 bg-(--color-border) inline-flex gap-1">
      <button
        class="px-3 py-1 text-sm font-medium transition-colors {mode === 'escape'
          ? 'bg-(--color-text) text-(--color-btn-text)'
          : 'text-(--color-text-muted) hover:text-(--color-text)'}"
        onclick={() => {
          mode = "escape";
          error = "";
        }}
      >
        Escape
      </button>
      <button
        class="px-3 py-1 text-sm font-medium transition-colors {mode === 'unescape'
          ? 'bg-(--color-text) text-(--color-btn-text)'
          : 'text-(--color-text-muted) hover:text-(--color-text)'}"
        onclick={() => {
          mode = "unescape";
          error = "";
        }}
      >
        Unescape
      </button>
    </div>

    <!-- Format Selector -->
    <div class="flex items-center gap-2">
      <span class="text-sm text-(--color-text-muted)">Format:</span>
      <select
        bind:value={format}
        class="px-3 py-1 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
      >
        {#each formats as fmt}
          <option value={fmt.id}>{fmt.name}</option>
        {/each}
      </select>
    </div>
  </div>

  <!-- Format Description -->
  {#if currentFormat}
    <p class="mb-4 text-xs text-(--color-text-light)">
      {currentFormat.description}
    </p>
  {/if}

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
          {mode === "escape" ? "Text to Escape" : "Text to Unescape"}
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
          {mode === "escape" ? "Escaped Text" : "Unescaped Text"}
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
