<script lang="ts">
  import * as YAML from "yaml";
  import * as TOML from "smol-toml";
  import CodeMirror from "svelte-codemirror-editor";
  import { EditorView } from "@codemirror/view";
  import { json } from "@codemirror/lang-json";
  import { yaml as yamlLang } from "@codemirror/lang-yaml";
  import {
    createDarkModeObserver,
    getInitialDarkMode,
    createTheme,
    editorHeightExtension,
  } from "../../lib/codemirror.js";

  type Format = "json" | "yaml" | "toml" | "markdown";
  type IndentType = "0" | "2" | "4" | "tab";

  let format = $state<Format>("json");
  let indentType = $state<IndentType>("2");
  let sortKeys = $state(false);
  let error = $state("");
  let copied = $state(false);
  let isDark = $state(getInitialDarkMode());

  let value = $state("");

  const formatLabels: Record<Format, string> = {
    json: "JSON",
    yaml: "YAML",
    toml: "TOML",
    markdown: "Markdown",
  };

  const getIndent = (): string | number | undefined => {
    if (indentType === "tab") return "\t";
    if (indentType === "0") return undefined;
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

  const formatJSON = (text: string): string => {
    const indent = getIndent();
    let parsed = JSON.parse(text);
    if (sortKeys) {
      parsed = sortObjectKeys(parsed);
    }
    return JSON.stringify(parsed, null, indent);
  };

  const formatYAML = (text: string): string => {
    const indent = getIndent();
    let parsed = YAML.parse(text);
    if (sortKeys) {
      parsed = sortObjectKeys(parsed);
    }
    return YAML.stringify(parsed, {
      indent: typeof indent === "string" ? 2 : indent,
    });
  };

  const formatTOML = (text: string): string => {
    const parsed = TOML.parse(text);
    const processedData = sortKeys ? sortObjectKeys(parsed) : parsed;
    return TOML.stringify(processedData as Parameters<typeof TOML.stringify>[0]);
  };

  const formatMarkdown = (text: string): string => {
    const indent = getIndent();
    const indentStr = typeof indent === "string" ? indent : " ".repeat(indent ?? 2);
    const lines = text.split("\n");
    const result: string[] = [];
    let inCodeBlock = false;
    let inList = false;
    let inTable = false;
    let prevLineEmpty = false;
    let prevLineType: "heading" | "paragraph" | "list" | "code" | "empty" | "table" | "other" = "empty";

    // Helper to detect table rows (starts and ends with |, or has | separators)
    const isTableRow = (line: string): boolean => {
      const trimmed = line.trim();
      return trimmed.startsWith("|") || (trimmed.includes("|") && /\|.*\|/.test(trimmed));
    };

    // Helper to detect table separator row (contains only |, -, :, and spaces)
    const isTableSeparator = (line: string): boolean => {
      const trimmed = line.trim();
      return /^\|?[\s\-:|]+\|?$/.test(trimmed) && trimmed.includes("-");
    };

    // Helper to format a table row with aligned columns
    const formatTableRow = (row: string, columnWidths: number[]): string => {
      const cells = row.split("|").map((c) => c.trim());
      // Remove empty first/last cells from leading/trailing pipes
      if (cells[0] === "") cells.shift();
      if (cells[cells.length - 1] === "") cells.pop();

      const formattedCells = cells.map((cell, i) => {
        const width = columnWidths[i] || cell.length;
        return ` ${cell.padEnd(width)} `;
      });

      return `|${formattedCells.join("|")}|`;
    };

    // Helper to format separator row
    const formatSeparatorRow = (row: string, columnWidths: number[]): string => {
      const cells = row.split("|").map((c) => c.trim());
      if (cells[0] === "") cells.shift();
      if (cells[cells.length - 1] === "") cells.pop();

      const formattedCells = cells.map((cell, i) => {
        const width = columnWidths[i] || 3;
        const hasLeftColon = cell.startsWith(":");
        const hasRightColon = cell.endsWith(":");
        const dashes = "-".repeat(width);

        if (hasLeftColon && hasRightColon) {
          return `:${dashes}:`;
        } else if (hasLeftColon) {
          return `:${dashes}-`;
        } else if (hasRightColon) {
          return `-${dashes}:`;
        }
        return `-${dashes}-`;
      });

      return `|${formattedCells.join("|")}|`;
    };

    // First pass: collect tables and calculate column widths
    const tableGroups: { start: number; end: number; columnWidths: number[] }[] = [];
    let tableStart = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
        inCodeBlock = !inCodeBlock;
        continue;
      }

      if (inCodeBlock) continue;

      if (isTableRow(trimmed)) {
        if (tableStart === -1) {
          tableStart = i;
        }
      } else if (tableStart !== -1) {
        // End of table
        tableGroups.push({ start: tableStart, end: i - 1, columnWidths: [] });
        tableStart = -1;
      }
    }

    // Handle table at end of file
    if (tableStart !== -1) {
      tableGroups.push({ start: tableStart, end: lines.length - 1, columnWidths: [] });
    }

    // Calculate column widths for each table
    for (const table of tableGroups) {
      const widths: number[] = [];
      for (let i = table.start; i <= table.end; i++) {
        const line = lines[i].trim();
        if (isTableSeparator(line)) continue;

        const cells = line.split("|").map((c) => c.trim());
        if (cells[0] === "") cells.shift();
        if (cells[cells.length - 1] === "") cells.pop();

        cells.forEach((cell, idx) => {
          widths[idx] = Math.max(widths[idx] || 0, cell.length);
        });
      }
      table.columnWidths = widths;
    }

    // Helper to find table group for a line
    const getTableGroup = (lineIdx: number) => {
      return tableGroups.find((t) => lineIdx >= t.start && lineIdx <= t.end);
    };

    // Reset for second pass
    inCodeBlock = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Track code blocks
      if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
        inCodeBlock = !inCodeBlock;
        // Add blank line before code block if needed
        if (!inCodeBlock === false && prevLineType !== "empty" && result.length > 0) {
          if (result[result.length - 1].trim() !== "") {
            result.push("");
          }
        }
        result.push(line);
        prevLineType = "code";
        prevLineEmpty = false;
        inTable = false;
        continue;
      }

      // Don't format inside code blocks
      if (inCodeBlock) {
        result.push(line);
        prevLineType = "code";
        prevLineEmpty = false;
        continue;
      }

      // Empty line
      if (trimmed === "") {
        // Avoid multiple consecutive empty lines
        if (!prevLineEmpty) {
          result.push("");
          prevLineEmpty = true;
        }
        prevLineType = "empty";
        inTable = false;
        continue;
      }

      prevLineEmpty = false;

      // Table rows
      const tableGroup = getTableGroup(i);
      if (tableGroup) {
        // Add blank line before table if needed
        if (!inTable && prevLineType !== "empty" && result.length > 0) {
          result.push("");
        }

        if (isTableSeparator(trimmed)) {
          result.push(formatSeparatorRow(trimmed, tableGroup.columnWidths));
        } else {
          result.push(formatTableRow(trimmed, tableGroup.columnWidths));
        }
        prevLineType = "table";
        inTable = true;
        inList = false;
        continue;
      }

      inTable = false;

      // Headings - normalize spacing after #
      const headingMatch = trimmed.match(/^(#{1,6})\s*(.*)$/);
      if (headingMatch) {
        // Add blank line before heading if previous wasn't empty
        if (prevLineType !== "empty" && result.length > 0) {
          result.push("");
        }
        result.push(`${headingMatch[1]} ${headingMatch[2].trim()}`);
        prevLineType = "heading";
        inList = false;
        continue;
      }

      // Horizontal rules
      if (/^[-*_]{3,}$/.test(trimmed)) {
        if (prevLineType !== "empty" && result.length > 0) {
          result.push("");
        }
        result.push("---");
        prevLineType = "other";
        inList = false;
        continue;
      }

      // Unordered list items - normalize bullet and indentation
      const ulMatch = line.match(/^(\s*)([-*+])\s+(.*)$/);
      if (ulMatch) {
        const depth = Math.floor(ulMatch[1].length / 2);
        const content = ulMatch[3].trim();
        const newIndent = indentStr.repeat(depth);
        result.push(`${newIndent}- ${content}`);
        prevLineType = "list";
        inList = true;
        continue;
      }

      // Ordered list items - normalize numbering
      const olMatch = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/);
      if (olMatch) {
        const depth = Math.floor(olMatch[1].length / 2);
        const content = olMatch[3].trim();
        const newIndent = indentStr.repeat(depth);
        result.push(`${newIndent}1. ${content}`);
        prevLineType = "list";
        inList = true;
        continue;
      }

      // Blockquotes - normalize spacing
      const bqMatch = trimmed.match(/^(>+)\s*(.*)$/);
      if (bqMatch) {
        const level = bqMatch[1];
        const content = bqMatch[2].trim();
        result.push(`${level} ${content}`);
        prevLineType = "other";
        inList = false;
        continue;
      }

      // Regular paragraph
      if (prevLineType === "heading" || prevLineType === "table" || (prevLineType === "list" && !inList)) {
        if (result.length > 0 && result[result.length - 1].trim() !== "") {
          result.push("");
        }
      }
      result.push(trimmed);
      prevLineType = "paragraph";
      inList = false;
    }

    // Ensure file ends with newline
    let output = result.join("\n").trim();
    if (output.length > 0) {
      output += "\n";
    }
    return output;
  };

  const handleFormat = () => {
    error = "";

    if (!value.trim()) {
      return;
    }

    try {
      switch (format) {
        case "json":
          value = formatJSON(value);
          break;
        case "yaml":
          value = formatYAML(value);
          break;
        case "toml":
          value = formatTOML(value);
          break;
        case "markdown":
          value = formatMarkdown(value);
          break;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : `Invalid ${formatLabels[format]} input`;
    }
  };

  const getLanguageExtension = (fmt: Format) => {
    switch (fmt) {
      case "json":
        return json();
      case "yaml":
      case "toml":
      case "markdown":
        // Use YAML highlighting for TOML and Markdown (similar structure)
        return yamlLang();
    }
  };

  // Extensions for editor
  let extensions = $derived([
    ...createTheme(isDark),
    editorHeightExtension,
    EditorView.lineWrapping,
    getLanguageExtension(format),
  ]);

  $effect(() => {
    isDark = getInitialDarkMode();

    const cleanup = createDarkModeObserver((newIsDark) => {
      if (newIsDark !== isDark) isDark = newIsDark;
    });

    return cleanup;
  });

  // Reset indent to "2" if switching away from JSON while "0" is selected
  $effect(() => {
    if (format !== "json" && indentType === "0") {
      indentType = "2";
    }
  });

  const handleCopy = () => {
    if (value) {
      navigator.clipboard.writeText(value);
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 2000);
    }
  };

  const handlePaste = () => {
    navigator.clipboard.readText().then((text) => {
      value = text;
    });
  };

  const handleClear = () => {
    value = "";
    error = "";
  };
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Format and prettify JSON, YAML, TOML, and Markdown with customizable indentation.
    </p>
  </header>

  <!-- Configuration -->
  <div class="mb-4 py-1 px-2 bg-(--color-bg-alt) border border-(--color-border)">
    <div class="flex flex-wrap items-center gap-3">
      <!-- Format -->
      <div class="flex items-center gap-2">
        <label
          for="format"
          class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium"
        >
          Format
        </label>
        <select
          id="format"
          bind:value={format}
          class="px-2 py-1 text-sm bg-(--color-bg) border border-(--color-border) text-(--color-text) focus:border-(--color-text-light) outline-none hover:cursor-pointer"
        >
          <option value="json">JSON</option>
          <option value="yaml">YAML</option>
          <option value="toml">TOML</option>
          <option value="markdown">Markdown</option>
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
          {#if format === "json"}
            <option value="0">Minified</option>
          {/if}
          <option value="2">2 spaces</option>
          <option value="4">4 spaces</option>
          <option value="tab">Tabs</option>
        </select>
      </div>

      {#if format !== "markdown"}
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
      {/if}

      <div class="hidden sm:block w-px h-6 bg-(--color-border)"></div>

      <!-- Format Button -->
      <button
        onclick={handleFormat}
        class="px-4 py-1 text-sm font-medium bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) transition-colors"
      >
        Format
      </button>
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

  <!-- Editor -->
  <div class="flex-1 flex flex-col min-h-[300px]">
    <div class="flex justify-between items-center mb-2">
      <span
        class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium"
      >
        {formatLabels[format]}
      </span>
      <div class="flex gap-3">
        <button
          onclick={handlePaste}
          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
        >
          Paste
        </button>
        <button
          onclick={handleCopy}
          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
        >
          {copied ? "Copied!" : "Copy"}
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
        bind:value={value}
        placeholder={`Paste or type your ${formatLabels[format]} here...`}
        extensions={extensions}
      />
    </div>
  </div>
</div>
