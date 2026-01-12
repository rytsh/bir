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
