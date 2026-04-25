<script lang="ts">
  import PdfDropzone from "./shared/PdfDropzone.svelte";
  import SignatureBanner from "./shared/SignatureBanner.svelte";
  import { getPdfjs } from "./shared/pdfjs-loader";
  import { detectSignatures, type DetectedSignature } from "./shared/pdf-signatures";
  import { downloadBlob, fileToUint8Array, parsePageRanges, stripPdfExtension } from "./shared/pdf-utils";
  import { buildZip } from "./shared/zip-store";

  let file = $state<File | null>(null);
  let bytes = $state<Uint8Array | null>(null);
  let pageCount = $state(0);
  let signatures = $state<DetectedSignature[]>([]);
  let format = $state<"jpeg" | "png">("jpeg");
  let quality = $state(0.92);
  let dpi = $state(150);
  let scope = $state<"all" | "ranges">("all");
  let rangesInput = $state("1");
  let processing = $state(false);
  let progress = $state("");
  let error = $state("");
  let previews = $state<{ index: number; dataUrl: string }[]>([]);

  async function handleFiles(files: File[]) {
    error = "";
    previews = [];
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
    previews = [];
    error = "";
  }

  async function dataUrlToBytes(url: string): Promise<Uint8Array> {
    const res = await fetch(url);
    return new Uint8Array(await res.arrayBuffer());
  }

  async function convert() {
    if (!bytes || !file) return;
    processing = true;
    error = "";
    previews = [];
    progress = "";
    try {
      let targets: number[];
      if (scope === "all") {
        targets = Array.from({ length: pageCount }, (_, i) => i);
      } else {
        const parsed = parsePageRanges(rangesInput, pageCount);
        if (!parsed || parsed.length === 0) {
          error = "Invalid page range.";
          processing = false;
          return;
        }
        targets = parsed;
      }

      const pdfjs = await getPdfjs();
      const doc = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
      const base = stripPdfExtension(file.name);
      const scale = dpi / 72;
      const ext = format === "jpeg" ? "jpg" : "png";
      const mime = format === "jpeg" ? "image/jpeg" : "image/png";

      const out: { name: string; bytes: Uint8Array }[] = [];
      const previewArr: { index: number; dataUrl: string }[] = [];

      for (let i = 0; i < targets.length; i++) {
        const idx = targets[i];
        progress = `Rendering page ${i + 1} / ${targets.length}...`;
        const page = await doc.getPage(idx + 1);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d")!;
        if (format === "jpeg") {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        await page.render({ canvasContext: ctx, viewport }).promise;
        const dataUrl = canvas.toDataURL(mime, format === "jpeg" ? quality : undefined);
        out.push({
          name: `${base}-page-${idx + 1}.${ext}`,
          bytes: await dataUrlToBytes(dataUrl),
        });
        if (previewArr.length < 4) previewArr.push({ index: idx, dataUrl });
      }

      previews = previewArr;
      progress = "";

      if (out.length === 1) {
        downloadBlob(out[0].bytes as unknown as BlobPart, out[0].name, mime);
      } else {
        const zip = buildZip(out);
        downloadBlob(zip as unknown as BlobPart, `${base}-images.zip`, "application/zip");
      }
    } catch (e: any) {
      error = `Conversion failed: ${e.message ?? e}`;
      progress = "";
    } finally {
      processing = false;
    }
  }
</script>

<div class="flex flex-col gap-4">
  {#if signatures.length > 0}
    <SignatureBanner {signatures} />
  {/if}

  {#if !file}
    <PdfDropzone label="Drop a PDF here to convert pages to images" onfiles={handleFiles} />
  {:else}
    <div class="p-4 border border-(--color-border) bg-(--color-bg-alt) flex items-center justify-between">
      <div>
        <div class="text-sm text-(--color-text)">{file.name}</div>
        <div class="text-xs text-(--color-text-muted)">{pageCount} page{pageCount !== 1 ? "s" : ""}</div>
      </div>
      <button class="text-xs text-(--color-text-muted) hover:text-(--color-text)" onclick={reset}>Clear</button>
    </div>

    <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 border border-(--color-border)">
      <label class="text-xs text-(--color-text-muted) flex flex-col gap-1">
        Format
        <select
          bind:value={format}
          class="px-2 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
        >
          <option value="jpeg">JPEG (.jpg)</option>
          <option value="png">PNG (.png)</option>
        </select>
      </label>
      {#if format === "jpeg"}
        <label class="text-xs text-(--color-text-muted) flex flex-col gap-1">
          JPEG quality ({Math.round(quality * 100)}%)
          <input
            type="range"
            min="0.3"
            max="1"
            step="0.05"
            bind:value={quality}
            class="accent-(--color-accent)"
          />
        </label>
      {/if}
      <label class="text-xs text-(--color-text-muted) flex flex-col gap-1">
        DPI
        <input
          type="number"
          min="72"
          max="600"
          step="1"
          bind:value={dpi}
          class="px-2 py-1.5 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
        />
      </label>
      <label class="text-xs text-(--color-text-muted) flex flex-col gap-1">
        Pages
        <select
          bind:value={scope}
          class="px-2 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
        >
          <option value="all">All pages</option>
          <option value="ranges">Specific pages</option>
        </select>
      </label>
      {#if scope === "ranges"}
        <label class="text-xs text-(--color-text-muted) flex flex-col gap-1 sm:col-span-2 lg:col-span-4">
          Page range
          <input
            type="text"
            bind:value={rangesInput}
            placeholder="1, 3-5"
            class="px-2 py-1.5 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
          />
        </label>
      {/if}
    </div>

    {#if error}
      <div class="p-3 border border-red-500 bg-red-500/10 text-red-500 text-sm">{error}</div>
    {/if}
    {#if progress}
      <div class="p-3 border border-(--color-border) bg-(--color-bg-alt) text-sm text-(--color-text-muted)">{progress}</div>
    {/if}

    <button
      class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50 self-start"
      onclick={convert}
      disabled={processing}
    >
      {processing ? "Rendering..." : "Convert & Download"}
    </button>

    {#if previews.length > 0}
      <div class="border border-(--color-border) p-3">
        <div class="text-xs text-(--color-text-muted) mb-2">Preview (first {previews.length} page{previews.length !== 1 ? "s" : ""})</div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {#each previews as p}
            <div class="bg-white border border-(--color-border) p-1 flex items-center justify-center">
              <img src={p.dataUrl} alt="Page {p.index + 1}" class="max-w-full max-h-48 object-contain" />
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>
