<script lang="ts">
  import {
    cleanText,
    computeStats,
    escapeString,
    findIssues,
    inspectChars,
    type CharCategory,
    type CharInfo,
    type CleanOptions,
  } from "../../lib/stringInspect.js";

  type EscapeStyle = "js" | "python" | "html" | "css" | "url";

  const MAX_TABLE_ROWS = 2000;

  const SAMPLE = [
    "\uFEFFpassword\u200B = \u201Cs3cr\u0435t\u201D\u00A0\u2014 cafe\u0301 ",
    String.fromCodePoint(0x202e),
    "evil.exe",
    String.fromCodePoint(0x202c),
    " ",
    String.fromCodePoint(0x1f469, 0x1f3fd, 0x200d, 0x1f4bb),
    "\r\nnext line \n",
  ].join("");

  const CATEGORY_STYLES: Record<CharCategory, string> = {
    letter: "text-(--color-text)",
    digit: "text-(--color-text)",
    space: "text-(--color-text-light)",
    punctuation: "text-(--color-text)",
    symbol: "text-(--color-text)",
    emoji: "text-(--color-text)",
    control: "bg-(--color-diff-removed-bg) text-(--color-diff-removed-text)",
    invisible: "bg-(--color-diff-removed-bg) text-(--color-diff-removed-text)",
    combining: "text-(--color-text-muted)",
    other: "text-(--color-text)",
  };

  const SEVERITY_STYLES = {
    danger: "border-(--color-error-border) bg-(--color-error-bg) text-(--color-error-text)",
    warning: "border-(--color-border) bg-(--color-bg-alt) text-(--color-text)",
    info: "border-(--color-border) bg-(--color-bg-alt) text-(--color-text-muted)",
  };

  let input = $state(SAMPLE);
  let showOnlySuspicious = $state(false);
  let selected = $state<CharInfo | null>(null);
  let escapeStyle = $state<EscapeStyle>("js");
  let copiedKey = $state("");
  let cleanOptions = $state<CleanOptions>({
    removeInvisible: true,
    normalizeSpaces: true,
    replaceSmartPunctuation: false,
    replaceHomoglyphs: false,
    removeControl: true,
    trimTrailing: false,
    normalizeLineEndings: false,
    normalization: "NFC",
  });

  let chars = $derived(inspectChars(input));
  let stats = $derived(computeStats(input));
  let findings = $derived(findIssues(input, chars, stats));
  let suspiciousCount = $derived(chars.filter((info) => info.suspicious).length);
  let tableRows = $derived(
    (showOnlySuspicious ? chars.filter((info) => info.suspicious) : chars).slice(0, MAX_TABLE_ROWS),
  );
  let cleaned = $derived(cleanText(input, cleanOptions));
  let cleanedDiff = $derived(input.length - cleaned.length);
  let escaped = $derived(escapeString(input, escapeStyle));

  const toBytesHex = (bytes: number[]): string =>
    bytes.map((byte) => byte.toString(16).toUpperCase().padStart(2, "0")).join(" ");

  const handleCopy = (value: string, key: string): void => {
    navigator.clipboard.writeText(value);
    copiedKey = key;
    setTimeout(() => {
      if (copiedKey === key) copiedKey = "";
    }, 2000);
  };

  const handlePaste = async (): Promise<void> => {
    input = await navigator.clipboard.readText();
  };

  const formatNumber = (value: number): string => value.toLocaleString();

  const statItems = $derived([
    { label: "Characters (graphemes)", value: formatNumber(stats.graphemes) },
    { label: "Code points", value: formatNumber(stats.codePoints) },
    { label: "JS length (UTF-16)", value: formatNumber(stats.utf16Length) },
    { label: "UTF-8 bytes", value: formatNumber(stats.utf8Bytes) },
    { label: "UTF-16 bytes", value: formatNumber(stats.utf16Bytes) },
    { label: "Words", value: formatNumber(stats.words) },
    { label: "Lines", value: formatNumber(stats.lines) },
    { label: "Non-ASCII", value: formatNumber(stats.nonAscii) },
  ]);

  const cleanToggles: { key: Exclude<keyof CleanOptions, "normalization">; label: string }[] = [
    { key: "removeInvisible", label: "Remove invisible (ZW, BOM, bidi, tags)" },
    { key: "normalizeSpaces", label: "Unusual spaces → space" },
    { key: "removeControl", label: "Remove control chars" },
    { key: "replaceSmartPunctuation", label: "Smart quotes/dashes → ASCII" },
    { key: "replaceHomoglyphs", label: "Homoglyphs → Latin" },
    { key: "trimTrailing", label: "Trim trailing whitespace" },
    { key: "normalizeLineEndings", label: "Line endings → LF" },
  ];
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Reveal hidden and confusing characters in text: zero-width spaces, BOM, bidirectional overrides (Trojan Source), homoglyphs, non-breaking spaces, smart quotes, and control characters. Shows code points, UTF-8/UTF-16 bytes, length metrics, and cleans or escapes the text.
    </p>
  </header>

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
    <div class="flex flex-col">
      <div class="flex justify-between items-center mb-2">
        <label for="string-input" class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Input</label>
        <div class="flex gap-3">
          <button onclick={() => (input = SAMPLE)} class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors">Sample</button>
          <button onclick={handlePaste} class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors">Paste</button>
          <button onclick={() => (input = "")} class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors">Clear</button>
        </div>
      </div>
      <textarea
        id="string-input"
        bind:value={input}
        rows="7"
        spellcheck="false"
        placeholder="Paste text to inspect..."
        class="w-full flex-1 px-3 py-2 font-mono text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) outline-none focus:border-(--color-text-light) resize-y"
      ></textarea>
    </div>

    <div class="flex flex-col">
      <div class="flex justify-between items-center mb-2">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">
          Revealed {#if suspiciousCount}<span class="normal-case text-(--color-error-text)">· {suspiciousCount} hidden/suspicious</span>{/if}
        </span>
        <span class="text-xs text-(--color-text-light)">Click a character for details</span>
      </div>
      <div
        class="flex-1 min-h-[150px] max-h-80 overflow-auto px-3 py-2 font-mono text-sm border border-(--color-border) bg-(--color-bg-alt) whitespace-pre-wrap break-all leading-relaxed"
      >
        {#each chars.slice(0, 20000) as info (info.index)}<button
            type="button"
            onclick={() => (selected = info)}
            title="{info.hex} {info.name}"
            class="inline rounded-sm {CATEGORY_STYLES[info.category]} {info.suspicious && info.category === 'letter'
              ? 'bg-(--color-diff-removed-bg) text-(--color-diff-removed-text) underline decoration-wavy'
              : ''} {info.suspicious && info.category === 'space' ? 'bg-(--color-diff-removed-bg) text-(--color-diff-removed-text)' : ''} {info.category === 'invisible' || info.category === 'control' || (info.category === 'space' && info.codePoint !== 0x20)
              ? 'text-[10px] px-0.5 mx-px align-middle'
              : ''} {selected?.index === info.index ? 'outline outline-1 outline-(--color-text)' : ''}"
          >{info.display}</button>{#if info.codePoint === 0x0a}<br />{/if}{/each}
        {#if chars.length > 20000}
          <span class="text-(--color-text-light)">… truncated</span>
        {/if}
      </div>
    </div>
  </div>

  {#if selected}
    <div class="mb-4 border border-(--color-text) bg-(--color-bg-alt) px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
      <span class="text-3xl font-mono min-w-10 text-center text-(--color-text)">{selected.category === "invisible" || selected.category === "control" ? "∅" : selected.char}</span>
      <div>
        <div class="font-mono text-sm text-(--color-text)">{selected.hex}</div>
        <div class="text-xs text-(--color-text-muted)">{selected.name || selected.category}</div>
      </div>
      <div class="text-xs"><span class="text-(--color-text-light)">Category</span> <span class="text-(--color-text)">{selected.category}</span></div>
      <div class="text-xs"><span class="text-(--color-text-light)">UTF-8</span> <span class="font-mono text-(--color-text)">{toBytesHex(selected.utf8)}</span></div>
      <div class="text-xs"><span class="text-(--color-text-light)">UTF-16</span> <span class="font-mono text-(--color-text)">{selected.utf16.map((unit) => unit.toString(16).toUpperCase().padStart(4, "0")).join(" ")}</span></div>
      <div class="text-xs"><span class="text-(--color-text-light)">Decimal</span> <span class="font-mono text-(--color-text)">{selected.codePoint}</span></div>
      <div class="text-xs"><span class="text-(--color-text-light)">Index</span> <span class="font-mono text-(--color-text)">{selected.index}</span></div>
      <button onclick={() => (selected = null)} class="ml-auto text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors">Close</button>
    </div>
  {/if}

  <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 mb-4">
    {#each statItems as item (item.label)}
      <div class="border border-(--color-border) bg-(--color-bg-alt) px-3 py-2">
        <div class="text-[11px] text-(--color-text-light) truncate" title={item.label}>{item.label}</div>
        <div class="font-mono text-lg text-(--color-text)">{item.value}</div>
      </div>
    {/each}
  </div>

  <div class="flex flex-wrap gap-2 mb-4 text-xs">
    <span class="px-2 py-0.5 border border-(--color-border) text-(--color-text-muted)">{stats.isAscii ? "ASCII only" : "Contains Unicode"}</span>
    <span class="px-2 py-0.5 border border-(--color-border) text-(--color-text-muted)">NFC: {stats.isNfc ? "yes" : "no"}</span>
    <span class="px-2 py-0.5 border border-(--color-border) text-(--color-text-muted)">NFKC: {stats.isNfkc ? "yes" : "no"}</span>
    {#if stats.lineEndings.lf + stats.lineEndings.crlf + stats.lineEndings.cr > 0}
      <span class="px-2 py-0.5 border border-(--color-border) text-(--color-text-muted)">
        Line endings: {[
          stats.lineEndings.lf && `LF ×${stats.lineEndings.lf}`,
          stats.lineEndings.crlf && `CRLF ×${stats.lineEndings.crlf}`,
          stats.lineEndings.cr && `CR ×${stats.lineEndings.cr}`,
        ].filter(Boolean).join(", ")}
      </span>
    {/if}
    {#if stats.scripts.length}
      <span class="px-2 py-0.5 border border-(--color-border) text-(--color-text-muted)">Scripts: {stats.scripts.join(", ")}</span>
    {/if}
  </div>

  <h2 class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2">Findings</h2>
  {#if findings.length === 0}
    <div class="mb-4 p-3 bg-(--color-diff-added-bg) text-(--color-diff-added-text) text-sm">
      {input ? "✓ No hidden or suspicious characters found." : "Paste some text to inspect."}
    </div>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
      {#each findings as finding (finding.label)}
        <div class="border px-3 py-2 {SEVERITY_STYLES[finding.severity]}">
          <div class="flex items-baseline justify-between gap-2">
            <span class="text-sm font-medium">{finding.severity === "danger" ? "⚠ " : ""}{finding.label}</span>
            <span class="font-mono text-xs">×{finding.count}</span>
          </div>
          <p class="text-xs text-(--color-text-muted) mt-0.5">{finding.description}</p>
        </div>
      {/each}
    </div>
  {/if}

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
    <div class="border border-(--color-border) bg-(--color-bg-alt) flex flex-col">
      <div class="flex items-center justify-between px-3 py-2 border-b border-(--color-border)">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">
          Clean {#if cleanedDiff !== 0 || cleaned !== input}<span class="normal-case">· {cleaned === input ? "no changes" : `${Math.abs(cleanedDiff)} chars ${cleanedDiff >= 0 ? "removed" : "added"}`}</span>{/if}
        </span>
        <div class="flex gap-3">
          <button onclick={() => (input = cleaned)} class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors">Apply to input</button>
          <button onclick={() => handleCopy(cleaned, "clean")} class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors">
            {copiedKey === "clean" ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
      <div class="px-3 py-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 border-b border-(--color-border)">
        {#each cleanToggles as toggle (toggle.key)}
          <label class="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" bind:checked={cleanOptions[toggle.key]} class="w-3.5 h-3.5 accent-(--color-text)" />
            <span class="text-xs text-(--color-text-muted)">{toggle.label}</span>
          </label>
        {/each}
        <label class="flex items-center gap-1.5">
          <span class="text-xs text-(--color-text-muted)">Normalize</span>
          <select bind:value={cleanOptions.normalization} class="px-1 py-0.5 text-xs bg-(--color-bg) border border-(--color-border) text-(--color-text) outline-none">
            <option value="none">None</option>
            <option value="NFC">NFC</option>
            <option value="NFKC">NFKC</option>
          </select>
        </label>
      </div>
      <pre class="px-3 py-2 text-xs font-mono text-(--color-text) whitespace-pre-wrap break-all max-h-48 overflow-auto">{cleaned}</pre>
    </div>

    <div class="border border-(--color-border) bg-(--color-bg-alt) flex flex-col">
      <div class="flex items-center justify-between px-3 py-2 border-b border-(--color-border)">
        <div class="flex items-center gap-2">
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Escape as</span>
          <select bind:value={escapeStyle} class="px-1 py-0.5 text-xs bg-(--color-bg) border border-(--color-border) text-(--color-text) outline-none">
            <option value="js">JavaScript / JSON</option>
            <option value="python">Python</option>
            <option value="html">HTML entities</option>
            <option value="css">CSS</option>
            <option value="url">URL (percent)</option>
          </select>
        </div>
        <button onclick={() => handleCopy(escaped, "escape")} class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors">
          {copiedKey === "escape" ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre class="px-3 py-2 text-xs font-mono text-(--color-text) whitespace-pre-wrap break-all max-h-60 overflow-auto">{escaped}</pre>
    </div>
  </div>

  <div class="flex items-center justify-between mb-2">
    <h2 class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Code Points</h2>
    <label class="flex items-center gap-1.5 cursor-pointer">
      <input type="checkbox" bind:checked={showOnlySuspicious} class="w-3.5 h-3.5 accent-(--color-text)" />
      <span class="text-xs text-(--color-text-muted)">Only hidden / suspicious</span>
    </label>
  </div>
  <div class="border border-(--color-border) bg-(--color-bg-alt) overflow-auto max-h-[480px]">
    <table class="w-full text-xs">
      <thead class="sticky top-0 bg-(--color-bg-alt)">
        <tr class="border-b border-(--color-border) text-(--color-text-light) uppercase tracking-wider">
          <th class="px-3 py-1.5 text-left font-medium">#</th>
          <th class="px-3 py-1.5 text-left font-medium">Char</th>
          <th class="px-3 py-1.5 text-left font-medium">Code Point</th>
          <th class="px-3 py-1.5 text-left font-medium">Name / Category</th>
          <th class="px-3 py-1.5 text-left font-medium">UTF-8</th>
          <th class="px-3 py-1.5 text-left font-medium">UTF-16</th>
        </tr>
      </thead>
      <tbody>
        {#each tableRows as info (info.index)}
          <tr
            onclick={() => (selected = info)}
            class="border-b border-(--color-border) last:border-b-0 cursor-pointer hover:bg-(--color-bg) {info.suspicious ? 'bg-(--color-error-bg)' : ''}"
          >
            <td class="px-3 py-1 font-mono text-(--color-text-light)">{info.index}</td>
            <td class="px-3 py-1 font-mono text-sm text-(--color-text)">{info.display}</td>
            <td class="px-3 py-1 font-mono text-(--color-text)">{info.hex}</td>
            <td class="px-3 py-1 {info.suspicious ? 'text-(--color-error-text)' : 'text-(--color-text-muted)'}">{info.name || info.category}</td>
            <td class="px-3 py-1 font-mono text-(--color-text-muted)">{toBytesHex(info.utf8)}</td>
            <td class="px-3 py-1 font-mono text-(--color-text-muted)">{info.utf16.map((unit) => unit.toString(16).toUpperCase().padStart(4, "0")).join(" ")}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    {#if (showOnlySuspicious ? suspiciousCount : chars.length) > MAX_TABLE_ROWS}
      <p class="px-3 py-2 text-xs text-(--color-text-light)">Showing first {MAX_TABLE_ROWS} rows.</p>
    {/if}
  </div>
</div>
