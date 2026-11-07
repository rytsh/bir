<script lang="ts">
  import { ChevronDown, ChevronUp, ClipboardPaste, Columns2, Copy, Download, FileDiff, Rows2 } from "@lucide/svelte";
  import FileDropZone from "../ui/FileDropZone.svelte";
  import ToolWorkbench from "../ui/ToolWorkbench.svelte";
  import { parsePatch, splitPatchLines, type PatchFile } from "../../lib/git-patch.ts";
  import { downloadBlob, errorMessage, isEditing } from "../../lib/workbench.ts";

  const sample: string = `diff --git a/src/greet.ts b/src/greet.ts
index 2e65efe..b36a097 100644
--- a/src/greet.ts
+++ b/src/greet.ts
@@ -1,3 +1,5 @@
-export function greet(name) {
-  return "Hello " + name;
+export function greet(name: string): string {
+  const trimmed = name.trim();
+  if (!trimmed) return "Hello, world!";
+  return \`Hello, \${trimmed}!\`;
 }
diff --git a/README.md b/README.md
index 99a5..a22c 100644
--- a/README.md
+++ b/README.md
@@ -1,2 +1,3 @@
 # Greeting
-A small helper.
+A typed greeting helper.
+Empty names are welcome too.
`;
  let source = $state<string>("");
  let draft = $state<string>("");
  let query = $state<string>("");
  let selected = $state<number>(0);
  let split = $state<boolean>(false);
  let changesOnly = $state<boolean>(false);
  let wrap = $state<boolean>(false);
  let error = $state<string>("");
  let status = $state<string>("");
  let editing = $state<boolean>(false);
  let content = $state<HTMLDivElement>();
  let fileList = $state<HTMLElement>();
  const parsed = $derived.by(() => { try { if (source.length > 4 * 1024 * 1024) throw new Error("Patch exceeds 4 MB. Choose a smaller patch."); return { files: parsePatch(source), error: "" }; } catch (issue) { return { files: [] as PatchFile[], error: errorMessage(issue) }; } });
  const filtered = $derived(parsed.files.map((file, index) => ({ file, index })).filter(({ file }) => file.label.toLowerCase().includes(query.toLowerCase())));
  const file = $derived(parsed.files[selected]);
  const additions = $derived(parsed.files.reduce((sum, item) => sum + item.additions, 0));
  const deletions = $derived(parsed.files.reduce((sum, item) => sum + item.deletions, 0));
  const hasPatch = $derived(parsed.files.length > 0);

  function load(text: string, origin: string): void {
    source = text; draft = text; selected = 0; query = ""; editing = false; error = "";
    status = origin;
  }
  async function open(files: File[]): Promise<void> {
    try { if (files[0].size > 4 * 1024 * 1024) throw new Error("Patch exceeds 4 MB. Choose a smaller patch."); load(await files[0].text(), `Opened ${files[0].name}.`); } catch (issue) { error = errorMessage(issue); }
  }
  async function pasteFromClipboard(): Promise<void> {
    try { const text: string = await navigator.clipboard.readText(); if (!text.trim()) throw new Error("The clipboard is empty."); load(text, "Pasted from clipboard."); }
    catch (issue) { error = issue instanceof Error && issue.message === "The clipboard is empty." ? issue.message : "Clipboard access was denied. Paste into the text box instead."; editing = true; }
  }
  function select(index: number): void {
    selected = index; content?.scrollTo({ top: 0 });
    fileList?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }
  function navigate(direction: number): void {
    if (!filtered.length) return;
    const position: number = filtered.findIndex((item) => item.index === selected);
    select(filtered[(position + direction + filtered.length) % filtered.length].index);
  }
  function jumpHunk(direction: number): void {
    if (!content) return;
    const headers: HTMLElement[] = [...content.querySelectorAll<HTMLElement>(".hunk-header")];
    const top: number = content.scrollTop;
    const target: HTMLElement | undefined = direction > 0 ? headers.find((header) => header.offsetTop > top + 4) : [...headers].reverse().find((header) => header.offsetTop < top - 4);
    if (target) content.scrollTo({ top: target.offsetTop, behavior: "smooth" });
  }
  async function copyPath(path: string): Promise<void> {
    try { await navigator.clipboard.writeText(path); status = `Copied ${path}.`; } catch { status = "Clipboard access was denied."; }
  }
  function changeBar(item: PatchFile): { add: number; remove: number } {
    const total: number = item.additions + item.deletions;
    if (!total) return { add: 0, remove: 0 };
    const blocks: number = 5; const add: number = Math.round(item.additions / total * blocks);
    return { add, remove: blocks - add };
  }
  function shortcut(event: KeyboardEvent): void {
    if (isEditing(event) || !hasPatch) return;
    const key: string = event.key.toLowerCase();
    if (key === "j" || key === "k") { event.preventDefault(); navigate(key === "j" ? 1 : -1); }
    if (key === "n" || key === "p") { event.preventDefault(); jumpHunk(key === "n" ? 1 : -1); }
    if (key === "v") split = !split;
    if (key === "w") wrap = !wrap;
    if (key === "c") changesOnly = !changesOnly;
  }
