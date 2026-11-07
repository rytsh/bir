<script lang="ts">
  import { untrack } from "svelte";
  import { Check, ClipboardPaste, Copy, Download, Eraser, Plus, ShieldAlert, Trash2 } from "@lucide/svelte";
  import ToolWorkbench from "../ui/ToolWorkbench.svelte";
  import { cleanTrackingParams, decodeLayers, parseInspectedUrl } from "../../lib/url-inspector.ts";
  import { downloadBlob, errorMessage } from "../../lib/workbench.ts";

  interface QueryRow { id: string; key: string; value: string; }
  const trackerPattern: RegExp = /^(utm_.+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|_ga|_gl)$/i;
  let source = $state<string>("");
  let base = $state<string>("");
  let showBase = $state<boolean>(false);
  let queryRows = $state<QueryRow[]>([]);
  let path = $state<string>("");
  let fragment = $state<string>("");
  let error = $state<string>("");
  let status = $state<string>("");
  let copied = $state<string>("");
  let inspectValue = $state<string>("");
  let lastCommitted: string = "";
  const parsed = $derived.by(() => { if (!source.trim()) return { url: null, error: "" }; try { return { url: parseInspectedUrl(source, base), error: "" }; } catch (issue) { return { url: null, error: errorMessage(issue) }; } });
  const layers = $derived(decodeLayers(inspectValue));
  const trackerCount = $derived(queryRows.filter((row) => trackerPattern.test(row.key)).length);
  const duplicateKeys = $derived.by(() => { const counts: Map<string, number> = new Map(); queryRows.forEach((row) => counts.set(row.key, (counts.get(row.key) ?? 0) + 1)); return new Set([...counts].filter(([, count]) => count > 1).map(([key]) => key)); });
  const warnings = $derived.by((): { level: "danger" | "info"; text: string }[] => {
    const url: URL | null = parsed.url; if (!url) return [];
    const result: { level: "danger" | "info"; text: string }[] = [];
    if (url.username || url.password) result.push({ level: "danger", text: "Contains embedded credentials — they are included in copies and exports." });
    if (url.hostname.includes("xn--")) result.push({ level: "danger", text: "Internationalized (Punycode) hostname — check for look-alike characters." });
    if (!["https:", "http:"].includes(url.protocol)) result.push({ level: "danger", text: `Uses the ${url.protocol} scheme, not HTTP(S). This tool never opens it.` });
    if (url.protocol === "http:") result.push({ level: "info", text: "Unencrypted HTTP." });
    if (duplicateKeys.size) result.push({ level: "info", text: `Repeated query keys: ${[...duplicateKeys].join(", ")}. Order is preserved; servers may read them differently.` });
    if (/%(?![0-9a-f]{2})/i.test(url.href)) result.push({ level: "danger", text: "Malformed percent escape." });
    return result;
  });

  $effect(() => {
    const url: URL | null = parsed.url;
    untrack(() => {
      if (url && url.href === lastCommitted) return;
      queryRows = url ? [...url.searchParams.entries()].map(([key, value]) => ({ id: crypto.randomUUID(), key, value })) : [];
      path = url?.pathname ?? ""; fragment = url?.hash.slice(1) ?? "";
    });
  });

  function commit(): void {
    if (!parsed.url) return;
    try {
      const url: URL = new URL(parsed.url.href);
      const params: URLSearchParams = new URLSearchParams();
      queryRows.forEach((row) => params.append(row.key, row.value));
      url.search = params.toString(); url.pathname = path; url.hash = fragment;
      lastCommitted = url.href; source = url.href; error = "";
    } catch (issue) { error = errorMessage(issue); }
  }
  function removeRow(id: string): void { queryRows = queryRows.filter((item) => item.id !== id); commit(); }
  function addRow(): void { queryRows = [...queryRows, { id: crypto.randomUUID(), key: "", value: "" }]; requestAnimationFrame(() => document.querySelector<HTMLInputElement>(".query-table tbody tr:last-child input")?.focus()); }
  async function copy(value: string, label: string): Promise<void> {
    try { await navigator.clipboard.writeText(value); copied = label; status = ""; setTimeout(() => { if (copied === label) copied = ""; }, 1400); }
    catch { status = "Clipboard access was denied. Select the text and copy it manually."; }
  }
  async function paste(): Promise<void> {
    try { const text: string = (await navigator.clipboard.readText()).trim(); if (text) { source = text; status = ""; } }
    catch { status = "Clipboard access was denied. Paste into the field instead."; }
  }
  function removeTrackers(): void { if (!parsed.url) return; const count: number = trackerCount; source = cleanTrackingParams(parsed.url).href; status = `Removed ${count} tracking ${count === 1 ? "parameter" : "parameters"}.`; }
  function example(): void { source = "https://example.com:8443/search/items?q=hello+world&tag=tools&tag=browser&redirect=https%253A%252F%252Fexample.org%252Fdocs&utm_source=newsletter#results"; base = ""; inspectValue = "https%253A%252F%252Fexample.org%252Fdocs"; status = "Example loaded. No network request was made."; }
  function isEncoded(value: string): boolean { return /%[0-9a-f]{2}/i.test(value); }
