<script lang="ts">
  import { Archive, Download, FilePlus, FolderPlus, Pencil, Trash2, X } from "@lucide/svelte";
  import FileDropZone from "../ui/FileDropZone.svelte";
  import ToolWorkbench from "../ui/ToolWorkbench.svelte";
  import { ARCHIVE_LIMIT, ENTRY_LIMIT, readArchive, safeArchivePath, writeArchive, type ArchiveEntry } from "../../lib/archive.ts";
  import { downloadBlob, errorMessage, formatBytes, isEditing } from "../../lib/workbench.ts";

  type SortKey = "name" | "size";
  let entries = $state<ArchiveEntry[]>([]);
  let selected = $state<string[]>([]);
  let query = $state<string>("");
  let sortKey = $state<SortKey>("name");
  let format = $state<"zip" | "tar" | "tar.gz">("zip");
  let level = $state<number>(6);
  let archiveName = $state<string>("archive");
  let busy = $state<boolean>(false);
  let error = $state<string>("");
  let status = $state<string>("");
  let previewName = $state<string>("");
  let rename = $state<string>("");
  let renaming = $state<boolean>(false);
  let searchInput = $state<HTMLInputElement>();
  const filtered = $derived(entries.filter((entry) => entry.name.toLowerCase().includes(query.toLowerCase())).sort((a, b) => sortKey === "size" ? b.data.length - a.data.length : a.name.localeCompare(b.name)));
  const total = $derived(entries.reduce((sum, entry) => sum + entry.data.length, 0));
  const selectedSize = $derived(entries.filter((entry) => selected.includes(entry.name)).reduce((sum, entry) => sum + entry.data.length, 0));
  const allVisibleSelected = $derived(filtered.length > 0 && filtered.every((entry) => selected.includes(entry.name)));
  const preview = $derived(entries.find((entry) => entry.name === previewName));
  const previewText = $derived.by(() => {
    if (!preview) return "";
    if (!preview.data.length) return "Empty file.";
    if (preview.data.subarray(0, 4096).includes(0)) return "Binary file — download it to open in its native application.";
    return new TextDecoder().decode(preview.data.subarray(0, 64 * 1024));
  });
  const extension = $derived(format === "tar.gz" ? "tar.gz" : format);

  async function open(files: File[]): Promise<void> {
    if (entries.length && !confirm("Opening an archive replaces the current workspace. Continue?")) return;
    busy = true; error = ""; status = "Opening archive…";
    try {
      const file: File = files[0];
      if (file.size > 128 * 1024 * 1024) throw new Error("Choose an archive smaller than 128 MB.");
      const result: ArchiveEntry[] = await readArchive(new Uint8Array(await file.arrayBuffer()), file.name);
      entries = result; selected = []; previewName = ""; query = "";
      archiveName = file.name.replace(/\.(tar\.gz|tgz|zip|tar|gz)$/i, "");
      status = `Opened ${file.name} · ${result.length} files.`;
    } catch (issue) { error = errorMessage(issue); status = ""; }
    finally { busy = false; }
  }

  async function add(files: File[]): Promise<void> {
    if (!files.length) return;
    busy = true; error = "";
    try {
      if (entries.length + files.length > ENTRY_LIMIT || total + files.reduce((sum, file) => sum + file.size, 0) > ARCHIVE_LIMIT) throw new Error("Workspace is limited to 5000 files and 256 MB.");
      const added: ArchiveEntry[] = [];
      const names: Set<string> = new Set(entries.map((entry) => entry.name));
      for (const file of files) {
        const name: string = safeArchivePath(file.webkitRelativePath || file.name);
        if (names.has(name)) throw new Error(`${name} already exists. Rename or remove it first.`);
        names.add(name); added.push({ name, data: new Uint8Array(await file.arrayBuffer()) });
      }
      entries = [...entries, ...added]; status = `Added ${added.length} ${added.length === 1 ? "file" : "files"}.`;
    } catch (issue) { error = errorMessage(issue); }
    finally { busy = false; }
  }

  async function exportArchive(onlySelected: boolean = false): Promise<void> {
    const files: ArchiveEntry[] = onlySelected ? entries.filter((entry) => selected.includes(entry.name)) : entries;
    if (!files.length || busy) return;
    busy = true; error = ""; status = "Building archive locally…";
    try {
      const bytes: Uint8Array = await writeArchive($state.snapshot(files), format, Number(level));
      downloadBlob(bytes, `${archiveName.trim().replace(/[\\/]/g, "_") || "archive"}.${extension}`);
      status = `Downloaded ${files.length} ${files.length === 1 ? "file" : "files"} · ${formatBytes(bytes.length)}.`;
    } catch (issue) { error = errorMessage(issue); status = ""; }
    finally { busy = false; }
  }

  function openPreview(entry: ArchiveEntry): void { previewName = entry.name; rename = entry.name; renaming = false; }

  function renameEntry(): void {
    if (!preview) return;
    try {
      const name: string = safeArchivePath(rename);
      if (entries.some((entry) => entry !== preview && entry.name === name)) throw new Error("A file with that path already exists.");
      const previous: string = preview.name;
      entries = entries.map((entry) => entry.name === previous ? { ...entry, name } : entry);
      selected = selected.map((value) => value === previous ? name : value);
      previewName = name; renaming = false; error = ""; status = `Renamed to ${name}.`;
    } catch (issue) { error = errorMessage(issue); }
  }

  function removeSelected(): void {
    const count: number = selected.length;
    entries = entries.filter((entry) => !selected.includes(entry.name));
    if (selected.includes(previewName)) previewName = "";
    selected = []; status = `Removed ${count} ${count === 1 ? "file" : "files"}.`;
  }

  function toggleAll(): void {
    const names: string[] = filtered.map((entry) => entry.name);
    selected = allVisibleSelected ? selected.filter((name) => !names.includes(name)) : [...new Set([...selected, ...names])];
  }

  function clearWorkspace(): void {
    if (!confirm("Remove all files from this workspace?")) return;
    entries = []; selected = []; previewName = ""; query = ""; status = "Workspace cleared.";
  }

  function shortcut(event: KeyboardEvent): void {
    if (isEditing(event) || busy) return;
    if (event.key === "/") { event.preventDefault(); searchInput?.focus(); }
    if (event.key.toLowerCase() === "e" && entries.length) { event.preventDefault(); void exportArchive(selected.length > 0); }
    if (event.key === "Delete" && selected.length) removeSelected();
    if (event.key === "Escape") { previewName = ""; selected = []; }
  }
