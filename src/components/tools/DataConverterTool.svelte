 <script lang="ts">
   import * as YAML from "yaml";
   import * as TOML from "smol-toml";
   import * as TOON from "@toon-format/toon";
   import { XMLParser, XMLBuilder } from "fast-xml-parser";
   // @ts-ignore
   import { parse as parseIni, stringify as stringifyIni } from "ini";
   // @ts-ignore
   import Papa from "papaparse";
   // @ts-ignore
   import propertiesParser from "properties-parser";
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

   type Format = "json" | "yaml" | "toml" | "toon" | "xml" | "ini" | "csv" | "properties";
  type IndentType = "2" | "4" | "tab";

  let sourceFormat = $state<Format>("json");
  let outputFormat = $state<Format>("yaml");
  let indentType = $state<IndentType>("2");
  let sortKeys = $state(false);
  let error = $state("");
  let copied = $state(false);
  let isDark = $state(getInitialDarkMode());

  let sourceValue = $state("");
  let outputValue = $state("");

  let sourceChars = $state(0);
  let sourceTokens = $state(0);
  let outputChars = $state(0);
  let outputTokens = $state(0);

  let convertTimeout: ReturnType<typeof setTimeout> | null = null;

   const formatLabels: Record<Format, string> = {
     json: "JSON",
     yaml: "YAML",
     toml: "TOML",
     toon: "TOON",
     xml: "XML",
     ini: "INI",
     csv: "CSV",
     properties: "Properties",
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
    sourceChars = sourceValue.length;
    sourceTokens = countTokens(sourceValue);
  };

  const updateOutputStats = () => {
    outputChars = outputValue.length;
    outputTokens = countTokens(outputValue);
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
       case "xml": {
         const parser = new XMLParser();
         return parser.parse(text);
       }
       case "ini":
         return parseIni(text);
       case "csv": {
         const csvResult = Papa.parse(text, { header: true, dynamicTyping: true });
         return csvResult.data;
       }
       case "properties":
         return propertiesParser.parse(text);
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
       case "xml": {
         const builder = new XMLBuilder();
         return builder.build(processedData);
       }
       case "ini":
         return stringifyIni(processedData as Record<string, unknown>);
      case "csv": {
        // CSV requires an array of objects (tabular data)
        // If it's a single object, wrap it in an array
        let csvData = processedData;
        if (processedData !== null && typeof processedData === "object" && !Array.isArray(processedData)) {
          csvData = [processedData];
        }
        if (!Array.isArray(csvData)) {
          throw new Error(
            `Cannot convert ${typeof processedData} to CSV. CSV requires an array of objects or a single object.`,
          );
        }
        return Papa.unparse(csvData as Record<string, unknown>[]);
      }
      case "properties": {
        // properties-parser doesn't have stringify, so we implement it manually
        const obj = processedData as Record<string, unknown>;
        return Object.entries(obj)
          .map(([key, value]) => {
            // Escape special characters in key and value
            const escapedKey = String(key).replace(/([=:#!\\])/g, "\\$1");
            const escapedValue = String(value ?? "").replace(/\n/g, "\\n");
            return `${escapedKey}=${escapedValue}`;
          })
          .join("\n");
      }
     }
   };

   const getLanguageExtension = (format: Format) => {
     switch (format) {
       case "json":
         return json();
       case "yaml":
       case "toml":
       case "toon":
       case "xml":
       case "ini":
       case "csv":
       case "properties":
         // TOON, XML, INI, CSV, Properties are YAML-like, so use YAML highlighting
         return yamlLang();
     }
   };

  const convert = () => {
    error = "";
    updateSourceStats();

    if (!sourceValue.trim()) {
      outputValue = "";
      updateOutputStats();
      return;
    }

    try {
      const parsed = parse(sourceValue, sourceFormat);
      const result = stringify(parsed, outputFormat);
      outputValue = result;
      updateOutputStats();
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

  // Extensions for source editor (editable, with language)
  let sourceExtensions = $derived([
    ...createTheme(isDark),
    editorHeightExtension,
    EditorView.lineWrapping,
    getLanguageExtension(sourceFormat),
  ]);

  // Extensions for output editor (read-only, with language)
  let outputExtensions = $derived([
    ...createTheme(isDark),
    editorHeightExtension,
    EditorView.lineWrapping,
    EditorView.editable.of(false),
    EditorView.contentAttributes.of({ "aria-readonly": "true" }),
    getLanguageExtension(outputFormat),
  ]);

  $effect(() => {
    isDark = getInitialDarkMode();

    const cleanup = createDarkModeObserver((newIsDark) => {
      if (newIsDark !== isDark) isDark = newIsDark;
    });

    return () => {
      cleanup();
      if (convertTimeout) {
        clearTimeout(convertTimeout);
      }
    };
  });

  // React to source value changes
  $effect(() => {
    sourceValue;
    debouncedConvert();
  });

  // Re-convert when format or options change
  $effect(() => {
    outputFormat;
    indentType;
    sortKeys;
    convert();
  });

  const handleCopy = () => {
    if (outputValue) {
      navigator.clipboard.writeText(outputValue);
      copied = true;
      setTimeout(() => { copied = false; }, 2000);
    }
  };

  const handlePaste = () => {
    navigator.clipboard.readText().then((text) => {
      sourceValue = text;
    });
  };

  const handleClear = () => {
    sourceValue = "";
    error = "";
  };

  const handleSwap = () => {
    if (outputValue) {
      sourceValue = outputValue;
      const temp = sourceFormat;
      sourceFormat = outputFormat;
      outputFormat = temp;
    }
  };

  const dataToTable = (data: unknown): { columns: string[]; rows: string[][] } | null => {
    if (data === null || data === undefined) return null;

    let items: Record<string, unknown>[];

    if (Array.isArray(data)) {
      if (data.length === 0) return null;
      // Array of objects — the ideal case
      if (typeof data[0] === "object" && data[0] !== null) {
        items = data as Record<string, unknown>[];
      } else {
        // Array of primitives
        items = data.map((v, i) => ({ "#": i + 1, value: v }));
      }
    } else if (typeof data === "object") {
      // Single object — flatten top-level keys as a single row,
      // or if values are objects/arrays, treat each key as a row
      const obj = data as Record<string, unknown>;
      const values = Object.values(obj);
      const allPrimitive = values.every(
        (v) => v === null || v === undefined || typeof v !== "object",
      );
      if (allPrimitive) {
        // Single row table
        items = [obj];
      } else {
        // Try to treat nested objects as rows
        const nestedArrays = values.filter(Array.isArray);
        if (nestedArrays.length === 1 && Array.isArray(nestedArrays[0]) && nestedArrays[0].length > 0) {
          // Common pattern: root object with one array property
          const arr = nestedArrays[0] as unknown[];
          if (typeof arr[0] === "object" && arr[0] !== null) {
            items = arr as Record<string, unknown>[];
          } else {
            items = arr.map((v, i) => ({ "#": i + 1, value: v }));
          }
        } else {
          // Flatten: each key becomes a row with key/value columns
          items = Object.entries(obj).map(([key, value]) => ({
            key,
            value: typeof value === "object" ? JSON.stringify(value) : value,
          }));
        }
      }
    } else {
      // Primitive value
      return { columns: ["value"], rows: [[String(data)]] };
    }

    // Collect all unique columns across all items
    const columnSet = new Set<string>();
    for (const item of items) {
      if (item && typeof item === "object") {
        for (const k of Object.keys(item)) columnSet.add(k);
      }
    }
    const columns = Array.from(columnSet);
    if (columns.length === 0) return null;

    const rows = items.map((item) =>
      columns.map((col) => {
        const val = item?.[col];
        if (val === null || val === undefined) return "";
        if (typeof val === "object") return JSON.stringify(val);
        return String(val);
      }),
    );

    return { columns, rows };
  };

  const tableHTML = (output: { rows?: string[][]; columns: string[] } | null): string => {
    if (!output) {
      return "<table><thead></thead><tbody></tbody></table>";
    }

    if (!output.rows) {
      output.rows = [];
    }

    const escapeHtml = (s: string): string =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    const headerRow =
      '<th class="row-number-header">#</th>' +
      output.columns
        .map(
          (col, idx) =>
            `<th onclick="sortTable(${idx}, event)" class="sortable">${escapeHtml(col)} <span class="sort-icon"></span><span class="sort-order"></span></th>`,
        )
        .join("");

    const bodyRows = output.rows
      .map((row, rowIndex) => {
        const rowData = row
          .map(
            (cell) =>
              `<td title="${escapeHtml(cell)}" onclick="handleCellClick(event, this)" style="cursor: pointer;">${escapeHtml(cell)}</td>`,
          )
          .join("");
        return `<tr><td class="row-number">${rowIndex + 1}</td>${rowData}</tr>`;
      })
      .join("");

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Table View</title>
<style>
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .table-container { padding: 10px; background: #ffffff; }
  .search-container { margin-bottom: 10px; display: flex; gap: 8px; }
  .search-input { flex: 1; padding: 6px 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; }
  .search-input:focus { outline: none; border-color: #666; }
  .search-clear { padding: 6px 12px; background: #f0f0f0; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; font-size: 14px; }
  .search-clear:hover { background: #e0e0e0; }
  .table-wrapper { border: 1px solid #ddd; overflow-x: auto; overflow-y: auto; }
  .data-table { width: max-content; min-width: 100%; border-collapse: collapse; font-size: 13px; }
  .data-table thead { background: #f5f5f5; position: sticky; top: 0; z-index: 10; }
  .data-table th { padding: 10px 12px; text-align: left; font-weight: 600; border-bottom: 2px solid #ddd; border-right: 1px solid #ddd; cursor: pointer; user-select: none; white-space: nowrap; min-width: 100px; }
  .data-table th.row-number-header { cursor: default; width: 20px; min-width: 10px; text-align: center; background: #e8e8e8; position: sticky; left: 0; z-index: 11; }
  .data-table td.row-number { text-align: center; font-weight: 500; color: #666; background: #fafafa; width: 20px; min-width: 10px; position: sticky; left: 0; z-index: 5; }
  .data-table th.sortable:hover { background: #e8e8e8; }
  .data-table th .sort-icon { margin-left: 4px; font-size: 11px; display: inline-block; min-width: 12px; }
  .data-table th .sort-icon::before { content: '\\2195'; opacity: 0.4; }
  .data-table th.sorted-asc .sort-icon::before { content: '\\25B2'; opacity: 1; }
  .data-table th.sorted-desc .sort-icon::before { content: '\\25BC'; opacity: 1; }
  .data-table th .sort-order { margin-left: 2px; font-size: 9px; color: #666; font-weight: bold; }
  .data-table tbody tr { border-bottom: 1px solid #eee; }
  .data-table tbody tr:hover { background: #fff085; }
  .data-table tbody tr:nth-child(even) { background: #fafafa; }
  .data-table tbody tr:nth-child(even):hover { background: #fff085; }
  .data-table td { padding: 8px 12px; min-width: 100px; max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border-right: 1px solid #eee; }
  .data-table td:hover { overflow: visible; white-space: normal; word-wrap: break-word; position: relative; z-index: 20; background: #fffacd; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
  .data-table tbody tr:hover td.row-number { background: #fff085; }
  .data-table tbody tr:nth-child(even):hover td.row-number { background: #fff085; }
  .table-info { margin-bottom: 10px; padding: 8px; background: #f9f9f9; border: 1px solid #ddd; font-size: 12px; display: flex; justify-content: space-between; }
</style>
</head><body>
<div class="table-container">
  <div class="table-info">
    <span>Total: <strong id="totalRows">${output.rows.length}</strong></span>
    <span style="font-size: 11px; color: #666;">Click columns to sort (supports multiple columns) | Ctrl+Click cell to copy</span>
  </div>
  <div class="search-container">
    <input type="text" id="searchInput" class="search-input" placeholder="Search..." oninput="filterTable()" />
    <button class="search-clear" onclick="clearSearch()">Clear</button>
    <button class="search-clear" onclick="resetSort()">Reset Sort</button>
  </div>
  <div class="table-wrapper">
    <table class="data-table" id="dataTable">
      <thead><tr>${headerRow}</tr></thead>
      <tbody id="tableBody">${bodyRows}</tbody>
    </table>
  </div>
</div>
<script>
  let sortColumns = [];
  let originalOrder = [];

  window.addEventListener('DOMContentLoaded', function() {
    var tbody = document.getElementById('tableBody');
    if (tbody) { originalOrder = Array.from(tbody.getElementsByTagName('tr')); }
  });

  function sortTable(columnIndex, event) {
    var table = document.getElementById('dataTable');
    var tbody = document.getElementById('tableBody');
    var rows = Array.from(tbody.getElementsByTagName('tr'));
    var headers = table.getElementsByTagName('th');
    if (originalOrder.length === 0) { originalOrder = Array.from(rows); }
    var existingIndex = sortColumns.findIndex(function(s) { return s.column === columnIndex; });
    var direction = 'asc';
    if (existingIndex >= 0) {
      var current = sortColumns[existingIndex].direction;
      if (current === 'asc') { direction = 'desc'; }
      else {
        sortColumns.splice(existingIndex, 1);
        updateSortUI(headers);
        if (sortColumns.length === 0) { originalOrder.forEach(function(row) { tbody.appendChild(row); }); }
        else { performSort(rows, tbody); }
        return;
      }
      sortColumns[existingIndex].direction = direction;
    } else { sortColumns.push({ column: columnIndex, direction: direction }); }
    updateSortUI(headers);
    performSort(rows, tbody);
  }

  function updateSortUI(headers) {
    for (var i = 0; i < headers.length; i++) {
      headers[i].classList.remove('sorted-asc', 'sorted-desc');
      var orderSpan = headers[i].querySelector('.sort-order');
      if (orderSpan) orderSpan.textContent = '';
    }
    sortColumns.forEach(function(sort, index) {
      headers[sort.column + 1].classList.add('sorted-' + sort.direction);
      var orderSpan = headers[sort.column + 1].querySelector('.sort-order');
      if (orderSpan && sortColumns.length > 1) { orderSpan.textContent = (index + 1); }
    });
  }

  function performSort(rows, tbody) {
    rows.sort(function(a, b) {
      var aCells = a.getElementsByTagName('td');
      var bCells = b.getElementsByTagName('td');
      for (var i = 0; i < sortColumns.length; i++) {
        var sort = sortColumns[i];
        var aValue = aCells[sort.column + 1].textContent;
        var bValue = bCells[sort.column + 1].textContent;
        var aNum = parseFloat(aValue);
        var bNum = parseFloat(bValue);
        var comparison = 0;
        if (!isNaN(aNum) && !isNaN(bNum)) { comparison = aNum - bNum; }
        else { comparison = aValue.localeCompare(bValue); }
        if (comparison !== 0) { return sort.direction === 'asc' ? comparison : -comparison; }
      }
      return 0;
    });
    rows.forEach(function(row) { tbody.appendChild(row); });
  }

  function filterTable() {
    var input = document.getElementById('searchInput');
    var filter = input.value.toLowerCase();
    var tbody = document.getElementById('tableBody');
    var rows = tbody.getElementsByTagName('tr');
    var visibleCount = 0;
    for (var i = 0; i < rows.length; i++) {
      var cells = rows[i].getElementsByTagName('td');
      var found = false;
      for (var j = 0; j < cells.length; j++) {
        if (cells[j].textContent.toLowerCase().includes(filter)) { found = true; break; }
      }
      rows[i].style.display = found ? '' : 'none';
      if (found) visibleCount++;
    }
    document.getElementById('totalRows').textContent = visibleCount + ' / ' + ${output.rows.length};
  }

  function clearSearch() {
    document.getElementById('searchInput').value = '';
    filterTable();
    document.getElementById('totalRows').textContent = ${output.rows.length};
  }

  function resetSort() {
    var table = document.getElementById('dataTable');
    var tbody = document.getElementById('tableBody');
    var headers = table.getElementsByTagName('th');
    sortColumns = [];
    updateSortUI(headers);
    originalOrder.forEach(function(row) { tbody.appendChild(row); });
  }

  function handleCellClick(event, cell) {
    if (event.ctrlKey || event.metaKey) {
      var value = cell.textContent;
      navigator.clipboard.writeText(value);
      var originalBg = cell.style.backgroundColor;
      cell.style.backgroundColor = '#90EE90';
      setTimeout(function() { cell.style.backgroundColor = originalBg; }, 200);
    }
  }
<\/script>
</body></html>`;
  };

  const openInTable = () => {
    if (!sourceValue.trim()) return;

    try {
      const parsed = parse(sourceValue, sourceFormat);
      const tableData = dataToTable(parsed);

      if (!tableData) {
        error = "Cannot convert data to table format.";
        return;
      }

      const html = tableHTML(tableData);
      const popup = window.open("", "_blank", "width=1000,height=700,scrollbars=yes,resizable=yes");
      if (popup) {
        popup.document.write(html);
        popup.document.close();
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to open table view";
    }
  };
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Convert between JSON, YAML, TOML, TOON, XML, INI, CSV, and Properties formats with customizable indentation and key sorting.
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
           <option value="xml">XML</option>
           <option value="ini">INI</option>
           <option value="csv">CSV</option>
           <option value="properties">Properties</option>
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
           <option value="xml">XML</option>
           <option value="ini">INI</option>
           <option value="csv">CSV</option>
           <option value="properties">Properties</option>
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

      <!-- Open in Table -->
      <button
        onclick={openInTable}
        disabled={!sourceValue.trim()}
        class="ml-auto px-2 py-1 text-sm bg-(--color-bg) border border-(--color-border) text-(--color-text) hover:bg-(--color-border) cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        title="Open data in table view (new window)"
      >
        Table &#8599;
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
      <div class="flex-1 border border-(--color-border) overflow-hidden">
        <CodeMirror
          bind:value={sourceValue}
          placeholder={`Paste or type your ${formatLabels[sourceFormat]} here...`}
          extensions={sourceExtensions}
        />
      </div>
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
      <div class="flex-1 border border-(--color-border) overflow-hidden bg-(--color-bg)">
        <CodeMirror
          bind:value={outputValue}
          placeholder="Converted output will appear here..."
          extensions={outputExtensions}
        />
      </div>
    </div>
  </div>
</div>
