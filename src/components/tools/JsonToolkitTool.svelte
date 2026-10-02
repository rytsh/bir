<script lang="ts">
  import { JSONPath } from "jsonpath-plus";
  import Ajv2020 from "ajv/dist/2020";
  import Ajv, { type ErrorObject } from "ajv";
  import addFormats from "ajv-formats";
  import * as YAML from "yaml";
  import CodeMirror from "svelte-codemirror-editor";
  import { EditorView } from "@codemirror/view";
  import { json } from "@codemirror/lang-json";
  import {
    createDarkModeObserver,
    getInitialDarkMode,
    createTheme,
    editorHeightExtension,
  } from "../../lib/codemirror.js";
  import { generateTypes, inferJsonSchema, type TypeTarget } from "../../lib/jsonTypes.js";

  type Tab = "query" | "schema" | "types";

  interface QueryMatch {
    path: string;
    value: unknown;
  }

  interface SchemaError {
    path: string;
    message: string;
    keyword: string;
  }

  const SAMPLE_JSON = `{
  "store": {
    "name": "Corner Books",
    "open": true,
    "book": [
      { "id": 1, "category": "reference", "author": "Nigel Rees", "title": "Sayings of the Century", "price": 8.95 },
      { "id": 2, "category": "fiction", "author": "Evelyn Waugh", "title": "Sword of Honour", "price": 12.99, "isbn": "0-553-21311-3" },
      { "id": 3, "category": "fiction", "author": "Herman Melville", "title": "Moby Dick", "price": 8.99, "isbn": "0-553-21311-4" }
    ],
    "bicycle": { "color": "red", "price": 19.95 }
  },
  "owner": { "email": "owner@example.com", "since": "2019-04-01" }
}`;

  const QUERY_EXAMPLES: { label: string; path: string }[] = [
    { label: "All authors", path: "$.store.book[*].author" },
    { label: "All prices (recursive)", path: "$..price" },
    { label: "Books under 10", path: "$.store.book[?(@.price < 10)]" },
    { label: "Books with ISBN", path: "$.store.book[?(@.isbn)].title" },
    { label: "Last book", path: "$.store.book[-1:]" },
    { label: "First two books", path: "$.store.book[0,1]" },
    { label: "Keys of store", path: "$.store.*~" },
  ];

  const TYPE_TARGETS: { value: TypeTarget; label: string }[] = [
    { value: "typescript", label: "TypeScript" },
    { value: "go", label: "Go" },
    { value: "rust", label: "Rust (serde)" },
    { value: "jsonSchema", label: "JSON Schema" },
  ];

  let activeTab = $state<Tab>("query");
  let jsonInput = $state(SAMPLE_JSON);
  let isDark = $state(getInitialDarkMode());
  let copiedKey = $state("");

  let queryPath = $state("$.store.book[?(@.price < 10)].title");
  let showPaths = $state(false);

  let schemaInput = $state("");
  let schemaDraft = $state<"2020-12" | "draft-07">("2020-12");

  let typeTarget = $state<TypeTarget>("typescript");
  let rootName = $state("Root");
  let optionalNullable = $state(true);

  const parseInput = (text: string): { value?: unknown; error?: string } => {
    if (!text.trim()) return { error: "" };
    try {
      return { value: JSON.parse(text) };
    } catch (jsonError) {
      try {
        const value = YAML.parse(text);
        if (value !== null && typeof value === "object") return { value };
      } catch {
        // fall through to JSON error
      }
      return { error: jsonError instanceof Error ? jsonError.message : "Invalid JSON" };
    }
  };

  let parsed = $derived(parseInput(jsonInput));

  let queryResult = $derived.by((): { matches: QueryMatch[]; error: string } => {
    if (parsed.value === undefined || !queryPath.trim()) return { matches: [], error: "" };
    try {
      const results = JSONPath({
        path: queryPath.trim(),
        json: parsed.value as object,
        resultType: "all",
        eval: "safe",
      }) as { path: string; value: unknown }[];
      return { matches: results.map((result) => ({ path: result.path, value: result.value })), error: "" };
    } catch (e) {
      return { matches: [], error: e instanceof Error ? e.message : "Invalid JSONPath expression" };
    }
  });

  let queryOutput = $derived(
    JSON.stringify(
      showPaths
        ? queryResult.matches.map((match) => ({ path: match.path, value: match.value }))
        : queryResult.matches.map((match) => match.value),
      null,
      2,
    ),
  );

  let schemaResult = $derived.by((): { valid?: boolean; errors: SchemaError[]; error: string } => {
    if (parsed.value === undefined || !schemaInput.trim()) return { errors: [], error: "" };
    let schema: unknown;
    try {
      schema = JSON.parse(schemaInput);
    } catch (e) {
      return { errors: [], error: `Schema: ${e instanceof Error ? e.message : "Invalid JSON"}` };
    }
    try {
      const ajv = schemaDraft === "2020-12"
        ? new Ajv2020({ allErrors: true, strict: false })
        : new Ajv({ allErrors: true, strict: false });
      addFormats(ajv);
      const schemaObject = { ...(schema as Record<string, unknown>) };
      delete schemaObject.$schema;
      const validate = ajv.compile(schemaObject);
      const valid = validate(parsed.value) as boolean;
      const errors = (validate.errors ?? []).map((err: ErrorObject) => ({
        path: err.instancePath || "/",
        message: err.message ?? "invalid",
        keyword: err.keyword,
        params: err.params,
      }));
      return {
        valid,
        errors: errors.map((err) => ({
          path: err.path,
          keyword: err.keyword,
          message: err.keyword === "additionalProperties"
            ? `${err.message}: "${(err.params as { additionalProperty: string }).additionalProperty}"`
            : err.keyword === "enum"
              ? `${err.message}: ${JSON.stringify((err.params as { allowedValues: unknown[] }).allowedValues)}`
              : err.message,
        })),
        error: "",
      };
    } catch (e) {
      return { errors: [], error: `Schema: ${e instanceof Error ? e.message : "Invalid schema"}` };
    }
  });

  let typesOutput = $derived.by((): string => {
    if (parsed.value === undefined) return "";
    try {
      return generateTypes(parsed.value, typeTarget, {
        rootName: rootName.trim() || "Root",
        optionalNullable,
      });
    } catch (e) {
      return `// ${e instanceof Error ? e.message : "Failed to generate types"}`;
    }
  });

  const handleCopy = (value: string, key: string): void => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    copiedKey = key;
    setTimeout(() => {
      if (copiedKey === key) copiedKey = "";
    }, 2000);
  };

  const handleFormatInput = (): void => {
    if (parsed.value !== undefined) jsonInput = JSON.stringify(parsed.value, null, 2);
  };

  const handleGenerateSchema = (): void => {
    if (parsed.value === undefined) return;
    schemaInput = JSON.stringify(inferJsonSchema(parsed.value), null, 2);
  };

  const pointerToSegments = (pointer: string): string =>
    pointer === "/" ? "(root)" : pointer;

  let editorExtensions = $derived([
    ...createTheme(isDark),
    editorHeightExtension,
    EditorView.lineWrapping,
    json(),
  ]);

  let readOnlyExtensions = $derived([
    ...createTheme(isDark),
    editorHeightExtension,
    EditorView.lineWrapping,
    EditorView.editable.of(false),
  ]);

  $effect(() => {
    isDark = getInitialDarkMode();
    return createDarkModeObserver((newIsDark) => {
      if (newIsDark !== isDark) isDark = newIsDark;
    });
  });

  const tabs: { id: Tab; label: string }[] = [
    { id: "query", label: "JSONPath Query" },
    { id: "schema", label: "Schema Validate" },
    { id: "types", label: "Generate Types" },
  ];
