<script lang="ts">
  import { onDestroy, tick } from "svelte";
  import { Archive, Download, File as FileIcon, FileArchive, FileCode, FileImage, FileMusic, FilePlus, FileSpreadsheet, FileText, FolderPlus, Lock, Package, Pencil, ShieldCheck, Trash2, X } from "@lucide/svelte";
  import FileDropZone from "../ui/FileDropZone.svelte";
  import ToolWorkbench from "../ui/ToolWorkbench.svelte";
  import { ARCHIVE_LIMIT, ENTRY_LIMIT, readArchive, safeArchivePath, writeArchive, type ArchiveEntry } from "../../lib/archive.ts";
  import { downloadBlob, errorMessage, formatBytes, isEditing } from "../../lib/workbench.ts";
  import { ArchiveUnlockError, readExtendedArchive } from "../../lib/archive-engine-client.ts";

  type SortKey = "name" | "size";
  let entries = $state<ArchiveEntry[]>([]);
  let selected = $state<string[]>([]);
  let query = $state<string>("");
  let sortKey = $state<SortKey>("name");
  let format = $state<"zip" | "tar" | "tar.gz">("zip");
  let level = $state<number>(6);
  let archiveName = $state<string>("archive");
  let busy = $state<boolean>(false);
  let enforceLimits = $state<boolean>(true);
  let openingController = $state<AbortController | null>(null);
  let lockedFile = $state<File | null>(null);
  let password = $state<string>("");
  let passwordInput = $state<HTMLInputElement>();
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
    if (preview.data.subarray(0, 4096).includes(0)) return "Binary file. Download it to open in its native application.";
    return new TextDecoder().decode(preview.data.subarray(0, 64 * 1024));
  });
  const extension = $derived(format === "tar.gz" ? "tar.gz" : format);
  const folderCount = $derived(new Set(entries.filter((entry) => entry.name.includes("/")).map((entry) => entry.name.split("/")[0])).size);
  const imageTypes: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif", bmp: "image/bmp", ico: "image/x-icon" };
  const previewImageType = $derived(preview ? imageTypes[fileExtension(preview.name)] ?? "" : "");
  let previewUrl = $state<string>("");

  $effect(() => {
    if (!preview || !previewImageType) { previewUrl = ""; return; }
    const url: string = URL.createObjectURL(new Blob([preview.data as BlobPart], { type: previewImageType }));
    previewUrl = url;
    return () => URL.revokeObjectURL(url);
  });

  function fileExtension(name: string): string {
    const base: string = name.split("/").pop() ?? "";
    return base.includes(".") ? base.split(".").pop()!.toLowerCase() : "";
  }

  function fileKind(name: string): "image" | "code" | "text" | "data" | "audio" | "archive" | "file" {
    const ext: string = fileExtension(name);
    if (ext in imageTypes || ext === "svg") return "image";
    if (["js", "mjs", "cjs", "ts", "tsx", "jsx", "svelte", "astro", "vue", "html", "css", "scss", "py", "go", "rs", "java", "c", "h", "cpp", "sh", "rb", "php", "swift", "kt", "sql"].includes(ext)) return "code";
    if (["md", "txt", "log", "rtf", "pdf", "doc", "docx"].includes(ext)) return "text";
    if (["json", "yaml", "yml", "toml", "xml", "csv", "tsv", "xlsx", "xls", "ini", "env", "lock"].includes(ext)) return "data";
    if (["mp3", "wav", "flac", "ogg", "m4a", "aac"].includes(ext)) return "audio";
    if (["zip", "tar", "gz", "tgz", "rar", "7z", "xz", "bz2"].includes(ext)) return "archive";
    return "file";
  }

  onDestroy(() => { openingController?.abort(); });

  async function open(files: File[], retry: boolean = false): Promise<void> {
    if (busy || !files.length) return;
    if (!retry && entries.length && !confirm("Opening an archive replaces the current workspace. Continue?")) return;
    if (!retry) { password = ""; lockedFile = null; }
    busy = true; error = ""; status = "Opening archive…";
    const controller: AbortController = new AbortController();
    openingController = controller;
    try {
      const file: File = files[0];
      const signature: Uint8Array = new Uint8Array(await file.slice(0, 8).arrayBuffer());
      const extended: boolean = /\.(zip|rar|7z)$/i.test(file.name) || (signature[0] === 0x50 && signature[1] === 0x4b) || (signature[0] === 0x52 && signature[1] === 0x61 && signature[2] === 0x72) || (signature[0] === 0x37 && signature[1] === 0x7a);
      const result: ArchiveEntry[] = extended
        ? await readExtendedArchive(file, password, { enforceLimits }, controller.signal)
        : await readArchive(new Uint8Array(await file.arrayBuffer()), file.name, { enforceLimits });
      if (controller.signal.aborted) return;
      entries = result; selected = []; previewName = ""; query = "";
      archiveName = file.name.replace(/\.(tar\.gz|tgz|zip|tar|gz|rar|7z)$/i, "");
      lockedFile = null; password = "";
      status = `Opened ${file.name} · ${result.length} files.`;
    } catch (issue) {
      if (controller.signal.aborted) { status = "Opening cancelled."; return; }
      error = errorMessage(issue); status = "";
      if (issue instanceof ArchiveUnlockError) {
        lockedFile = files[0]; password = "";
      }
    }
    finally { busy = false; openingController = null; if (lockedFile) { await tick(); passwordInput?.focus(); } }
  }

  async function add(files: File[]): Promise<void> {
    if (!files.length) return;
    busy = true; error = "";
    try {
      if (enforceLimits && (entries.length + files.length > ENTRY_LIMIT || total + files.reduce((sum, file) => sum + file.size, 0) > ARCHIVE_LIMIT)) throw new Error("Memory protection is enabled: 5000 files / 256 MB. Disable it above to work with larger archives.");
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
      const bytes: Uint8Array = await writeArchive($state.snapshot(files), format, Number(level), { enforceLimits });
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
<ToolWorkbench description="Open, inspect, and create archives locally. Nothing leaves this tab.">
  <FileDropZone accept=".zip,.tar,.gz,.tgz,.rar,.7z" compact={entries.length > 0} title={entries.length ? "Open a different archive" : "Drop an archive to open it"} hint={entries.length ? "Replaces the current workspace after confirmation." : "Or start empty: add files below and export them as a new archive."} disabled={busy} onfiles={open} />

  {#if !entries.length}
    <ul class="format-list" aria-label="Supported formats">
      <li><span class="format-label">Opens</span>{#each ["ZIP", "TAR", "TAR.GZ", "GZIP", "RAR", "7z"] as name}<span class="format-chip">{name}</span>{/each}</li>
      <li><span class="format-label">Exports</span>{#each ["ZIP", "TAR", "TAR.GZ"] as name}<span class="format-chip">{name}</span>{/each}</li>
      <li><span class="format-label"><Lock size={12} aria-hidden="true" /> Passwords</span><span class="wb-muted">ZIP, RAR and 7z unlock locally</span></li>
    </ul>
  {/if}

  {#if lockedFile}
    <form class="unlock-panel" onsubmit={(event) => { event.preventDefault(); if (lockedFile) void open([lockedFile], true); }}>
      <div class="unlock-heading"><Lock size={18} aria-hidden="true" /><div><strong>{lockedFile.name} is password-protected</strong><span id="archive-password-hint" class="wb-small wb-muted">The password stays in this tab and is cleared after opening.</span></div></div>
      <div class="unlock-fields">
        <input bind:this={passwordInput} type="password" bind:value={password} autocomplete="off" disabled={busy} aria-label="Archive password" placeholder="Archive password" aria-describedby="archive-password-hint" />
        <button type="submit" class="primary" disabled={busy || !password}>Unlock</button>
        <button type="button" disabled={busy} onclick={() => { lockedFile = null; password = ""; error = ""; }}>Cancel</button>
      </div>
    </form>
  {/if}

  <div class="wb-toolbar">
    <label class="wb-button" class:disabled={busy}><FilePlus size={16} /> {entries.length ? "Add files" : "Add files to pack"}<input class="wb-file-input" type="file" multiple disabled={busy} onchange={(event) => { void add(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = ""; }} /></label>
    <label class="wb-button" class:disabled={busy}><FolderPlus size={16} /> Add folder<input class="wb-file-input" type="file" webkitdirectory multiple disabled={busy} onchange={(event) => { void add(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = ""; }} /></label>
    {#if busy}<progress aria-label="Processing archive" class="busy-progress"></progress>{/if}
    {#if openingController}<button onclick={() => openingController?.abort()}>Cancel opening</button>{/if}
    <span class="wb-small wb-muted" role="status">{status}</span>
    <span class="wb-spacer"></span>
    <label class="memory-toggle" title={enforceLimits ? "Caps expanded data at 256 MB and 5,000 files. Turn off to remove limits." : "Limits disabled. Large archives may exhaust browser memory or freeze this tab."}>
      <input type="checkbox" bind:checked={enforceLimits} disabled={busy} aria-describedby="archive-memory-hint" />
      <ShieldCheck size={15} aria-hidden="true" /> Memory protection
      <span id="archive-memory-hint" class="wb-small" class:wb-muted={enforceLimits} class:limits-off={!enforceLimits}>{enforceLimits ? "256 MB · 5,000 files" : "Off: large archives may freeze this tab"}</span>
    </label>
  </div>
  {#if error}<p class="wb-error" role="alert">{error}</p>{/if}

  {#if entries.length}
    <div class="archive-summary">
      <div class="summary-title"><Package size={18} aria-hidden="true" /><strong class="wb-mono">{archiveName || "archive"}</strong></div>
      <dl class="summary-stats">
        <div><dt>Files</dt><dd>{entries.length.toLocaleString("en-US")}</dd></div>
        {#if folderCount}<div><dt>Top folders</dt><dd>{folderCount}</dd></div>{/if}
        <div><dt>Expanded size</dt><dd>{formatBytes(total)}</dd></div>
      </dl>
      <span class="wb-spacer"></span>
      <button class="clear-button" disabled={busy} onclick={clearWorkspace}><Trash2 size={14} /> Clear workspace</button>
    </div>

    <div class="wb-toolbar">
      <input bind:this={searchInput} type="search" aria-label="Filter archive files" placeholder="Filter by path…" bind:value={query} class="filter-input" />
      <label class="wb-field sort-field"><span class="visually-hidden">Sort files</span><select aria-label="Sort files" bind:value={sortKey}><option value="name">Sort by path</option><option value="size">Largest first</option></select></label>
    </div>
    <div class="archive-layout" class:with-preview={!!preview}>
      <div class="wb-panel file-panel">
        {#if selected.length}
          <div class="selection-bar" role="region" aria-label="Selection actions">
            <strong>{selected.length} selected</strong><span class="wb-small wb-muted">{formatBytes(selectedSize)}</span>
            <span class="wb-spacer"></span>
            <button disabled={busy} onclick={() => exportArchive(true)}><Archive size={15} /> Export selected</button>
            <button class="danger" disabled={busy} onclick={removeSelected}><Trash2 size={15} /> Remove</button>
            <button class="wb-icon" aria-label="Clear selection" title="Clear selection (Esc)" onclick={() => selected = []}><X size={15} /></button>
          </div>
        {/if}
        <div class="wb-scroll file-table">
          <table>
            <thead><tr><th class="check-cell"><input type="checkbox" aria-label="Select all visible files" checked={allVisibleSelected} indeterminate={!allVisibleSelected && filtered.some((entry) => selected.includes(entry.name))} onchange={toggleAll} /></th><th>Path</th><th class="size-cell">Size</th><th class="action-cell"><span class="visually-hidden">Download</span></th></tr></thead>
            <tbody>
              {#each filtered as entry (entry.name)}
                {@const kind = fileKind(entry.name)}
                <tr class:wb-row-active={previewName === entry.name} class:row-selected={selected.includes(entry.name)}>
                  <td class="check-cell"><input type="checkbox" aria-label={`Select ${entry.name}`} value={entry.name} bind:group={selected} /></td>
                  <td>
                    <button class="wb-plain file-open" onclick={() => openPreview(entry)} aria-label={`Preview ${entry.name}`}>
                      <span class="file-icon" data-kind={kind} aria-hidden="true">
                        {#if kind === "image"}<FileImage size={16} />{:else if kind === "code"}<FileCode size={16} />{:else if kind === "text"}<FileText size={16} />{:else if kind === "data"}<FileSpreadsheet size={16} />{:else if kind === "audio"}<FileMusic size={16} />{:else if kind === "archive"}<FileArchive size={16} />{:else}<FileIcon size={16} />{/if}
                      </span>
                      <span class="file-path wb-mono">{#if entry.name.includes("/")}<span class="file-dir">{entry.name.slice(0, entry.name.lastIndexOf("/") + 1)}</span>{/if}<span class="file-base">{entry.name.split("/").pop()}</span></span>
                    </button>
                  </td>
                  <td class="size-cell">{formatBytes(entry.data.length)}</td>
                  <td class="action-cell"><button class="wb-icon row-download" aria-label={`Download ${entry.name}`} title="Download file" onclick={() => downloadBlob(entry.data, entry.name.split("/").pop()!)}><Download size={15} /></button></td>
                </tr>
              {/each}
            </tbody>
          </table>
          {#if !filtered.length}<p class="wb-empty">No paths match “{query}”. <button class="wb-link" onclick={() => query = ""}>Clear filter</button></p>{/if}
        </div>
      </div>
      {#if preview}
        <section class="wb-panel preview-panel" aria-label="File preview">
          <div class="wb-panel-heading">
            {#if renaming}
              <input aria-label="File path" bind:value={rename} style="flex: 1;" onkeydown={(event) => { if (event.key === "Enter") renameEntry(); if (event.key === "Escape") { event.stopPropagation(); renaming = false; rename = preview!.name; } }} />
              <button class="primary" onclick={renameEntry}>Save</button><button onclick={() => { renaming = false; rename = preview!.name; }}>Cancel</button>
            {:else}
              <div class="preview-title">
                <span class="wb-mono preview-name">{preview.name.split("/").pop()}</span>
                <span class="wb-small wb-muted">{preview.name.includes("/") ? `${preview.name.slice(0, preview.name.lastIndexOf("/") + 1)} · ` : ""}{formatBytes(preview.data.length)}</span>
              </div>
              <button class="wb-icon" aria-label="Rename path" title="Rename path" onclick={() => renaming = true}><Pencil size={14} /></button>
              <button class="wb-icon" aria-label={`Download ${preview.name}`} title="Download file" onclick={() => downloadBlob(preview!.data, preview!.name.split("/").pop()!)}><Download size={14} /></button>
              <button class="wb-icon" aria-label="Close preview" title="Close (Esc)" onclick={() => previewName = ""}><X size={14} /></button>
            {/if}
          </div>
          {#if previewUrl}
            <div class="image-preview wb-checker"><img src={previewUrl} alt={`Preview of ${preview.name}`} /></div>
          {:else}
            <pre class="wb-scroll preview-body">{previewText}</pre>
            {#if preview.data.length > 64 * 1024}<p class="wb-small wb-muted preview-meta">Showing the first 64 KB.</p>{/if}
          {/if}
        </section>
      {/if}
    </div>
    <section class="wb-panel wb-padded wb-sticky-bar export-bar" aria-label="Export archive">
      <div class="wb-toolbar export-fields">
        <label class="wb-field name-field">Archive name<span class="name-input"><input bind:value={archiveName} aria-describedby="archive-extension" /><span id="archive-extension" class="wb-muted">.{extension}</span></span></label>
        <div class="wb-field format-field" role="group" aria-labelledby="archive-format-label">
          <span id="archive-format-label">Format</span>
          <div class="segmented">
            {#each [["zip", "ZIP"], ["tar", "TAR"], ["tar.gz", "TAR.GZ"]] as [value, label]}
              <button type="button" aria-pressed={format === value} onclick={() => format = value as typeof format}>{label}</button>
            {/each}
          </div>
        </div>
        <label class="wb-field">Compression<select bind:value={level} disabled={format === "tar"} title={format === "tar" ? "TAR is not compressed" : undefined}><option value={0}>Store (fastest)</option><option value={6}>Balanced</option><option value={9}>Maximum</option></select></label>
        <span class="wb-spacer"></span>
        <button class="primary export-button" disabled={busy} onclick={() => exportArchive()}><Archive size={16} /> Export {entries.length} {entries.length === 1 ? "file" : "files"}</button>
      </div>
      <p class="wb-small wb-muted">Exports are unencrypted, even when the original archive required a password.</p>
    </section>
  {/if}
  <div class="wb-shortcuts"><span><kbd>/</kbd> Filter</span><span><kbd>E</kbd> Export (selection if any)</span><span><kbd>Del</kbd> Remove selected</span><span><kbd>Esc</kbd> Clear selection / close preview</span></div>
  <p class="wb-small wb-muted">ZIP, RAR, and 7z reader: 7-Zip WASM · <a href={`${import.meta.env.BASE_URL}wasm/7zip-LICENSE.txt`}>License</a> · <a href="https://github.com/use-strict/7z-wasm">Source and build instructions</a></p>
</ToolWorkbench>

<style>
  .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .format-list { display: flex; flex-wrap: wrap; gap: .6rem 1.75rem; margin: -.25rem 0 0; padding: 0; list-style: none; font-size: .75rem; }
  .format-list li { display: flex; flex-wrap: wrap; align-items: center; gap: .35rem; }
  .format-label { display: inline-flex; align-items: center; gap: .3rem; margin-inline-end: .2rem; color: var(--color-text-muted); }
  .format-chip { padding: .1rem .4rem; border: 1px solid var(--color-border); background: var(--color-bg-alt); font-family: var(--font-mono); font-size: .6875rem; }
  .memory-toggle { display: inline-flex; flex-wrap: wrap; align-items: center; gap: .45rem; font-size: .8125rem; cursor: pointer; }
  .memory-toggle :global(svg) { color: var(--color-text-muted); }
  .limits-off { color: var(--color-error-text); }
  .busy-progress { width: 8rem; }

  .unlock-panel { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem; padding: 1rem; border: 1px solid var(--color-text-muted); background: var(--color-bg-alt); }
  .unlock-heading { display: flex; align-items: flex-start; gap: .75rem; min-width: 0; }
  .unlock-heading > div { display: flex; flex-direction: column; gap: .15rem; min-width: 0; overflow-wrap: anywhere; }
  .unlock-fields { display: flex; flex-wrap: wrap; gap: .5rem; flex: 1 1 22rem; justify-content: flex-end; }
  .unlock-fields input { flex: 1 1 12rem; }

  .archive-summary { display: flex; flex-wrap: wrap; align-items: center; gap: .75rem 2rem; padding: .9rem 1rem; border: 1px solid var(--color-border); background: var(--color-bg-alt); }
  .summary-title { display: flex; align-items: center; gap: .6rem; min-width: 0; font-size: .9375rem; }
  .summary-title strong { font-weight: 600; overflow-wrap: anywhere; }
  .summary-stats { display: flex; flex-wrap: wrap; gap: .5rem 1.75rem; margin: 0; }
  .summary-stats div { display: flex; flex-direction: column; gap: .05rem; }
  .summary-stats dt { color: var(--color-text-muted); font-size: .6875rem; text-transform: uppercase; letter-spacing: .06em; }
  .summary-stats dd { margin: 0; font-weight: 600; font-variant-numeric: tabular-nums; }
  :global(.workbench) .clear-button { border-color: transparent; background: transparent; color: var(--color-text-muted); font-size: .8125rem; }
  :global(.workbench) .clear-button:hover:not(:disabled) { color: var(--color-error-text); background: transparent; border-color: var(--color-border); }

  .filter-input { flex: 1; min-width: min(100%, 14rem); }
  .sort-field { flex-direction: row; }

  .archive-layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1rem; align-items: start; }
  .archive-layout.with-preview { grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); }
  .file-panel { display: flex; flex-direction: column; }
  .selection-bar { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem .9rem; padding: .5rem .5rem .5rem .9rem; border-bottom: 1px solid var(--color-border); background: var(--color-bg); }
  :global(.workbench) .selection-bar button:not(.wb-icon) { min-height: 2rem; padding: .3rem .7rem; font-size: .8125rem; }
  :global(.workbench) .selection-bar .danger:hover:not(:disabled) { color: var(--color-error-text); border-color: var(--color-error-border); }
  .file-table { max-height: min(60dvh, 34rem); }
  .file-table thead th { position: sticky; top: 0; z-index: 1; }
  .file-table :is(th, td) { padding-block: .45rem; vertical-align: middle; }
  .file-table tbody tr { transition: background-color .1s ease; }
  .file-table tbody tr:hover > td { background: var(--color-bg); }
  .file-table tbody tr.row-selected > td { background: color-mix(in srgb, var(--color-text) 5%, var(--color-bg-alt)); }
  .check-cell { width: 2.5rem; }
  .size-cell { width: 6rem; white-space: nowrap; text-align: right; font-variant-numeric: tabular-nums; color: var(--color-text-muted); }
  .action-cell { width: 3rem; text-align: right; }
  :global(.workbench) .file-open { display: flex; align-items: center; gap: .65rem; width: 100%; min-height: 2rem; padding: 0; border: 0; background: none; color: var(--color-text); text-align: left; font: inherit; cursor: pointer; }
  .file-open:hover .file-base { text-decoration: underline; text-underline-offset: 3px; }
  .file-icon { display: inline-flex; flex-shrink: 0; align-items: center; justify-content: center; width: 1.9rem; height: 1.9rem; border: 1px solid var(--color-border); background: var(--color-bg); color: var(--color-text-muted); }
  .file-icon[data-kind="image"], .file-icon[data-kind="archive"] { color: var(--color-text); }
  .file-path { min-width: 0; font-size: .8125rem; line-height: 1.45; overflow-wrap: anywhere; }
  .file-dir { color: var(--color-text-muted); }
  .file-base { font-weight: 500; }
  :global(.workbench) .row-download { border-color: transparent; background: transparent; color: var(--color-text-muted); }
  :global(.workbench) .row-download:hover { color: var(--color-text); }

  .preview-panel { position: sticky; top: 1rem; display: flex; flex-direction: column; }
  .preview-title { display: flex; flex-direction: column; flex: 1; min-width: 0; }
  .preview-name { font-weight: 600; }
  .preview-title .wb-small { font-weight: 400; overflow-wrap: anywhere; }
  .preview-meta { padding: .5rem 1rem .75rem; border-top: 1px solid var(--color-border); }
  .preview-body { max-height: min(55dvh, 30rem); margin: 0; padding: .8rem 1rem 1rem; }
  .image-preview { display: flex; align-items: center; justify-content: center; min-height: 12rem; max-height: min(55dvh, 30rem); padding: 1rem; }
  .image-preview img { max-width: 100%; max-height: calc(min(55dvh, 30rem) - 2rem); object-fit: contain; }

  .export-fields { align-items: flex-end; }
  .name-field { flex: 1; min-width: min(100%, 14rem); }
  .name-input { display: flex; align-items: center; border: 1px solid var(--color-border); background: var(--color-bg-alt); }
  .name-input:focus-within { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  :global(.workbench) .name-input input { flex: 1; border: 0; outline: none; }
  .name-input span { padding-right: .7rem; font-size: .85rem; font-family: var(--font-mono); }
  .format-field { display: flex; flex-direction: column; gap: .4rem; color: var(--color-text-muted); font-size: .8rem; }
  .segmented { display: flex; }
  :global(.workbench) .segmented button { min-height: 2.4rem; padding-inline: .75rem; font-family: var(--font-mono); font-size: .75rem; }
  :global(.workbench) .segmented button + button { margin-inline-start: -1px; }
  .export-bar > p { margin-top: .6rem; }
  .export-button { min-height: 2.6rem; padding-inline: 1.1rem; }
  @media (max-width: 900px) { .archive-layout.with-preview { grid-template-columns: minmax(0, 1fr); } .preview-panel { position: static; } }
  @media (max-width: 600px) {
    .memory-toggle { width: 100%; }
    .export-fields > * { flex: 1 1 100%; }
    .export-fields .wb-spacer { display: none; }
    .segmented button { flex: 1; }
    .summary-stats { gap: .5rem 1.25rem; }
    .file-icon { display: none; }
    .file-table :is(th, td) { padding-inline: .5rem; }
    .size-cell { width: 4.5rem; }
    :global(.workbench) .clear-button { padding-inline: 0; }
  }
</style>
