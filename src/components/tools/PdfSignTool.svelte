<script lang="ts">
  import { onMount } from "svelte";

  // Types
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

  interface DetectedSignature {
    source: "digital" | "bir";
    signerName: string;
    signerEmail: string;
    signDate: string;
    signReason: string;
    location: string;
    tool: string;
    filter: string;
    subFilter: string;
    fieldName: string;
    hasCryptoData: boolean;
    storedHash: string;
  }

  interface VerificationResult {
    signatures: DetectedSignature[];
  }

  // State
  let pdfFile = $state<File | null>(null);
  let pdfDoc = $state<any>(null);
  let pageCanvases = $state<HTMLCanvasElement[]>([]);
  let totalPages = $state(0);
  let scale = $state(1.5);
  let error = $state("");
  let loading = $state(false);
  let pdfBytesBackup = $state<Uint8Array | null>(null);
  let dragOver = $state(false);

  // Signature state
  let signatureMode = $state<"draw" | "image" | "text">("draw");
  let signatureCanvas = $state<HTMLCanvasElement | null>(null);
  let isDrawing = $state(false);
  let signatureDataUrl = $state("");
  let signatureImage = $state<string>("");
  let signatureText = $state("");
  let signatureFont = $state("'Dancing Script', cursive");
  let signatureColor = $state("#000033");
  let penSize = $state(2);

  // Signer info
  let signerName = $state("");
  let signerEmail = $state("");
  let signReason = $state("");

  // Placed signatures
  let placedSignatures = $state<PlacedSignature[]>([]);
  let nextSigId = $state(1);
  let isDragging = $state(false);
  let dragSigId = $state<number | null>(null);
  let dragOffset = $state({ x: 0, y: 0 });
  let isResizing = $state(false);
  let resizeSigId = $state<number | null>(null);

  // Page containers ref
  let pagesContainer = $state<HTMLDivElement | null>(null);
  let pageWrappers = $state<HTMLDivElement[]>([]);
  let textLayerDivs = $state<HTMLDivElement[]>([]);
  let pageDimensions = $state<{ width: number; height: number }[]>([]);
  let pdfPageSizes = $state<{ width: number; height: number }[]>([]);

  // Download state
  let downloading = $state(false);
  let downloadProgress = $state("");

  // Verification state
  let verification = $state<VerificationResult | null>(null);
  let verifying = $state(false);

  // Derived
  let canSign = $derived(placedSignatures.length > 0 && signerName.trim().length > 0);

  // PDF.js library refs
  let pdfjsLib: any = null;

  // E-signature metadata keys
  const META_PREFIX = "BIR_ESIGN";
  const META_SIGNER_NAME = `${META_PREFIX}_SignerName`;
  const META_SIGNER_EMAIL = `${META_PREFIX}_SignerEmail`;
  const META_SIGN_DATE = `${META_PREFIX}_SignDate`;
  const META_SIGN_REASON = `${META_PREFIX}_SignReason`;
  const META_TOOL = `${META_PREFIX}_Tool`;
  const META_HASH = `${META_PREFIX}_IntegrityHash`;

  onMount(async () => {
    pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
  });

  // ─── File handling ───

  async function handleFileUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || file.type !== "application/pdf") {
      error = "Please select a valid PDF file.";
      return;
    }
    error = "";
    pdfFile = file;
    placedSignatures = [];
    verification = null;
    await loadPdf(file);
  }

  async function handleDrop(event: DragEvent) {
    event.preventDefault();
    dragOver = false;
    const file = event.dataTransfer?.files[0];
    if (!file || file.type !== "application/pdf") {
      error = "Please drop a valid PDF file.";
      return;
    }
    error = "";
    pdfFile = file;
    placedSignatures = [];
    verification = null;
    await loadPdf(file);
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    dragOver = true;
  }

  function handleDragLeave() {
    dragOver = false;
  }

  async function loadPdf(file: File) {
    if (!pdfjsLib) {
      error = "PDF library is still loading. Please try again.";
      return;
    }
    loading = true;
    try {
      const arrayBuffer = await file.arrayBuffer();
      pdfBytesBackup = new Uint8Array(arrayBuffer.slice(0));
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
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

      // Auto-detect if this PDF was signed with our tool
      await autoVerify();
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

      // Render text layer for text selection
      const textLayerDiv = textLayerDivs[i - 1];
      if (textLayerDiv) {
        textLayerDiv.innerHTML = "";
        // Set CSS variables required by pdfjs TextLayer's setLayerDimensions
        textLayerDiv.style.setProperty("--total-scale-factor", String(scale));
        textLayerDiv.style.setProperty("--scale-round-x", "1px");
        textLayerDiv.style.setProperty("--scale-round-y", "1px");
        try {
          const textContent = await page.getTextContent();
          const textLayer = new pdfjsLib.TextLayer({
            textContentSource: textContent,
            container: textLayerDiv,
            viewport,
          });
          await textLayer.render();
          // Override pdfjs setLayerDimensions sizing to match canvas exactly
          textLayerDiv.style.width = `${viewport.width}px`;
          textLayerDiv.style.height = `${viewport.height}px`;
        } catch {
          // Text layer rendering is optional; silently ignore errors
        }
      }
    }
  }

  // ─── Auto-verification ───

  function readDictStr(dict: any, key: string, PDFStringCls: any, PDFHexStringCls: any, PDFNameCls: any): string {
    try {
      const val = dict.lookupMaybe(PDFNameCls.of(key), PDFStringCls, PDFHexStringCls);
      if (val) return val.decodeText();
    } catch {
      // ignore
    }
    return "";
  }

  function readDictName(dict: any, key: string, PDFNameCls: any): string {
    try {
      const val = dict.lookupMaybe(PDFNameCls.of(key), PDFNameCls);
      if (val) return val.decodeText();
    } catch {
      // ignore
    }
    return "";
  }

  function parsePdfDate(pdfDate: string): string {
    if (!pdfDate) return "";
    // PDF date: D:YYYYMMDDHHmmSSOHH'mm'
    const m = pdfDate.match(
      /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([Z+-])?(\d{2})?'?(\d{2})?'?$/,
    );
    if (!m) return pdfDate; // return raw if unparseable
    const [, yr, mo, dy, hh, mm, ss, tz, tzH, tzM] = m;
    const iso = `${yr}-${mo ?? "01"}-${dy ?? "01"}T${hh ?? "00"}:${mm ?? "00"}:${ss ?? "00"}`;
    if (tz === "Z" || !tz) return new Date(iso + "Z").toISOString();
    return new Date(`${iso}${tz}${tzH ?? "00"}:${tzM ?? "00"}`).toISOString();
  }

  function detectSigningTool(sigDict: any, PDFNameCls: any, PDFStringCls: any, PDFHexStringCls: any, PDFDictCls: any): string {
    // Check /Prop_Build/App/Name
    try {
      const propBuild = sigDict.lookupMaybe(PDFNameCls.of("Prop_Build"), PDFDictCls);
      if (propBuild) {
        const app = propBuild.lookupMaybe(PDFNameCls.of("App"), PDFDictCls);
        if (app) {
          const appName = readDictStr(app, "Name", PDFStringCls, PDFHexStringCls, PDFNameCls)
            || readDictName(app, "Name", PDFNameCls);
          if (appName) {
            if (/adobe|acrobat/i.test(appName)) return "Adobe Acrobat";
            if (/docusign/i.test(appName)) return "DocuSign";
            if (/hellosign|dropbox/i.test(appName)) return "HelloSign (Dropbox Sign)";
            if (/pandadoc/i.test(appName)) return "PandaDoc";
            if (/signow/i.test(appName)) return "signNow";
            return appName;
          }
        }
      }
    } catch {
      // ignore
    }

    // Check /Name and /Reason for tool identifiers
    const name = readDictStr(sigDict, "Name", PDFStringCls, PDFHexStringCls, PDFNameCls);
    const reason = readDictStr(sigDict, "Reason", PDFStringCls, PDFHexStringCls, PDFNameCls);
    const combined = `${name} ${reason}`;
    if (/docusign/i.test(combined)) return "DocuSign";
    if (/hellosign/i.test(combined)) return "HelloSign (Dropbox Sign)";
    if (/adobe/i.test(combined)) return "Adobe Acrobat";
    if (/pandadoc/i.test(combined)) return "PandaDoc";

    // Check /Filter
    const filter = readDictName(sigDict, "Filter", PDFNameCls);
    if (filter === "Adobe.PPKLite") return "Adobe-compatible signer";
    if (filter === "Adobe.PPKMS") return "Adobe (Windows Certificate Store)";
    if (filter === "Entrust.PPKEF") return "Entrust";

    return "";
  }

  async function autoVerify() {
    if (!pdfBytesBackup) return;
    verifying = true;
    try {
      const { PDFDocument, PDFName, PDFString, PDFHexString, PDFDict } = await import("pdf-lib");
      const doc = await PDFDocument.load(pdfBytesBackup.slice(0), { ignoreEncryption: true });

      const detected: DetectedSignature[] = [];

      // ── 1. Detect PDF digital signatures (/Sig form fields) ──
      try {
        const form = doc.getForm();
        const fields = form.getFields();

        for (const field of fields) {
          // Check if this is a signature field
          const ftRaw = field.acroField.dict.get(PDFName.of("FT"))
            ?? (field.acroField as any).getInheritableAttribute?.(PDFName.of("FT"));
          const ft = doc.context.lookupMaybe(ftRaw, PDFName);
          if (ft?.decodeText() !== "Sig") continue;

          // Get the /V signature value dictionary
          const vObj = field.acroField.V();
          if (!(vObj instanceof PDFDict)) {
            // Empty signature field (not yet signed)
            continue;
          }

          const sigDict = vObj;
          const signerName = readDictStr(sigDict, "Name", PDFString, PDFHexString, PDFName);
          const reason = readDictStr(sigDict, "Reason", PDFString, PDFHexString, PDFName);
          const location = readDictStr(sigDict, "Location", PDFString, PDFHexString, PDFName);
          const contactInfo = readDictStr(sigDict, "ContactInfo", PDFString, PDFHexString, PDFName);
          const dateRaw = readDictStr(sigDict, "M", PDFString, PDFHexString, PDFName);
          const filter = readDictName(sigDict, "Filter", PDFName);
          const subFilter = readDictName(sigDict, "SubFilter", PDFName);

          // Check if PKCS#7 data exists
          const contentsRaw = sigDict.get(PDFName.of("Contents"));
          const hasCryptoData = contentsRaw instanceof PDFHexString && contentsRaw.asBytes().length > 0;

          const tool = detectSigningTool(sigDict, PDFName, PDFString, PDFHexString, PDFDict);

          detected.push({
            source: "digital",
            signerName,
            signerEmail: contactInfo,
            signDate: parsePdfDate(dateRaw),
            signReason: reason,
            location,
            tool,
            filter,
            subFilter,
            fieldName: field.getName(),
            hasCryptoData,
            storedHash: "",
          });
        }
      } catch {
        // PDF may not have forms
      }

      // ── 2. Detect BIR e-signature metadata in Info dictionary ──
      try {
        const infoRef = doc.context.trailerInfo.Info;
        if (infoRef) {
          const infoDict = doc.context.lookup(infoRef);
          if (infoDict instanceof PDFDict) {
            const birName = readDictStr(infoDict, META_SIGNER_NAME, PDFString, PDFHexString, PDFName);
            const birTool = readDictStr(infoDict, META_TOOL, PDFString, PDFHexString, PDFName);

            if (birName || birTool) {
              detected.push({
                source: "bir",
                signerName: birName,
                signerEmail: readDictStr(infoDict, META_SIGNER_EMAIL, PDFString, PDFHexString, PDFName),
                signDate: readDictStr(infoDict, META_SIGN_DATE, PDFString, PDFHexString, PDFName),
                signReason: readDictStr(infoDict, META_SIGN_REASON, PDFString, PDFHexString, PDFName),
                location: "",
                tool: birTool || "BIR PDF Sign Tool",
                filter: "",
                subFilter: "",
                fieldName: "",
                hasCryptoData: false,
                storedHash: readDictStr(infoDict, META_HASH, PDFString, PDFHexString, PDFName),
              });
            }
          }
        }
      } catch {
        // ignore
      }

      verification = detected.length > 0 ? { signatures: detected } : null;
    } catch {
      verification = null;
    } finally {
      verifying = false;
    }
  }

  // ─── SHA-256 hashing ───

  async function computeSha256(data: Uint8Array): Promise<string> {
    const hashBuffer = await crypto.subtle.digest("SHA-256", data.buffer as ArrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
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

    // Render at 4x resolution for crisp output when embedded in PDF
    const fontSize = 192;
    const padding = 40;
    ctx.font = `${fontSize}px ${signatureFont}`;
    const metrics = ctx.measureText(signatureText);
    const textWidth = metrics.width;
    const textHeight = fontSize * 1.4;

    canvas.width = textWidth + padding * 2;
    canvas.height = textHeight + padding;

    // Must re-set font after resizing canvas (canvas reset clears state)
    ctx.font = `${fontSize}px ${signatureFont}`;
    ctx.fillStyle = signatureColor;
    ctx.textBaseline = "middle";
    ctx.fillText(signatureText, padding, canvas.height / 2);

    signatureDataUrl = canvas.toDataURL("image/png");
    error = "";
  }

  // ─── Signature placement ───

  function placeSignature(pageIndex: number) {
    if (!signatureDataUrl) {
      error = "Please create a signature first.";
      return;
    }
    const pdfSize = pdfPageSizes[pageIndex];
    if (!pdfSize) return;

    // Load the signature image to get its actual dimensions for correct aspect ratio
    const img = new Image();
    img.onload = () => {
      const imgAspect = img.naturalWidth / img.naturalHeight;
      const pageAspect = pdfSize.width / pdfSize.height;

      // Target width: 30% of page width
      const widthRatio = 0.3;
      // Height derived from actual image aspect ratio, adjusted for page aspect
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
    placedSignatures = placedSignatures.map((s) => ({
      ...s,
      selected: s.id === id,
    }));
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

    placedSignatures = placedSignatures.map((s) => ({
      ...s,
      selected: s.id === id,
    }));

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

  // ─── E-Sign & Download ───

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

      // ── Step 1: Load original PDF (preserves text, vectors, links, bookmarks) ──
      downloadProgress = "Loading original document...";
      const signedDoc = await PDFDocument.load(pdfBytesBackup.slice(0));
      const pages = signedDoc.getPages();

      // ── Step 2: Overlay signatures directly onto pages ──
      downloadProgress = "Embedding signatures...";

      for (const sig of placedSignatures) {
        const page = pages[sig.pageIndex];
        if (!page) continue;

        const { width: pageWidth, height: pageHeight } = page.getSize();

        // Embed signature image (PNG with transparency)
        const sigPngBytes = await fetch(sig.dataUrl).then((r) => r.arrayBuffer());
        let embeddedImage: Awaited<ReturnType<typeof signedDoc.embedPng>>;
        if (sig.dataUrl.includes("image/png")) {
          embeddedImage = await signedDoc.embedPng(sigPngBytes);
        } else {
          embeddedImage = await signedDoc.embedJpg(sigPngBytes);
        }

        // Convert ratios to PDF coordinates (bottom-left origin)
        const x = sig.xRatio * pageWidth;
        const w = sig.widthRatio * pageWidth;
        const h = sig.heightRatio * pageHeight;
        const y = pageHeight - (sig.yRatio * pageHeight + h);

        page.drawImage(embeddedImage, { x, y, width: w, height: h });
      }

      // ── Step 3: Flatten any existing form fields ──
      downloadProgress = "Finalizing document...";
      try {
        const form = signedDoc.getForm();
        form.flatten();
      } catch {
        // PDF may not have forms -- ignore
      }

      // ── Step 4: Compute integrity hash ──
      downloadProgress = "Computing integrity hash...";
      const contentBytes = await signedDoc.save();
      const contentHash = await computeSha256(new Uint8Array(contentBytes as unknown as ArrayBuffer));

      // ── Step 5: Embed e-signature metadata ──
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

      // ── Step 6: Save and download ──
      downloadProgress = "Saving...";
      const finalBytes = await signedDoc.save();
      const blob = new Blob([finalBytes as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${pdfFile?.name?.replace(".pdf", "") ?? "document"}_signed.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      downloadProgress = "";
    } catch (e: any) {
      error = `Failed to create signed PDF: ${e.message}`;
      downloadProgress = "";
    } finally {
      downloading = false;
    }
  }

  // ─── Zoom ───

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
    verification = null;
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

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      View PDF documents and add your e-signature by drawing, typing, or uploading an image.
      Signatures are embedded directly into the original PDF preserving full document quality. Signer
      info, timestamp, and SHA-256 integrity hash are embedded into PDF metadata. All processing
      happens in your browser.
    </p>
  </header>

  {#if error}
    <div class="mb-4 p-3 border border-red-500 bg-red-500/10 text-red-500 text-sm">
      {error}
    </div>
  {/if}

  <!-- Verification banner (auto-detected signatures) -->
  {#if verification && verification.signatures.length > 0}
    <div class="mb-4 border border-green-500 bg-(--color-bg-alt)">
      <div class="px-4 py-3 border-b border-(--color-border) flex items-center gap-2">
        <span class="text-green-500 text-lg">&#x2714;</span>
        <span class="text-sm font-medium text-green-500">
          This document contains {verification.signatures.length} signature{verification.signatures.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div class="divide-y divide-(--color-border)">
        {#each verification.signatures as sig, idx}
          <div class="px-4 py-3">
            <div class="flex items-center gap-2 mb-2">
              <span class="text-xs font-medium px-1.5 py-0.5 {sig.source === 'digital' ? 'bg-blue-500/10 text-blue-500 border border-blue-500/30' : 'bg-green-500/10 text-green-500 border border-green-500/30'}">
                {sig.source === "digital" ? "Digital Signature" : "E-Signature"}
              </span>
              {#if sig.hasCryptoData}
                <span class="text-xs px-1.5 py-0.5 bg-purple-500/10 text-purple-500 border border-purple-500/30">PKCS#7</span>
              {/if}
              {#if sig.tool}
                <span class="text-xs text-(--color-text-muted)">{sig.tool}</span>
              {/if}
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-(--color-text-muted)">
              {#if sig.signerName}
                <div><span class="text-(--color-text-light)">Signer:</span> {sig.signerName}</div>
              {/if}
              {#if sig.signerEmail}
                <div><span class="text-(--color-text-light)">Contact:</span> {sig.signerEmail}</div>
              {/if}
              {#if sig.signDate}
                <div><span class="text-(--color-text-light)">Date:</span> {new Date(sig.signDate).toLocaleString()}</div>
              {/if}
              {#if sig.signReason}
                <div><span class="text-(--color-text-light)">Reason:</span> {sig.signReason}</div>
              {/if}
              {#if sig.location}
                <div><span class="text-(--color-text-light)">Location:</span> {sig.location}</div>
              {/if}
              {#if sig.fieldName}
                <div><span class="text-(--color-text-light)">Field:</span> {sig.fieldName}</div>
              {/if}
              {#if sig.filter}
                <div><span class="text-(--color-text-light)">Filter:</span> {sig.filter}{sig.subFilter ? ` / ${sig.subFilter}` : ""}</div>
              {/if}
              {#if sig.storedHash}
                <div class="sm:col-span-2"><span class="text-(--color-text-light)">Integrity Hash:</span> <span class="font-mono text-[10px] break-all">{sig.storedHash}</span></div>
              {/if}
            </div>
            {#if sig.source === "digital" && sig.hasCryptoData}
              <p class="mt-2 text-[10px] text-(--color-text-light)">
                This signature contains cryptographic data (PKCS#7). Certificate chain verification is not performed client-side.
              </p>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#if !pdfDoc && !loading}
    <!-- File Upload -->
    <div
      class="flex-1 min-h-[300px] border-2 border-dashed flex flex-col items-center justify-center p-4 transition-colors cursor-pointer {dragOver ? 'border-(--color-accent) bg-(--color-accent)/5' : 'border-(--color-border)'}"
      ondrop={handleDrop}
      ondragover={handleDragOver}
      ondragleave={handleDragLeave}
      role="button"
      tabindex="0"
    >
      <div class="text-4xl mb-2">📄</div>
      <p class="text-sm text-(--color-text)">Drop a PDF file here or click to browse</p>
      <p class="text-xs text-(--color-text-muted) mt-1">Supports .pdf files</p>
      <label
        class="mt-3 inline-block px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium cursor-pointer hover:bg-(--color-accent-hover) transition-colors"
      >
        Browse Files
        <input type="file" accept=".pdf,application/pdf" class="hidden" onchange={handleFileUpload} />
      </label>
    </div>
  {/if}

  {#if loading}
    <div class="flex-1 flex items-center justify-center">
      <p class="text-(--color-text-muted)">Loading PDF...</p>
    </div>
  {/if}

  {#if pdfDoc}
    <div class="flex flex-col lg:flex-row gap-4 flex-1">
      <!-- Sidebar -->
      <div class="lg:w-72 flex flex-col gap-4 flex-shrink-0">
        <!-- Document info -->
        <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Document</span>
            <button
              class="px-3 py-1.5 text-xs font-medium text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              onclick={resetFile}
            >
              Clear
            </button>
          </div>
          <span class="text-sm text-(--color-text) font-medium truncate block">{pdfFile?.name}</span>
          <span class="text-xs text-(--color-text-muted)">{totalPages} page{totalPages !== 1 ? "s" : ""}</span>

          <div class="flex items-center gap-2 mt-3 pt-3 border-t border-(--color-border)">
            <button
              class="px-2 py-1 text-xs border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-bg-alt) transition-colors"
              onclick={zoomOut}
            >
              -
            </button>
            <span class="text-xs text-(--color-text-muted) min-w-[3ch] text-center">{Math.round(scale * 100)}%</span>
            <button
              class="px-2 py-1 text-xs border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-bg-alt) transition-colors"
              onclick={zoomIn}
            >
              +
            </button>
            <button
              class="px-2 py-1 text-xs border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-bg-alt) transition-colors"
              onclick={zoomReset}
            >
              Reset
            </button>
          </div>
        </div>

        <!-- Signer Info -->
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
                class="w-full px-3 py-2 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) focus:outline-none focus:border-(--color-accent) cursor-pointer"
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

        <!-- Signature Creation -->
        <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3 block">Create Signature</span>

          <div class="flex border-b border-(--color-border) mb-4">
            <button
              class="px-4 py-2 text-sm font-medium transition-colors {signatureMode === 'draw'
                ? 'text-(--color-accent) border-b-2 border-(--color-accent) -mb-px'
                : 'text-(--color-text-muted) hover:text-(--color-text)'}"
              onclick={() => { signatureMode = "draw"; signatureDataUrl = ""; }}
            >
              Draw
            </button>
            <button
              class="px-4 py-2 text-sm font-medium transition-colors {signatureMode === 'image'
                ? 'text-(--color-accent) border-b-2 border-(--color-accent) -mb-px'
                : 'text-(--color-text-muted) hover:text-(--color-text)'}"
              onclick={() => { signatureMode = "image"; signatureDataUrl = ""; }}
            >
              Image
            </button>
            <button
              class="px-4 py-2 text-sm font-medium transition-colors {signatureMode === 'text'
                ? 'text-(--color-accent) border-b-2 border-(--color-accent) -mb-px'
                : 'text-(--color-text-muted) hover:text-(--color-text)'}"
              onclick={() => { signatureMode = "text"; signatureDataUrl = ""; }}
            >
              Type
            </button>
          </div>

          {#if signatureMode === "draw"}
            <div class="flex flex-col gap-2">
              <div class="flex items-center gap-2 mb-1">
                <label class="text-xs text-(--color-text-muted)">Color:</label>
                <input
                  type="color"
                  bind:value={signatureColor}
                  class="w-6 h-6 cursor-pointer border-0"
                />
                <label class="text-xs text-(--color-text-muted) ml-2">Size:</label>
                <input
                  type="range"
                  min="1"
                  max="6"
                  bind:value={penSize}
                  class="flex-1 accent-(--color-accent)"
                />
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
                <button
                  class="flex-1 px-3 py-1.5 text-sm border border-(--color-border) text-(--color-text) hover:bg-(--color-bg-alt) transition-colors"
                  onclick={clearSignature}
                >
                  Clear
                </button>
                <button
                  class="flex-1 px-3 py-1.5 text-sm bg-(--color-accent) text-(--color-btn-text) font-medium hover:bg-(--color-accent-hover) transition-colors"
                  onclick={captureSignature}
                >
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
              <label
                class="flex items-center justify-center px-4 py-3 border-2 border-dashed border-(--color-border) cursor-pointer hover:border-(--color-accent) transition-colors"
              >
                <span class="text-xs text-(--color-text-muted)">
                  {signatureImage ? "Change image" : "Choose signature image"}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  class="hidden"
                  onchange={handleSignatureImageUpload}
                />
              </label>
              {#if signatureImage}
                <div class="bg-white p-2 border border-(--color-border)">
                  <img
                    src={signatureImage}
                    alt="Signature"
                    class="max-h-20 mx-auto object-contain"
                  />
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
                class="w-full px-3 py-2 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
              />
              <div class="flex items-center gap-2">
                <label class="text-xs text-(--color-text-muted)">Font:</label>
                <select
                  bind:value={signatureFont}
                  class="flex-1 px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) focus:outline-none focus:border-(--color-accent) cursor-pointer"
                >
                  <option value="'Dancing Script', cursive">Dancing Script</option>
                  <option value="'Great Vibes', cursive">Great Vibes</option>
                  <option value="'Pacifico', cursive">Pacifico</option>
                  <option value="'Caveat', cursive">Caveat</option>
                </select>
              </div>
              <div class="flex items-center gap-2">
                <label class="text-xs text-(--color-text-muted)">Color:</label>
                <input
                  type="color"
                  bind:value={signatureColor}
                  class="w-6 h-6 cursor-pointer border-0"
                />
              </div>
              {#if signatureText}
                <div
                  class="bg-white p-3 border border-(--color-border) text-center"
                  style="font-family: {signatureFont}; color: {signatureColor}; font-size: 28px;"
                >
                  {signatureText}
                </div>
              {/if}
              <button
                class="px-4 py-2 text-sm bg-(--color-accent) text-(--color-btn-text) font-medium hover:bg-(--color-accent-hover) transition-colors"
                onclick={generateTextSignature}
              >
                Use Signature
              </button>
            </div>
          {/if}

          {#if signatureDataUrl}
            <div class="mt-4 pt-3 border-t border-(--color-border)">
              <span class="text-xs text-(--color-text-muted) mb-2 block">Current signature:</span>
              <div class="bg-white p-2 border border-(--color-border)">
                <img
                  src={signatureDataUrl}
                  alt="Current signature"
                  class="max-h-16 mx-auto object-contain"
                />
              </div>
            </div>
          {/if}
        </div>

        <!-- Sign & Download Button -->
        {#if placedSignatures.length > 0}
          <div class="flex flex-col gap-2">
            {#if !canSign}
              <p class="text-xs text-orange-500">Enter your name above to sign the document.</p>
            {/if}
            <button
              class="w-full px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              onclick={signAndDownload}
              disabled={downloading || !canSign}
            >
              {#if downloading}
                {downloadProgress || "Processing..."}
              {:else}
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                  />
                </svg>
                Sign & Download
              {/if}
            </button>
            <p class="text-[10px] text-(--color-text-light) leading-tight">
              Signatures are embedded directly into the original PDF. Form fields are flattened. Signer metadata and SHA-256 integrity hash are stored in document properties.
            </p>
          </div>
        {/if}

        <!-- Placed signatures list -->
        {#if placedSignatures.length > 0}
          <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
            <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3 block">
              Placed Signatures ({placedSignatures.length})
            </span>
            <div class="divide-y divide-(--color-border)">
              {#each placedSignatures as sig (sig.id)}
                <div
                  class="flex items-center justify-between py-2 text-xs {sig.selected ? 'text-(--color-accent)' : 'text-(--color-text-muted)'}"
                >
                  <span>Page {sig.pageIndex + 1}</span>
                  <button
                    class="px-2 py-1 text-xs text-red-500 hover:bg-red-500/10 transition-colors"
                    onclick={() => removeSignature(sig.id)}
                  >
                    Remove
                  </button>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <!-- PDF Viewer -->
      <div class="flex-1 min-w-0" bind:this={pagesContainer}>
        <div class="flex flex-col gap-4 items-center" onclick={deselectAll} role="presentation">
          {#each Array(totalPages) as _, i}
            <div
              class="relative border border-(--color-border) bg-white"
              bind:this={pageWrappers[i]}
            >
              <canvas bind:this={pageCanvases[i]} class="block max-w-full h-auto"></canvas>

              <!-- Text layer for text selection -->
              <div
                bind:this={textLayerDivs[i]}
                class="pdf-text-layer"
              ></div>

              {#each placedSignatures.filter((s) => s.pageIndex === i) as sig (sig.id)}
                <div
                  class="absolute cursor-move {sig.selected ? 'ring-2 ring-(--color-accent)' : ''}"
                  style="left: {sig.xRatio * 100}%; top: {sig.yRatio * 100}%; width: {sig.widthRatio * 100}%; height: {sig.heightRatio * 100}%; z-index: 20;"
                  onclick={(e) => selectSignature(sig.id, e)}
                  onmousedown={(e) => startDragSignature(sig.id, e)}
                  role="button"
                  tabindex="0"
                >
                  <img
                    src={sig.dataUrl}
                    alt="Signature"
                    class="w-full h-full object-contain pointer-events-none select-none"
                    draggable="false"
                  />
                  {#if sig.selected}
                    <button
                      class="absolute -top-2.5 -right-2.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600"
                      onclick={(e) => {
                        e.stopPropagation();
                        removeSignature(sig.id);
                      }}
                    >
                      x
                    </button>
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
                class="absolute bottom-2 right-2 px-3 py-1.5 text-xs bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) transition-colors font-medium disabled:opacity-40"
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

<style>
  /* PDF.js text layer styles (extracted from pdfjs-dist/web/pdf_viewer.css) */
  .pdf-text-layer {
    position: absolute;
    text-align: initial;
    inset: 0;
    overflow: clip;
    opacity: 1;
    line-height: 1;
    -webkit-text-size-adjust: none;
    -moz-text-size-adjust: none;
    text-size-adjust: none;
    forced-color-adjust: none;
    transform-origin: 0 0;
    caret-color: CanvasText;
    z-index: 10;

    --min-font-size: 1;
    --text-scale-factor: calc(var(--total-scale-factor) * var(--min-font-size));
    --min-font-size-inv: calc(1 / var(--min-font-size));
  }

  .pdf-text-layer :global(:is(span, br)) {
    color: transparent;
    position: absolute;
    white-space: pre;
    cursor: text;
    transform-origin: 0% 0%;
  }

  .pdf-text-layer :global(> :not(.markedContent)),
  .pdf-text-layer :global(.markedContent span:not(.markedContent)) {
    z-index: 1;
    font-size: calc(var(--text-scale-factor) * var(--font-height));
    transform: rotate(var(--rotate, 0deg)) scaleX(var(--scale-x, 1)) scale(var(--min-font-size-inv));
  }

  .pdf-text-layer :global(.markedContent) {
    display: contents;
  }

  .pdf-text-layer :global(span::selection) {
    background: rgba(0, 100, 200, 0.3);
  }
</style>
