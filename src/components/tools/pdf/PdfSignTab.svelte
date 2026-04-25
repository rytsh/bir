<script lang="ts">
  import { onMount } from "svelte";
  import PdfDropzone from "./shared/PdfDropzone.svelte";
  import SignatureBanner from "./shared/SignatureBanner.svelte";
  import { getPdfjs } from "./shared/pdfjs-loader";
  import {
    detectSignatures,
    type DetectedSignature,
    META_SIGNER_NAME,
    META_SIGNER_EMAIL,
    META_SIGN_DATE,
    META_SIGN_REASON,
    META_TOOL,
    META_HASH,
  } from "./shared/pdf-signatures";
  import { computeSha256Hex, downloadPdfBytes, fileToUint8Array, stripPdfExtension } from "./shared/pdf-utils";

  interface PlacedSignature {
    id: number;
    pageIndex: number;
    xRatio: number;
    yRatio: number;
    widthRatio: number;
    heightRatio: number;
    dataUrl: string;
    selected: boolean;
  }

  let pdfFile = $state<File | null>(null);
  let pdfDoc = $state<any>(null);
  let pageCanvases = $state<HTMLCanvasElement[]>([]);
  let totalPages = $state(0);
  let scale = $state(1.5);
  let error = $state("");
  let loading = $state(false);
  let pdfBytesBackup = $state<Uint8Array | null>(null);

  let signatureMode = $state<"draw" | "image" | "text">("draw");
  let signatureCanvas = $state<HTMLCanvasElement | null>(null);
  let isDrawing = $state(false);
  let signatureDataUrl = $state("");
  let signatureImage = $state<string>("");
  let signatureText = $state("");
  let signatureFont = $state("'Dancing Script', cursive");
  let signatureColor = $state("#000033");
  let penSize = $state(2);

  let signerName = $state("");
  let signerEmail = $state("");
  let signReason = $state("");

  let placedSignatures = $state<PlacedSignature[]>([]);
  let nextSigId = $state(1);
  let isDragging = $state(false);
  let dragSigId = $state<number | null>(null);
  let dragOffset = $state({ x: 0, y: 0 });
  let isResizing = $state(false);
  let resizeSigId = $state<number | null>(null);

  let pageWrappers = $state<HTMLDivElement[]>([]);
  let pageDimensions = $state<{ width: number; height: number }[]>([]);
  let pdfPageSizes = $state<{ width: number; height: number }[]>([]);

  let downloading = $state(false);
  let downloadProgress = $state("");

  let detectedSignatures = $state<DetectedSignature[]>([]);
  let pdfjsLib: any = null;

  let canSign = $derived(placedSignatures.length > 0 && signerName.trim().length > 0);

  onMount(async () => {
    pdfjsLib = await getPdfjs();
  });

  async function handleFiles(files: File[]) {
    const file = files[0];
    if (!file) return;
    error = "";
    pdfFile = file;
    placedSignatures = [];
    detectedSignatures = [];
    await loadPdf(file);
  }

  async function loadPdf(file: File) {
    if (!pdfjsLib) pdfjsLib = await getPdfjs();
    loading = true;
    try {
      const buf = await fileToUint8Array(file);
      pdfBytesBackup = buf;
      detectedSignatures = await detectSignatures(buf);

      const loadingTask = pdfjsLib.getDocument({ data: buf.slice(0) });
      pdfDoc = await loadingTask.promise;
      totalPages = pdfDoc.numPages;
      pageCanvases = [];
      pageDimensions = [];
      pdfPageSizes = [];

      for (let i = 1; i <= totalPages; i++) {
        const page = await pdfDoc.getPage(i);
        const vp = page.getViewport({ scale: 1 });
        pdfPageSizes[i - 1] = { width: vp.width, height: vp.height };
      }
      await new Promise((r) => setTimeout(r, 50));
      await renderAllPages();
    } catch (e: any) {
      error = `Failed to load PDF: ${e.message}`;
    } finally {
      loading = false;
    }
  }

  async function renderAllPages() {
    if (!pdfDoc) return;
    pageDimensions = [];
    for (let i = 1; i <= totalPages; i++) {
      const page = await pdfDoc.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = pageCanvases[i - 1];
      if (!canvas) continue;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      pageDimensions[i - 1] = { width: viewport.width, height: viewport.height };
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      await page.render({ canvasContext: ctx, viewport }).promise;
    }
  }

  // ─── Signature drawing ───

  function initSignatureCanvas() {
    if (!signatureCanvas) return;
    const ctx = signatureCanvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, signatureCanvas.width, signatureCanvas.height);
  }

  function startDraw(event: MouseEvent | TouchEvent) {
    if (!signatureCanvas) return;
    isDrawing = true;
    const ctx = signatureCanvas.getContext("2d");
    if (!ctx) return;
    const rect = signatureCanvas.getBoundingClientRect();
    const sx = signatureCanvas.width / rect.width;
    const sy = signatureCanvas.height / rect.height;
    let x: number, y: number;
    if ("touches" in event) {
      x = (event.touches[0].clientX - rect.left) * sx;
      y = (event.touches[0].clientY - rect.top) * sy;
    } else {
      x = (event.clientX - rect.left) * sx;
      y = (event.clientY - rect.top) * sy;
    }
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = signatureColor;
    ctx.lineWidth = penSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }

  function draw(event: MouseEvent | TouchEvent) {
    if (!isDrawing || !signatureCanvas) return;
    event.preventDefault();
    const ctx = signatureCanvas.getContext("2d");
    if (!ctx) return;
    const rect = signatureCanvas.getBoundingClientRect();
    const sx = signatureCanvas.width / rect.width;
    const sy = signatureCanvas.height / rect.height;
    let x: number, y: number;
    if ("touches" in event) {
      x = (event.touches[0].clientX - rect.left) * sx;
      y = (event.touches[0].clientY - rect.top) * sy;
    } else {
      x = (event.clientX - rect.left) * sx;
      y = (event.clientY - rect.top) * sy;
    }
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function endDraw() {
    isDrawing = false;
  }

  function clearSignature() {
    initSignatureCanvas();
    signatureDataUrl = "";
  }

  function captureSignature() {
    if (!signatureCanvas) return;
    const ctx = signatureCanvas.getContext("2d");
    if (!ctx) return;
    const imageData = ctx.getImageData(0, 0, signatureCanvas.width, signatureCanvas.height);
    const { data, width, height } = imageData;
    let minX = width, minY = height, maxX = 0, maxY = 0;
    let hasContent = false;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        if (data[idx] < 250 || data[idx + 1] < 250 || data[idx + 2] < 250) {
          hasContent = true;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }
    if (!hasContent) {
      error = "Please draw a signature first.";
      return;
    }
    const pad = 10;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(width - 1, maxX + pad);
    maxY = Math.min(height - 1, maxY + pad);
    const trimW = maxX - minX + 1;
    const trimH = maxY - minY + 1;
    const trimCanvas = document.createElement("canvas");
    trimCanvas.width = trimW;
    trimCanvas.height = trimH;
    const trimCtx = trimCanvas.getContext("2d");
    if (!trimCtx) return;
    const trimData = ctx.getImageData(minX, minY, trimW, trimH);
    for (let i = 0; i < trimData.data.length; i += 4) {
      if (trimData.data[i] > 250 && trimData.data[i + 1] > 250 && trimData.data[i + 2] > 250) {
        trimData.data[i + 3] = 0;
      }
    }
    trimCtx.putImageData(trimData, 0, 0);
    signatureDataUrl = trimCanvas.toDataURL("image/png");
    error = "";
  }

  function handleSignatureImageUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !file.type.startsWith("image/")) {
      error = "Please select a valid image file.";
      return;
    }
    error = "";
    const reader = new FileReader();
    reader.onload = (e) => {
      signatureImage = e.target?.result as string;
      signatureDataUrl = signatureImage;
    };
    reader.readAsDataURL(file);
  }

  function generateTextSignature() {
    if (!signatureText.trim()) {
      error = "Please enter text for the signature.";
      return;
    }
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const fontSize = 192;
    const padding = 40;
    ctx.font = `${fontSize}px ${signatureFont}`;
    const metrics = ctx.measureText(signatureText);
    const textWidth = metrics.width;
    const textHeight = fontSize * 1.4;
    canvas.width = textWidth + padding * 2;
    canvas.height = textHeight + padding;
    ctx.font = `${fontSize}px ${signatureFont}`;
    ctx.fillStyle = signatureColor;
    ctx.textBaseline = "middle";
    ctx.fillText(signatureText, padding, canvas.height / 2);
    signatureDataUrl = canvas.toDataURL("image/png");
    error = "";
  }

  function placeSignature(pageIndex: number) {
    if (!signatureDataUrl) {
      error = "Please create a signature first.";
      return;
    }
    const pdfSize = pdfPageSizes[pageIndex];
    if (!pdfSize) return;
    const img = new Image();
    img.onload = () => {
      const imgAspect = img.naturalWidth / img.naturalHeight;
      const pageAspect = pdfSize.width / pdfSize.height;
      const widthRatio = 0.3;
      const heightRatio = (widthRatio / imgAspect) * pageAspect;
      const sig: PlacedSignature = {
        id: nextSigId++,
        pageIndex,
        xRatio: 0.5 - widthRatio / 2,
        yRatio: 1 - heightRatio - 0.05,
        widthRatio,
        heightRatio,
        dataUrl: signatureDataUrl,
        selected: true,
      };
      placedSignatures = placedSignatures.map((s) => ({ ...s, selected: false }));
      placedSignatures = [...placedSignatures, sig];
    };
    img.src = signatureDataUrl;
  }

  function selectSignature(id: number, event: MouseEvent) {
    event.stopPropagation();
    placedSignatures = placedSignatures.map((s) => ({ ...s, selected: s.id === id }));
  }

  function deselectAll() {
    placedSignatures = placedSignatures.map((s) => ({ ...s, selected: false }));
  }

  function removeSignature(id: number) {
    placedSignatures = placedSignatures.filter((s) => s.id !== id);
  }

  function startDragSignature(id: number, event: MouseEvent) {
    event.stopPropagation();
    event.preventDefault();
    const sig = placedSignatures.find((s) => s.id === id);
    if (!sig) return;
    const canvas = pageCanvases[sig.pageIndex];
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    isDragging = true;
    dragSigId = id;
    dragOffset = {
      x: (event.clientX - canvasRect.left) / canvasRect.width - sig.xRatio,
      y: (event.clientY - canvasRect.top) / canvasRect.height - sig.yRatio,
    };
    placedSignatures = placedSignatures.map((s) => ({ ...s, selected: s.id === id }));
    const onMove = (e: MouseEvent) => {
      if (!isDragging || dragSigId === null) return;
      const cRect = canvas.getBoundingClientRect();
      const newXRatio = (e.clientX - cRect.left) / cRect.width - dragOffset.x;
      const newYRatio = (e.clientY - cRect.top) / cRect.height - dragOffset.y;
      placedSignatures = placedSignatures.map((s) =>
        s.id === dragSigId
          ? {
              ...s,
              xRatio: Math.max(0, Math.min(newXRatio, 1 - s.widthRatio)),
              yRatio: Math.max(0, Math.min(newYRatio, 1 - s.heightRatio)),
            }
          : s,
      );
    };
    const onUp = () => {
      isDragging = false;
      dragSigId = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function startResizeSignature(id: number, event: MouseEvent) {
    event.stopPropagation();
    event.preventDefault();
    const sig = placedSignatures.find((s) => s.id === id);
    if (!sig) return;
    const canvas = pageCanvases[sig.pageIndex];
    if (!canvas) return;
    isResizing = true;
    resizeSigId = id;
    const startX = event.clientX;
    const startWidthRatio = sig.widthRatio;
    const aspectRatio = sig.heightRatio / sig.widthRatio;
    const onMove = (e: MouseEvent) => {
      if (!isResizing || resizeSigId === null) return;
      const cRect = canvas.getBoundingClientRect();
      const diffRatio = (e.clientX - startX) / cRect.width;
      const newWidthRatio = Math.max(0.05, Math.min(startWidthRatio + diffRatio, 0.8));
      const newHeightRatio = newWidthRatio * aspectRatio;
      placedSignatures = placedSignatures.map((s) =>
        s.id === resizeSigId ? { ...s, widthRatio: newWidthRatio, heightRatio: newHeightRatio } : s,
      );
    };
    const onUp = () => {
      isResizing = false;
      resizeSigId = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  async function signAndDownload() {
    if (!pdfBytesBackup || !pdfDoc || placedSignatures.length === 0) {
      error = "Please add at least one signature to the document.";
      return;
    }
    if (!signerName.trim()) {
      error = "Please enter your name to sign the document.";
      return;
    }
    downloading = true;
    error = "";
    downloadProgress = "Preparing document...";
    try {
      const { PDFDocument, PDFName, PDFString } = await import("pdf-lib");
      const signDateStr = new Date().toISOString();
      downloadProgress = "Loading original document...";
      const signedDoc = await PDFDocument.load(pdfBytesBackup.slice(0));
      const pages = signedDoc.getPages();
      downloadProgress = "Embedding signatures...";
      for (const sig of placedSignatures) {
        const page = pages[sig.pageIndex];
        if (!page) continue;
        const { width: pageWidth, height: pageHeight } = page.getSize();
        const sigPngBytes = await fetch(sig.dataUrl).then((r) => r.arrayBuffer());
        let embeddedImage: any;
        if (sig.dataUrl.includes("image/png")) {
          embeddedImage = await signedDoc.embedPng(sigPngBytes);
        } else {
          embeddedImage = await signedDoc.embedJpg(sigPngBytes);
        }
        const x = sig.xRatio * pageWidth;
        const w = sig.widthRatio * pageWidth;
        const h = sig.heightRatio * pageHeight;
        const y = pageHeight - (sig.yRatio * pageHeight + h);
        page.drawImage(embeddedImage, { x, y, width: w, height: h });
      }
      downloadProgress = "Finalizing document...";
      try {
        const form = signedDoc.getForm();
        form.flatten();
      } catch {
        // ignore
      }
      downloadProgress = "Computing integrity hash...";
      const contentBytes = await signedDoc.save();
      const contentHash = await computeSha256Hex(new Uint8Array(contentBytes));
      downloadProgress = "Embedding metadata...";
      signedDoc.setProducer("BIR PDF Sign Tool");
      signedDoc.setModificationDate(new Date());
      const infoRef = signedDoc.context.trailerInfo.Info;
      if (infoRef) {
        const infoDict = signedDoc.context.lookup(infoRef) as any;
        if (infoDict && infoDict.set) {
          infoDict.set(PDFName.of(META_SIGNER_NAME), PDFString.of(signerName.trim()));
          infoDict.set(PDFName.of(META_SIGNER_EMAIL), PDFString.of(signerEmail.trim()));
          infoDict.set(PDFName.of(META_SIGN_DATE), PDFString.of(signDateStr));
          infoDict.set(PDFName.of(META_SIGN_REASON), PDFString.of(signReason.trim()));
          infoDict.set(PDFName.of(META_TOOL), PDFString.of("BIR PDF Sign Tool v1.0"));
          infoDict.set(PDFName.of(META_HASH), PDFString.of(contentHash));
        }
      }
      downloadProgress = "Saving...";
      const finalBytes = await signedDoc.save();
      const base = stripPdfExtension(pdfFile?.name ?? "document");
      downloadPdfBytes(finalBytes, `${base}_signed.pdf`);
      downloadProgress = "";
    } catch (e: any) {
      error = `Failed to create signed PDF: ${e.message}`;
      downloadProgress = "";
    } finally {
      downloading = false;
    }
  }

  async function zoomIn() {
    scale = Math.min(scale + 0.25, 4);
    await renderAllPages();
  }
  async function zoomOut() {
    scale = Math.max(scale - 0.25, 0.5);
    await renderAllPages();
  }
  async function zoomReset() {
    scale = 1.5;
    await renderAllPages();
  }

  function resetFile() {
    pdfDoc = null;
    pdfFile = null;
    totalPages = 0;
    placedSignatures = [];
    pdfBytesBackup = null;
    pageDimensions = [];
    pdfPageSizes = [];
    error = "";
    detectedSignatures = [];
    downloadProgress = "";
  }

  $effect(() => {
    if (signatureMode === "draw" && signatureCanvas) {
      initSignatureCanvas();
    }
  });
</script>

<svelte:head>
  <link
    href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;700&family=Great+Vibes&family=Pacifico&family=Caveat:wght@400;700&display=swap"
    rel="stylesheet"
  />
</svelte:head>

<div class="flex flex-col gap-4">
  {#if detectedSignatures.length > 0}
    <SignatureBanner signatures={detectedSignatures} />
  {/if}

  {#if error}
    <div class="p-3 border border-red-500 bg-red-500/10 text-red-500 text-sm">{error}</div>
  {/if}

  {#if !pdfDoc && !loading}
    <PdfDropzone label="Drop a PDF here to view & sign" onfiles={handleFiles} />
  {/if}

  {#if loading}
    <div class="p-4 text-sm text-(--color-text-muted)">Loading PDF...</div>
  {/if}

  {#if pdfDoc}
    <div class="flex flex-col lg:flex-row gap-4 flex-1">
      <!-- Sidebar -->
      <div class="lg:w-72 flex flex-col gap-4 flex-shrink-0">
        <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Document</span>
            <button class="px-3 py-1.5 text-xs font-medium text-(--color-text-muted) hover:text-(--color-text)" onclick={resetFile}>
              Clear
            </button>
          </div>
          <span class="text-sm text-(--color-text) font-medium truncate block">{pdfFile?.name}</span>
          <span class="text-xs text-(--color-text-muted)">{totalPages} page{totalPages !== 1 ? "s" : ""}</span>
          <div class="flex items-center gap-2 mt-3 pt-3 border-t border-(--color-border)">
            <button class="px-2 py-1 text-xs border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)" onclick={zoomOut}>-</button>
            <span class="text-xs text-(--color-text-muted) min-w-[3ch] text-center">{Math.round(scale * 100)}%</span>
            <button class="px-2 py-1 text-xs border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)" onclick={zoomIn}>+</button>
            <button class="px-2 py-1 text-xs border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)" onclick={zoomReset}>Reset</button>
          </div>
        </div>

        <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3 block">Signer Information</span>
          <div class="flex flex-col gap-3">
            <div>
              <label class="text-xs text-(--color-text-muted) mb-1 block">Full Name <span class="text-red-500">*</span></label>
              <input
                type="text"
                bind:value={signerName}
                placeholder="John Doe"
                class="w-full px-3 py-2 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
              />
            </div>
            <div>
              <label class="text-xs text-(--color-text-muted) mb-1 block">Email</label>
              <input
                type="email"
                bind:value={signerEmail}
                placeholder="john@example.com"
                class="w-full px-3 py-2 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
              />
            </div>
            <div>
              <label class="text-xs text-(--color-text-muted) mb-1 block">Reason</label>
              <select
                bind:value={signReason}
                class="w-full px-3 py-2 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
              >
                <option value="">None</option>
                <option value="Approved">Approved</option>
                <option value="Reviewed">Reviewed</option>
                <option value="Agreed">Agreed to terms</option>
                <option value="Acknowledged">Acknowledged</option>
                <option value="Witnessed">Witnessed</option>
              </select>
            </div>
          </div>
        </div>

        <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3 block">Create Signature</span>
          <div class="flex border-b border-(--color-border) mb-4">
            {#each [["draw", "Draw"], ["image", "Image"], ["text", "Type"]] as [m, label]}
              <button
                class="px-4 py-2 text-sm font-medium transition-colors {signatureMode === m
                  ? 'text-(--color-accent) border-b-2 border-(--color-accent) -mb-px'
                  : 'text-(--color-text-muted) hover:text-(--color-text)'}"
                onclick={() => { signatureMode = m as any; signatureDataUrl = ""; }}
              >
                {label}
              </button>
            {/each}
          </div>

          {#if signatureMode === "draw"}
            <div class="flex flex-col gap-2">
              <div class="flex items-center gap-2 mb-1">
                <label class="text-xs text-(--color-text-muted)">Color:</label>
                <input type="color" bind:value={signatureColor} class="w-6 h-6 cursor-pointer border-0" />
                <label class="text-xs text-(--color-text-muted) ml-2">Size:</label>
                <input type="range" min="1" max="6" bind:value={penSize} class="flex-1 accent-(--color-accent)" />
              </div>
              <canvas
                bind:this={signatureCanvas}
                width={400}
                height={160}
                class="border border-(--color-border) cursor-crosshair bg-white w-full touch-none"
                onmousedown={startDraw}
                onmousemove={draw}
                onmouseup={endDraw}
                onmouseleave={endDraw}
                ontouchstart={startDraw}
                ontouchmove={draw}
                ontouchend={endDraw}
              ></canvas>
              <div class="flex gap-2">
                <button class="flex-1 px-3 py-1.5 text-sm border border-(--color-border) text-(--color-text) hover:bg-(--color-bg-alt)" onclick={clearSignature}>
                  Clear
                </button>
                <button class="flex-1 px-3 py-1.5 text-sm bg-(--color-accent) text-(--color-btn-text) font-medium hover:bg-(--color-accent-hover)" onclick={captureSignature}>
                  Use Signature
                </button>
              </div>
            </div>
          {/if}

          {#if signatureMode === "image"}
            <div class="flex flex-col gap-3">
              <p class="text-xs text-(--color-text-muted)">
                Upload a signature image (PNG with transparent background works best).
              </p>
              <label class="flex items-center justify-center px-4 py-3 border-2 border-dashed border-(--color-border) cursor-pointer hover:border-(--color-accent)">
                <span class="text-xs text-(--color-text-muted)">{signatureImage ? "Change image" : "Choose signature image"}</span>
                <input type="file" accept="image/*" class="hidden" onchange={handleSignatureImageUpload} />
              </label>
              {#if signatureImage}
                <div class="bg-white p-2 border border-(--color-border)">
                  <img src={signatureImage} alt="Signature" class="max-h-20 mx-auto object-contain" />
                </div>
              {/if}
            </div>
          {/if}

          {#if signatureMode === "text"}
            <div class="flex flex-col gap-3">
              <input
                type="text"
                bind:value={signatureText}
                placeholder="Type your name..."
                class="w-full px-3 py-2 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text)"
              />
              <div class="flex items-center gap-2">
                <label class="text-xs text-(--color-text-muted)">Font:</label>
                <select bind:value={signatureFont} class="flex-1 px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text)">
                  <option value="'Dancing Script', cursive">Dancing Script</option>
                  <option value="'Great Vibes', cursive">Great Vibes</option>
                  <option value="'Pacifico', cursive">Pacifico</option>
                  <option value="'Caveat', cursive">Caveat</option>
                </select>
              </div>
              <div class="flex items-center gap-2">
                <label class="text-xs text-(--color-text-muted)">Color:</label>
                <input type="color" bind:value={signatureColor} class="w-6 h-6 cursor-pointer border-0" />
              </div>
              {#if signatureText}
                <div class="bg-white p-3 border border-(--color-border) text-center" style="font-family: {signatureFont}; color: {signatureColor}; font-size: 28px;">
                  {signatureText}
                </div>
              {/if}
              <button class="px-4 py-2 text-sm bg-(--color-accent) text-(--color-btn-text) font-medium hover:bg-(--color-accent-hover)" onclick={generateTextSignature}>
                Use Signature
              </button>
            </div>
          {/if}

          {#if signatureDataUrl}
            <div class="mt-4 pt-3 border-t border-(--color-border)">
              <span class="text-xs text-(--color-text-muted) mb-2 block">Current signature:</span>
              <div class="bg-white p-2 border border-(--color-border)">
                <img src={signatureDataUrl} alt="Current signature" class="max-h-16 mx-auto object-contain" />
              </div>
            </div>
          {/if}
        </div>

        {#if placedSignatures.length > 0}
          <div class="flex flex-col gap-2">
            {#if !canSign}
              <p class="text-xs text-orange-500">Enter your name above to sign the document.</p>
            {/if}
            <button
              class="w-full px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) disabled:opacity-50"
              onclick={signAndDownload}
              disabled={downloading || !canSign}
            >
              {#if downloading}{downloadProgress || "Processing..."}{:else}Sign & Download{/if}
            </button>
            <p class="text-[10px] text-(--color-text-light) leading-tight">
              Signatures are embedded directly into the original PDF. Form fields are flattened. Signer metadata and SHA-256 integrity hash are stored in document properties.
            </p>
          </div>
        {/if}

        {#if placedSignatures.length > 0}
          <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
            <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3 block">
              Placed Signatures ({placedSignatures.length})
            </span>
            <div class="divide-y divide-(--color-border)">
              {#each placedSignatures as sig (sig.id)}
                <div class="flex items-center justify-between py-2 text-xs {sig.selected ? 'text-(--color-accent)' : 'text-(--color-text-muted)'}">
                  <span>Page {sig.pageIndex + 1}</span>
                  <button class="px-2 py-1 text-xs text-red-500 hover:bg-red-500/10" onclick={() => removeSignature(sig.id)}>Remove</button>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <!-- PDF Viewer -->
      <div class="flex-1 min-w-0">
        <div class="flex flex-col gap-4 items-center" onclick={deselectAll} role="presentation">
          {#each Array(totalPages) as _, i}
            <div class="relative border border-(--color-border) bg-white" bind:this={pageWrappers[i]}>
              <canvas bind:this={pageCanvases[i]} class="block max-w-full h-auto"></canvas>
              {#each placedSignatures.filter((s) => s.pageIndex === i) as sig (sig.id)}
                <div
                  class="absolute cursor-move {sig.selected ? 'ring-2 ring-(--color-accent)' : ''}"
                  style="left: {sig.xRatio * 100}%; top: {sig.yRatio * 100}%; width: {sig.widthRatio * 100}%; height: {sig.heightRatio * 100}%; z-index: 20;"
                  onclick={(e) => selectSignature(sig.id, e)}
                  onmousedown={(e) => startDragSignature(sig.id, e)}
                  role="button"
                  tabindex="0"
                >
                  <img src={sig.dataUrl} alt="Signature" class="w-full h-full object-contain pointer-events-none select-none" draggable="false" />
                  {#if sig.selected}
                    <button
                      class="absolute -top-2.5 -right-2.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600"
                      onclick={(e) => { e.stopPropagation(); removeSignature(sig.id); }}
                    >x</button>
                    <div
                      class="absolute -bottom-1.5 -right-1.5 w-4 h-4 bg-(--color-accent) rounded-full cursor-se-resize"
                      onmousedown={(e) => startResizeSignature(sig.id, e)}
                      role="button"
                      tabindex="0"
                    ></div>
                  {/if}
                </div>
              {/each}
              <button
                class="absolute bottom-2 right-2 px-3 py-1.5 text-xs bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) font-medium disabled:opacity-40"
                style="z-index: 20;"
                onclick={() => placeSignature(i)}
                disabled={!signatureDataUrl}
                title={signatureDataUrl ? "Place signature on this page" : "Create a signature first"}
              >
                + Sign here
              </button>
              <div class="absolute bottom-2 left-2 px-2 py-0.5 text-xs bg-black/50 text-white" style="z-index: 20;">
                {i + 1} / {totalPages}
              </div>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>
