<script lang="ts">
  import PdfDropzone from "./shared/PdfDropzone.svelte";
  import { downloadPdfBytes, formatBytes } from "./shared/pdf-utils";

  type PageSize = "fit" | "a4" | "letter" | "legal";
  type Orientation = "portrait" | "landscape" | "auto";

  interface ImageItem {
    id: number;
    file: File;
    dataUrl: string;
    width: number;
    height: number;
  }

  // Common PDF page sizes (in points: 72pt = 1 inch)
  const SIZES: Record<Exclude<PageSize, "fit">, { w: number; h: number }> = {
    a4: { w: 595.28, h: 841.89 },
    letter: { w: 612, h: 792 },
    legal: { w: 612, h: 1008 },
  };

  let images = $state<ImageItem[]>([]);
  let pageSize = $state<PageSize>("fit");
  let orientation = $state<Orientation>("auto");
  let margin = $state(20);
  let processing = $state(false);
  let error = $state("");
  let info = $state("");
  let nextId = 0;

  async function handleFiles(files: File[]) {
    error = "";
    info = "";
    const imgFiles = files.filter((f) => f.type.startsWith("image/"));
    if (imgFiles.length === 0) {
      error = "Please select image files (JPG, PNG, etc.).";
      return;
    }
    const newItems: ImageItem[] = [];
    for (const f of imgFiles) {
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.onerror = reject;
          r.readAsDataURL(f);
        });
        const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = reject;
          img.src = dataUrl;
        });
        newItems.push({ id: ++nextId, file: f, dataUrl, width: dims.w, height: dims.h });
      } catch {
        error = `Failed to load ${f.name}`;
      }
    }
    images = [...images, ...newItems];
  }

  function move(id: number, dir: -1 | 1) {
    const idx = images.findIndex((e) => e.id === id);
    if (idx < 0) return;
    const ni = idx + dir;
    if (ni < 0 || ni >= images.length) return;
    const next = [...images];
    [next[idx], next[ni]] = [next[ni], next[idx]];
    images = next;
  }

  function remove(id: number) {
    images = images.filter((e) => e.id !== id);
  }

  function clearAll() {
    images = [];
  }

  async function build() {
    if (images.length === 0) {
      error = "Add at least one image.";
      return;
    }
    processing = true;
    error = "";
    info = "";
    try {
      const { PDFDocument } = await import("pdf-lib");
      const out = await PDFDocument.create();

      for (const img of images) {
        const isPng = img.file.type === "image/png";
        const isJpg = img.file.type === "image/jpeg" || img.file.type === "image/jpg";

        let bytes: ArrayBuffer;
        let embedded: any;

        if (isPng) {
          bytes = await img.file.arrayBuffer();
          embedded = await out.embedPng(bytes);
        } else if (isJpg) {
          bytes = await img.file.arrayBuffer();
          embedded = await out.embedJpg(bytes);
        } else {
          // Convert other formats to PNG via canvas
          const dataUrl = await new Promise<string>((resolve) => {
            const i = new Image();
            i.onload = () => {
              const c = document.createElement("canvas");
              c.width = i.naturalWidth;
              c.height = i.naturalHeight;
              c.getContext("2d")!.drawImage(i, 0, 0);
              resolve(c.toDataURL("image/png"));
            };
            i.src = img.dataUrl;
          });
          const b64 = dataUrl.split(",")[1];
          const bin = atob(b64);
          const u8 = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
          embedded = await out.embedPng(u8);
        }

        const iw = embedded.width;
        const ih = embedded.height;

        let pw: number;
        let ph: number;

        if (pageSize === "fit") {
          // Fit page to image (with margin)
          pw = iw + margin * 2;
          ph = ih + margin * 2;
        } else {
          const dims = SIZES[pageSize];
          let landscape = false;
          if (orientation === "landscape") landscape = true;
          else if (orientation === "auto") landscape = iw > ih;
          pw = landscape ? dims.h : dims.w;
          ph = landscape ? dims.w : dims.h;
        }

        const page = out.addPage([pw, ph]);

        // Center image inside page (minus margin)
        const maxW = pw - margin * 2;
        const maxH = ph - margin * 2;
        const scale = Math.min(maxW / iw, maxH / ih);
        const w = iw * scale;
        const h = ih * scale;
        const x = (pw - w) / 2;
        const y = (ph - h) / 2;
        page.drawImage(embedded, { x, y, width: w, height: h });
      }

      const bytes = await out.save();
      downloadPdfBytes(bytes, "images.pdf");
      info = `Created PDF with ${images.length} page(s).`;
    } catch (e: any) {
      error = `Build failed: ${e.message ?? e}`;
    } finally {
      processing = false;
    }
  }
