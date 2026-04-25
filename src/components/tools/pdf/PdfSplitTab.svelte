<script lang="ts">
  import PdfDropzone from "./shared/PdfDropzone.svelte";
  import SignatureBanner from "./shared/SignatureBanner.svelte";
  import { detectSignatures, type DetectedSignature } from "./shared/pdf-signatures";
  import { downloadBlob, downloadPdfBytes, fileToUint8Array, parsePageRanges, stripPdfExtension } from "./shared/pdf-utils";
  import { buildZip } from "./shared/zip-store";

  type Mode = "ranges" | "every-n" | "extract";

  let file = $state<File | null>(null);
  let bytes = $state<Uint8Array | null>(null);
  let pageCount = $state(0);
  let signatures = $state<DetectedSignature[]>([]);
  let mode = $state<Mode>("ranges");
  let rangesInput = $state("1-1");
  let everyN = $state(1);
  let extractInput = $state("1");
  let separateFiles = $state(true);
  let processing = $state(false);
  let error = $state("");
  let info = $state("");

  async function handleFiles(files: File[]) {
    error = "";
    info = "";
    const f = files[0];
    if (!f) return;
    try {
      const buf = await fileToUint8Array(f);
      const { PDFDocument } = await import("pdf-lib");
      const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
      file = f;
      bytes = buf;
      pageCount = doc.getPageCount();
      signatures = await detectSignatures(buf);
      rangesInput = `1-${pageCount}`;
      extractInput = "1";
    } catch (e: any) {
      error = `Failed to load PDF: ${e.message ?? e}`;
    }
  }

  function reset() {
    file = null;
    bytes = null;
    pageCount = 0;
    signatures = [];
    error = "";
    info = "";
  }

  async function buildPdfFromPages(srcDoc: any, pageIndices: number[]): Promise<Uint8Array> {
    const { PDFDocument } = await import("pdf-lib");
    const out = await PDFDocument.create();
    const copied = await out.copyPages(srcDoc, pageIndices);
    for (const p of copied) out.addPage(p);
    return await out.save();
  }

  async function downloadAsZip(pieces: { name: string; bytes: Uint8Array }[]) {
    const zip = buildZip(pieces);
    const base = stripPdfExtension(file?.name ?? "split");
    downloadBlob(zip as unknown as BlobPart, `${base}-split.zip`, "application/zip");
  }

  async function split() {
    if (!bytes || !file) {
      error = "Load a PDF first.";
      return;
    }
    processing = true;
    error = "";
    info = "";
    try {
      const { PDFDocument } = await import("pdf-lib");
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const base = stripPdfExtension(file.name);

      let groups: number[][] = [];

      if (mode === "ranges") {
        const ranges = rangesInput
          .split(",")
          .map((r) => r.trim())
          .filter(Boolean);
        for (const r of ranges) {
          const parsed = parsePageRanges(r, pageCount);
          if (!parsed || parsed.length === 0) {
            error = `Invalid range: "${r}"`;
            processing = false;
            return;
          }
          groups.push(parsed);
        }
      } else if (mode === "every-n") {
        const n = Math.max(1, Math.floor(everyN));
        for (let i = 0; i < pageCount; i += n) {
          const slice: number[] = [];
          for (let j = i; j < Math.min(i + n, pageCount); j++) slice.push(j);
          groups.push(slice);
        }
      } else if (mode === "extract") {
        const parsed = parsePageRanges(extractInput, pageCount);
        if (!parsed || parsed.length === 0) {
          error = "Enter at least one valid page number.";
          processing = false;
          return;
        }
        if (separateFiles) {
          for (const p of parsed) groups.push([p]);
        } else {
          groups.push(parsed);
        }
      }

      if (groups.length === 0) {
        error = "Nothing to split.";
        processing = false;
        return;
      }

      if (groups.length === 1) {
        const out = await buildPdfFromPages(src, groups[0]);
        const suffix = groups[0].length === 1 ? `page-${groups[0][0] + 1}` : `pages-${groups[0][0] + 1}-${groups[0][groups[0].length - 1] + 1}`;
        downloadPdfBytes(out, `${base}-${suffix}.pdf`);
        info = `Created 1 file (${groups[0].length} pages).`;
      } else {
        const pieces: { name: string; bytes: Uint8Array }[] = [];
        for (const g of groups) {
          const out = await buildPdfFromPages(src, g);
          const suffix = g.length === 1 ? `page-${g[0] + 1}` : `pages-${g[0] + 1}-${g[g.length - 1] + 1}`;
          pieces.push({ name: `${base}-${suffix}.pdf`, bytes: out });
        }
        await downloadAsZip(pieces);
        info = `Created ${pieces.length} files in ZIP.`;
      }
    } catch (e: any) {
      error = `Split failed: ${e.message ?? e}`;
    } finally {
      processing = false;
    }
  }
