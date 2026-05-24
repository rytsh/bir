<script lang="ts">
  import CodeMirror from "svelte-codemirror-editor";
  import { EditorView } from "@codemirror/view";
  import {
    createDarkModeObserver,
    getInitialDarkMode,
    createTheme,
    editorHeightExtension,
  } from "../../lib/codemirror.js";

  interface DiffLine {
    type: "unchanged" | "added" | "removed";
    oldLineNum: number | null;
    newLineNum: number | null;
    content: string;
  }

  let inlineMode = $state(false);
  let jsonMode = $state(false);
  let sortJsonKeys = $state(true);
  let isDark = $state(getInitialDarkMode());

  let oldValue = $state("");
  let newValue = $state("");
  let oldJsonError = $state("");
  let newJsonError = $state("");

  let diffLines = $state<DiffLine[]>([]);

  interface JsonFormatResult {
    text: string;
    error: string;
  }

  const computeDiff = (oldText: string, newText: string): DiffLine[] => {
    const oldLines = oldText.split("\n");
    const newLines = newText.split("\n");

    // LCS-based diff algorithm
    const m = oldLines.length;
    const n = newLines.length;

    // Build LCS table
    const dp: number[][] = Array(m + 1)
      .fill(null)
      .map(() => Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (oldLines[i - 1] === newLines[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    // Backtrack to find diff
    const result: DiffLine[] = [];
    let i = m;
    let j = n;

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
        result.unshift({
          type: "unchanged",
          oldLineNum: i,
          newLineNum: j,
          content: oldLines[i - 1],
        });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        result.unshift({
          type: "added",
          oldLineNum: null,
          newLineNum: j,
          content: newLines[j - 1],
        });
        j--;
      } else if (i > 0) {
        result.unshift({
          type: "removed",
          oldLineNum: i,
          newLineNum: null,
          content: oldLines[i - 1],
        });
        i--;
      }
    }

    return result;
  };

  const sortJsonValue = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map(sortJsonValue);
    }

    if (value && typeof value === "object") {
      const source = value as Record<string, unknown>;
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(source).sort()) {
        sorted[key] = sortJsonValue(source[key]);
      }
      return sorted;
    }

    return value;
  };

  const formatJsonForDiff = (value: string): JsonFormatResult => {
    if (!value.trim()) return { text: "", error: "" };

    try {
      const parsed = JSON.parse(value) as unknown;
      const normalized = sortJsonKeys ? sortJsonValue(parsed) : parsed;
      return { text: JSON.stringify(normalized, null, 2), error: "" };
    } catch (error) {
      return {
        text: "",
        error: error instanceof Error ? error.message : "Invalid JSON",
      };
    }
  };

  const updateDiff = () => {
    oldJsonError = "";
    newJsonError = "";

    if (!oldValue && !newValue) {
      diffLines = [];
      return;
    }

    if (!jsonMode) {
      diffLines = computeDiff(oldValue, newValue);
      return;
    }

    const oldJson = formatJsonForDiff(oldValue);
    const newJson = formatJsonForDiff(newValue);
    oldJsonError = oldJson.error;
    newJsonError = newJson.error;

    if (oldJsonError || newJsonError) {
      diffLines = [];
      return;
    }

    diffLines = computeDiff(oldJson.text, newJson.text);
  };

  // Extensions for input editors
  let editorExtensions = $derived([
    ...createTheme(isDark),
    editorHeightExtension,
    EditorView.lineWrapping,
  ]);

  $effect(() => {
    isDark = getInitialDarkMode();

    const cleanup = createDarkModeObserver((newIsDark) => {
      if (newIsDark !== isDark) isDark = newIsDark;
    });

    return cleanup;
  });

  // React to value changes
  $effect(() => {
    oldValue;
    newValue;
    jsonMode;
    sortJsonKeys;
    updateDiff();
  });

  const handleClearOld = () => {
    oldValue = "";
  };

  const handleClearNew = () => {
    newValue = "";
  };

  const handlePasteOld = () => {
    navigator.clipboard.readText().then((text) => {
      oldValue = text;
    });
  };

  const handlePasteNew = () => {
    navigator.clipboard.readText().then((text) => {
      newValue = text;
    });
  };

  let hasDiff = $derived(diffLines.some((line) => line.type !== "unchanged"));
  let addedCount = $derived(diffLines.filter((line) => line.type === "added").length);
  let removedCount = $derived(diffLines.filter((line) => line.type === "removed").length);
  let hasJsonError = $derived(jsonMode && Boolean(oldJsonError || newJsonError));
</script>

