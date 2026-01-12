<script lang="ts">
  import * as YAML from "yaml";
  import * as TOML from "smol-toml";
  import { XMLParser, XMLBuilder } from "fast-xml-parser";
  import Papa from "papaparse";
  import { format as formatCSSLib } from "@projectwallace/format-css";
  import CodeMirror from "svelte-codemirror-editor";
  import { EditorView, keymap } from "@codemirror/view";
  import { redo } from "@codemirror/commands";
  import { json } from "@codemirror/lang-json";
  import { yaml as yamlLang } from "@codemirror/lang-yaml";
  import { html } from "@codemirror/lang-html";
  import { xml } from "@codemirror/lang-xml";
  import { css } from "@codemirror/lang-css";
  import {
    createDarkModeObserver,
    getInitialDarkMode,
    createTheme,
    editorHeightExtension,
  } from "../../lib/codemirror.js";

  type Format = "json" | "yaml" | "toml" | "markdown" | "css" | "html" | "xml" | "csv";
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
    css: "CSS",
    html: "HTML",
    xml: "XML",
    csv: "CSV",
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

  const formatCSS = (text: string): string => {
    const indent = getIndent();

    // Minified mode when indent is undefined (indentType === "0")
    if (indent === undefined) {
      return formatCSSLib(text, { minify: true });
    }

    // tab_size: undefined = use tabs, number = use N spaces
    const tabSize = indent === "\t" ? undefined : (typeof indent === "number" ? indent : 2);

    return formatCSSLib(text, {
      tab_size: tabSize,
    });
  };

  const minifyHTMLString = (text: string): string => {
    // Browser-compatible HTML minifier
    return text
      // Remove HTML comments (but not conditional comments)
      .replace(/<!--(?!\[if)[\s\S]*?-->/gi, "")
      // Collapse whitespace between tags
      .replace(/>\s+</g, "><")
      // Remove whitespace around tags
      .replace(/\s*(<[^>]+>)\s*/g, "$1")
      // Collapse multiple spaces to single space
      .replace(/\s{2,}/g, " ")
      // Remove spaces around = in attributes
      .replace(/\s*=\s*/g, "=")
      // Trim
      .trim();
  };

  const formatHTML = (text: string): string => {
    const indent = getIndent();

    // Minified mode when indent is undefined (indentType === "0")
    if (indent === undefined) {
      return minifyHTMLString(text);
    }

    const indentStr = typeof indent === "string" ? indent : " ".repeat(indent ?? 2);

    // Parse and re-format HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "text/html");

    // Check for parsing errors
    const parseError = doc.querySelector("parsererror");
    if (parseError) {
      throw new Error("Invalid HTML");
    }

    const formatNode = (node: Node, depth: number): string => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.trim() || "";
        return text ? text : "";
      }

      if (node.nodeType === Node.COMMENT_NODE) {
        return `${indentStr.repeat(depth)}<!--${node.textContent}-->`;
      }

      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        const tagName = el.tagName.toLowerCase();
        const attrs = Array.from(el.attributes)
          .map((attr) => `${attr.name}="${attr.value}"`)
          .join(" ");

        const openTag = attrs ? `<${tagName} ${attrs}>` : `<${tagName}>`;
        const voidElements = ["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"];

        if (voidElements.includes(tagName)) {
          return `${indentStr.repeat(depth)}${openTag}`;
        }

        const children = Array.from(el.childNodes);
        const hasOnlyText = children.length === 1 && children[0].nodeType === Node.TEXT_NODE;

        if (hasOnlyText) {
          const text = children[0].textContent?.trim() || "";
          return `${indentStr.repeat(depth)}${openTag}${text}</${tagName}>`;
        }

        if (children.length === 0) {
          return `${indentStr.repeat(depth)}${openTag}</${tagName}>`;
        }

        const childContent = children
          .map((child) => formatNode(child, depth + 1))
          .filter((s) => s.trim())
          .join("\n");

        return `${indentStr.repeat(depth)}${openTag}\n${childContent}\n${indentStr.repeat(depth)}</${tagName}>`;
      }

      return "";
    };

    // Get the body content or the whole document
    const body = doc.body;
    const head = doc.head;

    // Check if original had doctype/html structure
    const hasDoctype = text.trim().toLowerCase().startsWith("<!doctype");
    const hasHtmlTag = /<html[\s>]/i.test(text);

    if (hasDoctype || hasHtmlTag) {
      let result = "<!DOCTYPE html>\n<html";
      const htmlEl = doc.documentElement;
      const htmlAttrs = Array.from(htmlEl.attributes)
        .map((attr) => `${attr.name}="${attr.value}"`)
        .join(" ");
      if (htmlAttrs) result += " " + htmlAttrs;
      result += ">\n";

      if (head.childNodes.length > 0 || head.attributes.length > 0) {
        result += `${indentStr}<head>\n`;
        Array.from(head.childNodes).forEach((child) => {
          const formatted = formatNode(child, 2);
          if (formatted.trim()) result += formatted + "\n";
        });
        result += `${indentStr}</head>\n`;
      }

      result += `${indentStr}<body>\n`;
      Array.from(body.childNodes).forEach((child) => {
        const formatted = formatNode(child, 2);
        if (formatted.trim()) result += formatted + "\n";
      });
      result += `${indentStr}</body>\n</html>\n`;

      return result;
    }

    // Just format the body content
    const result = Array.from(body.childNodes)
      .map((child) => formatNode(child, 0))
      .filter((s) => s.trim())
      .join("\n");

    return result + "\n";
  };

  const formatXML = (text: string): string => {
    const indent = getIndent();
    const indentStr = typeof indent === "string" ? indent : " ".repeat(indent ?? 2);

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      preserveOrder: true,
      commentPropName: "#comment",
      textNodeName: "#text",
    });

    const parsed = parser.parse(text);

    const builder = new XMLBuilder({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      preserveOrder: true,
      commentPropName: "#comment",
      textNodeName: "#text",
      format: true,
      indentBy: indentStr,
    });

    const result = builder.build(parsed);

    // Add XML declaration if original had one
    const hasDeclaration = text.trim().startsWith("<?xml");
    if (hasDeclaration && !result.trim().startsWith("<?xml")) {
      return '<?xml version="1.0" encoding="UTF-8"?>\n' + result;
    }

    return result;
  };

  const formatCSV = (text: string): string => {
    const parsed = Papa.parse(text, {
      skipEmptyLines: true,
    });

    if (parsed.errors.length > 0) {
      throw new Error(parsed.errors[0].message);
    }

    const data = parsed.data as string[][];

    // Calculate column widths for alignment
    const columnWidths: number[] = [];
    for (const row of data) {
      row.forEach((cell, i) => {
        const cellStr = String(cell);
        columnWidths[i] = Math.max(columnWidths[i] || 0, cellStr.length);
      });
    }

    // Format each row with proper quoting
    const formattedRows = data.map((row) => {
      return row
        .map((cell) => {
          const cellStr = String(cell);
          // Quote if contains comma, quote, or newline
          if (cellStr.includes(",") || cellStr.includes('"') || cellStr.includes("\n")) {
            return '"' + cellStr.replace(/"/g, '""') + '"';
          }
          return cellStr;
        })
        .join(",");
    });

    return formattedRows.join("\n") + "\n";
  };

  // Validation functions
  const validateFormat = (text: string, fmt: Format): boolean => {
    if (!text.trim()) return true; // Empty is considered valid

    try {
      switch (fmt) {
        case "json":
          JSON.parse(text);
          return true;
        case "yaml":
          YAML.parse(text);
          return true;
        case "toml":
          TOML.parse(text);
          return true;
        case "xml": {
          const xmlParser = new XMLParser();
          xmlParser.parse(text);
          return true;
        }
        case "csv": {
          const result = Papa.parse(text, { skipEmptyLines: true });
          // Check for parse errors
          if (result.errors.length > 0) {
            return false;
          }
          const data = result.data as string[][];
          // Must have at least one row
          if (data.length === 0) {
            return false;
          }
          // Check for consistent column count across rows
          const firstRowLength = data[0]?.length ?? 0;
          if (firstRowLength === 0) {
            return false;
          }
          const hasInconsistentColumns = data.some(row => row.length !== firstRowLength);
          return !hasInconsistentColumns;
        }
        case "html": {
          const parser = new DOMParser();
          const doc = parser.parseFromString(text, "text/html");
          return !doc.querySelector("parsererror");
        }
        case "css": {
          // Try to format - if it succeeds, it's valid CSS
          formatCSSLib(text);
          return true;
        }
        case "markdown":
          return true; // Markdown is always valid
        default:
          return true;
      }
    } catch {
      return false;
    }
  };

  let isValid = $derived(validateFormat(value, format));

  let editorView = $state<EditorView | undefined>(undefined);
  let needsUpdate = $state(false);
  let pendingValue = $state("");

  // Extension to capture the EditorView instance
  const viewCapture = EditorView.updateListener.of((update) => {
    if (!editorView) {
      editorView = update.view;
    }

    // Apply pending formatted value if needed
    if (needsUpdate && pendingValue !== undefined) {
      const currentValue = update.view.state.doc.toString();
      if (currentValue !== pendingValue) {
        const transaction = update.view.state.update({
          changes: {
            from: 0,
            to: update.view.state.doc.length,
            insert: pendingValue,
          },
        });
        update.view.dispatch(transaction);
      }
      needsUpdate = false;
      pendingValue = "";
    }
  });

  const handleFormat = () => {
    error = "";

    if (!value.trim()) {
      return;
    }

    try {
      let formatted: string;
      switch (format) {
        case "json":
          formatted = formatJSON(value);
          break;
        case "yaml":
          formatted = formatYAML(value);
          break;
        case "toml":
          formatted = formatTOML(value);
          break;
        case "markdown":
          formatted = formatMarkdown(value);
          break;
        case "css":
          formatted = formatCSS(value);
          break;
        case "html":
          formatted = formatHTML(value);
          break;
        case "xml":
          formatted = formatXML(value);
          break;
        case "csv":
          formatted = formatCSV(value);
          break;
        default:
          return;
      }

      // Update via CodeMirror transaction to preserve undo history
      if (editorView) {
        const transaction = editorView.state.update({
          changes: {
            from: 0,
            to: editorView.state.doc.length,
            insert: formatted,
          },
        });
        editorView.dispatch(transaction);
      } else {
        // Queue update if editor not ready
        pendingValue = formatted;
        needsUpdate = true;
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
      case "html":
        return html();
      case "xml":
        return xml();
      case "css":
        return css();
      case "csv":
        // No specific CSV language, use plain text
        return [];
    }
  };

  // Custom keymap to add Ctrl+Shift+Z for redo (in addition to default Ctrl+Y)
  const customKeymap = keymap.of([
    {
      key: "Mod-Shift-z",
      run: redo,
    },
  ]);

  // Extensions for editor
  let extensions = $derived([
    ...createTheme(isDark),
    editorHeightExtension,
    EditorView.lineWrapping,
    getLanguageExtension(format),
    viewCapture,
    customKeymap,
  ]);

  $effect(() => {
    isDark = getInitialDarkMode();

    const cleanup = createDarkModeObserver((newIsDark) => {
      if (newIsDark !== isDark) isDark = newIsDark;
    });

    return cleanup;
  });

  // Reset indent to "2" if switching away from JSON/CSS/HTML while "0" is selected
  $effect(() => {
    if (format !== "json" && format !== "css" && format !== "html" && indentType === "0") {
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

  const handleClear = () => {
    value = "";
    error = "";
  };
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Format and prettify JSON, YAML, TOML, Markdown, CSS, HTML, XML, and CSV with customizable indentation.
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
          <option value="css">CSS</option>
          <option value="html">HTML</option>
          <option value="xml">XML</option>
          <option value="csv">CSV</option>
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
          {#if format === "json" || format === "css" || format === "html"}
            <option value="0">Minified</option>
          {/if}
          <option value="2">2 spaces</option>
          <option value="4">4 spaces</option>
          <option value="tab">Tabs</option>
        </select>
      </div>

      {#if format === "json" || format === "yaml" || format === "toml"}
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
      <div class="flex items-center gap-3">
        <span
          class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium"
        >
          {formatLabels[format]}
        </span>
        {#if value.trim()}
          <span
            class="text-xs px-2 py-0.5 rounded-sm font-medium {isValid
              ? 'bg-green-500/20 text-green-600 dark:text-green-400'
              : 'bg-red-500/20 text-red-600 dark:text-red-400'}"
          >
            {isValid ? "Valid" : "Invalid"}
          </span>
        {/if}
      </div>
      <div class="flex gap-3">
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
