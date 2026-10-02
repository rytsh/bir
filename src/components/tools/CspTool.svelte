<script lang="ts">
  import {
    CSP_PRESETS,
    DIRECTIVES,
    KEYWORDS,
    SANDBOX_TOKENS,
    analyzeCsp,
    effectiveSources,
    generateNonce,
    hashInline,
    parseCsp,
    scoreFindings,
    serializeCsp,
    serverSnippets,
    type CspPolicy,
    type Severity,
  } from "../../lib/csp.js";

  type Tab = "build" | "analyze" | "hash";

  const SEVERITY_STYLES: Record<Severity, string> = {
    high: "bg-(--color-diff-removed-bg) text-(--color-diff-removed-text)",
    medium: "bg-(--color-error-bg) text-(--color-error-text)",
    low: "bg-(--color-border) text-(--color-text)",
    info: "bg-(--color-bg) text-(--color-text-muted)",
  };

  const KEYWORD_HELP: Record<string, string> = {
    "'self'": "Same origin (scheme + host + port)",
    "'none'": "Block everything",
    "'unsafe-inline'": "Allow inline scripts/styles (dangerous)",
    "'unsafe-eval'": "Allow eval() and friends (dangerous)",
    "'wasm-unsafe-eval'": "Allow WebAssembly compilation",
    "'strict-dynamic'": "Trust scripts loaded by nonce/hash-trusted scripts",
    "'unsafe-hashes'": "Allow hashes to match event handlers",
    "'report-sample'": "Include code sample in violation reports",
    "'inline-speculation-rules'": "Allow inline speculation rules",
  };

  let activeTab = $state<Tab>("build");
  let policy = $state<CspPolicy>(new Map());
  let enabled = $state<Record<string, boolean>>({});
  let customSource = $state<Record<string, string>>({});
  let reportOnly = $state(false);
  let multiline = $state(false);
  let snippetIndex = $state(0);
  let copiedKey = $state("");
  let showAllDirectives = $state(false);

  let analyzeInput = $state("");
  let hashInput = $state("console.log('hello');");
  let hashAlgorithm = $state<"SHA-256" | "SHA-384" | "SHA-512">("SHA-256");
  let hashResult = $state("");
  let nonce = $state("");

  const COMMON_DIRECTIVES = new Set([
    "default-src", "script-src", "style-src", "img-src", "font-src", "connect-src", "media-src", "object-src",
    "frame-src", "worker-src", "base-uri", "form-action", "frame-ancestors", "upgrade-insecure-requests", "report-uri", "report-to",
  ]);

  const loadPolicy = (text: string): void => {
    const parsed = parseCsp(text);
    policy = new Map(parsed.policy);
    enabled = Object.fromEntries([...parsed.policy.keys()].map((key) => [key, true]));
    if ([...parsed.policy.keys()].some((key) => !COMMON_DIRECTIVES.has(key))) showAllDirectives = true;
  };

  const applyPreset = (presetPolicy: string): void => {
    if (!nonce) nonce = generateNonce();
    loadPolicy(presetPolicy.replace("{NONCE}", nonce));
  };

  applyPreset(CSP_PRESETS[1].policy);

  let builtPolicy = $derived.by(() => {
    const result: CspPolicy = new Map();
    for (const directive of DIRECTIVES) {
      if (enabled[directive.name]) result.set(directive.name, policy.get(directive.name) ?? []);
    }
    for (const [name, values] of policy) {
      if (enabled[name] && !result.has(name)) result.set(name, values);
    }
    return result;
  });

  let builtText = $derived(serializeCsp(builtPolicy, multiline));
  let builtSingleLine = $derived(serializeCsp(builtPolicy));
  let builtFindings = $derived(analyzeCsp(builtPolicy));
  let builtScore = $derived(scoreFindings(builtFindings));
  let snippets = $derived(serverSnippets(builtSingleLine, reportOnly));

  let analyzed = $derived.by(() => {
    if (!analyzeInput.trim()) return null;
    const parsed = parseCsp(analyzeInput);
    const findings = analyzeCsp(parsed.policy, parsed);
    return { ...parsed, findings, score: scoreFindings(findings) };
  });

  const toggleDirective = (name: string): void => {
    enabled[name] = !enabled[name];
    if (enabled[name] && !policy.has(name)) {
      const def = DIRECTIVES.find((directive) => directive.name === name);
      const defaults: Record<string, string[]> = {
        "object-src": ["'none'"],
        "base-uri": ["'self'"],
        "frame-ancestors": ["'self'"],
        "form-action": ["'self'"],
        "require-trusted-types-for": ["'script'"],
        "report-to": ["csp-endpoint"],
        "report-uri": ["/csp-report"],
      };
      policy.set(name, defaults[name] ?? (def?.kind === "source" ? ["'self'"] : []));
      policy = new Map(policy);
    }
  };

  const toggleValue = (name: string, value: string): void => {
    const current = policy.get(name) ?? [];
    let next: string[];
    if (current.includes(value)) {
      next = current.filter((item) => item !== value);
    } else if (value === "'none'") {
      next = ["'none'"];
    } else {
      next = [...current.filter((item) => item !== "'none'"), value];
    }
    policy.set(name, next);
    policy = new Map(policy);
    enabled[name] = true;
  };

  const addCustom = (name: string): void => {
    const values = (customSource[name] ?? "").split(/[\s,]+/).filter(Boolean);
    if (!values.length) return;
    const current = (policy.get(name) ?? []).filter((item) => item !== "'none'");
    policy.set(name, [...current, ...values.filter((value) => !current.includes(value))]);
    policy = new Map(policy);
    enabled[name] = true;
    customSource[name] = "";
  };

  const removeValue = (name: string, value: string): void => {
    policy.set(name, (policy.get(name) ?? []).filter((item) => item !== value));
    policy = new Map(policy);
  };

  const handleCopy = (value: string, key: string): void => {
    navigator.clipboard.writeText(value);
    copiedKey = key;
    setTimeout(() => {
      if (copiedKey === key) copiedKey = "";
    }, 2000);
  };

  const computeHash = async (content: string, algorithm: typeof hashAlgorithm): Promise<void> => {
    const result = content ? await hashInline(content, algorithm) : "";
    if (content === hashInput && algorithm === hashAlgorithm) hashResult = result;
  };

  $effect(() => {
    computeHash(hashInput, hashAlgorithm);
  });

  const addToScriptSrc = (value: string): void => {
    const current = policy.get("script-src") ?? ["'self'"];
    if (!current.includes(value)) policy.set("script-src", [...current.filter((item) => item !== "'none'"), value]);
    policy = new Map(policy);
    enabled["script-src"] = true;
    activeTab = "build";
  };

  const refreshNonce = (): void => {
    const previous = nonce;
    nonce = generateNonce();
    for (const [name, values] of policy) {
      policy.set(name, values.map((value) => (previous && value === `'nonce-${previous}'` ? `'nonce-${nonce}'` : value)));
    }
    policy = new Map(policy);
  };

  let visibleDirectives = $derived(
    DIRECTIVES.filter((directive) => showAllDirectives || COMMON_DIRECTIVES.has(directive.name) || enabled[directive.name]),
  );

  const tabs: { id: Tab; label: string }[] = [
    { id: "build", label: "Builder" },
    { id: "analyze", label: "Analyze Policy" },
    { id: "hash", label: "Hash & Nonce" },
  ];

  const gradeClass = (grade: string): string =>
    grade === "A"
      ? "bg-(--color-diff-added-bg) text-(--color-diff-added-text)"
      : grade === "B" || grade === "C"
        ? "bg-(--color-error-bg) text-(--color-error-text)"
        : "bg-(--color-diff-removed-bg) text-(--color-diff-removed-text)";
