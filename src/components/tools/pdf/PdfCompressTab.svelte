<script lang="ts">
  import PdfDropzone from "./shared/PdfDropzone.svelte";
  import SignatureBanner from "./shared/SignatureBanner.svelte";
  import { detectSignatures, type DetectedSignature } from "./shared/pdf-signatures";
  import { downloadPdfBytes, fileToUint8Array, formatBytes, stripPdfExtension } from "./shared/pdf-utils";

  type Mode = "smart" | "rasterize";

  let file = $state<File | null>(null);
  let bytes = $state<Uint8Array | null>(null);
  let originalSize = $state(0);
  let pageCount = $state(0);
  let signatures = $state<DetectedSignature[]>([]);

  let mode = $state<Mode>("smart");
  let quality = $state(0.7);
  let maxDpi = $state(150);
  let processing = $state(false);
  let progress = $state("");
  let error = $state("");
  let result = $state<{ size: number; saved: number; touchedImages: number } | null>(null);

  async function handleFiles(files: File[]) {
    error = "";
    result = null;
    progress = "";
    const f = files[0];
    if (!f) return;
    try {
      const buf = await fileToUint8Array(f);
      const { PDFDocument } = await import("pdf-lib");
      const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
      file = f;
      bytes = buf;
      originalSize = f.size;
      pageCount = doc.getPageCount();
      signatures = await detectSignatures(buf);
    } catch (e: any) {
      error = `Failed to load PDF: ${e.message ?? e}`;
    }
  }

  function reset() {
    file = null;
    bytes = null;
    originalSize = 0;
    pageCount = 0;
    signatures = [];
    error = "";
    result = null;
    progress = "";
  }

  // Decode a JPEG byte stream to an Image element
  async function loadJpeg(data: Uint8Array): Promise<HTMLImageElement> {
    const blob = new Blob([data as unknown as BlobPart], { type: "image/jpeg" });
    const url = URL.createObjectURL(blob);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(e);
      };
      img.src = url;
    });
  }

  async function reencodeJpeg(img: HTMLImageElement, q: number, dpiCap: number): Promise<Uint8Array | null> {
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    // We don't know the actual placement DPI, so we cap by max-pixel target
    // approximating: at 150 DPI a typical letter page image is ~1275×1650
    // Use the dpiCap to derive a max long edge cap from a 11x17 page worst case
    const maxEdge = Math.round(11 * dpiCap); // 11 inches as the longest realistic edge
    const longest = Math.max(w, h);
    if (longest > maxEdge) {
      const scale = maxEdge / longest;
      w = Math.max(1, Math.round(w * scale));
      h = Math.max(1, Math.round(h * scale));
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise((resolve) => {
      canvas.toBlob(
        async (blob) => {
          if (!blob) {
            resolve(null);
            return;
          }
          const buf = new Uint8Array(await blob.arrayBuffer());
          resolve(buf);
        },
        "image/jpeg",
        q,
      );
    });
  }

  async function compressSmart(): Promise<{ bytes: Uint8Array; touched: number }> {
    const { PDFDocument, PDFName, PDFRawStream, PDFArray, PDFNumber } = await import("pdf-lib");
    const doc = await PDFDocument.load(bytes!, { ignoreEncryption: true });

    let touched = 0;
    const indirectObjects = doc.context.enumerateIndirectObjects();
    const total = indirectObjects.length;

    for (let p = 0; p < indirectObjects.length; p++) {
      if (p % 25 === 0) {
        progress = `Scanning objects ${p}/${total}...`;
        await new Promise((r) => setTimeout(r, 0));
      }
      const [ref, obj] = indirectObjects[p];
      if (!(obj instanceof PDFRawStream)) continue;
      const dict = obj.dict;
      const subtype = dict.lookup(PDFName.of("Subtype"));
      if (!subtype || (subtype as any).encodedName !== "/Image") continue;

      // Filter must be /DCTDecode (a JPEG)
      const filter = dict.lookup(PDFName.of("Filter"));
      let filterIsDct = false;
      if (filter && (filter as any).encodedName === "/DCTDecode") {
        filterIsDct = true;
      } else if (filter instanceof PDFArray) {
        for (let i = 0; i < filter.size(); i++) {
          const f = filter.get(i);
          if ((f as any)?.encodedName === "/DCTDecode") {
            filterIsDct = true;
            break;
          }
        }
      }
      if (!filterIsDct) continue;

      const data = obj.contents;
      if (data.length < 8 * 1024) continue; // skip tiny images

      try {
        const img = await loadJpeg(data);
        const reencoded = await reencodeJpeg(img, quality, maxDpi);
        if (!reencoded) continue;
        if (reencoded.length >= data.length * 0.95) continue;

        // Detect new image dims (might have been downscaled)
        const reBlob = new Blob([reencoded as unknown as BlobPart], { type: "image/jpeg" });
        const reUrl = URL.createObjectURL(reBlob);
        const newImg = new Image();
        await new Promise<void>((res, rej) => {
          newImg.onload = () => res();
          newImg.onerror = rej;
          newImg.src = reUrl;
        });
        URL.revokeObjectURL(reUrl);

        // Build a new dict mirroring the existing one
        const newDict = dict.clone(doc.context);
        newDict.set(PDFName.of("Length"), PDFNumber.of(reencoded.length));
        if (newDict.has(PDFName.of("Width"))) newDict.set(PDFName.of("Width"), PDFNumber.of(newImg.naturalWidth));
        if (newDict.has(PDFName.of("Height"))) newDict.set(PDFName.of("Height"), PDFNumber.of(newImg.naturalHeight));

        const newStream = PDFRawStream.of(newDict, reencoded);
        doc.context.assign(ref, newStream);
        touched++;
      } catch {
        // ignore
      }
    }

    progress = "Saving...";
    const out = await doc.save({ useObjectStreams: false });
    return { bytes: out, touched };
  }

  async function compressRasterize(): Promise<{ bytes: Uint8Array; touched: number }> {
    const { getPdfjs } = await import("./shared/pdfjs-loader");
    const { PDFDocument } = await import("pdf-lib");

    const pdfjs = await getPdfjs();
    const src = await pdfjs.getDocument({ data: bytes!.slice(0) }).promise;
    const out = await PDFDocument.create();
    const scale = maxDpi / 72;

    let touched = 0;
    for (let i = 1; i <= src.numPages; i++) {
      progress = `Rasterizing page ${i}/${src.numPages}...`;
      const page = await src.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      const b64 = dataUrl.split(",")[1];
      const bin = atob(b64);
      const u8 = new Uint8Array(bin.length);
      for (let k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k);
      const embedded = await out.embedJpg(u8);

      const pageW = viewport.width / scale;
      const pageH = viewport.height / scale;
      const newPage = out.addPage([pageW, pageH]);
      newPage.drawImage(embedded, { x: 0, y: 0, width: pageW, height: pageH });
      touched++;
    }
    progress = "Saving...";
    const finalBytes = await out.save();
    return { bytes: finalBytes, touched };
  }

  async function compress() {
    if (!bytes || !file) return;
    processing = true;
    error = "";
    result = null;
    progress = "Starting...";
    try {
      const { bytes: out, touched } =
        mode === "smart" ? await compressSmart() : await compressRasterize();
      const base = stripPdfExtension(file.name);
      downloadPdfBytes(out, `${base}-compressed.pdf`);
      result = {
        size: out.length,
        saved: originalSize - out.length,
        touchedImages: touched,
      };
      progress = "";
    } catch (e: any) {
      error = `Compress failed: ${e.message ?? e}`;
      progress = "";
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
    <PdfDropzone label="Drop a PDF here to compress" sublabel="Reduces file size by re-encoding embedded images." onfiles={handleFiles} />
  {:else}
    <div class="p-4 border border-(--color-border) bg-(--color-bg-alt) flex items-center justify-between">
      <div>
        <div class="text-sm text-(--color-text)">{file.name}</div>
        <div class="text-xs text-(--color-text-muted)">
          {pageCount} page{pageCount !== 1 ? "s" : ""} · {formatBytes(originalSize)}
        </div>
      </div>
      <button class="text-xs text-(--color-text-muted) hover:text-(--color-text)" onclick={reset}>Clear</button>
    </div>

    <div class="border border-(--color-border) p-4 flex flex-col gap-4">
      <div>
        <div class="text-xs text-(--color-text-muted) mb-2">Strategy</div>
        <div class="flex flex-col gap-2">
          <label class="flex items-start gap-2 text-sm cursor-pointer">
            <input type="radio" bind:group={mode} value="smart" class="mt-1" />
            <span>
              <span class="font-medium text-(--color-text)">Smart</span>
              <span class="block text-xs text-(--color-text-muted)">
                Re-encodes embedded JPEG images. Preserves text, vectors, fonts. Best for image-heavy PDFs.
              </span>
            </span>
          </label>
          <label class="flex items-start gap-2 text-sm cursor-pointer">
            <input type="radio" bind:group={mode} value="rasterize" class="mt-1" />
            <span>
              <span class="font-medium text-(--color-text)">Rasterize pages</span>
              <span class="block text-xs text-(--color-text-muted)">
                Renders every page to a single JPEG. Aggressive compression but loses text selection and accessibility.
              </span>
            </span>
          </label>
        </div>
      </div>

      <div class="grid sm:grid-cols-2 gap-3">
        <label class="text-xs text-(--color-text-muted) flex flex-col gap-1">
          JPEG quality ({Math.round(quality * 100)}%)
          <input type="range" min="0.3" max="0.95" step="0.05" bind:value={quality} class="accent-(--color-accent)" />
          <span class="text-[11px] text-(--color-text-light)">Lower = smaller file, more artifacts.</span>
        </label>
        <label class="text-xs text-(--color-text-muted) flex flex-col gap-1">
          Max DPI ({maxDpi})
          <input type="range" min="72" max="300" step="1" bind:value={maxDpi} class="accent-(--color-accent)" />
          <span class="text-[11px] text-(--color-text-light)">
            72 = web · 150 = print draft · 300 = print quality.
          </span>
        </label>
      </div>
    </div>

    {#if error}
      <div class="p-3 border border-red-500 bg-red-500/10 text-red-500 text-sm">{error}</div>
    {/if}
    {#if progress}
      <div class="p-3 border border-(--color-border) bg-(--color-bg-alt) text-sm text-(--color-text-muted)">{progress}</div>
    {/if}
    {#if result}
      <div class="p-3 border border-green-500 bg-green-500/10 text-green-600 dark:text-green-400 text-sm">
        Compressed: {formatBytes(originalSize)} → {formatBytes(result.size)}
        {#if result.saved > 0}
          (saved {formatBytes(result.saved)}, {Math.round((result.saved / originalSize) * 100)}%)
        {:else}
          (no savings — try lower quality, lower DPI, or rasterize mode)
        {/if}
        {#if mode === "smart"}
          · {result.touchedImages} image{result.touchedImages !== 1 ? "s" : ""} re-encoded
        {/if}
      </div>
    {/if}

    <button
      class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50 self-start"
      onclick={compress}
      disabled={processing}
    >
      {processing ? "Compressing..." : "Compress & Download"}
    </button>
  {/if}
</div>
