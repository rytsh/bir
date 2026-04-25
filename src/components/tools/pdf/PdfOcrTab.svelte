<script lang="ts">
  import PdfDropzone from "./shared/PdfDropzone.svelte";
  import SignatureBanner from "./shared/SignatureBanner.svelte";
  import { getPdfjs } from "./shared/pdfjs-loader";
  import { detectSignatures, type DetectedSignature } from "./shared/pdf-signatures";
  import { downloadPdfBytes, fileToUint8Array, stripPdfExtension } from "./shared/pdf-utils";

  type Mode = "searchable" | "text";

  // ISO 639-3 codes used by tesseract.js
  const LANGUAGES = [
    { code: "eng", label: "English" },
    { code: "spa", label: "Spanish" },
    { code: "fra", label: "French" },
    { code: "deu", label: "German" },
    { code: "ita", label: "Italian" },
    { code: "por", label: "Portuguese" },
    { code: "tur", label: "Turkish" },
    { code: "rus", label: "Russian" },
    { code: "ara", label: "Arabic" },
    { code: "chi_sim", label: "Chinese (Simplified)" },
    { code: "chi_tra", label: "Chinese (Traditional)" },
    { code: "jpn", label: "Japanese" },
    { code: "kor", label: "Korean" },
  ];

  let file = $state<File | null>(null);
  let bytes = $state<Uint8Array | null>(null);
  let pageCount = $state(0);
  let signatures = $state<DetectedSignature[]>([]);
  let language = $state("eng");
  let mode = $state<Mode>("searchable");
  let dpi = $state(200);
  let processing = $state(false);
  let progress = $state("");
  let error = $state("");
  let extractedText = $state("");
  let info = $state("");

  async function handleFiles(files: File[]) {
    error = "";
    info = "";
    extractedText = "";
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
    extractedText = "";
    error = "";
    info = "";
    progress = "";
  }

  async function run() {
    if (!bytes || !file) return;
    processing = true;
    error = "";
    info = "";
    extractedText = "";
    progress = "Loading OCR engine (~20MB) on first run...";
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker(language, 1, {
        logger: (m: any) => {
          if (m.status && typeof m.progress === "number") {
            progress = `${m.status} (${Math.round(m.progress * 100)}%)`;
          }
        },
      });

      const pdfjs = await getPdfjs();
      const doc = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
      const scale = dpi / 72;

      const allText: string[] = [];
      const ocrPages: { pageIndex: number; words: any[] }[] = [];

      for (let i = 1; i <= doc.numPages; i++) {
        progress = `OCR page ${i}/${doc.numPages}...`;
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        const dataUrl = canvas.toDataURL("image/png");

        const { data } = await worker.recognize(dataUrl);
        allText.push(data.text);

        if (mode === "searchable") {
          // Capture word boxes in original PDF coordinates (need to scale back from DPI)
          const words = (data as any).words ?? [];
          ocrPages.push({
            pageIndex: i - 1,
            words: words.map((w: any) => ({
              text: w.text,
              bbox: w.bbox, // x0, y0, x1, y1 in pixel coords at scale
              scaleBack: 1 / scale,
            })),
          });
        }
      }

      await worker.terminate();
      progress = "";

      extractedText = allText.join("\n\n--- Page break ---\n\n");

      if (mode === "searchable") {
        progress = "Building searchable PDF...";
        const { PDFDocument, StandardFonts } = await import("pdf-lib");
        const out = await PDFDocument.load(bytes.slice(0));
        const font = await out.embedFont(StandardFonts.Helvetica);
        const pages = out.getPages();
        for (const op of ocrPages) {
          const page = pages[op.pageIndex];
          if (!page) continue;
          const { height: ph } = page.getSize();
          for (const w of op.words) {
            const { x0, y0, x1, y1 } = w.bbox;
            const xPdf = x0 * w.scaleBack;
            const yPdf = ph - y1 * w.scaleBack;
            const widthPdf = (x1 - x0) * w.scaleBack;
            const heightPdf = (y1 - y0) * w.scaleBack;
            const fontSize = Math.max(4, heightPdf * 0.9);
            page.drawText(w.text, {
              x: xPdf,
              y: yPdf,
              size: fontSize,
              font,
              opacity: 0,
            });
          }
        }
        const finalBytes = await out.save();
        const base = stripPdfExtension(file.name);
        downloadPdfBytes(finalBytes, `${base}-ocr.pdf`);
        info = "Searchable PDF generated. Text is invisible but selectable and searchable.";
        progress = "";
      } else {
        info = `OCR complete. ${allText.reduce((s, t) => s + t.length, 0)} characters extracted.`;
      }
    } catch (e: any) {
      error = `OCR failed: ${e.message ?? e}`;
      progress = "";
    } finally {
      processing = false;
    }
  }

  function copyText() {
    if (!extractedText) return;
    navigator.clipboard.writeText(extractedText);
  }

  function downloadText() {
    if (!extractedText || !file) return;
    const base = stripPdfExtension(file.name);
    const blob = new Blob([extractedText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${base}-ocr.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
</script>

<div class="flex flex-col gap-4">
  {#if signatures.length > 0}
    <SignatureBanner {signatures} showDestructiveWarning />
  {/if}

  <div class="p-3 bg-blue-500/10 border border-blue-500/30 text-xs text-blue-600 dark:text-blue-400">
    OCR uses tesseract.js (~20MB WASM, downloaded once on first use). Each page is rendered to an image
    then passed through the OCR engine in your browser. No data leaves your device.
  </div>

  {#if !file}
    <PdfDropzone label="Drop a scanned PDF here for OCR" onfiles={handleFiles} />
  {:else}
    <div class="p-4 border border-(--color-border) bg-(--color-bg-alt) flex items-center justify-between">
      <div>
        <div class="text-sm text-(--color-text)">{file.name}</div>
        <div class="text-xs text-(--color-text-muted)">{pageCount} page{pageCount !== 1 ? "s" : ""}</div>
      </div>
      <button class="text-xs text-(--color-text-muted) hover:text-(--color-text)" onclick={reset}>Clear</button>
    </div>

    <div class="grid sm:grid-cols-3 gap-3 p-3 border border-(--color-border)">
      <label class="text-xs text-(--color-text-muted) flex flex-col gap-1">
        Language
        <select bind:value={language} class="px-2 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text)">
          {#each LANGUAGES as lang}
            <option value={lang.code}>{lang.label}</option>
          {/each}
        </select>
      </label>
      <label class="text-xs text-(--color-text-muted) flex flex-col gap-1">
        Output
        <select bind:value={mode} class="px-2 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text)">
          <option value="searchable">Searchable PDF</option>
          <option value="text">Plain text</option>
        </select>
      </label>
      <label class="text-xs text-(--color-text-muted) flex flex-col gap-1">
        Render DPI ({dpi})
        <input type="range" min="100" max="400" step="10" bind:value={dpi} class="accent-(--color-accent)" />
      </label>
    </div>

    {#if error}
      <div class="p-3 border border-red-500 bg-red-500/10 text-red-500 text-sm">{error}</div>
    {/if}
    {#if progress}
      <div class="p-3 border border-(--color-border) bg-(--color-bg-alt) text-sm text-(--color-text-muted)">{progress}</div>
    {/if}
    {#if info}
      <div class="p-3 border border-green-500 bg-green-500/10 text-green-600 dark:text-green-400 text-sm">{info}</div>
    {/if}

    <button
      class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) disabled:opacity-50 self-start"
      onclick={run}
      disabled={processing}
    >
      {processing ? "Running OCR..." : "Run OCR"}
    </button>

    {#if extractedText}
      <div class="border border-(--color-border)">
        <div class="px-3 py-2 bg-(--color-bg-alt) border-b border-(--color-border) flex items-center justify-between">
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Extracted text</span>
          <div class="flex gap-2">
            <button class="px-3 py-1 text-xs border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)" onclick={copyText}>Copy</button>
            <button class="px-3 py-1 text-xs border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)" onclick={downloadText}>Download .txt</button>
          </div>
        </div>
        <textarea
          readonly
          rows="14"
          value={extractedText}
          class="w-full px-3 py-2 text-sm font-mono bg-(--color-bg) text-(--color-text) focus:outline-none"
        ></textarea>
      </div>
    {/if}
  {/if}
</div>
