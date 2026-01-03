<script lang="ts">
  import {
    EditorView,
    createEditor,
    createDarkModeObserver,
    getInitialDarkMode,
    updateEditorContent,
    getEditorContent,
    initEditorsWithRetry,
  } from "../../lib/codemirror.js";

  interface DiffLine {
    type: "unchanged" | "added" | "removed";
    oldLineNum: number | null;
    newLineNum: number | null;
    content: string;
  }

  let inlineMode = $state(false);
  let isDark = $state(false);

  let oldEditorContainer: HTMLDivElement;
  let newEditorContainer: HTMLDivElement;
  let oldEditor: EditorView;
  let newEditor: EditorView;

  let diffLines = $state<DiffLine[]>([]);

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

  const updateDiff = () => {
    const oldText = getEditorContent(oldEditor);
    const newText = getEditorContent(newEditor);
    diffLines = computeDiff(oldText, newText);
  };

  const createOldEditor = (): boolean => {
    if (!oldEditorContainer) return false;
    const content = getEditorContent(oldEditor);
    if (oldEditor) oldEditor.destroy();

    oldEditor = createEditor({
      container: oldEditorContainer,
      config: {
        dark: isDark,
        placeholderText: "Enter original text...",
        onUpdate: () => updateDiff(),
      },
      initialContent: content,
    });
    return true;
  };

  const createNewEditor = (): boolean => {
    if (!newEditorContainer) return false;
    const content = getEditorContent(newEditor);
    if (newEditor) newEditor.destroy();

    newEditor = createEditor({
      container: newEditorContainer,
      config: {
        dark: isDark,
        placeholderText: "Enter new text...",
        onUpdate: () => updateDiff(),
      },
      initialContent: content,
    });
    return true;
  };

  $effect(() => {
    isDark = getInitialDarkMode();

    const cleanup = createDarkModeObserver((newIsDark) => {
      if (newIsDark !== isDark) {
        isDark = newIsDark;
        createOldEditor();
        createNewEditor();
      }
    });

    initEditorsWithRetry([createOldEditor, createNewEditor]);

    return () => {
      cleanup();
      oldEditor?.destroy();
      newEditor?.destroy();
    };
  });

  const handleClearOld = () => {
    updateEditorContent(oldEditor, "");
  };

  const handleClearNew = () => {
    updateEditorContent(newEditor, "");
  };

  const handlePasteOld = () => {
    navigator.clipboard.readText().then((text) => {
      updateEditorContent(oldEditor, text);
    });
  };

  const handlePasteNew = () => {
    navigator.clipboard.readText().then((text) => {
      updateEditorContent(newEditor, text);
    });
  };

  let hasDiff = $derived(diffLines.some((line) => line.type !== "unchanged"));
  let addedCount = $derived(diffLines.filter((line) => line.type === "added").length);
  let removedCount = $derived(diffLines.filter((line) => line.type === "removed").length);
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Compare two texts and see the differences highlighted.
    </p>
  </header>

  <!-- Config Toggle -->
  <div class="mb-4 flex items-center gap-4">
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
  </div>

  <!-- Editors - Side by Side -->
  <div class="flex-1 flex flex-col lg:flex-row gap-4 mb-4">
    <!-- Old Text Editor -->
    <div class="flex-1 flex flex-col min-h-[150px]">
      <div class="flex justify-between items-center mb-2">
        <span class="text-xs tracking-wider text-(--color-text-light) font-medium">
          Old Text
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
      <div
        bind:this={oldEditorContainer}
        class="flex-1 border border-(--color-border) overflow-hidden"
      ></div>
    </div>

    <!-- New Text Editor -->
    <div class="flex-1 flex flex-col min-h-[150px]">
      <div class="flex justify-between items-center mb-2">
        <span class="text-xs tracking-wider text-(--color-text-light) font-medium">
          New Text
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
      <div
        bind:this={newEditorContainer}
        class="flex-1 border border-(--color-border) overflow-hidden"
      ></div>
    </div>
  </div>

  <!-- Diff Output -->
  <div class="flex-1 flex flex-col min-h-[200px] mt-2">
    <div class="flex justify-between items-center mb-2">
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
    <div class="flex-1 border border-(--color-border) overflow-auto bg-(--color-bg-alt) font-mono text-sm">
      {#if !hasDiff && diffLines.length === 0}
        <div class="p-4 text-(--color-text-light) italic">
          Enter text in both editors to see differences...
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
              class="flex font-mono whitespace-pre {line.type === 'added'
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
              <span class="flex-1">{line.content}</span>
            </div>
          {/each}
        </div>
      {:else}
        <!-- Side by Side Mode -->
        <div class="flex h-full">
          <!-- Old Side -->
          <div class="flex-1 border-r border-(--color-border)">
            {#each diffLines as line}
              {#if line.type === "removed" || line.type === "unchanged"}
                <div
                  class="flex font-mono whitespace-pre {line.type === 'removed'
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
                  <span class="flex-1 pl-1">{line.content}</span>
                </div>
              {:else}
                <div class="flex font-mono whitespace-pre">
                  <span class="w-10 text-right pr-2 text-(--color-text-light) select-none shrink-0 border-r border-(--color-border)">
                    &nbsp;
                  </span>
                  <span class="w-4 text-center select-none shrink-0">&nbsp;</span>
                  <span class="flex-1 pl-1">&nbsp;</span>
                </div>
              {/if}
            {/each}
          </div>
          <!-- New Side -->
          <div class="flex-1">
            {#each diffLines as line}
              {#if line.type === "added" || line.type === "unchanged"}
                <div
                  class="flex font-mono whitespace-pre {line.type === 'added'
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
                  <span class="flex-1 pl-1">{line.content}</span>
                </div>
              {:else}
                <div class="flex font-mono whitespace-pre">
                  <span class="w-10 text-right pr-2 text-(--color-text-light) select-none shrink-0 border-r border-(--color-border)">
                    &nbsp;
                  </span>
                  <span class="w-4 text-center select-none shrink-0">&nbsp;</span>
                  <span class="flex-1 pl-1">&nbsp;</span>
                </div>
              {/if}
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>
