<script lang="ts">
  import PdfDropzone from "./shared/PdfDropzone.svelte";
  import SignatureBanner from "./shared/SignatureBanner.svelte";
  import { getPdfjs } from "./shared/pdfjs-loader";
  import { detectSignatures, type DetectedSignature } from "./shared/pdf-signatures";
  import { downloadPdfBytes, fileToUint8Array, parsePageRanges, stripPdfExtension } from "./shared/pdf-utils";

  let file = $state<File | null>(null);
  let bytes = $state<Uint8Array | null>(null);
  let pageCount = $state(0);
  let signatures = $state<DetectedSignature[]>([]);

  // Crop box as ratios of page (0..1) measured top-left
  let cropX = $state(0.05);
  let cropY = $state(0.05);
  let cropW = $state(0.9);
  let cropH = $state(0.9);

  let scope = $state<"all" | "ranges">("all");
  let rangesInput = $state("1");
  let processing = $state(false);
  let error = $state("");
  let info = $state("");

  let previewCanvas = $state<HTMLCanvasElement | null>(null);
  let previewWrapper = $state<HTMLDivElement | null>(null);
  let previewPage = $state<any>(null);
  let previewPageWidth = $state(1);
  let previewPageHeight = $state(1);

  let dragging = $state<"move" | "ne" | "se" | "sw" | "nw" | null>(null);
  let dragStart = $state({ mx: 0, my: 0, x: 0, y: 0, w: 0, h: 0 });

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
      await renderPreview();
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
    previewPage = null;
  }

  async function renderPreview() {
    if (!bytes || !previewCanvas) {
      // Wait one tick for canvas to mount
      await new Promise((r) => setTimeout(r, 50));
      if (!previewCanvas) return;
    }
    const pdfjs = await getPdfjs();
    const doc = await pdfjs.getDocument({ data: bytes!.slice(0) }).promise;
    const page = await doc.getPage(1);
    previewPage = page;
    const viewport = page.getViewport({ scale: 1 });
    previewPageWidth = viewport.width;
    previewPageHeight = viewport.height;

    const targetWidth = 600;
    const scale = targetWidth / viewport.width;
    const scaled = page.getViewport({ scale });
    previewCanvas!.width = scaled.width;
    previewCanvas!.height = scaled.height;
    const ctx = previewCanvas!.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport: scaled }).promise;
  }

  $effect(() => {
    if (file && previewCanvas) {
      renderPreview();
    }
  });

  function clamp(n: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, n));
  }

  function startDrag(handle: typeof dragging, e: MouseEvent) {
    if (!previewCanvas) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = previewCanvas.getBoundingClientRect();
    dragging = handle;
    dragStart = {
      mx: (e.clientX - rect.left) / rect.width,
      my: (e.clientY - rect.top) / rect.height,
      x: cropX,
      y: cropY,
      w: cropW,
      h: cropH,
    };

    const onMove = (ev: MouseEvent) => {
      if (!dragging) return;
      const r = previewCanvas!.getBoundingClientRect();
      const mx = (ev.clientX - r.left) / r.width;
      const my = (ev.clientY - r.top) / r.height;
      const dx = mx - dragStart.mx;
      const dy = my - dragStart.my;

      if (dragging === "move") {
        cropX = clamp(dragStart.x + dx, 0, 1 - dragStart.w);
        cropY = clamp(dragStart.y + dy, 0, 1 - dragStart.h);
      } else {
        const minSize = 0.05;
        if (dragging.includes("e")) {
          cropW = clamp(dragStart.w + dx, minSize, 1 - dragStart.x);
        }
        if (dragging.includes("w")) {
          const newX = clamp(dragStart.x + dx, 0, dragStart.x + dragStart.w - minSize);
          cropW = dragStart.w - (newX - dragStart.x);
          cropX = newX;
        }
        if (dragging.includes("s")) {
          cropH = clamp(dragStart.h + dy, minSize, 1 - dragStart.y);
        }
        if (dragging.includes("n")) {
          const newY = clamp(dragStart.y + dy, 0, dragStart.y + dragStart.h - minSize);
          cropH = dragStart.h - (newY - dragStart.y);
          cropY = newY;
        }
      }
    };
    const onUp = () => {
      dragging = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  async function apply() {
    if (!bytes || !file) return;
    processing = true;
    error = "";
    info = "";
    try {
      const { PDFDocument } = await import("pdf-lib");
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
        const { width: pw, height: ph } = page.getSize();
        // Convert top-left origin ratios into PDF bottom-left coords
        const x = cropX * pw;
        const wOut = cropW * pw;
        const hOut = cropH * ph;
        const y = ph - (cropY * ph + hOut);
        page.setCropBox(x, y, wOut, hOut);
        page.setMediaBox(x, y, wOut, hOut);
      }

      const out = await doc.save();
      const base = stripPdfExtension(file.name);
      downloadPdfBytes(out, `${base}-cropped.pdf`);
      info = `Cropped ${targets.length} page(s).`;
    } catch (e: any) {
      error = `Crop failed: ${e.message ?? e}`;
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
    <PdfDropzone label="Drop a PDF here to crop pages" onfiles={handleFiles} />
  {:else}
    <div class="p-4 border border-(--color-border) bg-(--color-bg-alt) flex items-center justify-between">
      <div>
        <div class="text-sm text-(--color-text)">{file.name}</div>
        <div class="text-xs text-(--color-text-muted)">{pageCount} page{pageCount !== 1 ? "s" : ""}</div>
      </div>
      <button class="text-xs text-(--color-text-muted) hover:text-(--color-text)" onclick={reset}>Clear</button>
    </div>

    <p class="text-xs text-(--color-text-muted)">
      Drag the crop region on the preview (page 1). The same crop box is applied to selected pages.
    </p>

    <div class="border border-(--color-border) p-4 flex flex-col lg:flex-row gap-4">
      <div bind:this={previewWrapper} class="relative inline-block bg-white border border-(--color-border) self-start">
        <canvas bind:this={previewCanvas} class="block max-w-full"></canvas>
        <!-- Crop rectangle -->
        <div
          class="absolute border-2 border-(--color-accent) bg-(--color-accent)/10 cursor-move"
          style="left: {cropX * 100}%; top: {cropY * 100}%; width: {cropW * 100}%; height: {cropH * 100}%;"
          onmousedown={(e) => startDrag("move", e)}
          role="presentation"
        >
          <!-- Resize handles -->
          {#each [["nw", "left-0 top-0 cursor-nwse-resize"], ["ne", "right-0 top-0 cursor-nesw-resize"], ["sw", "left-0 bottom-0 cursor-nesw-resize"], ["se", "right-0 bottom-0 cursor-nwse-resize"]] as [pos, cls]}
            <div
              class="absolute w-3 h-3 -translate-x-1/2 -translate-y-1/2 bg-white border-2 border-(--color-accent) {cls}"
              style="margin-left: {pos.includes('e') ? '50%' : '50%'}; margin-top: {pos.includes('s') ? '50%' : '50%'};"
              onmousedown={(e) => startDrag(pos as any, e)}
              role="presentation"
            ></div>
          {/each}
        </div>
      </div>

      <div class="flex-1 flex flex-col gap-3">
        <div class="grid grid-cols-2 gap-3">
          <label class="text-xs text-(--color-text-muted) flex flex-col gap-1">
            X (%)
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={(cropX * 100).toFixed(1)}
              oninput={(e) => { cropX = clamp(parseFloat((e.target as HTMLInputElement).value) / 100, 0, 1 - cropW); }}
              class="px-2 py-1.5 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text)"
            />
          </label>
          <label class="text-xs text-(--color-text-muted) flex flex-col gap-1">
            Y (%)
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={(cropY * 100).toFixed(1)}
              oninput={(e) => { cropY = clamp(parseFloat((e.target as HTMLInputElement).value) / 100, 0, 1 - cropH); }}
              class="px-2 py-1.5 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text)"
            />
          </label>
          <label class="text-xs text-(--color-text-muted) flex flex-col gap-1">
            Width (%)
            <input
              type="number"
              min="5"
              max="100"
              step="0.1"
              value={(cropW * 100).toFixed(1)}
              oninput={(e) => { cropW = clamp(parseFloat((e.target as HTMLInputElement).value) / 100, 0.05, 1 - cropX); }}
              class="px-2 py-1.5 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text)"
            />
          </label>
          <label class="text-xs text-(--color-text-muted) flex flex-col gap-1">
            Height (%)
            <input
              type="number"
              min="5"
              max="100"
              step="0.1"
              value={(cropH * 100).toFixed(1)}
              oninput={(e) => { cropH = clamp(parseFloat((e.target as HTMLInputElement).value) / 100, 0.05, 1 - cropY); }}
              class="px-2 py-1.5 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text)"
            />
          </label>
        </div>

        <div class="text-xs text-(--color-text-muted) flex flex-col gap-2">
          Apply to:
          <div class="flex flex-wrap gap-3 items-center">
            <label class="flex items-center gap-2"><input type="radio" bind:group={scope} value="all" /> All pages</label>
            <label class="flex items-center gap-2"><input type="radio" bind:group={scope} value="ranges" /> Ranges</label>
            {#if scope === "ranges"}
              <input
                type="text"
                bind:value={rangesInput}
                placeholder="1, 3-5"
                class="flex-1 max-w-xs px-2 py-1.5 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text)"
              />
            {/if}
          </div>
        </div>
      </div>
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
      disabled={processing}
    >
      {processing ? "Cropping..." : "Crop & Download"}
    </button>
  {/if}
</div>