</script>

<div class="flex flex-col gap-4">
  <PdfDropzone
    multiple
    accept="image/*"
    icon="🖼️"
    label="Drop images here or click to browse"
    sublabel="JPG, PNG, GIF, WebP, BMP. Drag to reorder, then click Create PDF."
    onfiles={handleFiles}
  />

  {#if error}
    <div class="p-3 border border-red-500 bg-red-500/10 text-red-500 text-sm">{error}</div>
  {/if}
  {#if info}
    <div class="p-3 border border-green-500 bg-green-500/10 text-green-600 dark:text-green-400 text-sm">{info}</div>
  {/if}

  {#if images.length > 0}
    <div class="grid sm:grid-cols-3 gap-3 p-3 border border-(--color-border) bg-(--color-bg-alt)">
      <label class="text-xs text-(--color-text-muted) flex flex-col gap-1">
        Page size
        <select
          bind:value={pageSize}
          class="px-2 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
        >
          <option value="fit">Fit to image</option>
          <option value="a4">A4</option>
          <option value="letter">Letter</option>
          <option value="legal">Legal</option>
        </select>
      </label>
      <label class="text-xs text-(--color-text-muted) flex flex-col gap-1">
        Orientation
        <select
          bind:value={orientation}
          disabled={pageSize === "fit"}
          class="px-2 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) focus:outline-none focus:border-(--color-accent) disabled:opacity-50"
        >
          <option value="auto">Auto (per image)</option>
          <option value="portrait">Portrait</option>
          <option value="landscape">Landscape</option>
        </select>
      </label>
      <label class="text-xs text-(--color-text-muted) flex flex-col gap-1">
        Margin (pt)
        <input
          type="number"
          min="0"
          max="200"
          bind:value={margin}
          class="px-2 py-1.5 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
        />
      </label>
    </div>

    <div class="border border-(--color-border) bg-(--color-bg-alt)">
      <div class="px-4 py-2 border-b border-(--color-border) flex items-center justify-between">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">
          {images.length} image{images.length !== 1 ? "s" : ""}
        </span>
        <button
          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          onclick={clearAll}
        >
          Clear all
        </button>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 p-3">
        {#each images as img, i (img.id)}
          <div class="border border-(--color-border) bg-(--color-bg) p-2 flex flex-col">
            <div class="aspect-square bg-white flex items-center justify-center overflow-hidden mb-1">
              <img src={img.dataUrl} alt={img.file.name} class="max-w-full max-h-full object-contain" />
            </div>
            <div class="text-[11px] text-(--color-text-muted) truncate" title={img.file.name}>{i + 1}. {img.file.name}</div>
            <div class="text-[10px] text-(--color-text-light)">
              {img.width}×{img.height} · {formatBytes(img.file.size)}
            </div>
            <div class="flex gap-1 mt-1">
              <button
                class="px-1 py-0.5 text-xs border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) disabled:opacity-30"
                disabled={i === 0}
                onclick={() => move(img.id, -1)}
              >
                ←
              </button>
              <button
                class="px-1 py-0.5 text-xs border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) disabled:opacity-30"
                disabled={i === images.length - 1}
                onclick={() => move(img.id, 1)}
              >
                →
              </button>
              <button
                class="ml-auto px-1 py-0.5 text-xs border border-(--color-border) text-red-500 hover:bg-red-500/10"
                onclick={() => remove(img.id)}
              >
                ✕
              </button>
            </div>
          </div>
        {/each}
      </div>
    </div>

    <button
      class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50 self-start"
      onclick={build}
      disabled={processing}
    >
      {processing ? "Building..." : "Create PDF"}
    </button>
  {/if}
</div>
