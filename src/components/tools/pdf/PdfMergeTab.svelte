<script lang="ts">
  import PdfDropzone from "./shared/PdfDropzone.svelte";
  import SignatureBanner from "./shared/SignatureBanner.svelte";
  import { detectSignatures, type DetectedSignature } from "./shared/pdf-signatures";
  import { downloadPdfBytes, formatBytes, fileToUint8Array, stripPdfExtension } from "./shared/pdf-utils";

  interface PdfEntry {
    id: number;
    file: File;
    bytes: Uint8Array;
    pageCount: number;
    signatures: DetectedSignature[];
  }

  let entries = $state<PdfEntry[]>([]);
  let nextId = 0;
  let processing = $state(false);
  let error = $state("");
  let info = $state("");

  let allSignatures = $derived(entries.flatMap((e) => e.signatures));
  let hasSignatures = $derived(allSignatures.length > 0);

  async function handleFiles(files: File[]) {
    error = "";
    info = "";
    const { PDFDocument } = await import("pdf-lib");
    const newEntries: PdfEntry[] = [];

    for (const file of files) {
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        error = `Skipped non-PDF file: ${file.name}`;
        continue;
      }
      try {
        const bytes = await fileToUint8Array(file);
        const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pageCount = doc.getPageCount();
        const signatures = await detectSignatures(bytes);
        newEntries.push({ id: ++nextId, file, bytes, pageCount, signatures });
      } catch (e: any) {
        error = `Failed to load ${file.name}: ${e.message ?? e}`;
      }
    }

    entries = [...entries, ...newEntries];
  }

  function move(id: number, dir: -1 | 1) {
    const idx = entries.findIndex((e) => e.id === id);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= entries.length) return;
    const next = [...entries];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    entries = next;
  }

  function remove(id: number) {
    entries = entries.filter((e) => e.id !== id);
  }

  function clearAll() {
    entries = [];
    error = "";
    info = "";
  }

  async function merge() {
    if (entries.length < 2) {
      error = "Add at least two PDFs to merge.";
      return;
    }
    processing = true;
    error = "";
    info = "";
    try {
      const { PDFDocument } = await import("pdf-lib");
      const out = await PDFDocument.create();
      for (const entry of entries) {
        const src = await PDFDocument.load(entry.bytes, { ignoreEncryption: true });
        const indices = src.getPageIndices();
        const copied = await out.copyPages(src, indices);
        for (const p of copied) out.addPage(p);
      }
      const bytes = await out.save();
      const base = stripPdfExtension(entries[0].file.name);
      downloadPdfBytes(bytes, `${base}-merged.pdf`);
      info = `Merged ${entries.length} PDFs (${out.getPageCount()} pages total).`;
    } catch (e: any) {
      error = `Merge failed: ${e.message ?? e}`;
    } finally {
      processing = false;
    }
  }
</script>

<div class="flex flex-col gap-4">
  {#if hasSignatures}
    <SignatureBanner signatures={allSignatures} showDestructiveWarning />
  {/if}

  <PdfDropzone
    multiple
    label="Drop PDF files here or click to browse"
    sublabel="Select two or more PDFs to combine. Drag to reorder, then click Merge."
    onfiles={handleFiles}
  />

  {#if error}
    <div class="p-3 border border-red-500 bg-red-500/10 text-red-500 text-sm">{error}</div>
  {/if}

  {#if info}
    <div class="p-3 border border-green-500 bg-green-500/10 text-green-600 dark:text-green-400 text-sm">{info}</div>
  {/if}

  {#if entries.length > 0}
    <div class="border border-(--color-border) bg-(--color-bg-alt)">
      <div class="px-4 py-2 border-b border-(--color-border) flex items-center justify-between">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">
          {entries.length} PDF{entries.length !== 1 ? "s" : ""} queued
        </span>
        <button
          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          onclick={clearAll}
        >
          Clear all
        </button>
      </div>
      <ul class="divide-y divide-(--color-border)">
        {#each entries as entry, i (entry.id)}
          <li class="px-4 py-3 flex items-center gap-3">
            <span class="text-xs text-(--color-text-muted) w-6 text-right">{i + 1}.</span>
            <div class="flex-1 min-w-0">
              <div class="text-sm text-(--color-text) truncate">{entry.file.name}</div>
              <div class="text-xs text-(--color-text-muted) flex items-center gap-2">
                <span>{entry.pageCount} page{entry.pageCount !== 1 ? "s" : ""}</span>
                <span>·</span>
                <span>{formatBytes(entry.file.size)}</span>
                {#if entry.signatures.length > 0}
                  <span>·</span>
                  <span class="text-orange-500" title="This PDF is signed">✍️ signed</span>
                {/if}
              </div>
            </div>
            <div class="flex items-center gap-1">
              <button
                class="px-2 py-1 text-sm border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) disabled:opacity-30"
                disabled={i === 0}
                onclick={() => move(entry.id, -1)}
                title="Move up"
              >
                ↑
              </button>
              <button
                class="px-2 py-1 text-sm border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) disabled:opacity-30"
                disabled={i === entries.length - 1}
                onclick={() => move(entry.id, 1)}
                title="Move down"
              >
                ↓
              </button>
              <button
                class="px-2 py-1 text-sm border border-(--color-border) text-red-500 hover:bg-red-500/10"
                onclick={() => remove(entry.id)}
                title="Remove"
              >
                ✕
              </button>
            </div>
          </li>
        {/each}
      </ul>
    </div>

    <button
      class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50 self-start"
      onclick={merge}
      disabled={processing || entries.length < 2}
    >
      {processing ? "Merging..." : `Merge ${entries.length} PDF${entries.length !== 1 ? "s" : ""}`}
    </button>
  {/if}
</div>
