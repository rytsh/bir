<script lang="ts">
  import PdfDropzone from "./shared/PdfDropzone.svelte";
  import SignatureBanner from "./shared/SignatureBanner.svelte";
  import { getPdfjs } from "./shared/pdfjs-loader";
  import { detectSignatures, type DetectedSignature } from "./shared/pdf-signatures";
  import { downloadPdfBytes, fileToUint8Array, stripPdfExtension } from "./shared/pdf-utils";

  interface Region {
    id: number;
    page: number;
    x: number; // ratio 0..1, top-left
    y: number;
    w: number;
    h: number;
  }

  let file = $state<File | null>(null);
  let bytes = $state<Uint8Array | null>(null);
  let pageCount = $state(0);
  let signatures = $state<DetectedSignature[]>([]);
  let regions = $state<Region[]>([]);
  let nextId = 0;

  let canvases = $state<HTMLCanvasElement[]>([]);
  let pageDims = $state<{ w: number; h: number }[]>([]); // CSS-displayed dims
  let pageActualSizes = $state<{ w: number; h: number }[]>([]); // PDF coords

  let selectedId = $state<number | null>(null);
  let drawingPage = $state<number | null>(null);
  let drawStart = $state({ x: 0, y: 0 });
  let drawCurrent = $state({ x: 0, y: 0 });
  let processing = $state(false);
  let error = $state("");
  let info = $state("");

  async function handleFiles(files: File[]) {
    error = "";
    info = "";
    regions = [];
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

      const pdfjs = await getPdfjs();
      const pdfDoc = await pdfjs.getDocument({ data: buf.slice(0) }).promise;
      const sizes: { w: number; h: number }[] = [];
      const dims: { w: number; h: number }[] = [];
      // Render thumbnails (medium-resolution)
      const targetWidth = 700;
      // Wait one tick so canvases are bound
      await new Promise((r) => setTimeout(r, 50));
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const vp1 = page.getViewport({ scale: 1 });
        sizes.push({ w: vp1.width, h: vp1.height });
        const scale = targetWidth / vp1.width;
        const vp = page.getViewport({ scale });
        const canvas = canvases[i - 1];
        if (!canvas) continue;
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        dims.push({ w: vp.width, h: vp.height });
      }
      pageActualSizes = sizes;
      pageDims = dims;
    } catch (e: any) {
      error = `Failed to load PDF: ${e.message ?? e}`;
    }
  }

  function reset() {
    file = null;
    bytes = null;
    pageCount = 0;
    signatures = [];
    regions = [];
    error = "";
    info = "";
    canvases = [];
    pageDims = [];
    pageActualSizes = [];
  }

  function startDraw(pageIdx: number, e: MouseEvent) {
    const canvas = canvases[pageIdx];
    if (!canvas) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    drawingPage = pageIdx;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    drawStart = { x, y };
    drawCurrent = { x, y };

    const onMove = (ev: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      drawCurrent = {
        x: Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)),
        y: Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height)),
      };
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      const x1 = Math.min(drawStart.x, drawCurrent.x);
      const y1 = Math.min(drawStart.y, drawCurrent.y);
      const w = Math.abs(drawCurrent.x - drawStart.x);
      const h = Math.abs(drawCurrent.y - drawStart.y);
      drawingPage = null;
      if (w < 0.005 || h < 0.005) return;
      regions = [...regions, { id: ++nextId, page: pageIdx, x: x1, y: y1, w, h }];
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function removeRegion(id: number) {
    regions = regions.filter((r) => r.id !== id);
  }

  async function apply() {
    if (!bytes || !file) return;
    if (regions.length === 0) {
      error = "Draw at least one redaction region.";
      return;
    }
    processing = true;
    error = "";
    info = "";
    try {
      const { PDFDocument, rgb } = await import("pdf-lib");
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pages = doc.getPages();
      for (const r of regions) {
        const page = pages[r.page];
        if (!page) continue;
        const { width: pw, height: ph } = page.getSize();
        const x = r.x * pw;
        const w = r.w * pw;
        const h = r.h * ph;
        const y = ph - (r.y * ph + h);
        page.drawRectangle({ x, y, width: w, height: h, color: rgb(0, 0, 0), opacity: 1 });
      }
      const out = await doc.save();
      const base = stripPdfExtension(file.name);
      downloadPdfBytes(out, `${base}-redacted.pdf`);
      info = `Applied ${regions.length} redaction(s). Note: visual redaction only — underlying text may still exist.`;
    } catch (e: any) {
      error = `Redact failed: ${e.message ?? e}`;
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
    <PdfDropzone label="Drop a PDF here to redact regions" onfiles={handleFiles} />
  {:else}
    <div class="p-4 border border-(--color-border) bg-(--color-bg-alt) flex items-center justify-between">
      <div>
        <div class="text-sm text-(--color-text)">{file.name}</div>
        <div class="text-xs text-(--color-text-muted)">
          {pageCount} page{pageCount !== 1 ? "s" : ""} · {regions.length} region{regions.length !== 1 ? "s" : ""}
        </div>
      </div>
      <button class="text-xs text-(--color-text-muted) hover:text-(--color-text)" onclick={reset}>Clear</button>
    </div>

    <div class="p-3 bg-orange-500/10 border border-orange-500/30 text-xs text-orange-600 dark:text-orange-400">
      ⚠️ This adds opaque black rectangles over selected regions. The underlying text in the PDF stream is NOT removed. For
      true secret-handling, export to images (use PDF→JPG) or run the result through Compress → Rasterize.
    </div>

    <p class="text-xs text-(--color-text-muted)">
      Click and drag to draw a redaction box on any page. Click ✕ on a region to remove it.
    </p>

    <div class="flex flex-col items-center gap-4">
      {#each Array(pageCount) as _, i}
        <div class="relative bg-white border border-(--color-border) inline-block">
          <canvas
            bind:this={canvases[i]}
            onmousedown={(e) => startDraw(i, e)}
            class="block max-w-full cursor-crosshair"
          ></canvas>
          {#each regions.filter((r) => r.page === i) as r (r.id)}
            <div
              class="absolute bg-black/85 group"
              style="left: {r.x * 100}%; top: {r.y * 100}%; width: {r.w * 100}%; height: {r.h * 100}%;"
            >
              <button
                class="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600"
                onclick={() => removeRegion(r.id)}
                title="Remove redaction"
              >
                ✕
              </button>
            </div>
          {/each}
          {#if drawingPage === i}
            <div
              class="absolute bg-black/40 border border-black"
              style="left: {Math.min(drawStart.x, drawCurrent.x) * 100}%; top: {Math.min(drawStart.y, drawCurrent.y) * 100}%; width: {Math.abs(drawCurrent.x - drawStart.x) * 100}%; height: {Math.abs(drawCurrent.y - drawStart.y) * 100}%;"
            ></div>
          {/if}
          <div class="absolute bottom-1 left-1 px-2 py-0.5 text-xs bg-black/50 text-white">
            Page {i + 1}
          </div>
        </div>
      {/each}
    </div>

    {#if error}
      <div class="p-3 border border-red-500 bg-red-500/10 text-red-500 text-sm">{error}</div>
    {/if}
    {#if info}
      <div class="p-3 border border-green-500 bg-green-500/10 text-green-600 dark:text-green-400 text-sm">{info}</div>
    {/if}

    <button
      class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50 self-start"
      onclick={apply}
      disabled={processing || regions.length === 0}
    >
      {processing ? "Applying..." : `Redact ${regions.length} region${regions.length !== 1 ? "s" : ""} & Download`}
    </button>
  {/if}
</div>
