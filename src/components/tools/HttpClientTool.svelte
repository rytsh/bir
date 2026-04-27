<script lang="ts">
  import { get as idbGet, set as idbSet } from "idb-keyval";

  type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
  type BodyKind = "none" | "json" | "text" | "form-urlencoded" | "form-data" | "binary";
  type AuthKind = "none" | "basic" | "bearer" | "apikey";

  interface KV {
    key: string;
    value: string;
    enabled: boolean;
  }

  interface HistoryEntry {
    id: string;
    method: Method;
    url: string;
    timestamp: number;
    status?: number;
    timeMs?: number;
  }

  interface Collection {
    id: string;
    name: string;
    items: SavedRequest[];
  }

  interface SavedRequest {
    id: string;
    name: string;
    method: Method;
    url: string;
    headers: KV[];
    queryParams: KV[];
    body: { kind: BodyKind; text: string };
    auth: { kind: AuthKind; username: string; password: string; token: string; apiKeyName: string; apiKeyValue: string; apiKeyIn: "header" | "query" };
  }

  // Current request
  let method = $state<Method>("GET");
  let url = $state("https://httpbin.org/anything");
  let headers = $state<KV[]>([{ key: "Accept", value: "application/json", enabled: true }]);
  let queryParams = $state<KV[]>([]);
  let bodyKind = $state<BodyKind>("none");
  let bodyText = $state('{\n  "hello": "world"\n}');
  let bodyBinary = $state<File | null>(null);
  let auth = $state<{ kind: AuthKind; username: string; password: string; token: string; apiKeyName: string; apiKeyValue: string; apiKeyIn: "header" | "query" }>({
    kind: "none",
    username: "",
    password: "",
    token: "",
    apiKeyName: "X-API-Key",
    apiKeyValue: "",
    apiKeyIn: "header",
  });

  // Tabs
  let activeTab = $state<"params" | "headers" | "body" | "auth">("params");
  let activeRespTab = $state<"body" | "headers" | "raw">("body");

  // Method dropdown
  let methodOpen = $state(false);

  // Close method dropdown on outside click
  $effect(() => {
    if (!methodOpen) return;
    const handler = () => {
      methodOpen = false;
    };
    // Defer one tick so the toggling click doesn't immediately close it
    const t = setTimeout(() => document.addEventListener("click", handler), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", handler);
    };
  });

  // Response
  let loading = $state(false);
  let responseStatus = $state<number | null>(null);
  let responseStatusText = $state("");
  let responseTime = $state<number | null>(null);
  let responseSize = $state<number | null>(null);
  let responseHeaders = $state<[string, string][]>([]);
  let responseBody = $state<string>("");
  let responseError = $state<string>("");
  let responseJson = $state<unknown>(null);

  // Storage
  let history = $state<HistoryEntry[]>([]);
  let collections = $state<Collection[]>([]);
  let leftPanel = $state<"history" | "collections">("history");

  // cURL import
  let curlInput = $state("");
  let showCurlImport = $state(false);

  // Stable option lists — declared once to avoid recreating array literals
  // in templates on every reactive update (which can re-mount buttons and
  // make clicks feel unresponsive).
  const METHODS: Method[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
  const LEFT_PANELS: { val: "history" | "collections"; label: string }[] = [
    { val: "history", label: "History" },
    { val: "collections", label: "Collections" },
  ];
  const REQUEST_TABS: { val: "params" | "headers" | "body" | "auth"; label: string }[] = [
    { val: "params", label: "Params" },
    { val: "headers", label: "Headers" },
    { val: "body", label: "Body" },
    { val: "auth", label: "Auth" },
  ];
  const RESP_TABS: { val: "body" | "headers" | "raw"; label: string }[] = [
    { val: "body", label: "Body" },
    { val: "headers", label: "Headers" },
    { val: "raw", label: "Raw" },
  ];
  const BODY_KINDS: { val: BodyKind; label: string }[] = [
    { val: "none", label: "None" },
    { val: "json", label: "JSON" },
    { val: "text", label: "Text" },
    { val: "form-urlencoded", label: "x-www-form-urlencoded" },
    { val: "form-data", label: "form-data" },
    { val: "binary", label: "Binary" },
  ];
  const AUTH_KINDS: { val: AuthKind; label: string }[] = [
    { val: "none", label: "None" },
    { val: "basic", label: "Basic" },
    { val: "bearer", label: "Bearer" },
    { val: "apikey", label: "API Key" },
  ];
  const APIKEY_LOCATIONS: { val: "header" | "query"; label: string }[] = [
    { val: "header", label: "In header" },
    { val: "query", label: "In query" },
  ];

  // Restore from IndexedDB
  $effect(() => {
    idbGet("http-client-history").then((v) => {
      if (Array.isArray(v)) history = v as HistoryEntry[];
    });
    idbGet("http-client-collections").then((v) => {
      if (Array.isArray(v)) collections = v as Collection[];
    });
  });

  function persistHistory() {
    idbSet("http-client-history", $state.snapshot(history)).catch(() => {});
  }
  function persistCollections() {
    idbSet("http-client-collections", $state.snapshot(collections)).catch(() => {});
  }

  // Sync URL <-> queryParams (from URL)
  function urlToParams() {
    try {
      const u = new URL(url);
      const params: KV[] = [];
      u.searchParams.forEach((value, key) => {
        params.push({ key, value, enabled: true });
      });
      queryParams = params;
    } catch {
      // ignore
    }
  }

  function paramsToUrl(): string {
    try {
      const u = new URL(url);
      // Strip existing query
      u.search = "";
      for (const p of queryParams) {
        if (p.enabled && p.key) u.searchParams.append(p.key, p.value);
      }
      return u.toString();
    } catch {
      return url;
    }
  }

  function addKV(arr: KV[]): KV[] {
    return [...arr, { key: "", value: "", enabled: true }];
  }

  function removeKV(arr: KV[], i: number): KV[] {
    return arr.filter((_, idx) => idx !== i);
  }

  // Build request
  async function send() {
    responseError = "";
    responseBody = "";
    responseHeaders = [];
    responseStatus = null;
    responseStatusText = "";
    responseTime = null;
    responseSize = null;
    responseJson = null;
    loading = true;

    const t0 = performance.now();
    try {
      const builtUrl = paramsToUrl();
      const reqHeaders = new Headers();
      for (const h of headers) {
        if (h.enabled && h.key) reqHeaders.set(h.key, h.value);
      }

      // Auth
      let finalUrl = builtUrl;
      if (auth.kind === "basic") {
        reqHeaders.set("Authorization", `Basic ${btoa(`${auth.username}:${auth.password}`)}`);
      } else if (auth.kind === "bearer") {
        reqHeaders.set("Authorization", `Bearer ${auth.token}`);
      } else if (auth.kind === "apikey" && auth.apiKeyName) {
        if (auth.apiKeyIn === "header") {
          reqHeaders.set(auth.apiKeyName, auth.apiKeyValue);
        } else {
          const u = new URL(finalUrl);
          u.searchParams.set(auth.apiKeyName, auth.apiKeyValue);
          finalUrl = u.toString();
        }
      }

      // Body
      let body: BodyInit | undefined;
      if (method !== "GET" && method !== "HEAD") {
        if (bodyKind === "json") {
          if (!reqHeaders.has("Content-Type")) reqHeaders.set("Content-Type", "application/json");
          body = bodyText;
        } else if (bodyKind === "text") {
          if (!reqHeaders.has("Content-Type")) reqHeaders.set("Content-Type", "text/plain");
          body = bodyText;
        } else if (bodyKind === "form-urlencoded") {
          const params = new URLSearchParams();
          // Parse form-urlencoded as key=value lines
          for (const line of bodyText.split("\n")) {
            const idx = line.indexOf("=");
            if (idx >= 0) params.append(line.slice(0, idx).trim(), line.slice(idx + 1));
          }
          body = params;
        } else if (bodyKind === "form-data") {
          const fd = new FormData();
          for (const line of bodyText.split("\n")) {
            const idx = line.indexOf("=");
            if (idx >= 0) fd.append(line.slice(0, idx).trim(), line.slice(idx + 1));
          }
          body = fd;
          // Let browser set Content-Type with boundary
          reqHeaders.delete("Content-Type");
        } else if (bodyKind === "binary" && bodyBinary) {
          body = bodyBinary;
        }
      }

      const res = await fetch(finalUrl, {
        method,
        headers: reqHeaders,
        body,
      });

      responseStatus = res.status;
      responseStatusText = res.statusText;
      const hdrs: [string, string][] = [];
      res.headers.forEach((v, k) => {
        hdrs.push([k, v]);
      });
      responseHeaders = hdrs;

      const text = await res.text();
      responseBody = text;
      responseSize = new Blob([text]).size;

      // Try parse JSON
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("json") || (text.trim().startsWith("{") || text.trim().startsWith("["))) {
        try {
          responseJson = JSON.parse(text);
        } catch {
          // not actually JSON
        }
      }

      // History
      const entry: HistoryEntry = {
        id: crypto.randomUUID(),
        method,
        url: builtUrl,
        timestamp: Date.now(),
        status: res.status,
        timeMs: performance.now() - t0,
      };
      history = [entry, ...history].slice(0, 200);
      persistHistory();
    } catch (e) {
      responseError = (e as Error).message || "Request failed";
    } finally {
      responseTime = performance.now() - t0;
      loading = false;
    }
  }

  function loadHistoryEntry(e: HistoryEntry) {
    method = e.method;
    url = e.url;
    urlToParams();
  }

  function clearHistory() {
    history = [];
    persistHistory();
  }

  // Collections
  function newCollection() {
    const name = prompt("Collection name:");
    if (!name) return;
    collections = [...collections, { id: crypto.randomUUID(), name, items: [] }];
    persistCollections();
  }

  function saveCurrentToCollection(collectionId: string) {
    const name = prompt("Request name:", `${method} ${url}`);
    if (!name) return;
    const req: SavedRequest = {
      id: crypto.randomUUID(),
      name,
      method,
      url,
      headers: $state.snapshot(headers),
      queryParams: $state.snapshot(queryParams),
      body: { kind: bodyKind, text: bodyText },
      auth: $state.snapshot(auth),
    };
    collections = collections.map((c) =>
      c.id === collectionId ? { ...c, items: [...c.items, req] } : c,
    );
    persistCollections();
  }

  function loadSavedRequest(req: SavedRequest) {
    method = req.method;
    url = req.url;
    headers = [...req.headers];
    queryParams = [...req.queryParams];
    bodyKind = req.body.kind;
    bodyText = req.body.text;
    auth = { ...req.auth };
  }

  function deleteSavedRequest(collectionId: string, requestId: string) {
    collections = collections.map((c) =>
      c.id === collectionId ? { ...c, items: c.items.filter((r) => r.id !== requestId) } : c,
    );
    persistCollections();
  }

  function deleteCollection(id: string) {
    if (!confirm("Delete this collection?")) return;
    collections = collections.filter((c) => c.id !== id);
    persistCollections();
  }

  function exportCollections() {
    const blob = new Blob([JSON.stringify(collections, null, 2)], { type: "application/json" });
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u;
    a.download = "http-client-collections.json";
    a.click();
    URL.revokeObjectURL(u);
  }

  function importCollections(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    f.text().then((txt) => {
      try {
        const parsed = JSON.parse(txt);
        if (Array.isArray(parsed)) {
          collections = [...collections, ...parsed];
          persistCollections();
        }
      } catch {
        alert("Invalid JSON");
      }
    });
  }

  // cURL import
  async function importFromCurl() {
    if (!curlInput.trim()) return;
    try {
      const mod = await import("curlconverter");
      const json = mod.toJsonString(curlInput);
      const parsed = JSON.parse(json);
      if (parsed.method) method = parsed.method.toUpperCase() as Method;
      if (parsed.url || parsed.raw_url) url = parsed.url || parsed.raw_url;
      if (parsed.headers) {
        const hdrs: KV[] = [];
        for (const k of Object.keys(parsed.headers)) {
          hdrs.push({ key: k, value: parsed.headers[k] || "", enabled: true });
        }
        headers = hdrs;
      }
      if (parsed.queries) {
        const qs: KV[] = [];
        for (const k of Object.keys(parsed.queries)) {
          const v = parsed.queries[k];
          if (Array.isArray(v)) {
            for (const item of v) qs.push({ key: k, value: String(item), enabled: true });
          } else {
            qs.push({ key: k, value: String(v), enabled: true });
          }
        }
        queryParams = qs;
      }
      if (parsed.data) {
        bodyKind = "json";
        bodyText = typeof parsed.data === "string" ? parsed.data : JSON.stringify(parsed.data, null, 2);
      } else if (parsed.data_textraw) {
        bodyKind = "text";
        bodyText = parsed.data_textraw;
      }
      if (parsed.auth && parsed.auth.length >= 2) {
        auth.kind = "basic";
        auth.username = parsed.auth[0];
        auth.password = parsed.auth[1];
      }
      curlInput = "";
      showCurlImport = false;
    } catch (e) {
      alert(`Failed to parse cURL: ${(e as Error).message}`);
    }
  }

  function copyAsCurl() {
    let cmd = `curl -X ${method} '${paramsToUrl()}'`;
    for (const h of headers) {
      if (h.enabled && h.key) cmd += ` \\\n  -H '${h.key}: ${h.value}'`;
    }
    if (auth.kind === "basic") {
      cmd += ` \\\n  -u '${auth.username}:${auth.password}'`;
    } else if (auth.kind === "bearer") {
      cmd += ` \\\n  -H 'Authorization: Bearer ${auth.token}'`;
    }
    if (bodyKind === "json" || bodyKind === "text" || bodyKind === "form-urlencoded") {
      cmd += ` \\\n  -d '${bodyText.replace(/'/g, "'\\''")}'`;
    }
    navigator.clipboard.writeText(cmd).catch(() => {});
  }

  function fmtTime(ts: number): string {
    return new Date(ts).toLocaleTimeString(undefined, { hour12: false });
  }

  function fmtBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
  }

  // Postman-style method color palette. Inline styles avoid Tailwind
  // tree-shaking issues with class names hidden inside object literals.
  const METHOD_COLORS: Record<Method, string> = {
    GET: "#16a34a", // green
    POST: "#ca8a04", // amber
    PUT: "#2563eb", // blue
    PATCH: "#7c3aed", // violet
    DELETE: "#dc2626", // red
    HEAD: "#6b7280", // gray
    OPTIONS: "#0891b2", // cyan
  };

  function methodStyle(m: Method): string {
    return `color: ${METHOD_COLORS[m]};`;
  }

  function methodBadgeStyle(m: Method): string {
    const c = METHOD_COLORS[m];
    return `background: ${c}; color: #fff;`;
  }

  function statusStyle(s: number | null): string {
    if (s === null) return "";
    let c = "#dc2626"; // 4xx/5xx red
    if (s < 200) c = "#2563eb";
    else if (s < 300) c = "#16a34a";
    else if (s < 400) c = "#ca8a04";
    return `color: ${c};`;
  }

  function onBodyBinaryChange(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) bodyBinary = f;
  }
