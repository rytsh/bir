<script lang="ts">
  import semver from "semver";

  type Tab = "range" | "compare" | "bump";

  interface VersionRow {
    version: string;
    valid: boolean;
    satisfies: boolean;
    isMax: boolean;
    isMin: boolean;
  }

  const RANGE_EXAMPLES: { range: string; label: string }[] = [
    { range: "^1.2.3", label: "Caret" },
    { range: "~1.2.3", label: "Tilde" },
    { range: "1.x", label: "X-range" },
    { range: ">=1.2.0 <2.0.0", label: "Comparators" },
    { range: "1.2.3 - 2.3.4", label: "Hyphen" },
    { range: "^0.2.3", label: "Caret 0.x" },
    { range: "^1.0.0 || ^2.0.0", label: "Union" },
    { range: ">=3.0.0-beta.1", label: "Prerelease" },
  ];

  const DEFAULT_VERSIONS = [
    "0.9.0", "1.0.0", "1.2.2", "1.2.3", "1.2.4", "1.3.0", "1.9.9", "2.0.0-beta.1", "2.0.0", "2.1.0", "3.0.0-rc.1",
  ].join("\n");

  const RELEASE_TYPES: semver.ReleaseType[] = [
    "major", "minor", "patch", "premajor", "preminor", "prepatch", "prerelease",
  ];

  let activeTab = $state<Tab>("range");

  let range = $state("^1.2.3");
  let versionsInput = $state(DEFAULT_VERSIONS);
  let includePrerelease = $state(false);
  let loose = $state(false);
  let packageName = $state("");
  let fetchState = $state<"idle" | "loading" | "error">("idle");
  let fetchError = $state("");
  let distTags = $state<Record<string, string>>({});
  let hideNonMatching = $state(false);

  let versionA = $state("1.2.3");
  let versionB = $state("1.3.0-beta.2");
  let sortInput = $state("1.10.0\n1.2.0\n1.2.0-alpha\n2.0.0\n1.2.0-beta.11\n1.2.0-beta.2\nv0.9.1");

  let bumpVersion = $state("1.2.3");
  let preid = $state("beta");
  let copiedKey = $state("");

  let options = $derived({ includePrerelease, loose });

  let rangeInfo = $derived.by(() => {
    const trimmed = range.trim();
    if (!trimmed) return { valid: false, normalized: "", explanation: [] as string[], error: "" };
    try {
      const parsed = new semver.Range(trimmed, options);
      const explanation = parsed.set.map((comparators) =>
        comparators
          .map((comparator) => {
            if (comparator.value === "") return "any version";
            const version = comparator.semver.version.replace(/-0$/, "");
            const operator = comparator.operator;
            switch (operator) {
              case ">=":
                return `≥ ${version}`;
              case ">":
                return `> ${version}`;
              case "<=":
                return `≤ ${version}`;
              case "<":
                return `< ${version}`;
              default:
                return `= ${version}`;
            }
          })
          .join(" and "),
      );
      return { valid: true, normalized: parsed.range || "*", explanation, error: "" };
    } catch (e) {
      return { valid: false, normalized: "", explanation: [], error: e instanceof Error ? e.message : "Invalid range" };
    }
  });

  let versionList = $derived(
    versionsInput
      .split(/[\s,]+/)
      .map((version) => version.trim())
      .filter(Boolean),
  );

  let rows = $derived.by((): VersionRow[] => {
    const validVersions = versionList.filter((version) => semver.valid(version, options));
    const max = rangeInfo.valid ? semver.maxSatisfying(validVersions, range, options) : null;
    const min = rangeInfo.valid ? semver.minSatisfying(validVersions, range, options) : null;
    return versionList.map((version) => {
      const valid = semver.valid(version, options) !== null;
      return {
        version,
        valid,
        satisfies: valid && rangeInfo.valid && semver.satisfies(version, range, options),
        isMax: version === max,
        isMin: version === min,
      };
    });
  });

  let matchCount = $derived(rows.filter((row) => row.satisfies).length);
  let visibleRows = $derived(hideNonMatching ? rows.filter((row) => row.satisfies) : rows);

  const fetchPackageVersions = async (): Promise<void> => {
    const name = packageName.trim();
    if (!name) return;
    fetchState = "loading";
    fetchError = "";
    try {
      const encoded = name.startsWith("@") ? `@${encodeURIComponent(name.slice(1))}` : encodeURIComponent(name);
      const response = await fetch(`https://registry.npmjs.org/${encoded}`, {
        headers: { Accept: "application/vnd.npm.install-v1+json" },
      });
      if (response.status === 404) throw new Error(`Package "${name}" not found on npm`);
      if (!response.ok) throw new Error(`Registry returned ${response.status}`);
      const data = (await response.json()) as { versions: Record<string, unknown>; "dist-tags": Record<string, string> };
      const versions = semver.sort(Object.keys(data.versions ?? {}).filter((version) => semver.valid(version)));
      versionsInput = versions.reverse().join("\n");
      distTags = data["dist-tags"] ?? {};
      fetchState = "idle";
    } catch (e) {
      fetchState = "error";
      fetchError = e instanceof Error ? e.message : "Failed to fetch package";
    }
  };

  let comparison = $derived.by(() => {
    const a = semver.parse(versionA.trim(), { loose: true });
    const b = semver.parse(versionB.trim(), { loose: true });
    if (!a || !b) return null;
    const order = semver.compare(a, b);
    return {
      a,
      b,
      order,
      symbol: order < 0 ? "<" : order > 0 ? ">" : "=",
      diff: semver.diff(a, b),
      buildEqual: semver.compareBuild(a, b) === 0,
    };
  });

  let sortedVersions = $derived.by(() => {
    const entries = sortInput
      .split(/[\s,]+/)
      .map((version) => version.trim())
      .filter(Boolean);
    const valid = entries.filter((version) => semver.valid(version, { loose: true }));
    const invalid = entries.filter((version) => !semver.valid(version, { loose: true }));
    return {
      ascending: [...valid].sort((x, y) => semver.compareBuild(x, y, { loose: true })),
      invalid,
    };
  });

  let parsedBump = $derived(semver.parse(bumpVersion.trim(), { loose: true }));

  let bumps = $derived.by(() => {
    if (!parsedBump) return [];
    return RELEASE_TYPES.map((type) => ({
      type,
      result: semver.inc(parsedBump!.version, type, preid.trim() || undefined) ?? "—",
    }));
  });

  let coerced = $derived(bumpVersion.trim() && !parsedBump ? semver.coerce(bumpVersion.trim())?.version : null);

  const handleCopy = (value: string, key: string): void => {
    navigator.clipboard.writeText(value);
    copiedKey = key;
    setTimeout(() => {
      if (copiedKey === key) copiedKey = "";
    }, 2000);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "range", label: "Range Checker" },
    { id: "compare", label: "Compare & Sort" },
    { id: "bump", label: "Parse & Bump" },
  ];

  const inputClass =
    "w-full px-3 py-2 font-mono text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) outline-none focus:border-(--color-text-light)";
  const labelClass = "block text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2";
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Check which versions satisfy a semver range (npm-compatible), explain ranges like ^ and ~, compare and sort versions, and compute the next major / minor / patch / prerelease version.
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

  {#if activeTab === "range"}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div>
        <label for="semver-range" class={labelClass}>Range</label>
        <input id="semver-range" type="text" bind:value={range} spellcheck="false" class="{inputClass} text-base" />
        <div class="mt-2 flex flex-wrap gap-1.5">
          {#each RANGE_EXAMPLES as example (example.range)}
            <button
              onclick={() => (range = example.range)}
              title={example.range}
              class="px-2 py-0.5 text-xs border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:border-(--color-text-light) transition-colors"
            >
              {example.label}
            </button>
          {/each}
        </div>

        <div class="mt-3 flex flex-wrap gap-4">
          <label class="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" bind:checked={includePrerelease} class="w-3.5 h-3.5 accent-(--color-text)" />
            <span class="text-xs text-(--color-text-muted)">Include prereleases</span>
          </label>
          <label class="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" bind:checked={loose} class="w-3.5 h-3.5 accent-(--color-text)" />
            <span class="text-xs text-(--color-text-muted)">Loose parsing</span>
          </label>
        </div>

        <div class="mt-4 border border-(--color-border) bg-(--color-bg-alt)">
          {#if rangeInfo.error}
            <div class="p-3 bg-(--color-error-bg) text-(--color-error-text) text-sm">{rangeInfo.error}</div>
          {:else if rangeInfo.valid}
            <div class="px-4 py-2 border-b border-(--color-border) flex items-center justify-between gap-3">
              <div>
                <div class="text-xs text-(--color-text-light)">Normalized</div>
                <code class="text-sm font-mono text-(--color-text) break-all">{rangeInfo.normalized}</code>
              </div>
              <button
                onclick={() => handleCopy(rangeInfo.normalized, "normalized")}
                class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              >
                {copiedKey === "normalized" ? "Copied!" : "Copy"}
              </button>
            </div>
            <div class="px-4 py-2">
              <div class="text-xs text-(--color-text-light) mb-1">Matches versions that are</div>
              {#each rangeInfo.explanation as clause, index (index)}
                {#if index > 0}
                  <div class="text-xs font-medium text-(--color-text-light) my-0.5">OR</div>
                {/if}
                <div class="text-sm text-(--color-text)">{clause}</div>
              {/each}
            </div>
          {/if}
        </div>

        <div class="mt-4 text-xs text-(--color-text-light) space-y-1">
          <p><code class="font-mono">^1.2.3</code> allows changes that don't modify the left-most non-zero digit (<code class="font-mono">^0.2.3</code> → <code class="font-mono">&lt;0.3.0</code>).</p>
          <p><code class="font-mono">~1.2.3</code> allows patch-level changes only.</p>
          <p>Prereleases only match if the range has a prerelease on the same <code class="font-mono">major.minor.patch</code>, unless "Include prereleases" is checked.</p>
        </div>
      </div>

      <div class="flex flex-col min-h-[320px]">
        <span class={labelClass}>Versions</span>
        <div class="flex gap-2 mb-2">
          <input
            type="text"
            bind:value={packageName}
            onkeydown={(event) => {
              if (event.key === "Enter") fetchPackageVersions();
            }}
            placeholder="npm package name, e.g. react or @scope/pkg"
            spellcheck="false"
            class={inputClass}
          />
          <button
            onclick={fetchPackageVersions}
            disabled={fetchState === "loading" || !packageName.trim()}
            class="px-4 py-1 text-sm font-medium bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {fetchState === "loading" ? "Loading…" : "Fetch from npm"}
          </button>
        </div>
        {#if fetchState === "error"}
          <p class="mb-2 text-xs text-(--color-error-text)">{fetchError}</p>
        {/if}
        {#if Object.keys(distTags).length > 0}
          <div class="mb-2 flex flex-wrap gap-2">
            {#each Object.entries(distTags) as [tag, version] (tag)}
              <span class="px-2 py-0.5 text-xs border border-(--color-border) text-(--color-text-muted)">
                {tag}: <span class="font-mono text-(--color-text)">{version}</span>
              </span>
            {/each}
          </div>
        {/if}

        <div class="grid grid-cols-2 gap-3 flex-1 min-h-0">
          <textarea
            bind:value={versionsInput}
            spellcheck="false"
            aria-label="Versions, one per line"
            placeholder="One version per line"
            class="w-full h-full min-h-[240px] px-3 py-2 font-mono text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) outline-none focus:border-(--color-text-light) resize-none"
          ></textarea>
          <div class="flex flex-col min-h-0 border border-(--color-border) bg-(--color-bg-alt)">
            <div class="flex items-center justify-between px-3 py-1.5 border-b border-(--color-border)">
              <span class="text-xs text-(--color-text-muted)">{matchCount} / {versionList.length} match</span>
              <label class="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" bind:checked={hideNonMatching} class="w-3 h-3 accent-(--color-text)" />
                <span class="text-xs text-(--color-text-light)">Only matches</span>
              </label>
            </div>
            <ul class="flex-1 overflow-y-auto max-h-[420px]">
              {#each visibleRows as row, index (index)}
                <li
                  class="flex items-center gap-2 px-3 py-0.5 text-xs font-mono {row.satisfies
                    ? 'text-(--color-diff-added-text) bg-(--color-diff-added-bg)'
                    : row.valid
                      ? 'text-(--color-text-light)'
                      : 'text-(--color-error-text) line-through'}"
                >
                  <span class="w-3">{row.satisfies ? "✓" : row.valid ? "·" : "✗"}</span>
                  <span class="flex-1 truncate">{row.version}</span>
                  {#if row.isMax}<span class="font-sans font-medium">max</span>{/if}
                  {#if row.isMin && !row.isMax}<span class="font-sans font-medium">min</span>{/if}
                </li>
              {/each}
            </ul>
          </div>
        </div>
      </div>
    </div>
  {:else if activeTab === "compare"}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div>
        <div class="grid grid-cols-[1fr_auto_1fr] gap-3 items-end mb-4">
          <label class="block">
            <span class={labelClass}>Version A</span>
            <input type="text" bind:value={versionA} spellcheck="false" class="{inputClass} text-base" />
          </label>
          <div class="pb-2 text-2xl font-mono text-(--color-text) w-8 text-center">{comparison?.symbol ?? "?"}</div>
          <label class="block">
            <span class={labelClass}>Version B</span>
            <input type="text" bind:value={versionB} spellcheck="false" class="{inputClass} text-base" />
          </label>
        </div>
        {#if comparison}
          <div class="border border-(--color-border) bg-(--color-bg-alt) divide-y divide-(--color-border)">
            <div class="flex justify-between px-4 py-2 text-sm">
              <span class="text-(--color-text-muted)">Result</span>
              <span class="font-mono text-(--color-text)">
                {comparison.a.version} {comparison.symbol} {comparison.b.version}
              </span>
            </div>
            <div class="flex justify-between px-4 py-2 text-sm">
              <span class="text-(--color-text-muted)">Difference</span>
              <span class="font-mono text-(--color-text)">{comparison.diff ?? "none (equal)"}</span>
            </div>
            <div class="flex justify-between px-4 py-2 text-sm">
              <span class="text-(--color-text-muted)">Newer</span>
              <span class="font-mono text-(--color-text)">
                {comparison.order === 0 ? "—" : comparison.order > 0 ? "A" : "B"}
              </span>
            </div>
            {#if comparison.order === 0 && !comparison.buildEqual}
              <div class="px-4 py-2 text-xs text-(--color-text-light)">
                Build metadata differs but is ignored for precedence.
              </div>
            {/if}
          </div>
        {:else}
          <p class="text-sm text-(--color-error-text)">Enter two valid semantic versions.</p>
        {/if}
      </div>

      <div>
        <span class={labelClass}>Sort Versions</span>
        <div class="grid grid-cols-2 gap-3">
          <textarea
            bind:value={sortInput}
            spellcheck="false"
            aria-label="Versions to sort"
            rows="12"
            class="w-full px-3 py-2 font-mono text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) outline-none focus:border-(--color-text-light) resize-none"
          ></textarea>
          <div class="border border-(--color-border) bg-(--color-bg-alt) flex flex-col">
            <div class="flex items-center justify-between px-3 py-1.5 border-b border-(--color-border)">
              <span class="text-xs text-(--color-text-muted)">Ascending</span>
              <div class="flex gap-3">
                <button
                  onclick={() => (sortInput = [...sortedVersions.ascending].reverse().join("\n"))}
                  class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
                >
                  Apply desc
                </button>
                <button
                  onclick={() => handleCopy(sortedVersions.ascending.join("\n"), "sorted")}
                  class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
                >
                  {copiedKey === "sorted" ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
            <ol class="flex-1 overflow-y-auto px-3 py-1 text-xs font-mono text-(--color-text)">
              {#each sortedVersions.ascending as version, index (index)}
                <li>{version}</li>
              {/each}
              {#each sortedVersions.invalid as version, index (index)}
                <li class="text-(--color-error-text) line-through">{version}</li>
              {/each}
            </ol>
          </div>
        </div>
        <p class="mt-2 text-xs text-(--color-text-light)">
          Prereleases sort before their release (1.2.0-beta.2 &lt; 1.2.0-beta.11 &lt; 1.2.0). Leading "v" is accepted.
        </p>
      </div>
    </div>
  {:else}
    <div class="max-w-3xl">
      <div class="grid grid-cols-1 sm:grid-cols-[1fr_12rem] gap-4 mb-4">
        <label class="block">
          <span class={labelClass}>Version</span>
          <input type="text" bind:value={bumpVersion} spellcheck="false" class="{inputClass} text-base" />
        </label>
        <label class="block">
          <span class={labelClass}>Prerelease ID</span>
          <input type="text" bind:value={preid} spellcheck="false" placeholder="beta, rc, alpha…" class="{inputClass} text-base" />
        </label>
      </div>

      {#if parsedBump}
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
          {#each [
            { label: "Major", value: String(parsedBump.major) },
            { label: "Minor", value: String(parsedBump.minor) },
            { label: "Patch", value: String(parsedBump.patch) },
            { label: "Prerelease", value: parsedBump.prerelease.join(".") || "—" },
            { label: "Build", value: parsedBump.build.join(".") || "—" },
          ] as part (part.label)}
            <div class="border border-(--color-border) bg-(--color-bg-alt) px-3 py-2">
              <div class="text-xs text-(--color-text-light)">{part.label}</div>
              <div class="font-mono text-lg text-(--color-text) truncate">{part.value}</div>
            </div>
          {/each}
        </div>

        <div class="border border-(--color-border) bg-(--color-bg-alt) divide-y divide-(--color-border)">
          {#each bumps as bump (bump.type)}
            <div class="grid grid-cols-[8rem_1fr_auto] gap-3 px-4 py-2 items-center">
              <span class="text-sm text-(--color-text-muted)">{bump.type}</span>
              <code class="font-mono text-sm text-(--color-text)">{bump.result}</code>
              <button
                onclick={() => handleCopy(bump.result, bump.type)}
                class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              >
                {copiedKey === bump.type ? "Copied!" : "Copy"}
              </button>
            </div>
          {/each}
        </div>
      {:else if bumpVersion.trim()}
        <div class="p-3 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm">
          Not a valid semantic version.
          {#if coerced}
            Did you mean
            <button class="underline font-mono" onclick={() => (bumpVersion = coerced!)}>{coerced}</button>?
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>