</script>

<ToolWorkbench description="Break a URL into parts, edit its query parameters live, reveal nested percent-encoding, and strip tracking parameters. Nothing is fetched — inspection is offline.">
  <section class="wb-panel input-panel">
    <label class="visually-hidden" for="url-input">URL to inspect</label>
    <textarea id="url-input" class="url-input wb-mono" rows="2" spellcheck="false" bind:value={source} placeholder="Paste a URL — https://example.com/path?key=value#section" onfocus={(event) => event.currentTarget.select()}></textarea>
    <div class="input-actions">
      <button onclick={paste}><ClipboardPaste size={15} /> Paste</button>
      {#if !source}<button onclick={example}>Load example</button>{:else}<button onclick={() => { source = ""; base = ""; inspectValue = ""; status = ""; error = ""; }}><Eraser size={15} /> Clear</button>{/if}
      <button class="wb-link wb-small" onclick={() => showBase = !showBase} aria-expanded={showBase}>{showBase || base ? "Base URL" : "Relative URL? Add a base"}</button>
      {#if showBase || base}<input class="base-input" type="url" aria-label="Base URL for relative paths" bind:value={base} placeholder="https://example.com/" spellcheck="false" />{/if}
    </div>
  </section>
  {#if error || parsed.error}<p class="wb-error" role="alert">{error || parsed.error}</p>{/if}

  {#if parsed.url}
    {@const url = parsed.url}
    <section class="wb-panel">
      <div class="wb-panel-heading">
        <span>Normalized URL</span>
        <span class="wb-spacer"></span>
        {#if trackerCount}<button onclick={removeTrackers}><Eraser size={14} /> Remove {trackerCount} {trackerCount === 1 ? "tracker" : "trackers"}</button>{/if}
        <button class="primary" onclick={() => copy(url.href, "url")}>{#if copied === "url"}<Check size={14} /> Copied{:else}<Copy size={14} /> Copy URL{/if}</button>
      </div>
      <p class="anatomy wb-mono" aria-label="URL parts, color-coded">
        <span class="part scheme" title="Scheme">{url.protocol}//</span>{#if url.username || url.password}<span class="part creds" title="Credentials">{url.username}{url.password ? ":•••" : ""}@</span>{/if}<span class="part host" title="Host">{url.hostname}</span>{#if url.port}<span class="part port" title="Port">:{url.port}</span>{/if}<span class="part path" title="Path">{url.pathname}</span>{#if url.search}<span class="part query" title="Query">{url.search}</span>{/if}{#if url.hash}<span class="part hash" title="Fragment">{url.hash}</span>{/if}
      </p>
      <dl class="parts">
        {#each [["Scheme", url.protocol.replace(":", ""), "scheme"], ["Host", url.hostname, "host"], ["Port", url.port || "default", "port"], ["Path", url.pathname, "path"], ["Fragment", url.hash ? url.hash.slice(1) : "—", "hash"], ["Origin", url.origin, ""]] as [name, value, tone]}
          <div class="part-row"><dt><i class="swatch {tone}"></i>{name}</dt><dd class="wb-mono">{value}</dd><button class="wb-icon copy-part" aria-label={`Copy ${name}`} title={`Copy ${name.toLowerCase()}`} onclick={() => copy(String(value), name)}>{#if copied === name}<Check size={13} />{:else}<Copy size={13} />{/if}</button></div>
        {/each}
      </dl>
      {#if warnings.length}<ul class="warnings">{#each warnings as warning}<li class:danger={warning.level === "danger"}><ShieldAlert size={14} aria-hidden="true" />{warning.text}</li>{/each}</ul>{/if}
    </section>

    <section class="wb-panel">
      <div class="wb-panel-heading">
        <span>Edit</span><span class="wb-small wb-muted">Changes update the URL as you type</span>
        <span class="wb-spacer"></span>
        <button onclick={() => downloadBlob(JSON.stringify({ url: url.href, protocol: url.protocol, hostname: url.hostname, port: url.port, path: url.pathname, parameters: [...url.searchParams.entries()], fragment: url.hash }, null, 2), "url-inspection.json", "application/json")}><Download size={14} /> JSON</button>
      </div>
      <div class="wb-padded edit-grid">
        <label class="wb-field">Path<input class="wb-mono" bind:value={path} oninput={commit} spellcheck="false" /></label>
        <label class="wb-field">Fragment<input class="wb-mono" bind:value={fragment} oninput={commit} spellcheck="false" placeholder="none" /></label>
      </div>
      <div class="wb-scroll">
        <table class="query-table">
          <thead><tr><th>Key</th><th>Value <span class="wb-muted">(decoded)</span></th><th class="actions-cell"><span class="visually-hidden">Actions</span></th></tr></thead>
          <tbody>
            {#each queryRows as row (row.id)}
              <tr class:tracker={trackerPattern.test(row.key)}>
                <td class="key-cell"><input class="wb-mono" aria-label="Query key" bind:value={row.key} oninput={commit} spellcheck="false" />{#if trackerPattern.test(row.key)}<span class="tag">tracker</span>{:else if duplicateKeys.has(row.key)}<span class="tag">repeated</span>{/if}</td>
                <td><input class="wb-mono" aria-label={`Value for ${row.key || "new parameter"}`} bind:value={row.value} oninput={commit} spellcheck="false" /></td>
                <td class="actions-cell">
                  {#if isEncoded(row.value)}<button class="wb-small" onclick={() => inspectValue = row.value} title="This value is still percent-encoded — decode its layers">Decode</button>{/if}
                  <button class="wb-icon" aria-label={`Copy value of ${row.key}`} title="Copy value" onclick={() => copy(row.value, row.id)}>{#if copied === row.id}<Check size={13} />{:else}<Copy size={13} />{/if}</button>
                  <button class="wb-icon" aria-label={`Remove ${row.key || "parameter"}`} title="Remove" onclick={() => removeRow(row.id)}><Trash2 size={13} /></button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <div class="wb-padded"><button onclick={addRow}><Plus size={15} /> Add parameter</button>{#if !queryRows.length}<span class="wb-small wb-muted"> No query parameters yet.</span>{/if}</div>
    </section>
  {:else if !source}
    <p class="wb-small wb-muted">Paste any URL above. Duplicate keys, empty values, and nested encodings are all preserved.</p>
  {/if}

  <section class="wb-panel">
    <div class="wb-panel-heading"><span>Decode nested encoding</span><span class="wb-small wb-muted">Percent-decodes up to 5 layers; <code>+</code> is kept as-is</span></div>
    <div class="wb-padded">
      <textarea rows="2" class="wb-mono decode-input" bind:value={inspectValue} spellcheck="false" aria-label="Encoded value" placeholder="https%253A%252F%252Fexample.com"></textarea>
      {#if inspectValue}
        <ol class="layers">
          {#each layers as layer, index}
            <li><span class="wb-small wb-muted layer-label">Layer {index + 1}</span><code class="wb-mono">{layer.value}</code>{#if layer.error}<p class="wb-error wb-small">{layer.error}</p>{:else}<button class="wb-icon" aria-label={`Copy layer ${index + 1}`} onclick={() => copy(layer.value, `layer${index}`)}>{#if copied === `layer${index}`}<Check size={13} />{:else}<Copy size={13} />{/if}</button>{/if}</li>
          {/each}
          {#if !layers.length}<li class="wb-small wb-muted">Nothing to decode — no percent-encoded sequences.</li>{/if}
        </ol>
      {/if}
    </div>
  </section>
  <p class="wb-small wb-muted" role="status">{status || "URLs can contain secrets. Nothing is stored or sent anywhere."}</p>
</ToolWorkbench>

<style>
  .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .input-panel { padding: 0; }
  :global(.workbench) .url-input { width: 100%; border: 0; resize: vertical; padding: .9rem 1rem; line-height: 1.6; font-size: .85rem; display: block; }
  .input-actions { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem .75rem; padding: .6rem 1rem; border-top: 1px solid var(--color-border); background: var(--color-bg); }
  .base-input { flex: 1; min-width: min(100%, 16rem); }
  .anatomy { padding: 1rem; line-height: 1.9; overflow-wrap: anywhere; font-size: .85rem; border-bottom: 1px solid var(--color-border); }
  .part { padding: .1rem 0; border-bottom: 2px solid transparent; }
  .scheme, .swatch.scheme { --tone: #8e8b8b; }
  .creds { --tone: var(--color-error-text); }
  .host, .swatch.host { --tone: #3979c6; }
  .port, .swatch.port { --tone: #9b59b6; }
  .path, .swatch.path { --tone: #2d9871; }
  .query { --tone: #d48a20; }
  .hash, .swatch.hash { --tone: #c2185b; }
  .part { border-bottom-color: var(--tone); }
  .creds { color: var(--color-error-text); }
  .parts { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 19rem), 1fr)); }
  .part-row { display: grid; grid-template-columns: 6.5rem minmax(0, 1fr) auto; align-items: center; gap: .5rem; padding: .45rem .5rem .45rem 1rem; border-bottom: 1px solid var(--color-border); }
  .part-row dt { color: var(--color-text-muted); display: flex; align-items: center; gap: .45rem; }
  .part-row dd { overflow-wrap: anywhere; font-size: .8rem; }
  .swatch { width: 8px; height: 8px; background: var(--tone, transparent); display: inline-block; }
  .copy-part { opacity: .55; }
  .part-row:hover .copy-part, .copy-part:focus-visible { opacity: 1; }
  .warnings { display: flex; flex-direction: column; gap: .35rem; padding: .75rem 1rem; }
  .warnings li { display: flex; align-items: flex-start; gap: .5rem; color: var(--color-text-muted); font-size: .8rem; line-height: 1.5; }
  .warnings li.danger { color: var(--color-error-text); }
  .edit-grid { display: grid; grid-template-columns: 2fr 1fr; gap: .75rem; }
  .edit-grid input { width: 100%; }
  .query-table { min-width: 34rem; }
  .query-table td { vertical-align: middle; padding-block: .4rem; }
  .query-table input { width: 100%; font-size: .8rem; }
  .key-cell { width: 32%; position: relative; }
  .tag { position: absolute; right: 1.2rem; top: 50%; transform: translateY(-50%); font-size: .65rem; padding: 0 .3rem; border: 1px solid var(--color-border); background: var(--color-bg); color: var(--color-text-muted); pointer-events: none; }
  tr.tracker .tag { color: #d48a20; border-color: currentColor; }
  .actions-cell { width: 1%; white-space: nowrap; text-align: right; }
  .actions-cell > * { margin-left: .25rem; }
  :global(.workbench) .actions-cell button.wb-small { min-height: 2rem; padding: .2rem .55rem; }
  .decode-input { width: 100%; }
  .layers { margin-top: .75rem; }
  .layers li { display: grid; grid-template-columns: 4.5rem minmax(0, 1fr) auto; align-items: center; gap: .6rem; padding: .5rem 0; border-top: 1px solid var(--color-border); }
  .layers code { overflow-wrap: anywhere; font-size: .8rem; }
  .layer-label { font-variant-numeric: tabular-nums; }
  code { font-family: var(--font-mono); }
  @media (max-width: 640px) { .edit-grid { grid-template-columns: 1fr; } .part-row { grid-template-columns: 5.5rem minmax(0, 1fr) auto; } }
</style>
