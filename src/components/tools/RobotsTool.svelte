<script lang="ts">
  import {
    KNOWN_BOTS,
    buildRobots,
    isAllowed,
    parseRobots,
    type BotDef,
    type BuilderGroup,
  } from "../../lib/robots.js";

  type Tab = "build" | "test";

  interface Preset {
    id: string;
    label: string;
    description: string;
    apply: () => void;
  }

  const AI_TRAINING_BOTS = KNOWN_BOTS.filter(
    (bot) => bot.category === "ai" && !["OAI-SearchBot", "ChatGPT-User", "Claude-SearchBot", "Claude-User", "PerplexityBot"].includes(bot.token),
  ).map((bot) => bot.token);
  const ALL_AI_BOTS = KNOWN_BOTS.filter((bot) => bot.category === "ai").map((bot) => bot.token);
  const SEO_BOTS = KNOWN_BOTS.filter((bot) => bot.category === "seo").map((bot) => bot.token);

  let nextId = 1;
  const group = (userAgents: string[], rules: BuilderGroup["rules"], comment = "", crawlDelay = ""): BuilderGroup => ({
    id: nextId++,
    userAgents,
    rules,
    crawlDelay,
    comment,
  });

  let activeTab = $state<Tab>("build");
  let groups = $state<BuilderGroup[]>([
    group(["*"], [
      { type: "disallow", path: "/admin/" },
      { type: "disallow", path: "/api/" },
      { type: "allow", path: "/api/public/" },
    ]),
  ]);
  let sitemaps = $state<string[]>(["https://example.com/sitemap.xml"]);
  let headerComment = $state("");
  let agentDraft = $state<Record<number, string>>({});
  let copied = $state(false);

  let testInput = $state("");
  let testUrls = $state("/\n/admin/settings\n/api/public/status\n/blog/post-1\n/files/report.pdf");
  let customAgent = $state("");
  let selectedCategories = $state<Record<BotDef["category"], boolean>>({ search: true, ai: true, seo: false, social: false, other: false });
  let fetchUrl = $state("");
  let fetchState = $state<"idle" | "loading" | "error">("idle");
  let fetchError = $state("");

  let output = $derived(buildRobots(groups, sitemaps, headerComment));
  let builtParsed = $derived(parseRobots(output));

  const PRESETS: Preset[] = [
    {
      id: "allow-all",
      label: "Allow everything",
      description: "Let all crawlers index the whole site.",
      apply: () => {
        groups = [group(["*"], [{ type: "allow", path: "/" }])];
      },
    },
    {
      id: "block-all",
      label: "Block everything",
      description: "Staging / private sites. Does not remove already-indexed pages.",
      apply: () => {
        groups = [group(["*"], [{ type: "disallow", path: "/" }])];
      },
    },
    {
      id: "block-ai-training",
      label: "Block AI training",
      description: "Allow search engines and AI search, block model-training crawlers.",
      apply: () => {
        groups = [
          group(["*"], [{ type: "allow", path: "/" }]),
          group(AI_TRAINING_BOTS, [{ type: "disallow", path: "/" }], "AI model training crawlers"),
        ];
      },
    },
    {
      id: "block-all-ai",
      label: "Block all AI",
      description: "Block AI training, AI search, and AI user agents.",
      apply: () => {
        groups = [
          group(["*"], [{ type: "allow", path: "/" }]),
          group(ALL_AI_BOTS, [{ type: "disallow", path: "/" }], "AI crawlers and assistants"),
        ];
      },
    },
    {
      id: "block-seo",
      label: "Block SEO tools",
      description: "Stop Ahrefs, Semrush, Majestic, and Moz crawlers.",
      apply: () => {
        groups = [
          group(["*"], [{ type: "allow", path: "/" }]),
          group(SEO_BOTS, [{ type: "disallow", path: "/" }], "SEO tool crawlers"),
        ];
      },
    },
    {
      id: "wordpress",
      label: "WordPress",
      description: "Standard WordPress rules.",
      apply: () => {
        groups = [
          group(["*"], [
            { type: "disallow", path: "/wp-admin/" },
            { type: "allow", path: "/wp-admin/admin-ajax.php" },
            { type: "disallow", path: "/?s=" },
            { type: "disallow", path: "/search/" },
          ]),
        ];
        if (!sitemaps.length) sitemaps = ["https://example.com/wp-sitemap.xml"];
      },
    },
    {
      id: "ecommerce",
      label: "E-commerce",
      description: "Block cart, checkout, account, and faceted/sorted URLs.",
      apply: () => {
        groups = [
          group(["*"], [
            { type: "disallow", path: "/cart" },
            { type: "disallow", path: "/checkout" },
            { type: "disallow", path: "/account" },
            { type: "disallow", path: "/*?*sort=" },
            { type: "disallow", path: "/*?*filter=" },
            { type: "disallow", path: "/*?*sessionid=" },
          ]),
        ];
      },
    },
  ];

  const addGroup = (): void => {
    groups = [...groups, group([], [{ type: "disallow", path: "" }])];
  };

  const removeGroup = (id: number): void => {
    groups = groups.filter((item) => item.id !== id);
  };

  const addAgent = (target: BuilderGroup, agent: string): void => {
    const values = agent.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean);
    for (const value of values) {
      if (!target.userAgents.some((existing) => existing.toLowerCase() === value.toLowerCase())) target.userAgents.push(value);
    }
    agentDraft[target.id] = "";
  };

  const addRule = (target: BuilderGroup, type: "allow" | "disallow"): void => {
    target.rules.push({ type, path: "/" });
  };

  const handleCopy = (): void => {
    navigator.clipboard.writeText(output);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  };

  const handleDownload = (): void => {
    const url = URL.createObjectURL(new Blob([output], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "robots.txt";
    link.click();
    URL.revokeObjectURL(url);
  };

  const importToBuilder = (text: string): void => {
    const parsed = parseRobots(text);
    groups = parsed.groups.map((item) =>
      group(
        item.userAgents,
        item.rules.map((rule) => ({ type: rule.type, path: rule.path })),
        "",
        item.crawlDelay !== undefined ? String(item.crawlDelay) : "",
      ),
    );
    sitemaps = parsed.sitemaps;
    activeTab = "build";
  };

  const fetchRobots = async (): Promise<void> => {
    let target = fetchUrl.trim();
    if (!target) return;
    if (!/^https?:\/\//i.test(target)) target = `https://${target}`;
    try {
      const url = new URL(target);
      if (!url.pathname.endsWith("robots.txt")) url.pathname = "/robots.txt";
      target = url.toString();
    } catch {
      fetchState = "error";
      fetchError = "Invalid URL";
      return;
    }
    fetchState = "loading";
    fetchError = "";
    try {
      const response = await fetch(target, { redirect: "follow" });
      if (!response.ok) throw new Error(`HTTP ${response.status}${response.status === 404 ? " — no robots.txt means everything is allowed" : ""}`);
      testInput = await response.text();
      fetchState = "idle";
    } catch (e) {
      fetchState = "error";
      fetchError =
        e instanceof TypeError
          ? `The browser blocked the request (the site does not allow CORS). Open ${target} in a new tab and paste its contents here.`
          : e instanceof Error
            ? e.message
            : "Request failed";
    }
  };

  let testParsed = $derived(parseRobots(testInput));
  let urlList = $derived(testUrls.split("\n").map((value) => value.trim()).filter(Boolean));
  let botsToTest = $derived([
    ...(customAgent.trim() ? [{ token: customAgent.trim(), label: "Custom", category: "other" as const }] : []),
    ...KNOWN_BOTS.filter((bot) => selectedCategories[bot.category]),
  ]);
  let matrix = $derived(
    botsToTest.map((bot) => ({
      bot,
      results: urlList.map((url) => isAllowed(testParsed, bot.token, url)),
    })),
  );

  const ISSUE_STYLES = {
    error: "text-(--color-error-text)",
    warning: "text-(--color-text)",
    info: "text-(--color-text-muted)",
  };

  const CATEGORY_LABELS: Record<BotDef["category"], string> = {
    search: "Search engines",
    ai: "AI crawlers",
    seo: "SEO tools",
    social: "Link previews",
    other: "Other",
  };

  const inputClass =
    "px-2 py-1 text-sm font-mono border border-(--color-border) bg-(--color-bg) text-(--color-text) outline-none focus:border-(--color-text-light)";
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Generate robots.txt with presets (including blocking AI crawlers), validate an existing file, and test which URLs each crawler can access using Google's RFC 9309 matching rules (longest match wins, * and $ wildcards).
    </p>
  </header>

  <div class="mb-4 p-1 bg-(--color-border) inline-flex gap-1 self-start">
    {#each [{ id: "build", label: "Generator" }, { id: "test", label: "Validate & Test" }] as tab (tab.id)}
      <button
        class="px-3 py-1 text-sm font-medium transition-colors {activeTab === tab.id
          ? 'bg-(--color-text) text-(--color-btn-text)'
          : 'text-(--color-text-muted) hover:text-(--color-text)'}"
        onclick={() => (activeTab = tab.id as Tab)}
      >
        {tab.label}
      </button>
    {/each}
  </div>

  {#if activeTab === "build"}
    <div class="mb-4">
      <h2 class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2">Presets</h2>
      <div class="flex flex-wrap gap-2">
        {#each PRESETS as preset (preset.id)}
          <button
            onclick={preset.apply}
            title={preset.description}
            class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:border-(--color-text-light) transition-colors"
          >
            {preset.label}
          </button>
        {/each}
      </div>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-[1fr_minmax(340px,38%)] gap-6">
      <div class="space-y-3">
        {#each groups as item, groupIndex (item.id)}
          <div class="border border-(--color-border) bg-(--color-bg-alt)">
            <div class="flex items-center justify-between px-3 py-2 border-b border-(--color-border)">
              <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Group {groupIndex + 1}</span>
              <button onclick={() => removeGroup(item.id)} class="text-xs text-(--color-text-muted) hover:text-(--color-error-text) transition-colors">Remove</button>
            </div>
            <div class="p-3 space-y-3">
              <div>
                <div class="text-xs text-(--color-text-light) mb-1">User-agents</div>
                <div class="flex flex-wrap gap-1 mb-2">
                  {#each item.userAgents as agent, agentIndex (agent)}
                    <span class="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-mono border border-(--color-border) bg-(--color-bg) text-(--color-text)">
                      {agent}
                      <button onclick={() => item.userAgents.splice(agentIndex, 1)} aria-label="Remove {agent}" class="text-(--color-text-light) hover:text-(--color-error-text)">×</button>
                    </span>
                  {:else}
                    <span class="text-xs text-(--color-error-text)">Add at least one user-agent</span>
                  {/each}
                </div>
                <div class="flex flex-wrap gap-2">
                  <input
                    type="text"
                    bind:value={agentDraft[item.id]}
                    onkeydown={(event) => {
                      if (event.key === "Enter") addAgent(item, agentDraft[item.id] ?? "");
                    }}
                    placeholder="* or Googlebot"
                    list="robots-bot-list"
                    class="{inputClass} flex-1 min-w-40"
                  />
                  <button onclick={() => addAgent(item, agentDraft[item.id] ?? "")} class="px-2 py-1 text-xs border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) transition-colors">Add</button>
                </div>
              </div>

              <div>
                <div class="text-xs text-(--color-text-light) mb-1">Rules</div>
                <div class="space-y-1">
                  {#each item.rules as rule, ruleIndex (ruleIndex)}
                    <div class="flex gap-2">
                      <select bind:value={rule.type} aria-label="Rule type" class="{inputClass} w-28">
                        <option value="disallow">Disallow</option>
                        <option value="allow">Allow</option>
                      </select>
                      <input type="text" bind:value={rule.path} placeholder="/path/ or /*.pdf$" spellcheck="false" aria-label="Path" class="{inputClass} flex-1" />
                      <button onclick={() => item.rules.splice(ruleIndex, 1)} aria-label="Remove rule" class="px-2 text-(--color-text-light) hover:text-(--color-error-text)">×</button>
                    </div>
                  {/each}
                </div>
                <div class="flex gap-3 mt-2">
                  <button onclick={() => addRule(item, "disallow")} class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors">+ Disallow</button>
                  <button onclick={() => addRule(item, "allow")} class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors">+ Allow</button>
                </div>
              </div>

              <div class="flex flex-wrap gap-4">
                <label class="flex items-center gap-2">
                  <span class="text-xs text-(--color-text-light)">Crawl-delay (s)</span>
                  <input type="text" bind:value={item.crawlDelay} placeholder="—" class="{inputClass} w-16" />
                </label>
                <label class="flex items-center gap-2 flex-1 min-w-48">
                  <span class="text-xs text-(--color-text-light)">Comment</span>
                  <input type="text" bind:value={item.comment} class="{inputClass} flex-1 font-sans" />
                </label>
              </div>
            </div>
          </div>
        {/each}

        <button onclick={addGroup} class="w-full py-2 text-sm border border-dashed border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:border-(--color-text-light) transition-colors">
          + Add user-agent group
        </button>

        <div class="border border-(--color-border) bg-(--color-bg-alt) p-3">
          <div class="text-xs text-(--color-text-light) mb-1">Sitemaps</div>
          <div class="space-y-1">
            {#each sitemaps as _, index (index)}
              <div class="flex gap-2">
                <input type="text" bind:value={sitemaps[index]} placeholder="https://example.com/sitemap.xml" spellcheck="false" aria-label="Sitemap URL" class="{inputClass} flex-1" />
                <button onclick={() => sitemaps.splice(index, 1)} aria-label="Remove sitemap" class="px-2 text-(--color-text-light) hover:text-(--color-error-text)">×</button>
              </div>
            {/each}
          </div>
          <button onclick={() => sitemaps.push("")} class="mt-2 text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors">+ Sitemap</button>
          <label class="block mt-3">
            <span class="text-xs text-(--color-text-light)">Header comment</span>
            <textarea bind:value={headerComment} rows="2" class="mt-1 w-full px-2 py-1 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text) outline-none focus:border-(--color-text-light) resize-y"></textarea>
          </label>
        </div>
      </div>

      <div class="xl:sticky xl:top-2 self-start space-y-3">
        <div class="border border-(--color-text) bg-(--color-bg-alt)">
          <div class="flex items-center justify-between px-3 py-2 border-b border-(--color-border)">
            <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">robots.txt</span>
            <div class="flex gap-3">
              <button onclick={() => { testInput = output; activeTab = "test"; }} class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors">Test →</button>
              <button onclick={handleDownload} class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors">Download</button>
              <button onclick={handleCopy} class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors">{copied ? "Copied!" : "Copy"}</button>
            </div>
          </div>
          <pre class="px-3 py-2 text-xs font-mono text-(--color-text) whitespace-pre-wrap break-all max-h-[60vh] overflow-auto">{output}</pre>
        </div>
        {#if builtParsed.issues.some((issue) => issue.severity !== "info")}
          <ul class="space-y-0.5">
            {#each builtParsed.issues.filter((issue) => issue.severity !== "info") as issue, index (index)}
              <li class="text-xs {ISSUE_STYLES[issue.severity]}">{issue.line ? `Line ${issue.line}: ` : ""}{issue.message}</li>
            {/each}
          </ul>
        {/if}
        <p class="text-xs text-(--color-text-light)">
          robots.txt controls crawling, not indexing. Blocked URLs can still appear in search results if linked elsewhere — use <code class="font-mono">noindex</code> for that. It is also not access control: well-behaved bots honor it, others ignore it.
        </p>
      </div>
    </div>
  {:else}
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div>
        <div class="flex gap-2 mb-2">
          <input
            type="text"
            bind:value={fetchUrl}
            onkeydown={(event) => {
              if (event.key === "Enter") fetchRobots();
            }}
            placeholder="example.com"
            spellcheck="false"
            class="{inputClass} flex-1"
          />
          <button
            onclick={fetchRobots}
            disabled={fetchState === "loading" || !fetchUrl.trim()}
            class="px-4 py-1 text-sm font-medium bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50"
          >
            {fetchState === "loading" ? "Fetching…" : "Fetch"}
          </button>
        </div>
        {#if fetchState === "error"}
          <p class="mb-2 text-xs text-(--color-error-text)">{fetchError}</p>
        {/if}
        <div class="flex justify-between items-center mb-2">
          <label for="robots-input" class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">robots.txt content</label>
          <div class="flex gap-3">
            <button onclick={() => importToBuilder(testInput)} disabled={!testInput.trim()} class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors disabled:opacity-50">Edit in generator</button>
            <button onclick={() => (testInput = output)} class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors">Use generated</button>
          </div>
        </div>
        <textarea
          id="robots-input"
          bind:value={testInput}
          rows="14"
          spellcheck="false"
          placeholder={"User-agent: *\nDisallow: /admin/"}
          class="w-full px-3 py-2 font-mono text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) outline-none focus:border-(--color-text-light) resize-y"
        ></textarea>

        {#if testInput.trim()}
          <div class="mt-3 flex flex-wrap gap-2 text-xs">
            <span class="px-2 py-0.5 border border-(--color-border) text-(--color-text-muted)">{testParsed.groups.length} groups</span>
            <span class="px-2 py-0.5 border border-(--color-border) text-(--color-text-muted)">{testParsed.groups.reduce((sum, item) => sum + item.rules.length, 0)} rules</span>
            <span class="px-2 py-0.5 border border-(--color-border) text-(--color-text-muted)">{testParsed.sitemaps.length} sitemaps</span>
          </div>
          <h2 class="mt-3 text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-1">Validation</h2>
          {#if testParsed.issues.length === 0}
            <p class="text-sm text-(--color-diff-added-text)">✓ No issues found.</p>
          {:else}
            <ul class="space-y-0.5">
              {#each testParsed.issues as issue, index (index)}
                <li class="text-xs {ISSUE_STYLES[issue.severity]}">
                  <span class="font-medium uppercase">{issue.severity}</span>
                  {issue.line ? `· line ${issue.line}` : ""} — {issue.message}
                </li>
              {/each}
            </ul>
          {/if}
        {/if}
      </div>

      <div>
        <label for="robots-urls" class="block text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2">URLs or paths to test (one per line)</label>
        <textarea
          id="robots-urls"
          bind:value={testUrls}
          rows="5"
          spellcheck="false"
          class="w-full px-3 py-2 font-mono text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) outline-none focus:border-(--color-text-light) resize-y"
        ></textarea>

        <div class="flex flex-wrap items-center gap-x-4 gap-y-2 my-3">
          {#each Object.keys(CATEGORY_LABELS).filter((key) => key !== "other") as category (category)}
            <label class="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" bind:checked={selectedCategories[category as BotDef["category"]]} class="w-3.5 h-3.5 accent-(--color-text)" />
              <span class="text-xs text-(--color-text-muted)">{CATEGORY_LABELS[category as BotDef["category"]]}</span>
            </label>
          {/each}
          <input type="text" bind:value={customAgent} placeholder="Custom user-agent" list="robots-bot-list" class="{inputClass} text-xs w-40" />
        </div>

        {#if testInput.trim() && urlList.length}
          <div class="border border-(--color-border) bg-(--color-bg-alt) overflow-auto max-h-[60vh]">
            <table class="text-xs w-full">
              <thead class="sticky top-0 bg-(--color-bg-alt) z-10">
                <tr class="border-b border-(--color-border)">
                  <th class="px-2 py-1.5 text-left font-medium text-(--color-text-light) sticky left-0 bg-(--color-bg-alt)">Crawler</th>
                  {#each urlList as url, index (index)}
                    <th class="px-2 py-1.5 text-left font-mono font-normal text-(--color-text-muted) max-w-32 truncate" title={url}>{url}</th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each matrix as row (row.bot.token)}
                  <tr class="border-b border-(--color-border) last:border-b-0">
                    <td class="px-2 py-1 sticky left-0 bg-(--color-bg-alt) whitespace-nowrap">
                      <div class="font-mono text-(--color-text)">{row.bot.token}</div>
                      <div class="text-[10px] text-(--color-text-light)">{row.bot.label}</div>
                    </td>
                    {#each row.results as result, index (index)}
                      <td
                        class="px-2 py-1 whitespace-nowrap {result.allowed
                          ? 'text-(--color-diff-added-text)'
                          : 'bg-(--color-diff-removed-bg) text-(--color-diff-removed-text)'}"
                        title={result.rule
                          ? `Line ${result.rule.line}: ${result.rule.type === "allow" ? "Allow" : "Disallow"}: ${result.rule.path} (group: ${result.matchedAgent})`
                          : result.matchedAgent
                            ? `No matching rule in group "${result.matchedAgent}"`
                            : "No group applies to this crawler"}
                      >
                        {result.allowed ? "✓" : "✗"}
                        {#if result.rule}<span class="text-[10px] font-mono opacity-70">L{result.rule.line}</span>{/if}
                      </td>
                    {/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          <p class="mt-2 text-xs text-(--color-text-light)">Hover a cell to see which rule decided it. /robots.txt itself is always allowed.</p>
        {:else}
          <p class="text-sm text-(--color-text-muted)">Paste or fetch a robots.txt to test URLs.</p>
        {/if}
      </div>
    </div>
  {/if}

  <datalist id="robots-bot-list">
    <option value="*"></option>
    {#each KNOWN_BOTS as bot (bot.token)}
      <option value={bot.token}>{bot.label}</option>
    {/each}
  </datalist>
</div>