</script>

<div class="flex flex-col gap-4">
  {#if signatures.length > 0}
    <SignatureBanner {signatures} showDestructiveWarning />
  {/if}

  {#if !file}
    <PdfDropzone label="Drop a PDF here to split" onfiles={handleFiles} />
  {:else}
    <div class="p-4 border border-(--color-border) bg-(--color-bg-alt) flex items-center justify-between">
      <div>
        <div class="text-sm text-(--color-text)">{file.name}</div>
        <div class="text-xs text-(--color-text-muted)">{pageCount} page{pageCount !== 1 ? "s" : ""}</div>
      </div>
      <button class="text-xs text-(--color-text-muted) hover:text-(--color-text)" onclick={reset}>Clear</button>
    </div>

    <div class="flex flex-col gap-3 p-4 border border-(--color-border)">
      <div class="flex flex-wrap gap-2">
        <label class="flex items-center gap-2 text-sm">
          <input type="radio" bind:group={mode} value="ranges" />
          By ranges
        </label>
        <label class="flex items-center gap-2 text-sm">
          <input type="radio" bind:group={mode} value="every-n" />
          Every N pages
        </label>
        <label class="flex items-center gap-2 text-sm">
          <input type="radio" bind:group={mode} value="extract" />
          Extract specific pages
        </label>
      </div>

      {#if mode === "ranges"}
        <label class="text-xs text-(--color-text-muted)">
          Ranges (comma-separated, each range becomes one PDF):
          <input
            type="text"
            bind:value={rangesInput}
            placeholder="1-3, 5-8"
            class="mt-1 w-full px-3 py-2 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
          />
          <span class="block mt-1 text-[11px] text-(--color-text-light)">
            Example: <code>1-3, 5, 7-9</code> creates 3 PDFs: pages 1-3, just page 5, pages 7-9.
          </span>
        </label>
      {:else if mode === "every-n"}
        <label class="text-xs text-(--color-text-muted) flex items-center gap-2">
          Pages per file:
          <input
            type="number"
            min="1"
            max={pageCount}
            bind:value={everyN}
            class="w-24 px-3 py-2 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
          />
          <span class="text-[11px] text-(--color-text-light)">
            Will create {Math.ceil(pageCount / Math.max(1, everyN))} file(s).
          </span>
        </label>
      {:else}
        <label class="text-xs text-(--color-text-muted)">
          Pages to extract:
          <input
            type="text"
            bind:value={extractInput}
            placeholder="1, 3, 5-7"
            class="mt-1 w-full px-3 py-2 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
          />
        </label>
        <label class="flex items-center gap-2 text-xs text-(--color-text-muted)">
          <input type="checkbox" bind:checked={separateFiles} />
          Output each page as a separate PDF (otherwise combine into one)
        </label>
      {/if}
    </div>

    {#if error}
      <div class="p-3 border border-red-500 bg-red-500/10 text-red-500 text-sm">{error}</div>
    {/if}
    {#if info}
      <div class="p-3 border border-green-500 bg-green-500/10 text-green-600 dark:text-green-400 text-sm">{info}</div>
    {/if}

    <button
      class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50 self-start"
      onclick={split}
      disabled={processing}
    >
      {processing ? "Splitting..." : "Split PDF"}
    </button>
  {/if}
</div>
