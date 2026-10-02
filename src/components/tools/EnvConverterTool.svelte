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
  import {
    expandEnv,
    flattenToEnv,
    isSecretKey,
    maskValue,
    parseEnv,
    stringifyEnv,
    toExample,
    unflattenEnv,
    type EnvEntry,
    type KeyCase,
    type QuoteStyle,
  } from "../../lib/env.js";

  type Direction = "fromEnv" | "toEnv";
  type DataFormat = "json" | "yaml" | "toml";
  type EnvTarget =
    | "data"
    | "docker-compose"
    | "k8s-configmap"
    | "k8s-secret"
    | "github-actions"
    | "docker-run"
    | "shell-export"
    | "example";

  const SAMPLE_ENV = `# App
NODE_ENV=production
PORT=3000
APP_URL=https://example.com

# Database
DB__HOST=localhost
DB__PORT=5432
DB__USER=app
DB__PASSWORD="p@ss w0rd#1"
DATABASE_URL=postgres://\${DB__USER}:\${DB__PASSWORD}@\${DB__HOST}:\${DB__PORT}/app

# Features
FEATURE_FLAGS=["search","beta"]
DEBUG=false
API_KEY=sk_live_1234567890abcdef
GREETING='Hello $USER'
`;

  const SAMPLE_JSON = `{
  "nodeEnv": "production",
  "port": 3000,
  "db": {
    "host": "localhost",
    "port": 5432,
    "sslMode": "require"
  },
  "allowedOrigins": ["https://a.com", "https://b.com"],
  "message": "hello world"
}`;

  const TARGETS: { value: EnvTarget; label: string }[] = [
    { value: "data", label: "JSON / YAML / TOML" },
    { value: "docker-compose", label: "docker-compose environment" },
    { value: "k8s-configmap", label: "Kubernetes ConfigMap" },
    { value: "k8s-secret", label: "Kubernetes Secret" },
    { value: "github-actions", label: "GitHub Actions env" },
    { value: "docker-run", label: "docker run -e flags" },
    { value: "shell-export", label: "Shell export" },
    { value: "example", label: ".env.example" },
  ];

  let direction = $state<Direction>("fromEnv");
  let isDark = $state(getInitialDarkMode());
  let copied = $state(false);

  let envInput = $state(SAMPLE_ENV);
  let target = $state<EnvTarget>("data");
  let dataFormat = $state<DataFormat>("json");
  let expand = $state(true);
  let nest = $state(true);
  let nestSeparator = $state("__");
  let stripPrefix = $state("");
  let lowercaseKeys = $state(false);
  let inferTypes = $state(true);
  let resourceName = $state("app-config");
  let maskSecrets = $state(true);
  let keepNonSecretExamples = $state(true);

  let dataInput = $state(SAMPLE_JSON);
  let inputFormat = $state<DataFormat>("json");
  let separator = $state("__");
  let prefix = $state("");
  let keyCase = $state<KeyCase>("upper");
  let arrayMode = $state<"index" | "json" | "comma">("index");
  let quoteStyle = $state<QuoteStyle>("auto");
  let exportPrefix = $state(false);

  let parsedEnv = $derived(parseEnv(envInput));
  let effectiveEntries = $derived(expand ? expandEnv(parsedEnv.entries) : parsedEnv.entries);
  let dedupedEntries = $derived.by(() => {
    const map = new Map<string, EnvEntry>();
    for (const entry of effectiveEntries) map.set(entry.key, entry);
    return [...map.values()];
  });
  let secretKeys = $derived(dedupedEntries.filter((entry) => isSecretKey(entry.key)).map((entry) => entry.key));

  const yamlString = (value: string): string => {
    if (value === "" || /^[\s]|[\s]$|[:#{}[\],&*!|>'"%@`]|^(true|false|null|yes|no|on|off|~|-?\d[\d._]*)$/i.test(value) || value.includes("\n")) {
      return JSON.stringify(value);
    }
    return value;
  };

  const base64 = (value: string): string => {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  };

  const shellQuote = (value: string): string =>
    /^[A-Za-z0-9_./:@%+=,-]*$/.test(value) && value !== "" ? value : `'${value.replace(/'/g, "'\\''")}'`;

  const stringifyData = (data: unknown, format: DataFormat): string => {
    if (format === "json") return JSON.stringify(data, null, 2) + "\n";
    if (format === "yaml") return YAML.stringify(data);
    return TOML.stringify(data as Record<string, unknown>);
  };

  let fromEnvOutput = $derived.by((): { text: string; error: string } => {
    const entries = dedupedEntries;
    try {
      switch (target) {
        case "data": {
          const data = unflattenEnv(entries, {
            separator: nestSeparator,
            stripPrefix,
            lowercaseKeys,
            inferTypes,
            nest,
          });
          return { text: stringifyData(data, dataFormat), error: "" };
        }
        case "docker-compose":
          return {
            text: `services:\n  app:\n    environment:\n${entries
              .map((entry) => `      ${entry.key}: ${yamlString(entry.value.replace(/\$/g, "$$$$"))}`)
              .join("\n")}\n`,
            error: "",
          };
        case "k8s-configmap":
          return {
            text: `apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: ${resourceName}\ndata:\n${entries
              .map((entry) => `  ${entry.key}: ${JSON.stringify(entry.value)}`)
              .join("\n")}\n`,
            error: "",
          };
        case "k8s-secret":
          return {
            text: `apiVersion: v1\nkind: Secret\nmetadata:\n  name: ${resourceName}\ntype: Opaque\ndata:\n${entries
              .map((entry) => `  ${entry.key}: ${base64(entry.value)}`)
              .join("\n")}\n`,
            error: "",
          };
        case "github-actions":
          return {
            text: `env:\n${entries
              .map((entry) =>
                isSecretKey(entry.key)
                  ? `  ${entry.key}: \${{ secrets.${entry.key} }}`
                  : `  ${entry.key}: ${yamlString(entry.value)}`,
              )
              .join("\n")}\n`,
            error: "",
          };
        case "docker-run":
          return {
            text: `docker run \\\n${entries.map((entry) => `  -e ${entry.key}=${shellQuote(entry.value)} \\`).join("\n")}\n  IMAGE\n`,
            error: "",
          };
        case "shell-export":
          return {
            text: entries.map((entry) => `export ${entry.key}=${shellQuote(entry.value)}`).join("\n") + "\n",
            error: "",
          };
        case "example":
          return {
            text: stringifyEnv(toExample(parsedEnv.entries, keepNonSecretExamples), { quote: "auto", exportPrefix: false }),
            error: "",
          };
      }
    } catch (e) {
      return { text: "", error: e instanceof Error ? e.message : "Conversion failed" };
    }
  });

  let toEnvOutput = $derived.by((): { text: string; error: string; count: number } => {
    if (!dataInput.trim()) return { text: "", error: "", count: 0 };
    try {
      const data =
        inputFormat === "json" ? JSON.parse(dataInput) : inputFormat === "yaml" ? YAML.parse(dataInput) : TOML.parse(dataInput);
      const entries = flattenToEnv(data, { separator, prefix, keyCase, arrayMode });
      return { text: stringifyEnv(entries, { quote: quoteStyle, exportPrefix }), error: "", count: entries.length };
    } catch (e) {
      return { text: "", error: e instanceof Error ? e.message : "Invalid input", count: 0 };
    }
  });

  let output = $derived(direction === "fromEnv" ? fromEnvOutput.text : toEnvOutput.text);
  let outputError = $derived(direction === "fromEnv" ? fromEnvOutput.error : toEnvOutput.error);

  const handleCopy = (): void => {
    if (!output) return;
    navigator.clipboard.writeText(output);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  };

  const handleDownload = (): void => {
    if (!output) return;
    const names: Record<EnvTarget, string> = {
      data: `config.${dataFormat}`,
      "docker-compose": "docker-compose.env.yml",
      "k8s-configmap": "configmap.yaml",
      "k8s-secret": "secret.yaml",
      "github-actions": "env.yml",
      "docker-run": "docker-run.sh",
      "shell-export": "env.sh",
      example: ".env.example",
    };
    const name = direction === "toEnv" ? ".env" : names[target];
    const url = URL.createObjectURL(new Blob([output], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  };

  const swapDirection = (): void => {
    if (direction === "fromEnv") {
      if (target === "data" && fromEnvOutput.text) {
        dataInput = fromEnvOutput.text;
        inputFormat = dataFormat;
      }
      direction = "toEnv";
    } else {
      if (toEnvOutput.text) envInput = toEnvOutput.text;
      target = "data";
      direction = "fromEnv";
    }
  };

  let baseExtensions = $derived([...createTheme(isDark), editorHeightExtension, EditorView.lineWrapping]);
  let inputExtensions = $derived(
    direction === "fromEnv"
      ? baseExtensions
      : [...baseExtensions, inputFormat === "json" ? json() : yamlLang()],
  );
  let outputExtensions = $derived([
    ...baseExtensions,
    EditorView.editable.of(false),
    ...(direction === "fromEnv" && target === "data" && dataFormat === "json" ? [json()] : []),
    ...(direction === "fromEnv" && target !== "data" && !["docker-run", "shell-export", "example"].includes(target) ? [yamlLang()] : []),
    ...(direction === "fromEnv" && target === "data" && dataFormat !== "json" ? [yamlLang()] : []),
  ]);

  $effect(() => {
    isDark = getInitialDarkMode();
    return createDarkModeObserver((newIsDark) => {
      if (newIsDark !== isDark) isDark = newIsDark;
    });
  });

  const selectClass =
    "px-2 py-1 text-sm bg-(--color-bg) border border-(--color-border) text-(--color-text) focus:border-(--color-text-light) outline-none";
  const smallInputClass =
    "px-2 py-1 text-sm font-mono bg-(--color-bg) border border-(--color-border) text-(--color-text) focus:border-(--color-text-light) outline-none";
  const labelClass = "text-xs uppercase tracking-wider text-(--color-text-light) font-medium";
</script>

<div class="h-full flex flex-col">
  <header class="sr-only">
    <p>Convert .env files to JSON, YAML, TOML, docker-compose, Kubernetes ConfigMap/Secret, GitHub Actions, and shell exports — or flatten nested JSON/YAML/TOML into .env.</p>
  </header>

  <div class="mb-4 py-1 px-2 bg-(--color-bg-alt) border border-(--color-border)">
    <div class="flex flex-wrap items-center gap-3">
      <div class="p-1 bg-(--color-border) inline-flex gap-1">
        <button
          class="px-3 py-1 text-sm font-medium transition-colors {direction === 'fromEnv'
            ? 'bg-(--color-text) text-(--color-btn-text)'
            : 'text-(--color-text-muted) hover:text-(--color-text)'}"
          onclick={() => (direction = "fromEnv")}
        >
          .env → …
        </button>
        <button
          class="px-3 py-1 text-sm font-medium transition-colors {direction === 'toEnv'
            ? 'bg-(--color-text) text-(--color-btn-text)'
            : 'text-(--color-text-muted) hover:text-(--color-text)'}"
          onclick={() => (direction = "toEnv")}
        >
          … → .env
        </button>
      </div>
      <button
        onclick={swapDirection}
        class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
        title="Use the current output as the input of the other direction"
      >
        ⇄ Swap
      </button>

      <div class="hidden sm:block w-px h-6 bg-(--color-border)"></div>

      {#if direction === "fromEnv"}
        <label class="flex items-center gap-2">
          <span class={labelClass}>Output</span>
          <select bind:value={target} class={selectClass}>
            {#each TARGETS as item (item.value)}
              <option value={item.value}>{item.label}</option>
            {/each}
          </select>
        </label>
        {#if target === "data"}
          <select bind:value={dataFormat} aria-label="Data format" class={selectClass}>
            <option value="json">JSON</option>
            <option value="yaml">YAML</option>
            <option value="toml">TOML</option>
          </select>
        {/if}
        {#if target !== "example"}
          <label class="flex items-center gap-1.5 cursor-pointer" title="Expand ${'{VAR}'} and $VAR references">
            <input type="checkbox" bind:checked={expand} class="w-3.5 h-3.5 accent-(--color-text)" />
            <span class="text-sm text-(--color-text-muted)">Expand ${"{VAR}"}</span>
          </label>
        {/if}
      {:else}
        <label class="flex items-center gap-2">
          <span class={labelClass}>Input</span>
          <select bind:value={inputFormat} class={selectClass}>
            <option value="json">JSON</option>
            <option value="yaml">YAML</option>
            <option value="toml">TOML</option>
          </select>
        </label>
        <label class="flex items-center gap-2">
          <span class={labelClass}>Separator</span>
          <input type="text" bind:value={separator} class="{smallInputClass} w-14" />
        </label>
        <label class="flex items-center gap-2">
          <span class={labelClass}>Prefix</span>
          <input type="text" bind:value={prefix} placeholder="APP_" class="{smallInputClass} w-24" />
        </label>
      {/if}
    </div>

    <div class="flex flex-wrap items-center gap-x-4 gap-y-2 mt-1 pt-1 border-t border-(--color-border)">
      {#if direction === "fromEnv"}
        {#if target === "data"}
          <label class="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" bind:checked={nest} class="w-3.5 h-3.5 accent-(--color-text)" />
            <span class="text-xs text-(--color-text-muted)">Nest keys on</span>
          </label>
          <input type="text" bind:value={nestSeparator} disabled={!nest} aria-label="Nesting separator" class="{smallInputClass} w-14 text-xs disabled:opacity-50" />
          <label class="flex items-center gap-2">
            <span class="text-xs text-(--color-text-muted)">Strip prefix</span>
            <input type="text" bind:value={stripPrefix} placeholder="APP_" class="{smallInputClass} w-20 text-xs" />
          </label>
          <label class="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" bind:checked={lowercaseKeys} class="w-3.5 h-3.5 accent-(--color-text)" />
            <span class="text-xs text-(--color-text-muted)">Lowercase keys</span>
          </label>
          <label class="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" bind:checked={inferTypes} class="w-3.5 h-3.5 accent-(--color-text)" />
            <span class="text-xs text-(--color-text-muted)">Infer numbers / booleans / JSON</span>
          </label>
        {:else if target === "k8s-configmap" || target === "k8s-secret"}
          <label class="flex items-center gap-2">
            <span class="text-xs text-(--color-text-muted)">Name</span>
            <input type="text" bind:value={resourceName} class="{smallInputClass} w-40 text-xs" />
          </label>
        {:else if target === "example"}
          <label class="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" bind:checked={keepNonSecretExamples} class="w-3.5 h-3.5 accent-(--color-text)" />
            <span class="text-xs text-(--color-text-muted)">Keep non-secret values (blank only secrets)</span>
          </label>
        {:else if target === "github-actions"}
          <span class="text-xs text-(--color-text-light)">Secret-looking keys are replaced with <code class="font-mono">{"${{ secrets.KEY }}"}</code></span>
        {:else if target === "docker-compose"}
          <span class="text-xs text-(--color-text-light)"><code class="font-mono">$</code> is escaped as <code class="font-mono">$$</code> for Compose interpolation</span>
        {:else}
          <span class="text-xs text-(--color-text-light)">Values are shell-quoted</span>
        {/if}
      {:else}
        <label class="flex items-center gap-2">
          <span class="text-xs text-(--color-text-muted)">Key case</span>
          <select bind:value={keyCase} class="{selectClass} text-xs">
            <option value="upper">UPPER_SNAKE</option>
            <option value="preserve">Preserve</option>
          </select>
        </label>
        <label class="flex items-center gap-2">
          <span class="text-xs text-(--color-text-muted)">Arrays</span>
          <select bind:value={arrayMode} class="{selectClass} text-xs">
            <option value="index">Indexed (KEY__0)</option>
            <option value="comma">Comma-separated</option>
            <option value="json">JSON string</option>
          </select>
        </label>
        <label class="flex items-center gap-2">
          <span class="text-xs text-(--color-text-muted)">Quotes</span>
          <select bind:value={quoteStyle} class="{selectClass} text-xs">
            <option value="auto">Auto</option>
            <option value="double">Always double</option>
            <option value="single">Always single</option>
            <option value="none">None</option>
          </select>
        </label>
        <label class="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" bind:checked={exportPrefix} class="w-3.5 h-3.5 accent-(--color-text)" />
          <span class="text-xs text-(--color-text-muted)">export prefix</span>
        </label>
      {/if}
    </div>
  </div>

  {#if outputError}
    <div class="mb-4 p-3 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm">
      {outputError}
    </div>
  {/if}

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
    <div class="flex flex-col min-h-[320px]">
      <div class="flex justify-between items-center mb-2">
        <span class={labelClass}>{direction === "fromEnv" ? ".env" : inputFormat.toUpperCase()}</span>
        <div class="flex gap-3">
          <button
            onclick={() => (direction === "fromEnv" ? (envInput = SAMPLE_ENV) : ((dataInput = SAMPLE_JSON), (inputFormat = "json")))}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            Sample
          </button>
          <button
            onclick={() => (direction === "fromEnv" ? (envInput = "") : (dataInput = ""))}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            Clear
          </button>
        </div>
      </div>
      <div class="flex-1 border border-(--color-border) overflow-hidden min-h-0">
        {#if direction === "fromEnv"}
          <CodeMirror bind:value={envInput} placeholder="KEY=value" extensions={inputExtensions} />
        {:else}
          <CodeMirror bind:value={dataInput} placeholder={'{ "key": "value" }'} extensions={inputExtensions} />
        {/if}
      </div>
    </div>

    <div class="flex flex-col min-h-[320px]">
      <div class="flex justify-between items-center mb-2">
        <span class={labelClass}>
          Output
          {#if direction === "toEnv" && toEnvOutput.count}<span class="normal-case">· {toEnvOutput.count} variables</span>{/if}
        </span>
        <div class="flex gap-3">
          <button onclick={handleDownload} class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors">Download</button>
          <button onclick={handleCopy} class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors">
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
      <div class="flex-1 border border-(--color-border) overflow-hidden min-h-0">
        <CodeMirror value={output} extensions={outputExtensions} />
      </div>
    </div>
  </div>

  {#if direction === "fromEnv" && (parsedEnv.entries.length || parsedEnv.errors.length)}
    <div class="mt-4">
      <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h2 class={labelClass}>
          Variables · {dedupedEntries.length}
          {#if secretKeys.length}<span class="normal-case">· {secretKeys.length} look secret</span>{/if}
        </h2>
        <label class="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" bind:checked={maskSecrets} class="w-3.5 h-3.5 accent-(--color-text)" />
          <span class="text-xs text-(--color-text-muted)">Mask secret values</span>
        </label>
      </div>

      {#each parsedEnv.errors as err (err.line)}
        <p class="text-xs text-(--color-error-text)">Line {err.line}: {err.message}</p>
      {/each}
      {#if parsedEnv.duplicates.length}
        <p class="text-xs text-(--color-error-text) mb-1">
          Duplicate keys (last one wins): <span class="font-mono">{parsedEnv.duplicates.join(", ")}</span>
        </p>
      {/if}

      <div class="border border-(--color-border) bg-(--color-bg-alt) overflow-auto max-h-80 mt-1">
        <table class="w-full text-xs">
          <tbody>
            {#each dedupedEntries as entry (entry.key)}
              <tr class="border-b border-(--color-border) last:border-b-0">
                <td class="px-3 py-1 font-mono text-(--color-text) whitespace-nowrap align-top">
                  {entry.key}
                  {#if isSecretKey(entry.key)}<span title="Looks like a secret">🔒</span>{/if}
                </td>
                <td class="px-3 py-1 font-mono text-(--color-text-muted) break-all">
                  {#if entry.value === ""}
                    <span class="italic text-(--color-text-light)">empty</span>
                  {:else if maskSecrets && isSecretKey(entry.key)}
                    {maskValue(entry.value)}
                  {:else}
                    {entry.value}
                  {/if}
                </td>
                <td class="px-3 py-1 text-(--color-text-light) whitespace-nowrap align-top">line {entry.line}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>