</script>

<svelte:window onkeydown={shortcut} />
<ToolWorkbench description="Open archives, inspect their contents, or build a new one. ZIP, USTAR TAR, and GZIP are processed entirely on your device.">
  <FileDropZone accept=".zip,.tar,.gz,.tgz" compact={entries.length > 0} title={entries.length ? "Open a different archive" : "Drop an archive to open it"} hint={entries.length ? "Replaces the current workspace after confirmation." : "ZIP · TAR · TAR.GZ · GZIP — up to 128 MB. Or start empty with Add files below. Encrypted ZIP, RAR and 7z are not supported."} disabled={busy} onfiles={open} />
  <div class="wb-toolbar">
    <label class="wb-button" class:disabled={busy}><FilePlus size={16} /> Add files<input class="wb-file-input" type="file" multiple disabled={busy} onchange={(event) => { void add(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = ""; }} /></label>
    <label class="wb-button" class:disabled={busy}><FolderPlus size={16} /> Add folder<input class="wb-file-input" type="file" webkitdirectory multiple disabled={busy} onchange={(event) => { void add(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = ""; }} /></label>
    {#if busy}<progress aria-label="Processing archive" style="width: 8rem;"></progress>{/if}
    <span class="wb-small wb-muted" role="status">{status}</span>
    <span class="wb-spacer"></span>
    {#if entries.length}<button disabled={busy} onclick={clearWorkspace}>Clear workspace</button>{/if}
  </div>
  {#if error}<p class="wb-error" role="alert">{error}</p>{/if}

  {#if entries.length}
    <div class="wb-toolbar">
      <input bind:this={searchInput} type="search" aria-label="Filter archive files" placeholder="Filter by path…  ( / )" bind:value={query} style="flex: 1; min-width: min(100%, 14rem);" />
      <label class="wb-field sort-field"><span class="visually-hidden">Sort files</span><select aria-label="Sort files" bind:value={sortKey}><option value="name">Sort by path</option><option value="size">Largest first</option></select></label>
      <span class="wb-small wb-muted">{entries.length} files · {formatBytes(total)}</span>
    </div>
    {#if selected.length}
      <div class="selection-bar" role="region" aria-label="Selection actions">
        <strong>{selected.length} selected</strong><span class="wb-small">{formatBytes(selectedSize)}</span>
        <span class="wb-spacer"></span>
        <button disabled={busy} onclick={() => exportArchive(true)}><Archive size={15} /> Export selected</button>
        <button disabled={busy} onclick={removeSelected}><Trash2 size={15} /> Remove</button>
        <button class="wb-icon" aria-label="Clear selection" onclick={() => selected = []}><X size={15} /></button>
      </div>
    {/if}
    <div class="archive-layout" class:with-preview={!!preview}>
      <div class="wb-panel wb-scroll file-table">
        <table>
          <thead><tr><th class="check-cell"><input type="checkbox" aria-label="Select all visible files" checked={allVisibleSelected} indeterminate={!allVisibleSelected && filtered.some((entry) => selected.includes(entry.name))} onchange={toggleAll} /></th><th>Path</th><th class="size-cell">Size</th><th class="action-cell"><span class="visually-hidden">Download</span></th></tr></thead>
          <tbody>
            {#each filtered as entry (entry.name)}
              <tr class:wb-row-active={previewName === entry.name}>
                <td class="check-cell"><input type="checkbox" aria-label={`Select ${entry.name}`} value={entry.name} bind:group={selected} /></td>
                <td class="wb-mono"><button class="wb-link" onclick={() => openPreview(entry)} aria-label={`Preview ${entry.name}`}>{#if entry.name.includes("/")}<span class="wb-muted">{entry.name.slice(0, entry.name.lastIndexOf("/") + 1)}</span>{/if}{entry.name.split("/").pop()}</button></td>
                <td class="size-cell">{formatBytes(entry.data.length)}</td>
                <td class="action-cell"><button class="wb-icon" aria-label={`Download ${entry.name}`} title="Download file" onclick={() => downloadBlob(entry.data, entry.name.split("/").pop()!)}><Download size={15} /></button></td>
              </tr>
            {/each}
          </tbody>
        </table>
        {#if !filtered.length}<p class="wb-empty">No paths match “{query}”. <button class="wb-link" onclick={() => query = ""}>Clear filter</button></p>{/if}
      </div>
      {#if preview}
        <section class="wb-panel preview-panel" aria-label="File preview">
          <div class="wb-panel-heading">
            {#if renaming}
              <input aria-label="File path" bind:value={rename} style="flex: 1;" onkeydown={(event) => { if (event.key === "Enter") renameEntry(); if (event.key === "Escape") { event.stopPropagation(); renaming = false; rename = preview!.name; } }} />
              <button class="primary" onclick={renameEntry}>Save</button><button onclick={() => { renaming = false; rename = preview!.name; }}>Cancel</button>
            {:else}
              <span class="wb-mono preview-name">{preview.name}</span>
              <button class="wb-icon" aria-label="Rename path" title="Rename path" onclick={() => renaming = true}><Pencil size={14} /></button>
              <button class="wb-icon" aria-label={`Download ${preview.name}`} title="Download file" onclick={() => downloadBlob(preview!.data, preview!.name.split("/").pop()!)}><Download size={14} /></button>
              <button class="wb-icon" aria-label="Close preview" title="Close (Esc)" onclick={() => previewName = ""}><X size={14} /></button>
            {/if}
          </div>
          <p class="wb-small wb-muted preview-meta">{formatBytes(preview.data.length)} · text preview shows the first 64 KB</p>
          <pre class="wb-scroll preview-body">{previewText}</pre>
        </section>
      {/if}
    </div>
    <section class="wb-panel wb-padded wb-sticky-bar export-bar" aria-label="Export archive">
      <div class="wb-toolbar">
        <label class="wb-field name-field">Archive name<span class="name-input"><input bind:value={archiveName} aria-describedby="archive-extension" /><span id="archive-extension" class="wb-muted">.{extension}</span></span></label>
        <label class="wb-field">Format<select bind:value={format}><option value="zip">ZIP</option><option value="tar">TAR</option><option value="tar.gz">TAR.GZ</option></select></label>
        <label class="wb-field">Compression<select bind:value={level} disabled={format === "tar"} title={format === "tar" ? "TAR is not compressed" : undefined}><option value={0}>Store (fastest)</option><option value={6}>Balanced</option><option value={9}>Maximum</option></select></label>
        <span class="wb-spacer"></span>
        <button class="primary" disabled={busy} onclick={() => exportArchive()}><Archive size={16} /> Export all {entries.length} files</button>
      </div>
    </section>
  {:else}
    <p class="wb-small wb-muted">Tip: Add folder keeps directory structure. Everything stays in this tab until you download it.</p>
  {/if}
  <div class="wb-shortcuts"><span><kbd>/</kbd> Filter</span><span><kbd>E</kbd> Export (selection if any)</span><span><kbd>Del</kbd> Remove selected</span><span><kbd>Esc</kbd> Clear selection / close preview</span></div>
</ToolWorkbench>

<style>
  .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .sort-field { flex-direction: row; }
  .selection-bar { display: flex; flex-wrap: wrap; align-items: center; gap: .6rem 1rem; padding: .5rem .5rem .5rem 1rem; background: var(--color-accent); color: var(--color-btn-text); }
  .archive-layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1rem; align-items: start; }
  .archive-layout.with-preview { grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); }
  .file-table { max-height: min(60dvh, 34rem); }
  .file-table thead th { position: sticky; top: 0; z-index: 1; }
  .file-table td { vertical-align: middle; }
  .check-cell { width: 2.5rem; }
  .size-cell { width: 6rem; white-space: nowrap; text-align: right; font-variant-numeric: tabular-nums; }
  .action-cell { width: 3.25rem; text-align: right; }
  .preview-panel { position: sticky; top: 1rem; }
  .preview-name { flex: 1; min-width: 0; font-weight: 500; }
  .preview-meta { padding: .6rem 1rem 0; }
  .preview-body { max-height: min(50dvh, 26rem); padding: .6rem 1rem 1rem; }
  .name-field { flex: 1; min-width: min(100%, 14rem); }
  .name-input { display: flex; align-items: center; border: 1px solid var(--color-border); background: var(--color-bg-alt); }
  .name-input:focus-within { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  :global(.workbench) .name-input input { flex: 1; border: 0; outline: none; }
  .name-input span { padding-right: .7rem; font-size: .85rem; }
  @media (max-width: 900px) { .archive-layout.with-preview { grid-template-columns: minmax(0, 1fr); } .preview-panel { position: static; } }
</style>
