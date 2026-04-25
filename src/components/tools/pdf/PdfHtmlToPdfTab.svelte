<script lang="ts">
  import { downloadPdfBytes } from "./shared/pdf-utils";

  type Source = "html" | "url";
  type PageSize = "a4" | "letter" | "legal";

  let source = $state<Source>("html");
  let html = $state("<h1>Hello</h1>\n<p>This is an example HTML document that will be rendered into a PDF.</p>\n<p style='color:#0a8'>Edit this on the left, click <b>Generate PDF</b> on the right.</p>\n<ul><li>Item one</li><li>Item two</li><li>Item three</li></ul>");
  let url = $state("");
  let pageSize = $state<PageSize>("a4");
  let orientation = $state<"portrait" | "landscape">("portrait");
  let margin = $state(20);
  let scale = $state(2);
  let processing = $state(false);
  let error = $state("");
  let info = $state("");

  let renderFrame = $state<HTMLIFrameElement | null>(null);

  async function generate() {
    processing = true;
    error = "";
    info = "";
    try {
      // Build the HTML document we want to render
      let docHtml = "";
      if (source === "html") {
        docHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
          body { font-family: -apple-system, system-ui, "Segoe UI", Roboto, sans-serif; padding: 24px; color: #111; line-height: 1.5; }
          h1, h2, h3 { margin-top: 0; }
          pre, code { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
          pre { background: #f4f4f4; padding: 12px; border-radius: 4px; overflow-x: auto; }
          table { border-collapse: collapse; }
          td, th { border: 1px solid #ccc; padding: 6px 10px; }
        </style></head><body>${html}</body></html>`;
      } else {
        if (!url.trim()) {
          error = "Enter a URL.";
          processing = false;
          return;
        }
        try {
          // Fetch (will fail with CORS for most external URLs)
          const r = await fetch(url, { mode: "cors" });
          docHtml = await r.text();
        } catch {
          error = "Failed to fetch URL (cross-origin block). Use the HTML mode and paste the content instead.";
          processing = false;
          return;
        }
      }

      // Render into hidden iframe so html2canvas-pro can rasterize it
      if (!renderFrame) {
        error = "Render frame not ready.";
        processing = false;
        return;
      }
      const ifr = renderFrame;
      ifr.srcdoc = docHtml;
      await new Promise<void>((resolve) => {
        const handler = () => {
          ifr.removeEventListener("load", handler);
          resolve();
        };
        ifr.addEventListener("load", handler);
        // safety timeout
        setTimeout(resolve, 3000);
      });
      const innerDoc = ifr.contentDocument;
      const innerBody = innerDoc?.body;
      if (!innerDoc || !innerBody) {
        error = "Failed to read rendered HTML.";
        processing = false;
        return;
      }

      // Page sizes (in mm) for jspdf
      const sizesMm: Record<PageSize, [number, number]> = {
        a4: [210, 297],
        letter: [216, 279],
        legal: [216, 356],
      };
      const [pwMm, phMm] = sizesMm[pageSize];

      const html2canvas = (await import("html2canvas-pro")).default;
      const { jsPDF } = await import("jspdf");

      // Match iframe width to target page width so layout reflows realistically
      const cssWidthPx = orientation === "portrait" ? pwMm : phMm;
      // Map mm to px at 96 DPI: 1mm ~ 3.78px
      const widthPx = Math.round(cssWidthPx * 3.78 - margin * 2);
      ifr.style.width = `${widthPx + margin * 2}px`;
      // Also ensure body padding for visual margin in canvas (we apply margin in PDF)
      innerBody.style.padding = "0";

      const canvas = await html2canvas(innerBody, {
        scale,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
        windowWidth: widthPx,
      });

      const pdf = new jsPDF({
        orientation,
        unit: "mm",
        format: pageSize,
      });

      const pdfPageW = pdf.internal.pageSize.getWidth();
      const pdfPageH = pdf.internal.pageSize.getHeight();
      const usableW = pdfPageW - margin * 2;
      const usableH = pdfPageH - margin * 2;

      const canvasAspect = canvas.height / canvas.width;
      const renderedHeightMm = usableW * canvasAspect;

      const imgData = canvas.toDataURL("image/jpeg", 0.92);

      if (renderedHeightMm <= usableH) {
        pdf.addImage(imgData, "JPEG", margin, margin, usableW, renderedHeightMm);
      } else {
        // Multi-page: slice the canvas
        const pageHeightPx = (usableH / usableW) * canvas.width;
        let yOffsetPx = 0;
        let firstPage = true;
        while (yOffsetPx < canvas.height) {
          const sliceH = Math.min(pageHeightPx, canvas.height - yOffsetPx);
          const sliceCanvas = document.createElement("canvas");
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = sliceH;
          const ctx = sliceCanvas.getContext("2d")!;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
          ctx.drawImage(canvas, 0, -yOffsetPx);
          const sliceImg = sliceCanvas.toDataURL("image/jpeg", 0.92);
          if (!firstPage) pdf.addPage();
          firstPage = false;
          const sliceHeightMm = (sliceH / canvas.width) * usableW;
          pdf.addImage(sliceImg, "JPEG", margin, margin, usableW, sliceHeightMm);
          yOffsetPx += pageHeightPx;
        }
      }

      const out = pdf.output("arraybuffer");
      downloadPdfBytes(new Uint8Array(out), "html.pdf");
      info = "PDF generated.";
    } catch (e: any) {
      error = `Generation failed: ${e.message ?? e}`;
    } finally {
      processing = false;
    }
  }
</script>

<div class="flex flex-col gap-4">
  <div class="flex gap-2">
    <button
      class="px-3 py-1.5 text-sm border transition-colors {source === 'html'
        ? 'border-(--color-accent) bg-(--color-accent)/10 text-(--color-accent)'
        : 'border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)'}"
      onclick={() => (source = "html")}
    >
      HTML snippet
    </button>
    <button
      class="px-3 py-1.5 text-sm border transition-colors {source === 'url'
        ? 'border-(--color-accent) bg-(--color-accent)/10 text-(--color-accent)'
        : 'border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)'}"
      onclick={() => (source = "url")}
    >
      URL
    </button>
  </div>

  {#if source === "html"}
    <textarea
      bind:value={html}
      rows="14"
      class="w-full px-3 py-2 text-sm font-mono border border-(--color-border) bg-(--color-bg) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
      spellcheck="false"
    ></textarea>
  {:else}
    <label class="text-xs text-(--color-text-muted) flex flex-col gap-1">
      URL
      <input
        type="url"
        bind:value={url}
        placeholder="https://example.com"
        class="px-3 py-2 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text)"
      />
      <span class="text-[11px] text-orange-500">
        ⚠️ Most websites block cross-origin fetches. If this fails, copy the HTML and paste it into the HTML snippet mode.
      </span>
    </label>
  {/if}

  <div class="grid sm:grid-cols-4 gap-3 p-3 border border-(--color-border)">
    <label class="text-xs text-(--color-text-muted) flex flex-col gap-1">
      Page size
      <select bind:value={pageSize} class="px-2 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text)">
        <option value="a4">A4</option>
        <option value="letter">Letter</option>
        <option value="legal">Legal</option>
      </select>
    </label>
    <label class="text-xs text-(--color-text-muted) flex flex-col gap-1">
      Orientation
      <select bind:value={orientation} class="px-2 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text)">
        <option value="portrait">Portrait</option>
        <option value="landscape">Landscape</option>
      </select>
    </label>
    <label class="text-xs text-(--color-text-muted) flex flex-col gap-1">
      Margin (mm)
      <input type="number" min="0" max="50" bind:value={margin} class="px-2 py-1.5 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text)" />
    </label>
    <label class="text-xs text-(--color-text-muted) flex flex-col gap-1">
      Render scale ({scale}×)
      <input type="range" min="1" max="3" step="0.5" bind:value={scale} class="accent-(--color-accent)" />
    </label>
  </div>

  {#if error}
    <div class="p-3 border border-red-500 bg-red-500/10 text-red-500 text-sm">{error}</div>
  {/if}
  {#if info}
    <div class="p-3 border border-green-500 bg-green-500/10 text-green-600 dark:text-green-400 text-sm">{info}</div>
  {/if}

  <button
    class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) disabled:opacity-50 self-start"
    onclick={generate}
    disabled={processing}
  >
    {processing ? "Generating..." : "Generate PDF"}
  </button>

  <!-- Hidden iframe used to render and rasterize HTML -->
  <iframe
    bind:this={renderFrame}
    title="HTML render frame"
    class="absolute opacity-0 pointer-events-none"
    style="left: -10000px; top: 0; width: 800px; height: 1200px;"
  ></iframe>
</div>