</script>

{#snippet findingsList(findings: ReturnType<typeof analyzeCsp>)}
  {#if findings.length === 0}
    <p class="text-sm text-(--color-diff-added-text)">✓ No issues found.</p>
  {:else}
    <ul class="space-y-1">
      {#each findings as finding, index (index)}
        <li class="flex items-start gap-2 text-sm">
          <span class="shrink-0 w-16 text-center px-1.5 py-0.5 text-[10px] font-medium uppercase {SEVERITY_STYLES[finding.severity]}">
            {finding.severity}
          </span>
          <span class="shrink-0 font-mono text-xs text-(--color-text) pt-0.5">{finding.directive}</span>
          <span class="text-(--color-text-muted)">{finding.message}</span>
        </li>
      {/each}
    </ul>
  {/if}
{/snippet}

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Build a Content-Security-Policy visually from presets, analyze an existing policy for XSS bypasses and missing directives, and generate script hashes and nonces. Outputs ready-to-paste config for Nginx, Apache, Caddy, Express, Netlify, Vercel, and more.
    </p>
  </header>

  <div class="mb-4 p-1 bg-(--color-border) inline-flex gap-1 self-start">
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

  {#if activeTab === "build"}
    <div class="mb-4">
      <h2 class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2">Start from a preset</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {#each CSP_PRESETS as preset (preset.id)}
          <button
            onclick={() => applyPreset(preset.policy)}
            class="text-left px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) hover:border-(--color-text-light) transition-colors"
          >
            <div class="text-sm font-medium text-(--color-text)">{preset.label}</div>
            <div class="text-xs text-(--color-text-muted)">{preset.description}</div>
          </button>
        {/each}
      </div>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-[1fr_minmax(360px,40%)] gap-6">
      <div>
        <div class="flex items-center justify-between mb-2">
          <h2 class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Directives</h2>
          <label class="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" bind:checked={showAllDirectives} class="w-3.5 h-3.5 accent-(--color-text)" />
            <span class="text-xs text-(--color-text-muted)">Show all directives</span>
          </label>
        </div>
        <div class="space-y-2">
          {#each visibleDirectives as directive (directive.name)}
            {@const values = policy.get(directive.name) ?? []}
            {@const inherited = !enabled[directive.name] && directive.fetch ? effectiveSources(builtPolicy, directive.name) : null}
            <div class="border bg-(--color-bg-alt) {enabled[directive.name] ? 'border-(--color-text-light)' : 'border-(--color-border)'}">
              <label class="flex items-start gap-2 px-3 py-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enabled[directive.name] ?? false}
                  onchange={() => toggleDirective(directive.name)}
                  class="mt-0.5 w-4 h-4 accent-(--color-text)"
                />
                <span class="flex-1 min-w-0">
                  <span class="font-mono text-sm text-(--color-text)">{directive.name}</span>
                  <span class="block text-xs text-(--color-text-light)">{directive.description}</span>
                  {#if inherited?.values}
                    <span class="block text-xs text-(--color-text-light) italic">
                      Inherits from {inherited.from}: <span class="font-mono">{inherited.values.join(" ") || "(empty)"}</span>
                    </span>
                  {/if}
                </span>
              </label>

              {#if enabled[directive.name] && directive.kind !== "flag"}
                <div class="px-3 pb-3 pl-9 space-y-2">
                  {#if directive.kind === "source"}
                    <div class="flex flex-wrap gap-1">
                      {#each KEYWORDS.filter((keyword) => keyword !== "'inline-speculation-rules'") as keyword (keyword)}
                        <button
                          onclick={() => toggleValue(directive.name, keyword)}
                          title={KEYWORD_HELP[keyword]}
                          class="px-1.5 py-0.5 text-[11px] font-mono border transition-colors {values.includes(keyword)
                            ? keyword.startsWith("'unsafe")
                              ? 'border-(--color-error-border) bg-(--color-error-bg) text-(--color-error-text)'
                              : 'border-(--color-text) bg-(--color-text) text-(--color-btn-text)'
                            : 'border-(--color-border) text-(--color-text-muted) hover:border-(--color-text-light)'}"
                        >
                          {keyword}
                        </button>
                      {/each}
                      {#each ["https:", "data:", "blob:"] as scheme (scheme)}
                        <button
                          onclick={() => toggleValue(directive.name, scheme)}
                          class="px-1.5 py-0.5 text-[11px] font-mono border transition-colors {values.includes(scheme)
                            ? 'border-(--color-text) bg-(--color-text) text-(--color-btn-text)'
                            : 'border-(--color-border) text-(--color-text-muted) hover:border-(--color-text-light)'}"
                        >
                          {scheme}
                        </button>
                      {/each}
                    </div>
                  {:else if directive.kind === "sandbox"}
                    <div class="flex flex-wrap gap-1">
                      {#each SANDBOX_TOKENS as token (token)}
                        <button
                          onclick={() => toggleValue(directive.name, token)}
                          class="px-1.5 py-0.5 text-[11px] font-mono border transition-colors {values.includes(token)
                            ? 'border-(--color-text) bg-(--color-text) text-(--color-btn-text)'
                            : 'border-(--color-border) text-(--color-text-muted) hover:border-(--color-text-light)'}"
                        >
                          {token}
                        </button>
                      {/each}
                    </div>
                  {/if}

                  {#if values.filter((value) => !KEYWORDS.includes(value) && !["https:", "data:", "blob:"].includes(value) && !SANDBOX_TOKENS.includes(value)).length}
                    <div class="flex flex-wrap gap-1">
                      {#each values.filter((value) => !KEYWORDS.includes(value) && !["https:", "data:", "blob:"].includes(value) && !SANDBOX_TOKENS.includes(value)) as value (value)}
                        <span class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-mono border border-(--color-border) bg-(--color-bg) text-(--color-text)">
                          <span class="max-w-72 truncate" title={value}>{value}</span>
                          <button onclick={() => removeValue(directive.name, value)} aria-label="Remove {value}" class="text-(--color-text-light) hover:text-(--color-error-text)">×</button>
                        </span>
                      {/each}
                    </div>
                  {/if}

                  {#if directive.kind !== "sandbox"}
                    <div class="flex gap-2">
                      <input
                        type="text"
                        bind:value={customSource[directive.name]}
                        onkeydown={(event) => {
                          if (event.key === "Enter") addCustom(directive.name);
                        }}
                        placeholder={directive.kind === "source" ? "https://cdn.example.com *.example.com" : directive.kind === "uri" ? "/csp-report" : "value"}
                        spellcheck="false"
                        class="flex-1 px-2 py-1 text-xs font-mono border border-(--color-border) bg-(--color-bg) text-(--color-text) outline-none focus:border-(--color-text-light)"
                      />
                      <button
                        onclick={() => addCustom(directive.name)}
                        class="px-2 py-1 text-xs border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:border-(--color-text-light) transition-colors"
                      >
                        Add
                      </button>
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>

      <div class="xl:sticky xl:top-2 self-start space-y-4">
        <div class="border border-(--color-text) bg-(--color-bg-alt)">
          <div class="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-(--color-border)">
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 text-sm font-bold {gradeClass(builtScore.grade)}">{builtScore.grade}</span>
              <span class="text-xs text-(--color-text-muted)">{builtScore.score}/100</span>
            </div>
            <div class="flex items-center gap-3">
              <label class="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" bind:checked={reportOnly} class="w-3.5 h-3.5 accent-(--color-text)" />
                <span class="text-xs text-(--color-text-muted)">Report-Only</span>
              </label>
              <label class="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" bind:checked={multiline} class="w-3.5 h-3.5 accent-(--color-text)" />
                <span class="text-xs text-(--color-text-muted)">Multi-line</span>
              </label>
              <button onclick={() => handleCopy(builtText, "policy")} class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors">
                {copiedKey === "policy" ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
          <pre class="px-3 py-2 text-xs font-mono text-(--color-text) whitespace-pre-wrap break-all max-h-60 overflow-auto">{builtText || "(empty policy)"}</pre>
          <div class="px-3 py-1.5 border-t border-(--color-border) text-xs text-(--color-text-light)">
            {builtSingleLine.length} characters ·
            <button onclick={() => { analyzeInput = builtSingleLine; activeTab = "analyze"; }} class="underline hover:text-(--color-text)">Open in analyzer</button>
          </div>
        </div>

        <div class="border border-(--color-border) bg-(--color-bg-alt)">
          <div class="flex items-center justify-between px-3 py-2 border-b border-(--color-border)">
            <select bind:value={snippetIndex} aria-label="Server configuration format" class="px-2 py-1 text-xs bg-(--color-bg) border border-(--color-border) text-(--color-text) outline-none">
              {#each snippets as snippet, index (snippet.label)}
                <option value={index}>{snippet.label}</option>
              {/each}
            </select>
            <button onclick={() => handleCopy(snippets[snippetIndex].code, "snippet")} class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors">
              {copiedKey === "snippet" ? "Copied!" : "Copy"}
            </button>
          </div>
          <pre class="px-3 py-2 text-xs font-mono text-(--color-text) whitespace-pre-wrap break-all max-h-48 overflow-auto">{snippets[snippetIndex].code}</pre>
          {#if builtSingleLine.includes("'nonce-")}
            <p class="px-3 pb-2 text-xs text-(--color-error-text)">⚠ Nonces must be freshly generated for every response — don't hard-code this value.</p>
          {/if}
        </div>

        <div class="border border-(--color-border) bg-(--color-bg-alt) px-3 py-2">
          <h3 class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2">Analysis</h3>
          {@render findingsList(builtFindings)}
        </div>
      </div>
    </div>
  {:else if activeTab === "analyze"}
    <div class="max-w-4xl">
      <label for="csp-analyze" class="block text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2">
        Policy, header line, or &lt;meta&gt; tag
      </label>
      <textarea
        id="csp-analyze"
        bind:value={analyzeInput}
        rows="5"
        spellcheck="false"
        placeholder={"Content-Security-Policy: default-src 'self'; script-src 'self' https://cdn.example.com"}
        class="w-full px-3 py-2 font-mono text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) outline-none focus:border-(--color-text-light) resize-y"
      ></textarea>
      <p class="mt-1 mb-4 text-xs text-(--color-text-light)">
        Tip: copy it from DevTools → Network → (document) → Response Headers. The HTTP Client tool can fetch headers from CORS-enabled URLs.
      </p>

      {#if analyzed}
        <div class="flex flex-wrap items-center gap-3 mb-4">
          <span class="px-3 py-1 text-xl font-bold {gradeClass(analyzed.score.grade)}">{analyzed.score.grade}</span>
          <span class="text-sm text-(--color-text-muted)">{analyzed.score.score}/100 · {analyzed.policy.size} directives</span>
          <button
            onclick={() => { loadPolicy(analyzeInput); activeTab = "build"; }}
            class="ml-auto text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            Edit in builder →
          </button>
        </div>

        <div class="border border-(--color-border) bg-(--color-bg-alt) mb-4">
          <table class="w-full text-xs">
            <tbody>
              {#each [...analyzed.policy] as [name, values] (name)}
                <tr class="border-b border-(--color-border) last:border-b-0">
                  <td class="px-3 py-1.5 font-mono text-(--color-text) whitespace-nowrap align-top">{name}</td>
                  <td class="px-3 py-1.5 font-mono break-all">
                    {#each values as value, index (index)}
                      <span class="inline-block mr-1.5 {value.startsWith("'unsafe") || value === '*' ? 'text-(--color-error-text)' : 'text-(--color-text-muted)'}">{value}</span>
                    {:else}
                      <span class="text-(--color-text-light) italic">(no value)</span>
                    {/each}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <h2 class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2">Findings</h2>
        {@render findingsList(analyzed.findings)}
      {/if}
    </div>
  {:else}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl">
      <div>
        <h2 class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2">Inline Script / Style Hash</h2>
        <textarea
          bind:value={hashInput}
          rows="8"
          spellcheck="false"
          aria-label="Inline script content"
          placeholder="Exact content between &lt;script&gt; and &lt;/script&gt;"
          class="w-full px-3 py-2 font-mono text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) outline-none focus:border-(--color-text-light) resize-y"
        ></textarea>
        <div class="flex items-center gap-3 mt-2">
          <select bind:value={hashAlgorithm} aria-label="Hash algorithm" class="px-2 py-1 text-sm bg-(--color-bg) border border-(--color-border) text-(--color-text) outline-none">
            <option value="SHA-256">SHA-256</option>
            <option value="SHA-384">SHA-384</option>
            <option value="SHA-512">SHA-512</option>
          </select>
          <span class="text-xs text-(--color-text-light)">Whitespace matters — hash the exact contents.</span>
        </div>
        {#if hashResult}
          <div class="mt-3 border border-(--color-border) bg-(--color-bg-alt) px-3 py-2">
            <code class="block font-mono text-xs text-(--color-text) break-all">{hashResult}</code>
            <div class="mt-2 flex gap-3">
              <button onclick={() => handleCopy(hashResult, "hash")} class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors">
                {copiedKey === "hash" ? "Copied!" : "Copy"}
              </button>
              <button onclick={() => addToScriptSrc(hashResult)} class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors">
                Add to script-src →
              </button>
            </div>
          </div>
        {/if}
      </div>

      <div>
        <h2 class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2">Nonce</h2>
        <div class="border border-(--color-border) bg-(--color-bg-alt) px-3 py-2">
          <code class="block font-mono text-sm text-(--color-text) break-all">{nonce ? `'nonce-${nonce}'` : "—"}</code>
          <div class="mt-2 flex gap-3">
            <button onclick={refreshNonce} class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors">Regenerate</button>
            <button onclick={() => handleCopy(nonce, "nonce")} class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors">
              {copiedKey === "nonce" ? "Copied!" : "Copy value"}
            </button>
            <button onclick={() => addToScriptSrc(`'nonce-${nonce}'`)} class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors">
              Add to script-src →
            </button>
          </div>
        </div>
        <div class="mt-3 text-xs text-(--color-text-muted) space-y-2">
          <p>Use the same nonce on every trusted script tag in the response:</p>
          <pre class="px-3 py-2 font-mono bg-(--color-bg-alt) border border-(--color-border) text-(--color-text) whitespace-pre-wrap break-all">&lt;script nonce="{nonce}" src="/app.js"&gt;&lt;/script&gt;</pre>
          <p class="text-(--color-error-text)">
            A nonce is only secure if it is unpredictable and regenerated on every page load by your server. This value is for testing only.
          </p>
        </div>
      </div>
    </div>
  {/if}
</div>