</script>

<svelte:window onkeydown={shortcut} />
<ToolWorkbench description="Review Git patches without applying them. Browse changed files, read hunks in unified or split view, and spot additions, deletions, renames, and binary changes — all locally.">
  {#if !hasPatch || editing}
    <section class="wb-panel paste-panel">
      <div class="wb-panel-heading">
        <span>{hasPatch ? "Edit patch source" : "Paste a patch"}</span>
        <span class="wb-spacer"></span>
        <button onclick={pasteFromClipboard}><ClipboardPaste size={15} /> Paste from clipboard</button>
        {#if !hasPatch}<button onclick={() => load(sample, "Example patch loaded.")}>Load example</button>{/if}
      </div>
      <textarea class="wb-code source-input" spellcheck="false" bind:value={draft} aria-label="Unified patch" placeholder={"Paste the output of git diff, git show, or git format-patch…\n\ndiff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -1,3 +1,3 @@"}></textarea>
      <div class="wb-padded wb-toolbar">
        <button class="primary" disabled={!draft.trim()} onclick={() => load(draft, "Patch updated.")}><FileDiff size={15} /> {hasPatch ? "Apply changes" : "View diff"}</button>
        {#if hasPatch}<button onclick={() => { draft = source; editing = false; }}>Cancel</button>{/if}
        <span class="wb-small wb-muted">Read-only: patches are never applied and code is never executed.</span>
      </div>
    </section>
    <FileDropZone accept=".patch,.diff,text/plain" compact title="Or open a .patch / .diff file" hint="Up to 4 MB · Git and plain unified diffs" onfiles={open} />
  {/if}
  {#if error || parsed.error}<p class="wb-error" role="alert">{error || parsed.error}</p>{/if}

  {#if hasPatch && !editing}
    <div class="wb-toolbar summary-bar">
      <span class="wb-chip"><strong>{parsed.files.length}</strong> {parsed.files.length === 1 ? "file" : "files"}</span>
      <span class="added-count">+{additions}</span><span class="removed-count">−{deletions}</span>
      <span class="wb-small wb-muted" role="status">{status}</span>
      <span class="wb-spacer"></span>
      <button onclick={() => { draft = source; editing = true; }}>Edit source</button>
      <button onclick={() => downloadBlob(source, "changes.patch", "text/plain")}><Download size={15} /> Patch</button>
      <button onclick={() => { source = ""; draft = ""; status = ""; }}>New patch</button>
    </div>
    <div class="patch-layout">
      <nav class="wb-panel file-nav" aria-label="Changed files">
        <div class="nav-filter"><input type="search" aria-label="Filter changed files" placeholder="Filter files…" bind:value={query} /></div>
        <div class="file-list wb-scroll" bind:this={fileList}>
          {#each filtered as item (item.index)}
            {@const bar = changeBar(item.file)}
            <button class="file-button" data-index={item.index} aria-current={selected === item.index ? "true" : undefined} onclick={() => select(item.index)} title={item.file.label}>
              <span class="file-dir">{item.file.label.includes("/") ? item.file.label.slice(0, item.file.label.lastIndexOf("/") + 1) : ""}</span>
              <span class="file-base">{item.file.label.split("/").pop()}</span>
              <span class="file-stats">{#if item.file.binary}<span class="wb-muted">binary</span>{:else}<span class="added-count">+{item.file.additions}</span> <span class="removed-count">−{item.file.deletions}</span>{/if}<span class="bar" aria-hidden="true">{#each Array(bar.add) as _}<i class="add"></i>{/each}{#each Array(bar.remove) as _}<i class="remove"></i>{/each}</span></span>
            </button>
          {/each}
          {#if !filtered.length}<p class="wb-empty">No files match.</p>{/if}
        </div>
      </nav>

      {#if file}
        <section class="wb-panel diff-panel">
          <div class="wb-panel-heading diff-heading">
            <span class="path wb-mono">{#if file.oldPath !== file.newPath && file.oldPath !== "/dev/null" && file.newPath !== "/dev/null"}<span class="wb-muted">{file.oldPath} →</span> {/if}{file.label}</span>
            {#if file.oldPath === "/dev/null"}<span class="badge added-count">new</span>{:else if file.newPath === "/dev/null"}<span class="badge removed-count">deleted</span>{/if}
            <button class="wb-icon" aria-label="Copy file path" title="Copy path" onclick={() => copyPath(file.label)}><Copy size={14} /></button>
            <button class="wb-icon" aria-label="Download this file's patch" title="Download this file's patch" onclick={() => downloadBlob(file.raw, `${file.label.split("/").pop()}.patch`, "text/plain")}><Download size={14} /></button>
          </div>
          <div class="view-bar">
            <div class="segmented" role="group" aria-label="Diff layout">
              <button aria-pressed={!split} onclick={() => split = false}><Rows2 size={14} /> Unified</button>
              <button aria-pressed={split} onclick={() => split = true}><Columns2 size={14} /> Split</button>
            </div>
            <label class="wb-check wb-small"><input type="checkbox" bind:checked={changesOnly} /> Changes only</label>
            <label class="wb-check wb-small"><input type="checkbox" bind:checked={wrap} /> Wrap</label>
            <span class="wb-spacer"></span>
            {#if file.hunks.length > 1}<span class="wb-small wb-muted">{file.hunks.length} hunks</span><button class="wb-icon" aria-label="Previous hunk" title="Previous hunk (P)" onclick={() => jumpHunk(-1)}><ChevronUp size={15} /></button><button class="wb-icon" aria-label="Next hunk" title="Next hunk (N)" onclick={() => jumpHunk(1)}><ChevronDown size={15} /></button>{/if}
            <span class="wb-small wb-muted file-pos">File {filtered.findIndex((item) => item.index === selected) + 1} / {filtered.length}</span>
            <button class="wb-icon" aria-label="Previous file" title="Previous file (K)" onclick={() => navigate(-1)}><ChevronUp size={15} /></button>
            <button class="wb-icon" aria-label="Next file" title="Next file (J)" onclick={() => navigate(1)}><ChevronDown size={15} /></button>
          </div>
          {#if file.binary}<p class="wb-note wb-small notice">Binary file changed. A visual diff is not available; the original binary patch is kept in downloads.</p>{/if}
          {#if !file.hunks.length && !file.binary}<p class="wb-empty">No content changes — {file.oldPath !== file.newPath ? "renamed" : "metadata or mode change only"}.</p>{/if}
          <div class="patch-content wb-scroll" class:wrap bind:this={content}>
            {#each file.hunks as hunk}
              <div class="hunk-header">{hunk.header}</div>
              {#if split}
                <table class="split-table"><tbody>{#each splitPatchLines(hunk.lines) as row}{#if !changesOnly || row.left?.kind !== "context" || row.right?.kind !== "context"}<tr><td class="line-number">{row.left?.old ?? ""}</td><td class:wb-removed={row.left?.kind === "remove"} class:empty={!row.left} class="code-cell">{row.left?.text ?? ""}</td><td class="line-number">{row.right?.next ?? ""}</td><td class:wb-added={row.right?.kind === "add"} class:empty={!row.right} class="code-cell">{row.right?.text ?? ""}</td></tr>{/if}{/each}</tbody></table>
              {:else}
                <table class="unified-table"><tbody>{#each hunk.lines as line}{#if !changesOnly || line.kind !== "context"}<tr class:wb-added={line.kind === "add"} class:wb-removed={line.kind === "remove"}><td class="line-number">{line.old ?? ""}</td><td class="line-number">{line.next ?? ""}</td><td class="prefix">{line.kind === "add" ? "+" : line.kind === "remove" ? "−" : line.kind === "note" ? "\\" : " "}</td><td class="code-cell">{line.text}</td></tr>{/if}{/each}</tbody></table>
              {/if}
            {/each}
          </div>
          {#if file.metadata.length}<details class="wb-padded wb-small metadata"><summary>Patch metadata</summary><pre>{file.metadata.join("\n")}</pre></details>{/if}
        </section>
      {/if}
    </div>
  {/if}
  <div class="wb-shortcuts"><span><kbd>J</kbd> / <kbd>K</kbd> Next / previous file</span><span><kbd>N</kbd> / <kbd>P</kbd> Next / previous hunk</span><span><kbd>V</kbd> Unified / split</span><span><kbd>C</kbd> Changes only</span><span><kbd>W</kbd> Wrap</span></div>
</ToolWorkbench>

<style>
  .source-input { border: 0 !important; border-bottom: 1px solid var(--color-border) !important; min-height: 14rem; display: block; }
  .summary-bar { padding: .2rem 0; }
  .added-count { color: var(--color-diff-added-text); font-variant-numeric: tabular-nums; }
  .removed-count { color: var(--color-diff-removed-text); font-variant-numeric: tabular-nums; }
  .patch-layout { display: grid; grid-template-columns: minmax(200px, 260px) minmax(0, 1fr); gap: 1rem; align-items: start; }
  .file-nav { position: sticky; top: 1rem; display: flex; flex-direction: column; max-height: calc(100dvh - 6rem); }
  .nav-filter { padding: .6rem; border-bottom: 1px solid var(--color-border); }
  .nav-filter input { width: 100%; }
  .file-list { flex: 1; }
  :global(.workbench) button.file-button { display: grid; grid-template-columns: minmax(0, 1fr); width: 100%; justify-items: start; gap: .1rem; border: 0; border-bottom: 1px solid var(--color-border); padding: .6rem .8rem; font-weight: 400; text-align: left; min-height: 0; }
  .file-dir { font-size: .7rem; color: var(--color-text-muted); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .file-base { font-weight: 500; overflow-wrap: anywhere; }
  .file-stats { display: flex; align-items: center; gap: .35rem; font-size: .72rem; }
  .bar { display: inline-flex; gap: 1px; margin-left: .2rem; }
  .bar i { width: 6px; height: 6px; display: block; }
  .bar i.add { background: var(--color-diff-added-text); }
  .bar i.remove { background: var(--color-diff-removed-text); }
  .file-button[aria-current="true"] { background: var(--color-bg); box-shadow: inset 2px 0 0 var(--color-accent); }
  .diff-panel { min-width: 0; }
  .diff-heading { gap: .5rem; }
  .path { flex: 1; min-width: 0; overflow-wrap: anywhere; font-size: .82rem; }
  .badge { font-size: .7rem; font-weight: 500; border: 1px solid currentColor; padding: 0 .35rem; }
  .view-bar { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem 1rem; padding: .5rem 1rem; border-bottom: 1px solid var(--color-border); }
  .segmented { display: flex; }
  :global(.workbench) .segmented button { margin-right: -1px; min-height: 2rem; padding: .25rem .65rem; }
  .file-pos { font-variant-numeric: tabular-nums; }
  .notice { margin: 1rem; }
  .patch-content { max-height: calc(100dvh - 12rem); font: .78rem/1.65 var(--font-mono); position: relative; }
  .hunk-header { position: sticky; top: 0; z-index: 1; background: var(--color-bg); color: var(--color-text-muted); padding: .45rem .8rem; white-space: pre-wrap; overflow-wrap: anywhere; border-block: 1px solid var(--color-border); }
  .patch-content table { border-collapse: collapse; width: 100%; }
  .patch-content td { padding: 0 .5rem; border: 0; height: 1.65em; vertical-align: top; }
  .patch-content .line-number { width: 3.2rem; min-width: 3.2rem; text-align: right; color: var(--color-text-muted); background: var(--color-bg); user-select: none; font-variant-numeric: tabular-nums; }
  .prefix { width: 1rem; user-select: none; }
  .code-cell { white-space: pre; min-width: 6rem; }
  .code-cell.empty { background: repeating-linear-gradient(135deg, transparent 0 6px, var(--color-border) 6px 7px); }
  .split-table { table-layout: fixed; }
  .split-table .code-cell { width: calc(50% - 3.2rem); overflow: hidden; }
  .wrap .code-cell { white-space: pre-wrap; overflow-wrap: anywhere; }
  .metadata { border-top: 1px solid var(--color-border); }
  .metadata summary { color: var(--color-text-muted); }
  @media (max-width: 900px) { .patch-layout { grid-template-columns: minmax(0, 1fr); } .file-nav { position: static; max-height: 14rem; } .patch-content { max-height: 70dvh; } }
</style>
