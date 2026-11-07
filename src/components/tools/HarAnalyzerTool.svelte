<script lang="ts">
  import { ChevronDown, ChevronUp, Download, FunnelX, X } from "@lucide/svelte";
  import FileDropZone from "../ui/FileDropZone.svelte";
  import ToolWorkbench from "../ui/ToolWorkbench.svelte";
  import { analyzeHar, harReport, type HarAnalysis, type HarRequest } from "../../lib/har-analyzer.ts";
  import { downloadBlob, errorMessage, formatBytes, isEditing } from "../../lib/workbench.ts";

  type Sort = "timeline" | "slowest" | "largest" | "status";
  let analysis = $state<HarAnalysis | null>(null);
  let filename = $state<string>("");
  let error = $state<string>("");
  let busy = $state<boolean>(false);
  let query = $state<string>("");
  let domain = $state<string>("");
  let statusFilter = $state<string>("all");
  let mimeFilter = $state<string>("");
  let sort = $state<Sort>("timeline");
  let page = $state<number>(0);
  let selectedId = $state<number | null>(null);
  let detailTab = $state<"overview" | "headers" | "body">("overview");
  let searchInput = $state<HTMLInputElement>();
  const phases: { key: string; name: string; color: string }[] = [{ key: "blocked", name: "Blocked", color: "#737373" }, { key: "dns", name: "DNS", color: "#9b59b6" }, { key: "connect", name: "Connect (incl. TLS)", color: "#d48a20" }, { key: "send", name: "Send", color: "#27859c" }, { key: "wait", name: "Wait / TTFB", color: "#2d9871" }, { key: "receive", name: "Receive", color: "#3979c6" }];
  const domains = $derived.by(() => {
    const groups: Map<string, { name: string; count: number; bytes: number; time: number }> = new Map();
    for (const request of analysis?.requests ?? []) { const group = groups.get(request.host) ?? { name: request.host, count: 0, bytes: 0, time: 0 }; group.count++; group.bytes += request.size; group.time += request.duration; groups.set(request.host, group); }
    return [...groups.values()].sort((a, b) => b.bytes - a.bytes);
  });
  const filtered = $derived.by(() => {
    const term: string = query.toLowerCase();
    return (analysis?.requests ?? []).filter((request) => (!term || `${request.method} ${request.url} ${request.mime}`.toLowerCase().includes(term)) && (!domain || request.host === domain) && (!mimeFilter || request.mime.includes(mimeFilter)) && (statusFilter === "all" || statusFilter === "errors" ? statusFilter === "all" || request.status === 0 || request.status >= 400 : statusFilter === "redirects" ? request.status >= 300 && request.status < 400 : request.status >= 200 && request.status < 300)).sort((a, b) => sort === "slowest" ? b.duration - a.duration : sort === "largest" ? b.size - a.size : sort === "status" ? b.status - a.status : a.offset - b.offset || a.id - b.id);
  });
  const visible = $derived(filtered.slice(page * 100, (page + 1) * 100));
  const pageCount = $derived(Math.max(1, Math.ceil(filtered.length / 100)));
  const selected = $derived(analysis?.requests.find((request) => request.id === selectedId));
  const filteredBytes = $derived(filtered.reduce((sum, request) => sum + request.size, 0));
  const errors = $derived(analysis?.requests.filter((request) => request.status === 0 || request.status >= 400).length ?? 0);
  const responseText = $derived.by(() => {
    if (!selected?.content) return "No response body was saved in this HAR.";
    if (selected.encoding === "base64") {
      if (!/json|text|javascript|xml|svg|form-urlencoded/i.test(selected.mime)) return "Binary response saved as Base64. Preview is disabled; no external resources are loaded.";
      try { const bytes: Uint8Array = Uint8Array.from(atob(selected.content), (char) => char.charCodeAt(0)); return new TextDecoder().decode(bytes); } catch { return "Base64 response is invalid or truncated; it cannot be decoded."; }
    }
    return selected.content;
  });
  const filtersActive = $derived(!!query || !!domain || statusFilter !== "all" || !!mimeFilter);
  const slowThreshold = $derived.by(() => {
    const times: number[] = (analysis?.requests ?? []).map((request) => request.duration).sort((a, b) => a - b);
    return times.length ? times[Math.floor(times.length * .9)] : 0;
  });
  $effect(() => { query; domain; statusFilter; mimeFilter; sort; page = 0; });

  function resetFilters(): void { query = ""; domain = ""; statusFilter = "all"; mimeFilter = ""; }
  function quick(kind: "errors" | "slowest" | "largest" | "all"): void {
    resetFilters();
    if (kind === "errors") statusFilter = "errors";
    sort = kind === "slowest" ? "slowest" : kind === "largest" ? "largest" : "timeline";
  }
  function moveSelection(direction: number): void {
    if (!filtered.length) return;
    const position: number = filtered.findIndex((request) => request.id === selectedId);
    const next: number = position < 0 ? (direction > 0 ? 0 : filtered.length - 1) : Math.max(0, Math.min(filtered.length - 1, position + direction));
    selectedId = filtered[next].id; page = Math.floor(next / 100);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-request="${selectedId}"]`)?.scrollIntoView({ block: "nearest" }));
  }

  async function open(files: File[]): Promise<void> {
    busy = true; error = "";
    try {
      const file: File = files[0];
      const result: HarAnalysis = analyzeHar(JSON.parse(await file.text()));
      analysis = result; filename = file.name; selectedId = null; page = 0; query = ""; domain = ""; statusFilter = "all"; mimeFilter = "";
    } catch (issue) { error = issue instanceof SyntaxError ? "The file is not valid JSON. Export a fresh HAR from your browser’s Network panel." : errorMessage(issue); }
    finally { busy = false; }
  }
  function sample(): void {
    const origin: number = Date.parse("2026-01-01T12:00:00Z");
    const paths: string[] = ["/", "/assets/app.css", "/assets/app.js", "/api/profile", "/images/cover.webp", "/api/notifications", "/old-page"];
    const durations: number[] = [240, 85, 390, 1240, 620, 480, 60];
    analysis = analyzeHar({ log: { pages: [{}], entries: paths.map((path, index) => ({ startedDateTime: new Date(origin + index * 90).toISOString(), time: durations[index], request: { url: `https://${index === 4 ? "cdn.example.com" : "example.com"}${path}`, method: "GET", headers: [{ name: "Accept", value: "*/*" }] }, response: { status: index === 5 ? 500 : index === 6 ? 301 : 200, statusText: index === 5 ? "Internal Server Error" : "OK", bodySize: [4200, 18000, 142000, 860, 245000, 240, 0][index], headers: [{ name: "Content-Type", value: index === 3 || index === 5 ? "application/json" : "text/plain" }], content: { mimeType: ["text/html", "text/css", "application/javascript", "application/json", "image/webp", "application/json", "text/html"][index], text: index === 5 ? '{"error":"Example service unavailable"}' : "Example response body" } }, timings: { blocked: 0, dns: index === 0 ? 20 : 0, connect: index === 0 ? 50 : 0, send: 2, wait: durations[index] * .6, receive: durations[index] * .2 } })) } });
    filename = "Example session (synthetic)"; selectedId = null; query = ""; domain = ""; statusFilter = "all"; mimeFilter = ""; error = "";
  }
  function time(value: number): string { return value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${value.toFixed(1)} ms`; }
  function phaseWidth(request: HarRequest, key: string): number {
    const total: number = phases.reduce((sum, phase) => sum + request.timings[phase.key], 0);
    return total ? request.timings[key] / total * 100 : 0;
  }
  function shortcut(event: KeyboardEvent): void {
    if (isEditing(event)) return;
    if (event.key === "/") { event.preventDefault(); searchInput?.focus(); }
    if (event.key === "Escape") selectedId = null;
    if (!analysis) return;
    if (event.key === "j" || event.key === "ArrowDown") { event.preventDefault(); moveSelection(1); }
    if (event.key === "k" || event.key === "ArrowUp") { event.preventDefault(); moveSelection(-1); }
  }
</script>

<svelte:window onkeydown={shortcut} />
<ToolWorkbench description="Inspect a browser network session locally. Find slow requests, large responses, failing endpoints, and domain traffic using a waterfall timeline and request details.">
  <FileDropZone accept=".har,.json,application/json" compact={!!analysis} title={analysis ? "Open another HAR file" : "Drop a HAR network recording"} hint="Chrome / Edge / Firefox DevTools → Network → right-click → Save all as HAR. Requests in the file are never replayed." disabled={busy} onfiles={open} />
  {#if !analysis}
    <div class="wb-toolbar"><button onclick={sample} disabled={busy}>Load example session</button><span class="wb-small wb-muted">HAR files may contain cookies, tokens, and private response bodies. They stay in this tab.</span></div>
  {/if}
  {#if error}<p class="wb-error" role="alert">{error}</p>{/if}
  {#if busy}<p class="wb-muted" role="status">Reading network session…</p>{/if}
  {#if analysis}
    <div class="wb-toolbar file-bar">
      <strong class="file-name">{filename}</strong>
      <span class="wb-spacer"></span>
      <button onclick={() => downloadBlob(harReport(filtered), "network-report.json", "application/json")} title="Headers, bodies, credentials, fragments and query values are omitted; paths and hostnames are kept."><Download size={15} /> Export {filtersActive ? "filtered " : ""}report</button>
      <button onclick={() => { analysis = null; selectedId = null; resetFilters(); }}>Close</button>
    </div>
    <div class="stat-cards" role="group" aria-label="Quick views">
      <button class="stat" aria-pressed={!filtersActive && sort === "timeline"} onclick={() => quick("all")}><strong>{analysis.requests.length.toLocaleString()}</strong><span>requests · {time(analysis.span)}</span></button>
      <button class="stat" class:alert={errors > 0} aria-pressed={statusFilter === "errors"} disabled={!errors} onclick={() => quick("errors")}><strong>{errors.toLocaleString()}</strong><span>failed / 4xx / 5xx</span></button>
      <button class="stat" aria-pressed={!filtersActive && sort === "slowest"} onclick={() => quick("slowest")}><strong>{time(slowThreshold)}</strong><span>p90 · show slowest</span></button>
      <button class="stat" aria-pressed={!filtersActive && sort === "largest"} onclick={() => quick("largest")}><strong>{formatBytes(analysis.bytes)}</strong><span>transferred · show largest</span></button>
      <button class="stat" onclick={() => { const details = document.querySelector<HTMLDetailsElement>(".domains"); if (details) { details.open = true; details.scrollIntoView({ behavior: "smooth", block: "start" }); } }}><strong>{domains.length}</strong><span>domains</span></button>
    </div>
    {#each analysis.warnings as warning}<p class="wb-note wb-small">{warning}</p>{/each}
    <div class="wb-toolbar filters">
      <input bind:this={searchInput} type="search" aria-label="Filter network requests" placeholder="Search URL, method, or type…  ( / )" bind:value={query} class="search" />
      <select aria-label="Filter by domain" bind:value={domain}><option value="">All domains</option>{#each domains as group}<option value={group.name}>{group.name} ({group.count})</option>{/each}</select>
      <select aria-label="Filter by status" bind:value={statusFilter}><option value="all">All statuses</option><option value="success">2xx success</option><option value="redirects">3xx redirects</option><option value="errors">Failed / 4xx / 5xx</option></select>
      <select aria-label="Filter content type" bind:value={mimeFilter}><option value="">All types</option><option value="html">HTML</option><option value="css">CSS</option><option value="javascript">JavaScript</option><option value="json">JSON</option><option value="image/">Images</option><option value="font">Fonts</option><option value="video/">Video</option></select>
      <select aria-label="Sort requests" bind:value={sort}><option value="timeline">Timeline order</option><option value="slowest">Slowest first</option><option value="largest">Largest first</option><option value="status">Status descending</option></select>
      {#if filtersActive}<button onclick={resetFilters}><FunnelX size={15} /> Reset</button>{/if}
    </div>
    <div class="results-line wb-small wb-muted"><span>{filtered.length.toLocaleString()} of {analysis.requests.length.toLocaleString()} requests · {formatBytes(filteredBytes)}</span><span class="legend">{#each phases as phase}<span><i style:background={phase.color}></i>{phase.name}</span>{/each}</span></div>

    <div class="har-layout" class:with-detail={!!selected}>
      <div class="wb-panel wb-scroll table-wrap">
        <table class="request-table" class:compact={!!selected}>
          <thead><tr><th>Request</th><th class="num">Status</th>{#if !selected}<th>Type</th>{/if}<th class="num">Size</th><th class="num">Time</th>{#if !selected}<th class="timeline-heading">Waterfall</th>{/if}</tr></thead>
          <tbody>
            {#each visible as request (request.id)}
              <tr class="wb-clickable" class:wb-row-active={selectedId === request.id} class:slow={request.duration >= slowThreshold && request.duration > 0} data-request={request.id} onclick={() => { selectedId = selectedId === request.id ? null : request.id; detailTab = "overview"; }}>
                <td><button class="wb-plain request-name" aria-expanded={selectedId === request.id} title={request.url} onclick={(event) => { event.stopPropagation(); selectedId = selectedId === request.id ? null : request.id; detailTab = "overview"; }}><span class="method">{request.method}</span> {request.path}<small>{request.host}</small></button></td>
                <td class="num" class:error-status={request.status === 0 || request.status >= 400} class:redirect-status={request.status >= 300 && request.status < 400}>{request.status || "Failed"}</td>
                {#if !selected}<td class="mime" title={request.mime}>{request.mime}</td>{/if}
                <td class="num">{formatBytes(request.size)}</td>
                <td class="num">{time(request.duration)}</td>
                {#if !selected}<td class="timeline-cell"><div class="timeline-track"><div class="waterfall-bar" style:left={`${analysis.span ? request.offset / analysis.span * 100 : 0}%`} style:width={`${Math.max(.4, analysis.span ? request.duration / analysis.span * 100 : 0)}%`} title={`${time(request.offset)} → ${time(request.offset + request.duration)}`}>{#each phases as phase}<span style:width={`${phaseWidth(request, phase.key)}%`} style:background={phase.color}></span>{/each}</div></div></td>{/if}
              </tr>
            {/each}
          </tbody>
        </table>
        {#if !filtered.length}<p class="wb-empty">No requests match these filters. <button class="wb-link" onclick={resetFilters}>Reset filters</button></p>{/if}
      </div>

      {#if selected}
        <section class="wb-panel detail" aria-label="Request details">
          <div class="wb-panel-heading detail-heading">
            <span class="detail-title-line"><span class="method">{selected.method}</span> <span class:error-status={selected.status === 0 || selected.status >= 400}>{selected.status || "Failed"}</span> <span class="wb-muted">{time(selected.duration)}</span></span>
            <span class="wb-spacer"></span>
            <button class="wb-icon" aria-label="Previous request" title="Previous (K / ↑)" onclick={() => moveSelection(-1)}><ChevronUp size={15} /></button>
            <button class="wb-icon" aria-label="Next request" title="Next (J / ↓)" onclick={() => moveSelection(1)}><ChevronDown size={15} /></button>
            <button class="wb-icon" aria-label="Close request details" title="Close (Esc)" onclick={() => selectedId = null}><X size={15} /></button>
          </div>
          <p class="detail-url wb-mono">{selected.url}</p>
          <div class="tabs" role="tablist">
            <button role="tab" aria-selected={detailTab === "overview"} onclick={() => detailTab = "overview"}>Timing</button>
            <button role="tab" aria-selected={detailTab === "headers"} onclick={() => detailTab = "headers"}>Headers <small>{selected.requestHeaders.length + selected.responseHeaders.length}</small></button>
            <button role="tab" aria-selected={detailTab === "body"} onclick={() => detailTab = "body"}>Body</button>
          </div>
          <div class="wb-padded detail-body wb-scroll">
            {#if detailTab === "overview"}
              <div class="timing-list">{#each phases as phase}<div class="timing-row"><span><i style:background={phase.color}></i>{phase.name}</span><div class="timing-track"><div style:width={`${Math.max(phaseWidth(selected, phase.key) ? 1 : 0, phaseWidth(selected, phase.key))}%`} style:background={phase.color}></div></div><span class="num">{time(selected.timings[phase.key])}</span></div>{/each}</div>
              <p class="wb-small wb-muted tls">TLS {time(selected.timings.ssl)} (included in connect)</p>
              <dl class="wb-detail-grid">{#each [["Type", selected.mime], ["Size", formatBytes(selected.size)], ["Started at", `+${time(selected.offset)}`], ["HTTP", selected.httpVersion || "—"], ["Server IP", selected.serverIp || "—"]] as [name, value]}<dt>{name}</dt><dd class="wb-mono">{value}</dd>{/each}</dl>
            {:else if detailTab === "headers"}{#each [{ name: "Request headers", values: selected.requestHeaders }, { name: "Response headers", values: selected.responseHeaders }] as group}<h3 class="detail-title">{group.name}</h3>{#if group.values.length}<dl class="headers">{#each group.values as header}<dt class="wb-mono">{header.name}</dt><dd class="wb-mono">{header.value}</dd>{/each}</dl>{:else}<p class="wb-muted wb-small">None recorded.</p>{/if}{/each}
            {:else}<h3 class="detail-title">Request body</h3><pre class="body-preview wb-scroll">{selected.body || "No request body recorded."}</pre><h3 class="detail-title">Response body</h3><pre class="body-preview wb-scroll">{responseText}</pre><p class="wb-small wb-muted">Shown as text only (first 128 / 256 KB). Nothing is rendered or executed.</p>{/if}
          </div>
        </section>
      {/if}
    </div>
    {#if pageCount > 1}<div class="wb-toolbar"><span class="wb-spacer"></span><button disabled={page === 0} onclick={() => page--}>Previous</button><span class="wb-small wb-muted">Page {page + 1} / {pageCount}</span><button disabled={page + 1 >= pageCount} onclick={() => page++}>Next</button></div>{/if}
    <details class="wb-panel wb-padded domains"><summary>Traffic by domain</summary><div class="wb-scroll" style="margin-top: 1rem;"><table><thead><tr><th>Domain</th><th class="num">Requests</th><th class="num">Bytes</th><th class="num">Sum of times</th></tr></thead><tbody>{#each domains as group}<tr class="wb-clickable" onclick={() => { domain = group.name; window.scrollTo({ top: 0 }); }}><td><button class="wb-link" onclick={(event) => { event.stopPropagation(); domain = group.name; }}>{group.name}</button></td><td class="num">{group.count}</td><td class="num">{formatBytes(group.bytes)}</td><td class="num">{time(group.time)}</td></tr>{/each}</tbody></table></div><p class="wb-small wb-muted" style="margin-top: .75rem;">Request times overlap; their sum is not page load time. Bytes use transfer size when available.</p></details>
    <p class="wb-small wb-muted">Reports omit headers, bodies, credentials, fragments and query values, but keep paths and hostnames — review before sharing.</p>
  {/if}
  <div class="wb-shortcuts"><span><kbd>/</kbd> Search</span><span><kbd>J</kbd> <kbd>K</kbd> / <kbd>↓</kbd> <kbd>↑</kbd> Next / previous request</span><span><kbd>Esc</kbd> Close details</span></div>
</ToolWorkbench>

<style>
  .file-bar { padding: .1rem 0; }
  .file-name { overflow-wrap: anywhere; }
  .stat-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: .6rem; }
  :global(.workbench) button.stat { flex-direction: column; align-items: flex-start; gap: .15rem; padding: .7rem .9rem; text-align: left; min-height: 0; }
  .stat strong { font-size: 1.15rem; font-variant-numeric: tabular-nums; }
  .stat span { font-size: .72rem; font-weight: 400; opacity: .75; }
  :global(.workbench) button.stat.alert:not([aria-pressed="true"]) strong { color: var(--color-error-text); }
  .filters .search { flex: 1; min-width: min(100%, 16rem); }
  .results-line { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .5rem 1rem; }
  .legend { display: flex; flex-wrap: wrap; gap: .4rem .9rem; }
  .legend span, .timing-row > span:first-child { display: inline-flex; align-items: center; gap: .35rem; }
  .legend i, .timing-row i { display: inline-block; width: 9px; height: 9px; }
  .har-layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1rem; align-items: start; }
  .har-layout.with-detail { grid-template-columns: minmax(0, 1fr) minmax(320px, .9fr); }
  .table-wrap { max-height: min(70dvh, 46rem); }
  .request-table { min-width: 860px; }
  .request-table.compact { min-width: 420px; }
  .request-table thead th { position: sticky; top: 0; z-index: 1; }
  .request-table td { vertical-align: middle; padding-block: .45rem; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; font-size: .8rem; }
  .request-name { text-align: left; max-width: 300px; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; background: none; border: 0; padding: 0; color: inherit; cursor: pointer; font: inherit; }
  .compact .request-name { max-width: 220px; }
  .method { font-size: .68rem; font-weight: 600; letter-spacing: .02em; }
  .request-name small { display: block; color: var(--color-text-muted); overflow: hidden; text-overflow: ellipsis; }
  tr.slow .num:nth-last-child(2), .compact tr.slow .num:last-child { font-weight: 600; }
  .mime { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .75rem; color: var(--color-text-muted); }
  .timeline-heading { width: 30%; min-width: 220px; }
  .timeline-track { height: 18px; position: relative; background: var(--color-bg); overflow: hidden; }
  .waterfall-bar { display: flex; position: absolute; top: 3px; height: 12px; min-width: 2px; background: #737373; }
  .waterfall-bar span { display: block; height: 100%; }
  .error-status { color: var(--color-error-text); font-weight: 600; }
  .redirect-status { color: #b7791f; }
  .detail { position: sticky; top: 1rem; display: flex; flex-direction: column; max-height: calc(100dvh - 2rem); }
  .detail-heading { gap: .4rem; }
  .detail-title-line { display: flex; gap: .5rem; align-items: baseline; font-variant-numeric: tabular-nums; }
  .detail-url { padding: .6rem 1rem; font-size: .75rem; overflow-wrap: anywhere; border-bottom: 1px solid var(--color-border); color: var(--color-text-muted); }
  .tabs { display: flex; border-bottom: 1px solid var(--color-border); padding: 0 .5rem; }
  :global(.workbench) .tabs button { border: 0; border-bottom: 2px solid transparent; background: none; min-height: 2.4rem; padding: .3rem .7rem; color: var(--color-text-muted); }
  :global(.workbench) .tabs button[aria-selected="true"] { color: var(--color-text); border-bottom-color: var(--color-accent); }
  .tabs small { opacity: .7; font-variant-numeric: tabular-nums; }
  .detail-body { flex: 1; min-height: 0; }
  .timing-list { display: flex; flex-direction: column; gap: .45rem; margin-bottom: .6rem; }
  .timing-row { display: grid; grid-template-columns: 9.5rem minmax(0, 1fr) 4.5rem; align-items: center; gap: .6rem; font-size: .78rem; }
  .timing-track { height: 8px; background: var(--color-bg); }
  .timing-track div { height: 100%; }
  .tls { margin-bottom: 1rem; }
  .detail-title { font-weight: 600; margin: 1rem 0 .5rem; }
  .detail-title:first-child { margin-top: 0; }
  .headers { display: grid; grid-template-columns: minmax(7rem, auto) minmax(0, 1fr); gap: .3rem .8rem; font-size: .75rem; }
  .headers dt { color: var(--color-text-muted); overflow-wrap: anywhere; }
  .headers dd { overflow-wrap: anywhere; }
  .body-preview { max-height: 18rem; background: var(--color-bg); padding: .8rem; margin-bottom: .8rem; font-size: .75rem; }
  .domains summary { font-weight: 500; }
  @media (max-width: 1100px) { .har-layout.with-detail { grid-template-columns: minmax(0, 1fr); } .detail { position: static; max-height: none; } .request-table.compact { min-width: 520px; } }
</style>
