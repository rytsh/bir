<script lang="ts">
  import PdfDropzone from "./shared/PdfDropzone.svelte";
  import SignatureBanner from "./shared/SignatureBanner.svelte";
  import { detectSignatures, type DetectedSignature } from "./shared/pdf-signatures";
  import { downloadPdfBytes, fileToUint8Array, parsePageRanges, stripPdfExtension } from "./shared/pdf-utils";

  type Position = "bottom-center" | "bottom-left" | "bottom-right" | "top-center" | "top-left" | "top-right";

  let file = $state<File | null>(null);
  let bytes = $state<Uint8Array | null>(null);
  let pageCount = $state(0);
  let signatures = $state<DetectedSignature[]>([]);
  let format = $state("Page {n} of {total}");
  let fontSize = $state(11);
  let color = $state("#000000");
  let position = $state<Position>("bottom-center");
  let margin = $state(24);
  let startNumber = $state(1);
  let scope = $state<"all" | "ranges">("all");
  let rangesInput = $state("1");
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

  function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const m = hex.match(/^#?([0-9a-f]{6})$/i);
    if (!m) return { r: 0, g: 0, b: 0 };
    const n = parseInt(m[1], 16);
    return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
  }

  async function apply() {
    if (!bytes || !file) return;
    processing = true;
    error = "";
    info = "";
    try {
      const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
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

      const font = await doc.embedFont(StandardFonts.Helvetica);
      const { r, g, b } = hexToRgb(color);
      const pages = doc.getPages();

      for (let i = 0; i < targets.length; i++) {
        const idx = targets[i];
        const page = pages[idx];
        if (!page) continue;
        const { width: pw, height: ph } = page.getSize();

        const num = startNumber + i;
        const total = targets.length + (startNumber - 1);
        const label = format
          .replace(/\{n\}/g, String(num))
          .replace(/\{total\}/g, String(total))
          .replace(/\{idx\}/g, String(idx + 1));
        const tw = font.widthOfTextAtSize(label, fontSize);
        const th = fontSize;

        let x: number;
        let y: number;
        if (position.endsWith("center")) x = pw / 2 - tw / 2;
        else if (position.endsWith("left")) x = margin;
        else x = pw - tw - margin;

        if (position.startsWith("top")) y = ph - th - margin;
        else y = margin;

        page.drawText(label, { x, y, size: fontSize, font, color: rgb(r, g, b) });
      }

      const out = await doc.save();
      const base = stripPdfExtension(file.name);
      downloadPdfBytes(out, `${base}-numbered.pdf`);
      info = `Numbers applied to ${targets.length} page(s).`;
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
    <PdfDropzone label="Drop a PDF here to stamp page numbers" onfiles={handleFiles} />
  {:else}
    <div class="p-4 border border-(--color-border) bg-(--color-bg-alt) flex items-center justify-between">
      <div>
        <div class="text-sm text-(--color-text)">{file.name}</div>
        <div class="text-xs text-(--color-text-muted)">{pageCount} page{pageCount !== 1 ? "s" : ""}</div>
      </div>
      <button class="text-xs text-(--color-text-muted) hover:text-(--color-text)" onclick={reset}>Clear</button>
    </div>

    <div class="border border-(--color-border) p-4 grid sm:grid-cols-2 gap-3">
      <label class="text-xs text-(--color-text-muted) flex flex-col gap-1 sm:col-span-2">
        Format
        <input
          type="text"
          bind:value={format}
          class="px-2 py-1.5 text-sm font-mono border border-(--color-border) bg-(--color-bg) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
        />
        <span class="text-[11px] text-(--color-text-light)">
          Tokens: <code>{"{n}"}</code> page number, <code>{"{total}"}</code> total, <code>{"{idx}"}</code> original page index.
        </span>
      </label>
      <label class="text-xs text-(--color-text-muted) flex flex-col gap-1">
        Position
        <select
          bind:value={position}
          class="px-2 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
        >
          <option value="bottom-center">Bottom center</option>
          <option value="bottom-left">Bottom left</option>
          <option value="bottom-right">Bottom right</option>
          <option value="top-center">Top center</option>
          <option value="top-left">Top left</option>
          <option value="top-right">Top right</option>
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
      <label class="text-xs text-(--color-text-muted) flex flex-col gap-1">
        Font size
        <input
          type="number"
          min="6"
          max="60"
          bind:value={fontSize}
          class="px-2 py-1.5 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
        />
      </label>
      <label class="text-xs text-(--color-text-muted) flex items-center gap-2">
        Color <input type="color" bind:value={color} class="w-8 h-8 cursor-pointer border-0" />
      </label>
      <label class="text-xs text-(--color-text-muted) flex flex-col gap-1">
        Start at
        <input
          type="number"
          min="0"
          bind:value={startNumber}
          class="px-2 py-1.5 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
        />
      </label>
      <div class="text-xs text-(--color-text-muted) flex flex-col gap-1">
        Pages
        <div class="flex flex-wrap gap-3 items-center">
          <label class="flex items-center gap-2">
            <input type="radio" bind:group={scope} value="all" />
            All
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
              class="flex-1 px-2 py-1.5 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
            />
          {/if}
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
      {processing ? "Applying..." : "Add Page Numbers & Download"}
    </button>
  {/if}
</div>
