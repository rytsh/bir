<script lang="ts">
  import PdfDropzone from "./shared/PdfDropzone.svelte";
  import SignatureBanner from "./shared/SignatureBanner.svelte";
  import { getPdfjs } from "./shared/pdfjs-loader";
  import { detectSignatures, type DetectedSignature } from "./shared/pdf-signatures";
  import { downloadBlob, fileToUint8Array, formatBytes, stripPdfExtension } from "./shared/pdf-utils";
  import { buildZip } from "./shared/zip-store";

  interface ExtractedImage {
    id: number;
    page: number;
    width: number;
    height: number;
    dataUrl: string;
    bytes: Uint8Array;
    ext: "png" | "jpg";
  }

  let file = $state<File | null>(null);
  let bytes = $state<Uint8Array | null>(null);
  let pageCount = $state(0);
  let signatures = $state<DetectedSignature[]>([]);
  let images = $state<ExtractedImage[]>([]);
  let processing = $state(false);
  let progress = $state("");
  let error = $state("");
  let nextId = 0;

  async function handleFiles(files: File[]) {
    error = "";
    images = [];
    progress = "";
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
    } catch (e: any) {
      error = `Failed to load PDF: ${e.message ?? e}`;
    }
  }

  function reset() {
    file = null;
    bytes = null;
    pageCount = 0;
    signatures = [];
    images = [];
    progress = "";
    error = "";
  }

  async function extract() {
    if (!bytes || !file) return;
    processing = true;
    error = "";
    images = [];
    progress = "";
    try {
      const pdfjs = await getPdfjs();
      const doc = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
      const seenRefs = new Set<string>();
      const out: ExtractedImage[] = [];

      for (let i = 1; i <= doc.numPages; i++) {
        progress = `Scanning page ${i}/${doc.numPages}...`;
        const page = await doc.getPage(i);
        const ops = await page.getOperatorList();
        const fns = (pdfjs as any).OPS;
        for (let k = 0; k < ops.fnArray.length; k++) {
          const fn = ops.fnArray[k];
          if (
            fn === fns.paintImageXObject ||
            fn === fns.paintInlineImageXObject ||
            fn === fns.paintImageXObjectRepeat
          ) {
            const args = ops.argsArray[k];
            const name = args?.[0];
            if (typeof name !== "string" || seenRefs.has(`${i}-${name}`)) continue;
            seenRefs.add(`${i}-${name}`);

            try {
              const obj = await new Promise<any>((resolve) => {
                const objs = (page as any).objs;
                objs.get(name, resolve);
              });
              const bitmap = obj?.bitmap as ImageBitmap | undefined;
              const data = obj?.data as Uint8ClampedArray | undefined;
              const width = obj?.width;
              const height = obj?.height;
              if (!width || !height) continue;

              const canvas = document.createElement("canvas");
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext("2d");
              if (!ctx) continue;

              if (bitmap) {
                ctx.drawImage(bitmap, 0, 0);
              } else if (data) {
                // 4-channel RGBA expected
                const imgData = ctx.createImageData(width, height);
                if (data.length === width * height * 4) {
                  imgData.data.set(data);
                } else if (data.length === width * height * 3) {
                  // RGB → RGBA
                  for (let p = 0, q = 0; p < data.length; p += 3, q += 4) {
                    imgData.data[q] = data[p];
                    imgData.data[q + 1] = data[p + 1];
                    imgData.data[q + 2] = data[p + 2];
                    imgData.data[q + 3] = 255;
                  }
                } else if (data.length === width * height) {
                  // Greyscale
                  for (let p = 0, q = 0; p < data.length; p++, q += 4) {
                    imgData.data[q] = imgData.data[q + 1] = imgData.data[q + 2] = data[p];
                    imgData.data[q + 3] = 255;
                  }
                } else {
                  continue;
                }
                ctx.putImageData(imgData, 0, 0);
              } else {
                continue;
              }

              const dataUrl = canvas.toDataURL("image/png");
              const b64 = dataUrl.split(",")[1];
              const bin = atob(b64);
              const u8 = new Uint8Array(bin.length);
              for (let p = 0; p < bin.length; p++) u8[p] = bin.charCodeAt(p);
              out.push({
                id: ++nextId,
                page: i,
                width,
                height,
                dataUrl,
                bytes: u8,
                ext: "png",
              });
            } catch {
              // skip
            }
          }
        }
      }
      images = out;
      progress = out.length === 0 ? "No raster images were found in this PDF." : "";
    } catch (e: any) {
      error = `Extraction failed: ${e.message ?? e}`;
      progress = "";
    } finally {
      processing = false;
    }
  }

  function downloadOne(img: ExtractedImage) {
    const base = stripPdfExtension(file?.name ?? "pdf");
    downloadBlob(img.bytes as unknown as BlobPart, `${base}-p${img.page}-img${img.id}.${img.ext}`, `image/${img.ext === "jpg" ? "jpeg" : "png"}`);
  }

  function downloadAll() {
    if (images.length === 0) return;
    const base = stripPdfExtension(file?.name ?? "pdf");
    const entries = images.map((img) => ({
      name: `${base}-p${img.page}-img${img.id}.${img.ext}`,
      bytes: img.bytes,
    }));
    const zip = buildZip(entries);
    downloadBlob(zip as unknown as BlobPart, `${base}-images.zip`, "application/zip");
  }
</script>

<div class="flex flex-col gap-4">
  {#if signatures.length > 0}
    <SignatureBanner {signatures} />
  {/if}

  {#if !file}
    <PdfDropzone label="Drop a PDF here to extract embedded images" onfiles={handleFiles} />
  {:else}
    <div class="p-4 border border-(--color-border) bg-(--color-bg-alt) flex items-center justify-between">
      <div>
        <div class="text-sm text-(--color-text)">{file.name}</div>
        <div class="text-xs text-(--color-text-muted)">{pageCount} page{pageCount !== 1 ? "s" : ""}</div>
      </div>
      <button class="text-xs text-(--color-text-muted) hover:text-(--color-text)" onclick={reset}>Clear</button>
    </div>

    <button
      class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50 self-start"
      onclick={extract}
      disabled={processing}
    >
      {processing ? "Extracting..." : "Scan for images"}
    </button>

    {#if progress}
      <div class="p-3 border border-(--color-border) bg-(--color-bg-alt) text-sm text-(--color-text-muted)">{progress}</div>
    {/if}
    {#if error}
      <div class="p-3 border border-red-500 bg-red-500/10 text-red-500 text-sm">{error}</div>
    {/if}

    {#if images.length > 0}
      <div class="flex items-center justify-between">
        <span class="text-sm text-(--color-text)">{images.length} image{images.length !== 1 ? "s" : ""} found</span>
        <button
          class="px-3 py-1.5 text-sm bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover)"
          onclick={downloadAll}
        >
          Download all (ZIP)
        </button>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {#each images as img (img.id)}
          <div class="border border-(--color-border) bg-(--color-bg-alt) p-2 flex flex-col">
            <div class="aspect-square bg-white flex items-center justify-center overflow-hidden mb-1">
              <img src={img.dataUrl} alt="img" class="max-w-full max-h-full object-contain" />
            </div>
            <div class="text-[11px] text-(--color-text-muted)">
              p.{img.page} · {img.width}×{img.height} · {formatBytes(img.bytes.length)}
            </div>
            <button
              class="mt-1 px-2 py-1 text-xs border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)"
              onclick={() => downloadOne(img)}
            >
              Download
            </button>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>
