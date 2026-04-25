<script lang="ts">
  import PdfDropzone from "./shared/PdfDropzone.svelte";
  import SignatureBanner from "./shared/SignatureBanner.svelte";
  import { detectSignatures, type DetectedSignature } from "./shared/pdf-signatures";
  import { downloadPdfBytes, fileToUint8Array, parsePageRanges, stripPdfExtension } from "./shared/pdf-utils";

  type RotateScope = "all" | "ranges";

  let file = $state<File | null>(null);
  let bytes = $state<Uint8Array | null>(null);
  let pageCount = $state(0);
  let signatures = $state<DetectedSignature[]>([]);
  let scope = $state<RotateScope>("all");
  let rangesInput = $state("1");
  let angle = $state<90 | 180 | 270>(90);
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

  async function rotate() {
    if (!bytes || !file) return;
    processing = true;
    error = "";
    info = "";
    try {
      const { PDFDocument, degrees } = await import("pdf-lib");
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });

      let targets: number[];
      if (scope === "all") {
        targets = doc.getPageIndices();
      } else {
        const parsed = parsePageRanges(rangesInput, pageCount);
        if (!parsed || parsed.length === 0) {
          error = "Invalid page range.";
          processing = false;
          return;
        }
        targets = parsed;
      }

      const pages = doc.getPages();
      for (const idx of targets) {
        const page = pages[idx];
        if (!page) continue;
        const current = page.getRotation().angle ?? 0;
        const newAngle = (current + angle) % 360;
        page.setRotation(degrees(newAngle));
      }

      const out = await doc.save();
      const base = stripPdfExtension(file.name);
      downloadPdfBytes(out, `${base}-rotated.pdf`);
      info = `Rotated ${targets.length} page(s) by ${angle}°.`;
    } catch (e: any) {
      error = `Rotate failed: ${e.message ?? e}`;
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
    <PdfDropzone label="Drop a PDF here to rotate pages" onfiles={handleFiles} />
  {:else}
    <div class="p-4 border border-(--color-border) bg-(--color-bg-alt) flex items-center justify-between">
      <div>
        <div class="text-sm text-(--color-text)">{file.name}</div>
        <div class="text-xs text-(--color-text-muted)">{pageCount} page{pageCount !== 1 ? "s" : ""}</div>
      </div>
      <button class="text-xs text-(--color-text-muted) hover:text-(--color-text)" onclick={reset}>Clear</button>
    </div>

    <div class="flex flex-col gap-3 p-4 border border-(--color-border)">
      <div>
        <div class="text-xs text-(--color-text-muted) mb-2">Rotation angle</div>
        <div class="flex gap-2">
          {#each [90, 180, 270] as a}
            <button
              class="px-3 py-1.5 text-sm border transition-colors {angle === a
                ? 'border-(--color-accent) bg-(--color-accent)/10 text-(--color-accent)'
                : 'border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)'}"
              onclick={() => (angle = a as 90 | 180 | 270)}
            >
              {a}° {a === 90 ? "↻" : a === 180 ? "↕" : "↺"}
            </button>
          {/each}
        </div>
      </div>

      <div>
        <div class="text-xs text-(--color-text-muted) mb-2">Apply to</div>
        <div class="flex flex-wrap gap-3">
          <label class="flex items-center gap-2 text-sm">
            <input type="radio" bind:group={scope} value="all" />
            All pages
          </label>
          <label class="flex items-center gap-2 text-sm">
            <input type="radio" bind:group={scope} value="ranges" />
            Specific pages
          </label>
        </div>
      </div>

      {#if scope === "ranges"}
        <label class="text-xs text-(--color-text-muted)">
          Pages:
          <input
            type="text"
            bind:value={rangesInput}
            placeholder="1, 3-5, 7"
            class="mt-1 w-full px-3 py-2 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
          />
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
      onclick={rotate}
      disabled={processing}
    >
      {processing ? "Rotating..." : "Rotate & Download"}
    </button>
  {/if}
</div>