</script>

<div class="h-full flex flex-col">
  <header class="sr-only">
    <p class="text-sm text-(--color-text-muted)">
      Query JSON with JSONPath, validate against JSON Schema, and generate TypeScript, Go, Rust, or JSON Schema types from sample data.
    </p>
  </header>

  <div class="mb-4 flex flex-wrap items-center gap-3">
    <div class="p-1 bg-(--color-border) inline-flex gap-1">
      {#each tabs as tab (tab.id)}
        <button
          class="px-3 py-1 text-sm font-medium transition-colors {activeTab === tab.id
            ? 'bg-(--color-text) text-(--color-btn-text)'
            : 'text-(--color-text-muted) hover:text-(--color-text)'}"
          onclick={() => (activeTab = tab.id)}
        >
          {tab.label}
        </button>
      {/each}
    </div>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
    <!-- Input JSON -->
    <div class="flex flex-col min-h-[320px]">
      <div class="flex justify-between items-center mb-2">
        <div class="flex items-center gap-3">
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">JSON Input</span>
          {#if jsonInput.trim()}
            <span
              class="text-xs px-2 py-0.5 font-medium {parsed.value !== undefined
                ? 'bg-(--color-diff-added-bg) text-(--color-diff-added-text)'
                : 'bg-(--color-diff-removed-bg) text-(--color-diff-removed-text)'}"
            >
              {parsed.value !== undefined ? "Valid" : "Invalid"}
            </span>
          {/if}
        </div>
        <div class="flex gap-3">
          <button
            onclick={() => (jsonInput = SAMPLE_JSON)}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            Sample
          </button>
          <button
            onclick={handleFormatInput}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            Format
          </button>
          <button
            onclick={() => (jsonInput = "")}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            Clear
          </button>
        </div>
      </div>
      <div class="flex-1 border border-(--color-border) overflow-hidden min-h-0">
        <CodeMirror
          bind:value={jsonInput}
          placeholder="Paste JSON (or YAML) here..."
          extensions={editorExtensions}
        />
      </div>
      {#if parsed.error}
        <p class="mt-2 text-xs text-(--color-error-text)">{parsed.error}</p>
      {/if}
    </div>

    <!-- Tool Panel -->
    <div class="flex flex-col min-h-[320px] min-w-0">
      {#if activeTab === "query"}
        <label for="jsonpath" class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2">
          JSONPath Expression
        </label>
        <input
          id="jsonpath"
          type="text"
          bind:value={queryPath}
          spellcheck="false"
          placeholder="$.store.book[*].title"
          class="w-full px-3 py-2 text-sm font-mono border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) focus:outline-none focus:border-(--color-text-light)"
        />
        <div class="mt-2 mb-3 flex flex-wrap gap-1.5">
          {#each QUERY_EXAMPLES as example (example.path)}
            <button
              onclick={() => (queryPath = example.path)}
              title={example.path}
              class="px-2 py-0.5 text-xs border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:border-(--color-text-light) transition-colors"
            >
              {example.label}
            </button>
          {/each}
        </div>

        {#if queryResult.error}
          <div class="mb-3 p-3 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm">
            {queryResult.error}
          </div>
        {/if}

        <div class="flex justify-between items-center mb-2">
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">
            Result · {queryResult.matches.length} match{queryResult.matches.length === 1 ? "" : "es"}
          </span>
          <div class="flex items-center gap-3">
            <label class="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" bind:checked={showPaths} class="w-3.5 h-3.5 accent-(--color-text)" />
              <span class="text-xs text-(--color-text-muted)">Include paths</span>
            </label>
            <button
              onclick={() => handleCopy(queryOutput, "query")}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              {copiedKey === "query" ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
        <div class="flex-1 border border-(--color-border) overflow-hidden min-h-[200px]">
          <CodeMirror value={queryOutput} extensions={[...readOnlyExtensions, json()]} />
        </div>
      {:else if activeTab === "schema"}
        <div class="flex flex-wrap justify-between items-center gap-2 mb-2">
          <div class="flex items-center gap-3">
            <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">JSON Schema</span>
            <select
              bind:value={schemaDraft}
              aria-label="Schema draft"
              class="px-2 py-0.5 text-xs bg-(--color-bg) border border-(--color-border) text-(--color-text) outline-none"
            >
              <option value="2020-12">Draft 2020-12</option>
              <option value="draft-07">Draft-07</option>
            </select>
          </div>
          <div class="flex gap-3">
            <button
              onclick={handleGenerateSchema}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              title="Infer a schema from the JSON input"
            >
              Infer from input
            </button>
            <button
              onclick={() => (schemaInput = "")}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
        <div class="flex-1 border border-(--color-border) overflow-hidden min-h-[200px]">
          <CodeMirror
            bind:value={schemaInput}
            placeholder={'{ "type": "object", "required": ["store"] }'}
            extensions={editorExtensions}
          />
        </div>

        <div class="mt-3">
          {#if schemaResult.error}
            <div class="p-3 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm">
              {schemaResult.error}
            </div>
          {:else if schemaResult.valid === true}
            <div class="p-3 bg-(--color-diff-added-bg) text-(--color-diff-added-text) text-sm font-medium">
              ✓ JSON is valid against the schema
            </div>
          {:else if schemaResult.valid === false}
            <div class="border border-(--color-error-border)">
              <div class="px-3 py-2 bg-(--color-error-bg) text-(--color-error-text) text-sm font-medium">
                ✗ {schemaResult.errors.length} validation error{schemaResult.errors.length === 1 ? "" : "s"}
              </div>
              <ul class="max-h-60 overflow-auto divide-y divide-(--color-border)">
                {#each schemaResult.errors as err, index (index)}
                  <li class="px-3 py-2 text-sm flex flex-wrap gap-x-3 gap-y-0.5">
                    <code class="font-mono text-xs text-(--color-text)">{pointerToSegments(err.path)}</code>
                    <span class="text-(--color-text-muted)">{err.message}</span>
                    <span class="text-xs text-(--color-text-light)">({err.keyword})</span>
                  </li>
                {/each}
              </ul>
            </div>
          {:else}
            <p class="text-xs text-(--color-text-muted)">Enter a schema to validate the JSON input.</p>
          {/if}
        </div>
      {:else}
        <div class="flex flex-wrap items-center gap-3 mb-3">
          <select
            bind:value={typeTarget}
            aria-label="Target language"
            class="px-2 py-1 text-sm bg-(--color-bg) border border-(--color-border) text-(--color-text) outline-none"
          >
            {#each TYPE_TARGETS as target (target.value)}
              <option value={target.value}>{target.label}</option>
            {/each}
          </select>
          <label class="flex items-center gap-2">
            <span class="text-xs text-(--color-text-light)">Root name</span>
            <input
              type="text"
              bind:value={rootName}
              class="w-28 px-2 py-1 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) outline-none focus:border-(--color-text-light)"
            />
          </label>
          {#if typeTarget !== "jsonSchema"}
            <label class="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" bind:checked={optionalNullable} class="w-3.5 h-3.5 accent-(--color-text)" />
              <span class="text-xs text-(--color-text-muted)">Null fields optional</span>
            </label>
          {/if}
        </div>
        <div class="flex justify-between items-center mb-2">
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Output</span>
          <button
            onclick={() => handleCopy(typesOutput, "types")}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            {copiedKey === "types" ? "Copied!" : "Copy"}
          </button>
        </div>
        <div class="flex-1 border border-(--color-border) overflow-hidden min-h-[200px]">
          <CodeMirror value={typesOutput} extensions={readOnlyExtensions} />
        </div>
        <p class="mt-2 text-xs text-(--color-text-light)">
          Arrays of objects are merged: keys missing from some items become optional.
        </p>
      {/if}
    </div>
  </div>
</div>
