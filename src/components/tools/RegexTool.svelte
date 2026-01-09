<script lang="ts">
  interface Match {
    text: string;
    index: number;
    groups: { [key: string]: string } | undefined;
    captures: string[];
  }

  // State
  let pattern = $state("");
  let testString = $state("Hello World!\nThis is a test string.\nTest 123 and test 456.");
  let flagGlobal = $state(true);
  let flagCaseInsensitive = $state(false);
  let flagMultiline = $state(false);
  let flagDotAll = $state(false);
  let flagUnicode = $state(false);
  let showCheatsheet = $state(false);

  // Common regex patterns for quick reference
  const commonPatterns = [
    { name: "Email", pattern: "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}" },
    { name: "URL", pattern: "https?://[\\w.-]+(?:/[\\w./-]*)?" },
    { name: "Phone (US)", pattern: "\\(?\\d{3}\\)?[-.\\s]?\\d{3}[-.\\s]?\\d{4}" },
    { name: "IPv4", pattern: "\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b" },
    { name: "Date (YYYY-MM-DD)", pattern: "\\d{4}-\\d{2}-\\d{2}" },
    { name: "Time (HH:MM)", pattern: "\\d{2}:\\d{2}(?::\\d{2})?" },
    { name: "Hex Color", pattern: "#(?:[0-9a-fA-F]{3}){1,2}\\b" },
    { name: "Integer", pattern: "-?\\d+" },
    { name: "Decimal", pattern: "-?\\d+\\.\\d+" },
    { name: "Word", pattern: "\\b\\w+\\b" },
    { name: "Whitespace", pattern: "\\s+" },
    { name: "HTML Tag", pattern: "<[^>]+>" },
  ];

  // Cheatsheet data
  const cheatsheet = [
    { category: "Characters", items: [
      { pattern: ".", desc: "Any character except newline" },
      { pattern: "\\d", desc: "Digit [0-9]" },
      { pattern: "\\D", desc: "Non-digit" },
      { pattern: "\\w", desc: "Word character [a-zA-Z0-9_]" },
      { pattern: "\\W", desc: "Non-word character" },
      { pattern: "\\s", desc: "Whitespace" },
      { pattern: "\\S", desc: "Non-whitespace" },
    ]},
    { category: "Anchors", items: [
      { pattern: "^", desc: "Start of string/line" },
      { pattern: "$", desc: "End of string/line" },
      { pattern: "\\b", desc: "Word boundary" },
      { pattern: "\\B", desc: "Non-word boundary" },
    ]},
    { category: "Quantifiers", items: [
      { pattern: "*", desc: "0 or more" },
      { pattern: "+", desc: "1 or more" },
      { pattern: "?", desc: "0 or 1" },
      { pattern: "{n}", desc: "Exactly n" },
      { pattern: "{n,}", desc: "n or more" },
      { pattern: "{n,m}", desc: "Between n and m" },
    ]},
    { category: "Groups", items: [
      { pattern: "(abc)", desc: "Capture group" },
      { pattern: "(?:abc)", desc: "Non-capture group" },
      { pattern: "(?<name>abc)", desc: "Named capture group" },
      { pattern: "(?=abc)", desc: "Positive lookahead" },
      { pattern: "(?!abc)", desc: "Negative lookahead" },
      { pattern: "(?<=abc)", desc: "Positive lookbehind" },
      { pattern: "(?<!abc)", desc: "Negative lookbehind" },
    ]},
    { category: "Character Classes", items: [
      { pattern: "[abc]", desc: "Any of a, b, or c" },
      { pattern: "[^abc]", desc: "Not a, b, or c" },
      { pattern: "[a-z]", desc: "Range a to z" },
      { pattern: "[A-Z]", desc: "Range A to Z" },
      { pattern: "[0-9]", desc: "Range 0 to 9" },
    ]},
    { category: "Special", items: [
      { pattern: "|", desc: "Alternation (or)" },
      { pattern: "\\", desc: "Escape special char" },
    ]},
  ];

  // Helper to escape HTML
  const escapeHtml = (text: string): string => {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;")
      .replace(/\n/g, "<br>");
  };

  // Derived: build flags string
  let flags = $derived(
    (flagGlobal ? "g" : "") +
    (flagCaseInsensitive ? "i" : "") +
    (flagMultiline ? "m" : "") +
    (flagDotAll ? "s" : "") +
    (flagUnicode ? "u" : "")
  );

  // Derived: compile regex and get error
  let regexResult = $derived.by(() => {
    if (!pattern) {
      return { regex: null, error: "" };
    }
    try {
      const re = new RegExp(pattern, flags);
      return { regex: re, error: "" };
    } catch (e) {
      if (e instanceof Error) {
        return { regex: null, error: e.message };
      }
      return { regex: null, error: "Invalid regular expression" };
    }
  });

  // Derived: find matches
  let matches = $derived.by(() => {
    const { regex } = regexResult;
    if (!regex || !testString) {
      return [];
    }

    const foundMatches: Match[] = [];
    
    if (flagGlobal) {
      let match: RegExpExecArray | null;
      // Create a new regex to reset lastIndex
      const re = new RegExp(pattern, flags);
      while ((match = re.exec(testString)) !== null) {
        foundMatches.push({
          text: match[0],
          index: match.index,
          groups: match.groups,
          captures: match.slice(1),
        });
        // Prevent infinite loop on zero-width matches
        if (match[0].length === 0) {
          re.lastIndex++;
        }
        // Safety limit
        if (foundMatches.length > 1000) break;
      }
    } else {
      const match = regex.exec(testString);
      if (match) {
        foundMatches.push({
          text: match[0],
          index: match.index,
          groups: match.groups,
          captures: match.slice(1),
        });
      }
    }
    
    return foundMatches;
  });

  // Derived: highlighted text with matches
  let highlightedHtml = $derived.by(() => {
    if (!regexResult.regex || !testString || matches.length === 0) {
      return escapeHtml(testString);
    }

    // Sort matches by index (should already be sorted, but just in case)
    const sortedMatches = [...matches].sort((a, b) => a.index - b.index);
    
    let result = "";
    let lastIndex = 0;
    
    for (const match of sortedMatches) {
      // Add text before this match
      result += escapeHtml(testString.slice(lastIndex, match.index));
      // Add the highlighted match
      result += `<mark class="bg-yellow-300 dark:bg-yellow-600 text-black dark:text-white px-0.5 rounded">${escapeHtml(match.text)}</mark>`;
      lastIndex = match.index + match.text.length;
    }
    
    // Add remaining text after last match
    result += escapeHtml(testString.slice(lastIndex));
    
    return result;
  });

  // Apply a common pattern
  const applyPattern = (p: string) => {
    pattern = p;
  };

  // Copy regex to clipboard
  const copyRegex = async () => {
    const regexString = `/${pattern}/${flags}`;
    await navigator.clipboard.writeText(regexString);
  };

  // Copy pattern only
  const copyPattern = async () => {
    await navigator.clipboard.writeText(pattern);
  };
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Test regular expressions with real-time matching, capture groups, and flags.
    </p>
  </header>

  <div class="flex-1 flex flex-col lg:flex-row gap-4 min-h-0">
    <!-- Left Panel: Pattern & Test String -->
    <div class="flex-1 flex flex-col min-w-0 gap-4">
      <!-- Pattern Input -->
      <div>
        <div class="flex items-center justify-between mb-2">
          <label class="text-xs tracking-wider text-(--color-text-light) font-medium">
            Pattern
          </label>
          <div class="flex gap-2">
            <button
              onclick={copyPattern}
              disabled={!pattern}
              class="text-xs px-2 py-1 border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:border-(--color-accent) transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Copy Pattern
            </button>
            <button
              onclick={copyRegex}
              disabled={!pattern}
              class="text-xs px-2 py-1 border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:border-(--color-accent) transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Copy /{flags}
            </button>
          </div>
        </div>
        <div class="flex items-center border border-(--color-border) bg-(--color-bg-alt)">
          <span class="px-3 py-2 text-(--color-text-muted) font-mono text-lg border-r border-(--color-border)">/</span>
          <input
            type="text"
            bind:value={pattern}
            placeholder="Enter regex pattern..."
            class="flex-1 px-3 py-2 bg-transparent text-(--color-text) font-mono focus:outline-none"
          />
          <span class="px-3 py-2 text-(--color-text-muted) font-mono text-lg border-l border-(--color-border)">/{flags}</span>
        </div>
        {#if regexResult.error}
          <div class="mt-2 text-sm text-(--color-error-text)">
            {regexResult.error}
          </div>
        {/if}
      </div>

      <!-- Flags -->
      <div>
        <label class="text-xs tracking-wider text-(--color-text-light) font-medium mb-2 block">
          Flags
        </label>
        <div class="flex flex-wrap gap-3">
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" bind:checked={flagGlobal} class="w-4 h-4 accent-(--color-accent)" />
            <span class="text-sm text-(--color-text)"><code class="bg-(--color-bg-alt) px-1">g</code> Global</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" bind:checked={flagCaseInsensitive} class="w-4 h-4 accent-(--color-accent)" />
            <span class="text-sm text-(--color-text)"><code class="bg-(--color-bg-alt) px-1">i</code> Case Insensitive</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" bind:checked={flagMultiline} class="w-4 h-4 accent-(--color-accent)" />
            <span class="text-sm text-(--color-text)"><code class="bg-(--color-bg-alt) px-1">m</code> Multiline</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" bind:checked={flagDotAll} class="w-4 h-4 accent-(--color-accent)" />
            <span class="text-sm text-(--color-text)"><code class="bg-(--color-bg-alt) px-1">s</code> DotAll</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" bind:checked={flagUnicode} class="w-4 h-4 accent-(--color-accent)" />
            <span class="text-sm text-(--color-text)"><code class="bg-(--color-bg-alt) px-1">u</code> Unicode</span>
          </label>
        </div>
      </div>

      <!-- Test String -->
      <div class="flex-1 flex flex-col min-h-0">
        <label class="text-xs tracking-wider text-(--color-text-light) font-medium mb-2">
          Test String
        </label>
        <textarea
          bind:value={testString}
          placeholder="Enter text to test against..."
          class="flex-1 min-h-[150px] p-3 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) font-mono text-sm resize-none focus:outline-none focus:border-(--color-accent)"
        ></textarea>
      </div>

      <!-- Highlighted Result -->
      <div class="flex-1 flex flex-col min-h-0">
        <div class="flex items-center justify-between mb-2">
          <label class="text-xs tracking-wider text-(--color-text-light) font-medium">
            Result ({matches.length} match{matches.length !== 1 ? "es" : ""})
          </label>
        </div>
        <div
          class="flex-1 min-h-[150px] p-3 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) font-mono text-sm overflow-auto whitespace-pre-wrap"
        >
          {@html highlightedHtml}
        </div>
      </div>
    </div>

    <!-- Right Panel: Matches & Reference -->
    <div class="lg:w-80 flex-shrink-0 flex flex-col gap-4 min-h-0">
      <!-- Match Details -->
      <div class="flex-1 flex flex-col min-h-0">
        <label class="text-xs tracking-wider text-(--color-text-light) font-medium mb-2">
          Match Details
        </label>
        <div class="flex-1 border border-(--color-border) bg-(--color-bg-alt) overflow-y-auto">
          {#if matches.length === 0}
            <div class="p-4 text-sm text-(--color-text-muted) text-center">
              {#if pattern}
                No matches found
              {:else}
                Enter a pattern to see matches
              {/if}
            </div>
          {:else}
            <div class="divide-y divide-(--color-border)">
              {#each matches as match, i}
                <div class="p-3">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-xs font-medium text-(--color-text-light)">Match {i + 1}</span>
                    <span class="text-xs text-(--color-text-muted)">Index: {match.index}</span>
                  </div>
                  <div class="font-mono text-sm text-(--color-text) bg-(--color-bg) px-2 py-1 rounded mb-2 break-all">
                    "{match.text}"
                  </div>
                  {#if match.captures.length > 0}
                    <div class="text-xs text-(--color-text-muted) mb-1">Capture Groups:</div>
                    <div class="space-y-1">
                      {#each match.captures as capture, j}
                        <div class="flex items-center gap-2 text-xs">
                          <span class="text-(--color-text-muted)">${j + 1}:</span>
                          <span class="font-mono text-(--color-text) bg-(--color-bg) px-1 rounded">"{capture ?? ""}"</span>
                        </div>
                      {/each}
                    </div>
                  {/if}
                  {#if match.groups && Object.keys(match.groups).length > 0}
                    <div class="text-xs text-(--color-text-muted) mt-2 mb-1">Named Groups:</div>
                    <div class="space-y-1">
                      {#each Object.entries(match.groups) as [name, value]}
                        <div class="flex items-center gap-2 text-xs">
                          <span class="text-(--color-text-muted)">{name}:</span>
                          <span class="font-mono text-(--color-text) bg-(--color-bg) px-1 rounded">"{value ?? ""}"</span>
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <!-- Common Patterns -->
      <div>
        <label class="text-xs tracking-wider text-(--color-text-light) font-medium mb-2 block">
          Common Patterns
        </label>
        <div class="flex flex-wrap gap-1">
          {#each commonPatterns as cp}
            <button
              onclick={() => applyPattern(cp.pattern)}
              class="text-xs px-2 py-1 border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:border-(--color-accent) transition-colors"
              title={cp.pattern}
            >
              {cp.name}
            </button>
          {/each}
        </div>
      </div>

      <!-- Cheatsheet Toggle -->
      <div>
        <button
          onclick={() => showCheatsheet = !showCheatsheet}
          class="w-full text-xs px-3 py-2 border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:border-(--color-accent) transition-colors flex items-center justify-between"
        >
          <span>Regex Cheatsheet</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="transition-transform {showCheatsheet ? 'rotate-180' : ''}"
          >
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
        
        {#if showCheatsheet}
          <div class="mt-2 border border-(--color-border) bg-(--color-bg-alt) p-3 max-h-[300px] overflow-y-auto">
            {#each cheatsheet as section}
              <div class="mb-3 last:mb-0">
                <div class="text-xs font-medium text-(--color-text-light) mb-1">{section.category}</div>
                <div class="grid grid-cols-2 gap-x-2 gap-y-0.5">
                  {#each section.items as item}
                    <button
                      onclick={() => applyPattern(item.pattern)}
                      class="text-left text-xs hover:bg-(--color-bg) px-1 py-0.5 rounded transition-colors group"
                    >
                      <code class="text-(--color-accent) group-hover:underline">{item.pattern}</code>
                      <span class="text-(--color-text-muted) ml-1">{item.desc}</span>
                    </button>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
