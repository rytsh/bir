<script lang="ts">
  import PdfDropzone from "./shared/PdfDropzone.svelte";
  import SignatureBanner from "./shared/SignatureBanner.svelte";
  import { detectSignatures, type DetectedSignature } from "./shared/pdf-signatures";
  import { downloadPdfBytes, fileToUint8Array, parsePageRanges, stripPdfExtension } from "./shared/pdf-utils";

  type Mode = "text" | "image";
  type Position = "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right" | "diagonal";

  let file = $state<File | null>(null);
  let bytes = $state<Uint8Array | null>(null);
  let pageCount = $state(0);
  let signatures = $state<DetectedSignature[]>([]);

  let mode = $state<Mode>("text");
  let text = $state("CONFIDENTIAL");
  let fontSize = $state(64);
  let color = $state("#888888");
  let opacity = $state(0.4);
  let rotation = $state(0);
  let position = $state<Position>("diagonal");
  let scope = $state<"all" | "ranges">("all");
  let rangesInput = $state("1");

  let imageFile = $state<File | null>(null);
  let imageDataUrl = $state("");
  let imageScale = $state(0.5);

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

  async function handleImageSelect(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    imageFile = f;
    imageDataUrl = await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.readAsDataURL(f);
    });
  }

  function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const m = hex.match(/^#?([0-9a-f]{6})$/i);
    if (!m) return { r: 0, g: 0, b: 0 };
    const n = parseInt(m[1], 16);
    return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
  }

  async function apply() {
    if (!bytes || !file) return;
    if (mode === "image" && !imageFile) {
      error = "Please choose an image to use as the watermark.";
      return;
    }
    processing = true;
    error = "";
    info = "";
    try {
      const { PDFDocument, StandardFonts, rgb, degrees } = await import("pdf-lib");
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

      const font = await doc.embedFont(StandardFonts.HelveticaBold);
      const { r, g, b } = hexToRgb(color);

      let imgEmbed: any = null;
      if (mode === "image" && imageFile) {
        const ab = await imageFile.arrayBuffer();
        if (imageFile.type === "image/png") imgEmbed = await doc.embedPng(ab);
        else imgEmbed = await doc.embedJpg(ab);
      }

      const pages = doc.getPages();
      for (const idx of targets) {
        const page = pages[idx];
        if (!page) continue;
        const { width: pw, height: ph } = page.getSize();

        if (mode === "text") {
          const tw = font.widthOfTextAtSize(text, fontSize);
          const th = fontSize;
          let x = pw / 2 - tw / 2;
          let y = ph / 2 - th / 2;
          let rot = rotation;
          if (position === "diagonal") {
            rot = 45;
            x = pw / 2 - tw / 2;
            y = ph / 2 - th / 2;
          } else if (position === "top-left") {
            x = 30;
            y = ph - th - 30;
          } else if (position === "top-right") {
            x = pw - tw - 30;
            y = ph - th - 30;
          } else if (position === "bottom-left") {
            x = 30;
            y = 30;
          } else if (position === "bottom-right") {
            x = pw - tw - 30;
            y = 30;
          }
          page.drawText(text, {
            x,
            y,
            size: fontSize,
            font,
            color: rgb(r, g, b),
            opacity,
            rotate: degrees(rot),
          });
        } else if (imgEmbed) {
          const w = imgEmbed.width * imageScale;
          const h = imgEmbed.height * imageScale;
          let x = (pw - w) / 2;
          let y = (ph - h) / 2;
          let rot = rotation;
          if (position === "diagonal") {
            rot = 45;
          } else if (position === "top-left") {
            x = 30;
            y = ph - h - 30;
          } else if (position === "top-right") {
            x = pw - w - 30;
            y = ph - h - 30;
          } else if (position === "bottom-left") {
            x = 30;
            y = 30;
          } else if (position === "bottom-right") {
            x = pw - w - 30;
            y = 30;
          }
          page.drawImage(imgEmbed, {
            x,
            y,
            width: w,
            height: h,
            opacity,
            rotate: degrees(rot),
          });
        }
      }

      const out = await doc.save();
      const base = stripPdfExtension(file.name);
      downloadPdfBytes(out, `${base}-watermarked.pdf`);
      info = `Watermark applied to ${targets.length} page(s).`;
    } catch (e: any) {
      error = `Failed: ${e.message ?? e}`;
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
    <PdfDropzone label="Drop a PDF here to add a watermark" onfiles={handleFiles} />
  {:else}
    <div class="p-4 border border-(--color-border) bg-(--color-bg-alt) flex items-center justify-between">
      <div>
        <div class="text-sm text-(--color-text)">{file.name}</div>
        <div class="text-xs text-(--color-text-muted)">{pageCount} page{pageCount !== 1 ? "s" : ""}</div>
      </div>
      <button class="text-xs text-(--color-text-muted) hover:text-(--color-text)" onclick={reset}>Clear</button>
    </div>

    <div class="border border-(--color-border) p-4 flex flex-col gap-4">
      <div class="flex gap-2">
        <button
          class="px-3 py-1.5 text-sm border transition-colors {mode === 'text'
            ? 'border-(--color-accent) bg-(--color-accent)/10 text-(--color-accent)'
            : 'border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)'}"
          onclick={() => (mode = "text")}
        >
          Text watermark
        </button>
        <button
          class="px-3 py-1.5 text-sm border transition-colors {mode === 'image'
            ? 'border-(--color-accent) bg-(--color-accent)/10 text-(--color-accent)'
            : 'border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)'}"
          onclick={() => (mode = "image")}
        >
          Image watermark
        </button>
      </div>

      {#if mode === "text"}
        <div class="grid sm:grid-cols-2 gap-3">
          <label class="text-xs text-(--color-text-muted) flex flex-col gap-1 sm:col-span-2">
            Text
            <input
              type="text"
              bind:value={text}
              class="px-2 py-1.5 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
            />
          </label>
          <label class="text-xs text-(--color-text-muted) flex flex-col gap-1">
            Font size
            <input
              type="number"
              min="8"
              max="200"
              bind:value={fontSize}
              class="px-2 py-1.5 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
            />
          </label>
          <label class="text-xs text-(--color-text-muted) flex items-center gap-2">
            Color
            <input type="color" bind:value={color} class="w-8 h-8 cursor-pointer border-0" />
          </label>
        </div>
      {:else}
        <div class="grid sm:grid-cols-2 gap-3">
          <label class="text-xs text-(--color-text-muted) flex flex-col gap-1 sm:col-span-2">
            Image (PNG or JPG)
            <input
              type="file"
              accept="image/png,image/jpeg"
              onchange={handleImageSelect}
              class="text-sm"
            />
          </label>
          {#if imageDataUrl}
            <div class="bg-white p-2 border border-(--color-border) sm:col-span-2 max-w-xs">
              <img src={imageDataUrl} alt="Watermark" class="max-h-24 mx-auto" />
            </div>
          {/if}
          <label class="text-xs text-(--color-text-muted) flex flex-col gap-1">
            Scale ({Math.round(imageScale * 100)}%)
            <input type="range" min="0.05" max="2" step="0.05" bind:value={imageScale} class="accent-(--color-accent)" />
          </label>
        </div>
      {/if}

      <div class="grid sm:grid-cols-3 gap-3">
        <label class="text-xs text-(--color-text-muted) flex flex-col gap-1">
          Position
          <select
            bind:value={position}
            class="px-2 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
          >
            <option value="diagonal">Diagonal (45°)</option>
            <option value="center">Center</option>
            <option value="top-left">Top-left</option>
            <option value="top-right">Top-right</option>
            <option value="bottom-left">Bottom-left</option>
            <option value="bottom-right">Bottom-right</option>
          </select>
        </label>
        <label class="text-xs text-(--color-text-muted) flex flex-col gap-1">
          Opacity ({Math.round(opacity * 100)}%)
          <input type="range" min="0.05" max="1" step="0.05" bind:value={opacity} class="accent-(--color-accent)" />
        </label>
        <label class="text-xs text-(--color-text-muted) flex flex-col gap-1">
          Custom rotation ({rotation}°)
          <input type="range" min="-180" max="180" step="5" bind:value={rotation} disabled={position === "diagonal"} class="accent-(--color-accent)" />
        </label>
      </div>

      <div class="flex flex-wrap gap-3 items-center text-xs text-(--color-text-muted)">
        <label class="flex items-center gap-2">
          <input type="radio" bind:group={scope} value="all" />
          All pages
        </label>
        <label class="flex items-center gap-2">
          <input type="radio" bind:group={scope} value="ranges" />
          Ranges
        </label>
        {#if scope === "ranges"}
          <input
            type="text"
            bind:value={rangesInput}
            placeholder="1, 3-5"
            class="flex-1 max-w-xs px-2 py-1.5 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
          />
        {/if}
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
      {processing ? "Applying..." : "Apply Watermark & Download"}
    </button>
  {/if}
</div>