</script>

<div class="h-full flex flex-col gap-3 min-h-0">
  <header>
    <p class="text-sm text-(--color-text-muted)">
      Postman-style HTTP client. Send any request method with custom headers, body, and auth. Save requests in collections (IndexedDB), import/export as JSON or cURL. Note: browser CORS will block some endpoints — see the
      <a href="/network/cors" class="underline">CORS Checker</a>.
    </p>
  </header>

  <div class="flex-1 flex flex-col lg:flex-row gap-3 min-h-0">
    <!-- Left: history / collections -->
    <aside class="lg:w-72 flex flex-col gap-2 lg:min-h-0">
      <div class="flex gap-1">
        {#each LEFT_PANELS as panel (panel.val)}
          <button type="button"
            onclick={() => (leftPanel = panel.val)}
            class="flex-1 px-3 py-1.5 text-xs border-b-2 -mb-px transition-colors {leftPanel === panel.val
              ? 'border-(--color-accent) text-(--color-text)'
              : 'border-transparent text-(--color-text-muted) hover:text-(--color-text)'}"
          >
            {panel.label}
          </button>
        {/each}
      </div>

      {#if leftPanel === "history"}
        <div class="flex items-center justify-between">
          <span class="text-xs text-(--color-text-muted)">{history.length} entries</span>
          {#if history.length > 0}
            <button type="button" onclick={clearHistory} class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors">Clear</button>
          {/if}
        </div>
        <div class="flex-1 overflow-auto bg-(--color-bg-alt) border border-(--color-border) min-h-0">
          {#if history.length === 0}
            <div class="p-3 text-xs text-(--color-text-muted) text-center">No history yet</div>
          {:else}
            <div class="divide-y divide-(--color-border)">
              {#each history as h}
                <button type="button"
                  onclick={() => loadHistoryEntry(h)}
                  class="w-full text-left px-2 py-1.5 hover:bg-(--color-bg) transition-colors"
                >
                  <div class="flex items-center gap-2 text-xs">
                    <span class="font-mono font-bold w-12" style={methodStyle(h.method)}>{h.method}</span>
                    {#if h.status}
                      <span class="font-mono font-bold" style={statusStyle(h.status)}>{h.status}</span>
                    {/if}
                    <span class="text-(--color-text-light) ml-auto">{fmtTime(h.timestamp)}</span>
                  </div>
                  <div class="text-xs font-mono text-(--color-text) truncate">{h.url}</div>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {:else}
        <div class="flex items-center justify-between gap-1 flex-wrap">
          <button type="button" onclick={newCollection} class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors">+ New</button>
          <button type="button" onclick={exportCollections} class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors">Export</button>
          <label class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors cursor-pointer">
            Import
            <input type="file" accept="application/json" onchange={importCollections} class="hidden" />
          </label>
        </div>
        <div class="flex-1 overflow-auto bg-(--color-bg-alt) border border-(--color-border) min-h-0">
          {#if collections.length === 0}
            <div class="p-3 text-xs text-(--color-text-muted) text-center">No collections yet</div>
          {:else}
            {#each collections as c}
              <details class="border-b border-(--color-border)">
                <summary class="px-2 py-1.5 cursor-pointer hover:bg-(--color-bg) flex items-center justify-between">
                  <span class="text-sm font-medium text-(--color-text)">{c.name}</span>
                  <span class="flex gap-2">
                    <button type="button" onclick={(e) => { e.preventDefault(); saveCurrentToCollection(c.id); }} class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors" title="Save current request here">+</button>
                    <button type="button" onclick={(e) => { e.preventDefault(); deleteCollection(c.id); }} class="text-xs text-(--color-text-muted) hover:text-(--color-error-text) transition-colors">×</button>
                  </span>
                </summary>
                {#each c.items as req}
                  <div class="flex items-center hover:bg-(--color-bg) transition-colors">
                    <button type="button"
                      onclick={() => loadSavedRequest(req)}
                      class="flex-1 text-left px-3 py-1 text-xs"
                    >
                      <span class="font-mono font-bold w-12 inline-block" style={methodStyle(req.method)}>{req.method}</span>
                      <span class="text-(--color-text)">{req.name}</span>
                    </button>
                    <button type="button" onclick={() => deleteSavedRequest(c.id, req.id)} class="px-2 text-(--color-text-light) hover:text-(--color-error-text) transition-colors">×</button>
                  </div>
                {/each}
                {#if c.items.length === 0}
                  <div class="px-3 py-1 text-xs text-(--color-text-muted)">empty</div>
                {/if}
              </details>
            {/each}
          {/if}
        </div>
      {/if}
    </aside>

    <!-- Right: request + response -->
    <section class="flex-1 flex flex-col gap-3 min-h-0">
      <!-- URL bar -->
      <div class="flex gap-2 items-center flex-wrap">
        <div class="relative">
          <button
            type="button"
            onclick={() => (methodOpen = !methodOpen)}
            class="px-3 py-2 bg-(--color-bg-alt) border border-(--color-border) hover:border-(--color-text-light) font-mono text-sm font-bold outline-none flex items-center gap-2 transition-colors min-w-[6.5rem]"
          >
            <span style={methodStyle(method)}>{method}</span>
            <span class="text-xs text-(--color-text-muted) ml-auto">▾</span>
          </button>
          {#if methodOpen}
            <div
              class="absolute z-20 left-0 top-full mt-1 bg-(--color-bg-alt) border border-(--color-border) shadow-lg flex flex-col min-w-[7rem]"
              role="menu"
            >
              {#each METHODS as m (m)}
                <button
                  type="button"
                  onclick={() => {
                    method = m;
                    methodOpen = false;
                  }}
                  class="px-3 py-1.5 text-left font-mono text-xs font-bold hover:bg-(--color-bg) transition-colors {method === m ? 'bg-(--color-bg)' : ''}"
                  style={methodStyle(m)}
                >
                  {m}
                </button>
              {/each}
            </div>
          {/if}
        </div>
        <input
          type="text"
          bind:value={url}
          onblur={urlToParams}
          placeholder="https://api.example.com/path"
          class="flex-1 min-w-[260px] px-3 py-2 bg-(--color-bg-alt) border border-(--color-border) text-(--color-text) font-mono text-sm focus:border-(--color-text-light) outline-none"
        />
        <button type="button"
          onclick={send}
          disabled={loading || !url}
          class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50"
        >
          {loading ? "Sending…" : "Send"}
        </button>
        <button type="button"
          onclick={copyAsCurl}
          class="px-3 py-2 text-xs bg-(--color-bg-alt) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          title="Copy as cURL command"
        >
          Copy cURL
        </button>
        <button type="button"
          onclick={() => (showCurlImport = !showCurlImport)}
          class="px-3 py-2 text-xs bg-(--color-bg-alt) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) transition-colors"
        >
          Import cURL
        </button>
      </div>

      {#if showCurlImport}
        <div class="bg-(--color-bg-alt) border border-(--color-border) p-3 flex flex-col gap-2">
          <textarea
            bind:value={curlInput}
            placeholder="Paste a cURL command here…"
            rows="4"
            class="w-full px-2 py-1 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-xs focus:border-(--color-text-light) outline-none resize-y"
          ></textarea>
          <div class="flex gap-2">
            <button type="button" onclick={importFromCurl} class="px-3 py-1 text-xs bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) transition-colors">Parse</button>
            <button type="button" onclick={() => (showCurlImport = false)} class="px-3 py-1 text-xs bg-(--color-bg) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) transition-colors">Cancel</button>
          </div>
        </div>
      {/if}

      <!-- Request tabs -->
      <div class="flex border-b border-(--color-border) gap-0">
        {#each REQUEST_TABS as tab (tab.val)}
          {@const count =
            tab.val === "params"
              ? queryParams.filter((p) => p.enabled && p.key).length
              : tab.val === "headers"
                ? headers.filter((h) => h.enabled && h.key).length
                : 0}
          {@const dot =
            (tab.val === "body" && bodyKind !== "none") ||
            (tab.val === "auth" && auth.kind !== "none")}
          <button type="button"
            onclick={() => (activeTab = tab.val)}
            class="px-3 py-2 text-xs border-b-2 -mb-px transition-colors {activeTab === tab.val
              ? 'border-(--color-accent) text-(--color-text)'
              : 'border-transparent text-(--color-text-muted) hover:text-(--color-text)'}"
          >
            {tab.label}{count > 0 ? ` (${count})` : ""}{dot ? " ●" : ""}
          </button>
        {/each}
      </div>

      <!-- Tab content -->
      <div class="bg-(--color-bg-alt) border border-(--color-border) p-3">
        {#if activeTab === "params"}
          <div class="flex flex-col gap-1">
            {#each queryParams as p, i}
              <div class="flex gap-2 items-center">
                <input type="checkbox" bind:checked={queryParams[i].enabled} />
                <input
                  type="text"
                  bind:value={queryParams[i].key}
                  placeholder="key"
                  class="flex-1 px-2 py-1 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-xs focus:border-(--color-text-light) outline-none"
                />
                <input
                  type="text"
                  bind:value={queryParams[i].value}
                  placeholder="value"
                  class="flex-1 px-2 py-1 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-xs focus:border-(--color-text-light) outline-none"
                />
                <button type="button" onclick={() => (queryParams = removeKV(queryParams, i))} class="px-2 text-(--color-text-light) hover:text-(--color-error-text) transition-colors">×</button>
              </div>
            {/each}
            <button type="button" onclick={() => (queryParams = addKV(queryParams))} class="self-start px-2 py-1 text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors">
              + Add param
            </button>
          </div>
        {:else if activeTab === "headers"}
          <div class="flex flex-col gap-1">
            {#each headers as h, i}
              <div class="flex gap-2 items-center">
                <input type="checkbox" bind:checked={headers[i].enabled} />
                <input
                  type="text"
                  bind:value={headers[i].key}
                  placeholder="header name"
                  class="flex-1 px-2 py-1 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-xs focus:border-(--color-text-light) outline-none"
                />
                <input
                  type="text"
                  bind:value={headers[i].value}
                  placeholder="value"
                  class="flex-1 px-2 py-1 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-xs focus:border-(--color-text-light) outline-none"
                />
                <button type="button" onclick={() => (headers = removeKV(headers, i))} class="px-2 text-(--color-text-light) hover:text-(--color-error-text) transition-colors">×</button>
              </div>
            {/each}
            <button type="button" onclick={() => (headers = addKV(headers))} class="self-start px-2 py-1 text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors">
              + Add header
            </button>
          </div>
        {:else if activeTab === "body"}
          <div class="flex flex-col gap-2">
            <div class="flex gap-1 flex-wrap">
              {#each BODY_KINDS as opt (opt.val)}
                <button type="button"
                  onclick={() => (bodyKind = opt.val)}
                  class="px-2 py-1 text-xs border transition-colors {bodyKind === opt.val
                    ? 'bg-(--color-accent) text-(--color-btn-text) border-(--color-accent)'
                    : 'bg-(--color-bg) border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)'}"
                >
                  {opt.label}
                </button>
              {/each}
            </div>
            {#if bodyKind === "binary"}
              <input type="file" onchange={onBodyBinaryChange} class="text-xs text-(--color-text-muted)" />
              {#if bodyBinary}
                <span class="text-xs text-(--color-text-muted)">{bodyBinary.name} · {fmtBytes(bodyBinary.size)}</span>
              {/if}
            {:else if bodyKind !== "none"}
              <textarea
                bind:value={bodyText}
                rows="8"
                placeholder={bodyKind === "json" ? "{}" : bodyKind === "form-urlencoded" || bodyKind === "form-data" ? "key=value (one per line)" : "body text"}
                class="w-full px-2 py-1 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-xs focus:border-(--color-text-light) outline-none resize-y"
              ></textarea>
            {/if}
          </div>
        {:else if activeTab === "auth"}
          <div class="flex flex-col gap-2">
            <div class="flex gap-1">
              {#each AUTH_KINDS as opt (opt.val)}
                <button type="button"
                  onclick={() => (auth.kind = opt.val)}
                  class="px-2 py-1 text-xs border transition-colors {auth.kind === opt.val
                    ? 'bg-(--color-accent) text-(--color-btn-text) border-(--color-accent)'
                    : 'bg-(--color-bg) border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)'}"
                >
                  {opt.label}
                </button>
              {/each}
            </div>
            {#if auth.kind === "basic"}
              <input
                type="text"
                bind:value={auth.username}
                placeholder="username"
                class="px-2 py-1 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-xs focus:border-(--color-text-light) outline-none"
              />
              <input
                type="password"
                bind:value={auth.password}
                placeholder="password"
                class="px-2 py-1 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-xs focus:border-(--color-text-light) outline-none"
              />
            {:else if auth.kind === "bearer"}
              <input
                type="text"
                bind:value={auth.token}
                placeholder="token"
                class="px-2 py-1 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-xs focus:border-(--color-text-light) outline-none"
              />
            {:else if auth.kind === "apikey"}
              <div class="flex gap-1">
                {#each APIKEY_LOCATIONS as opt (opt.val)}
                  <button type="button"
                    onclick={() => (auth.apiKeyIn = opt.val)}
                    class="px-2 py-1 text-xs border transition-colors {auth.apiKeyIn === opt.val
                      ? 'bg-(--color-accent) text-(--color-btn-text) border-(--color-accent)'
                      : 'bg-(--color-bg) border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)'}"
                  >
                    {opt.label}
                  </button>
                {/each}
              </div>
              <input
                type="text"
                bind:value={auth.apiKeyName}
                placeholder="key name"
                class="px-2 py-1 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-xs focus:border-(--color-text-light) outline-none"
              />
              <input
                type="text"
                bind:value={auth.apiKeyValue}
                placeholder="key value"
                class="px-2 py-1 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-xs focus:border-(--color-text-light) outline-none"
              />
            {/if}
          </div>
        {/if}
      </div>

      <!-- Response -->
      <div class="flex-1 flex flex-col gap-2 min-h-0">
        <div class="flex items-center gap-3 flex-wrap text-xs">
          <span class="text-(--color-text-light) uppercase tracking-wider font-medium">Response</span>
          {#if responseStatus !== null}
            <span class="font-mono font-bold" style={statusStyle(responseStatus)}>{responseStatus}{responseStatusText ? ` ${responseStatusText}` : ""}</span>
          {/if}
          {#if responseTime !== null}
            <span class="text-(--color-text-muted)">{responseTime.toFixed(0)} ms</span>
          {/if}
          {#if responseSize !== null}
            <span class="text-(--color-text-muted)">{fmtBytes(responseSize)}</span>
          {/if}
          {#if responseError}
            <span class="text-(--color-error-text)">{responseError}</span>
          {/if}
        </div>

        {#if responseStatus !== null || responseError}
          <div class="flex border-b border-(--color-border) gap-0">
            {#each RESP_TABS as tab (tab.val)}
              <button type="button"
                onclick={() => (activeRespTab = tab.val)}
                class="px-3 py-1.5 text-xs border-b-2 -mb-px transition-colors {activeRespTab === tab.val
                  ? 'border-(--color-accent) text-(--color-text)'
                  : 'border-transparent text-(--color-text-muted) hover:text-(--color-text)'}"
              >
                {tab.label}{tab.val === "headers" && responseHeaders.length > 0 ? ` (${responseHeaders.length})` : ""}
              </button>
            {/each}
          </div>
          <div class="flex-1 overflow-auto bg-(--color-bg-alt) border border-(--color-border) p-3 min-h-0">
            {#if activeRespTab === "body"}
              {#if responseJson !== null}
                <pre class="text-xs font-mono text-(--color-text) m-0 whitespace-pre-wrap break-all">{JSON.stringify(responseJson, null, 2)}</pre>
              {:else}
                <pre class="text-xs font-mono text-(--color-text) m-0 whitespace-pre-wrap break-all">{responseBody}</pre>
              {/if}
            {:else if activeRespTab === "headers"}
              <table class="text-xs w-full">
                <tbody>
                  {#each responseHeaders as [k, v]}
                    <tr>
                      <td class="font-mono font-bold text-(--color-text) align-top pr-3 py-0.5">{k}</td>
                      <td class="font-mono text-(--color-text-muted) break-all py-0.5">{v}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            {:else}
              <pre class="text-xs font-mono text-(--color-text) m-0 whitespace-pre-wrap break-all">{responseBody}</pre>
            {/if}
          </div>
        {/if}
      </div>
    </section>
  </div>
</div>