<div class="h-full flex flex-col overflow-hidden">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Compare two texts or normalized JSON documents and see the differences highlighted.
    </p>
  </header>

  <!-- Config Toggle -->
  <div class="mb-4 flex flex-wrap items-center gap-6">
    <label class="flex items-center gap-2 cursor-pointer">
      <span class="text-sm text-(--color-text-muted)">Inline Mode</span>
      <button
        title="on/off"
        type="button"
        role="switch"
        aria-checked={inlineMode}
        class="flex items-center w-10 h-5 p-0.5 transition-colors {inlineMode
          ? 'bg-(--color-text) justify-end'
          : 'bg-(--color-border) justify-start'}"
        onclick={() => (inlineMode = !inlineMode)}
      >
        <span class="w-4 h-4 bg-(--color-bg-alt)"></span>
      </button>
    </label>

    <label class="flex items-center gap-2 cursor-pointer">
      <span class="text-sm text-(--color-text-muted)">JSON Mode</span>
      <button
        title="on/off"
        type="button"
        role="switch"
        aria-checked={jsonMode}
        class="flex items-center w-10 h-5 p-0.5 transition-colors {jsonMode
          ? 'bg-(--color-text) justify-end'
          : 'bg-(--color-border) justify-start'}"
        onclick={() => (jsonMode = !jsonMode)}
      >
        <span class="w-4 h-4 bg-(--color-bg-alt)"></span>
      </button>
    </label>

    {#if jsonMode}
      <label class="flex items-center gap-2 cursor-pointer">
        <span class="text-sm text-(--color-text-muted)">Sort Object Keys</span>
        <button
          title="on/off"
          type="button"
          role="switch"
          aria-checked={sortJsonKeys}
          class="flex items-center w-10 h-5 p-0.5 transition-colors {sortJsonKeys
            ? 'bg-(--color-text) justify-end'
            : 'bg-(--color-border) justify-start'}"
          onclick={() => (sortJsonKeys = !sortJsonKeys)}
        >
          <span class="w-4 h-4 bg-(--color-bg-alt)"></span>
        </button>
      </label>

      <span class="text-xs text-(--color-text-muted)">
        JSON mode ignores whitespace and compares pretty-printed structure.
      </span>
    {/if}
  </div>

  <!-- Editors - Side by Side -->
  <div class="flex-1 flex flex-col lg:flex-row gap-4 mb-4 min-h-0">
    <!-- Old Text Editor -->
    <div class="flex-1 flex flex-col min-h-[150px] min-w-0">
      <div class="flex justify-between items-center mb-2">
        <span class="text-xs tracking-wider text-(--color-text-light) font-medium">
          Old {jsonMode ? "JSON" : "Text"}
        </span>
        <div class="flex gap-3">
          <button
            onclick={handlePasteOld}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            Paste
          </button>
          <button
            onclick={handleClearOld}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            Clear
          </button>
        </div>
      </div>
      <div class="flex-1 min-h-0 border border-(--color-border) overflow-hidden">
        <CodeMirror
          bind:value={oldValue}
          placeholder={jsonMode ? "Enter original JSON..." : "Enter original text..."}
          extensions={editorExtensions}
        />
      </div>
      {#if jsonMode && oldJsonError}
        <p class="mt-1 text-xs text-(--color-error-text)">Old JSON error: {oldJsonError}</p>
      {/if}
    </div>

    <!-- New Text Editor -->
    <div class="flex-1 flex flex-col min-h-[150px] min-w-0">
      <div class="flex justify-between items-center mb-2">
        <span class="text-xs tracking-wider text-(--color-text-light) font-medium">
          New {jsonMode ? "JSON" : "Text"}
        </span>
        <div class="flex gap-3">
          <button
            onclick={handlePasteNew}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            Paste
          </button>
          <button
            onclick={handleClearNew}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            Clear
          </button>
        </div>
      </div>
      <div class="flex-1 min-h-0 border border-(--color-border) overflow-hidden">
        <CodeMirror
          bind:value={newValue}
          placeholder={jsonMode ? "Enter new JSON..." : "Enter new text..."}
          extensions={editorExtensions}
        />
      </div>
      {#if jsonMode && newJsonError}
        <p class="mt-1 text-xs text-(--color-error-text)">New JSON error: {newJsonError}</p>
      {/if}
    </div>
  </div>

  <!-- Diff Output -->
  <div class="flex-1 flex flex-col min-h-[200px] min-w-0 overflow-hidden mt-2">
    <div class="flex justify-between items-center mb-2 shrink-0">
      <span class="text-xs tracking-wider text-(--color-text-light) font-medium">
        Differences
      </span>
      {#if hasDiff}
        <div class="flex gap-3 text-xs">
          <span class="text-(--color-diff-added-text)">+{addedCount} added</span>
          <span class="text-(--color-diff-removed-text)">-{removedCount} removed</span>
        </div>
      {/if}
    </div>
    <div class="flex-1 min-h-0 border border-(--color-border) overflow-auto bg-(--color-bg-alt) font-mono text-sm">
      {#if hasJsonError}
        <div class="p-4 text-(--color-error-text) italic">
          Fix invalid JSON before viewing the normalized diff.
        </div>
      {:else if !hasDiff && diffLines.length === 0}
        <div class="p-4 text-(--color-text-light) italic">
          Enter {jsonMode ? "JSON" : "text"} in both editors to see differences...
        </div>
      {:else if !hasDiff}
        <div class="p-4 text-(--color-text-light) italic">
          No differences found.
        </div>
      {:else if inlineMode}
        <!-- Inline Mode -->
        <div class="p-2">
          {#each diffLines as line}
            <div
              class="flex font-mono {line.type === 'added'
                ? 'bg-(--color-diff-added-bg) text-(--color-diff-added-text)'
                : line.type === 'removed'
                  ? 'bg-(--color-diff-removed-bg) text-(--color-diff-removed-text)'
                  : ''}"
            >
              <span class="w-8 text-right pr-2 text-(--color-text-light) select-none shrink-0">
                {line.oldLineNum ?? ""}
              </span>
              <span class="w-8 text-right pr-2 text-(--color-text-light) select-none shrink-0">
                {line.newLineNum ?? ""}
              </span>
              <span class="w-4 text-center select-none shrink-0">
                {#if line.type === "added"}
                  +
                {:else if line.type === "removed"}
                  -
                {:else}
                  &nbsp;
                {/if}
              </span>
              <span class="flex-1 min-w-0 break-all whitespace-pre-wrap">{line.content}</span>
            </div>
          {/each}
        </div>
      {:else}
        <!-- Side by Side Mode -->
        <div class="flex h-full">
          <!-- Old Side -->
          <div class="flex-1 min-w-0 border-r border-(--color-border)">
            {#each diffLines as line}
              {#if line.type === "removed" || line.type === "unchanged"}
                <div
                  class="flex font-mono {line.type === 'removed'
                    ? 'bg-(--color-diff-removed-bg) text-(--color-diff-removed-text)'
                    : ''}"
                >
                  <span class="w-10 text-right pr-2 text-(--color-text-light) select-none shrink-0 border-r border-(--color-border)">
                    {line.oldLineNum ?? ""}
                  </span>
                  <span class="w-4 text-center select-none shrink-0">
                    {#if line.type === "removed"}
                      -
                    {:else}
                      &nbsp;
                    {/if}
                  </span>
                  <span class="flex-1 min-w-0 break-all whitespace-pre-wrap pl-1">{line.content}</span>
                </div>
              {:else}
                <div class="flex font-mono">
                  <span class="w-10 text-right pr-2 text-(--color-text-light) select-none shrink-0 border-r border-(--color-border)">
                    &nbsp;
                  </span>
                  <span class="w-4 text-center select-none shrink-0">&nbsp;</span>
                  <span class="pl-1">&nbsp;</span>
                </div>
              {/if}
            {/each}
          </div>
          <!-- New Side -->
          <div class="flex-1 min-w-0">
            {#each diffLines as line}
              {#if line.type === "added" || line.type === "unchanged"}
                <div
                  class="flex font-mono {line.type === 'added'
                    ? 'bg-(--color-diff-added-bg) text-(--color-diff-added-text)'
                    : ''}"
                >
                  <span class="w-10 text-right pr-2 text-(--color-text-light) select-none shrink-0 border-r border-(--color-border)">
                    {line.newLineNum ?? ""}
                  </span>
                  <span class="w-4 text-center select-none shrink-0">
                    {#if line.type === "added"}
                      +
                    {:else}
                      &nbsp;
                    {/if}
                  </span>
                  <span class="flex-1 min-w-0 break-all whitespace-pre-wrap pl-1">{line.content}</span>
                </div>
              {:else}
                <div class="flex font-mono">
                  <span class="w-10 text-right pr-2 text-(--color-text-light) select-none shrink-0 border-r border-(--color-border)">
                    &nbsp;
                  </span>
                  <span class="w-4 text-center select-none shrink-0">&nbsp;</span>
                  <span class="pl-1">&nbsp;</span>
                </div>
              {/if}
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>
