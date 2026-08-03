<script lang="ts">
  import { onMount } from "svelte";
  import bwipjs from "@bwip-js/browser";
  import { MatrixPainter, type ErrorCorrectionLevel } from "./qr-transfer/qr-encoder.ts";
  import { QrScanner, type Region } from "./qr-transfer/qr-decoder.ts";
  import {
    TransferReceiver,
    TransferSender,
    type ReceiverProgress,
    type SenderStats,
  } from "./qr-transfer/session.ts";

  type TabType = "barcode" | "wifi" | "reader" | "transfer";
  type OutputFormat = "png" | "svg" | "ascii";
  type FrameStyle = "none" | "simple" | "rounded" | "bold" | "double";
  type WifiEncryption = "WPA" | "WEP" | "nopass";
  type ReaderMode = "file" | "camera" | "screen" | "receive";
  type FileTransferState = "idle" | "ready" | "playing";

  /**
   * Legacy v1 transfer frame: a JSON envelope holding one sequential base64
   * chunk. Still parsed on the receiving side so codes produced by an older
   * build of this tool keep working, but no longer generated - see
   * `qr-transfer/protocol.ts` for the fountain-coded format that replaced it.
   */
  interface VideoFrameCallbackHost extends HTMLVideoElement {
    requestVideoFrameCallback?: (cb: () => void) => number;
    cancelVideoFrameCallback?: (handle: number) => void;
  }

  interface LegacyChunk {
    t: "file";
    n?: string;
    i: number;
    c: number;
    d: string;
    h?: string;
  }

  interface BarcodeType {
    id: string;
    name: string;
    description: string;
    category: "1d" | "2d";
  }

  const barcodeTypes: BarcodeType[] = [
    // 2D Barcodes
    { id: "qrcode", name: "QR Code", description: "Quick Response Code", category: "2d" },
    { id: "datamatrix", name: "Data Matrix", description: "2D matrix barcode", category: "2d" },
    { id: "pdf417", name: "PDF417", description: "Stacked linear barcode", category: "2d" },
    { id: "azteccode", name: "Aztec Code", description: "2D matrix barcode", category: "2d" },
    { id: "maxicode", name: "MaxiCode", description: "2D barcode for UPS", category: "2d" },
    // 1D Barcodes
    { id: "code128", name: "Code 128", description: "High-density barcode", category: "1d" },
    { id: "code39", name: "Code 39", description: "Alphanumeric barcode", category: "1d" },
    { id: "ean13", name: "EAN-13", description: "European Article Number", category: "1d" },
    { id: "ean8", name: "EAN-8", description: "Shortened EAN", category: "1d" },
    { id: "upca", name: "UPC-A", description: "Universal Product Code", category: "1d" },
    { id: "upce", name: "UPC-E", description: "Compressed UPC", category: "1d" },
    { id: "itf14", name: "ITF-14", description: "Interleaved 2 of 5", category: "1d" },
    { id: "code93", name: "Code 93", description: "Higher density Code 39", category: "1d" },
    { id: "codabar", name: "Codabar", description: "Numeric barcode", category: "1d" },
    { id: "pharmacode", name: "Pharmacode", description: "Pharmaceutical barcode", category: "1d" },
    { id: "msi", name: "MSI", description: "Modified Plessey", category: "1d" },
    { id: "plessey", name: "Plessey", description: "UK retail barcode", category: "1d" },
    { id: "telepen", name: "Telepen", description: "UK libraries", category: "1d" },
    { id: "rationalizedCodabar", name: "Rationalized Codabar", description: "Codabar variant", category: "1d" },
    { id: "interleaved2of5", name: "Interleaved 2 of 5", description: "Numeric pairs", category: "1d" },
  ];

  // State
  let activeTab = $state<TabType>("barcode");
  let selectedType = $state("qrcode");
  let inputText = $state("Hello World");
  let outputFormat = $state<OutputFormat>("svg");
  let foregroundColor = $state("#000000");
  let backgroundColor = $state("#ffffff");
  let transparentBackground = $state(false);
  let includeText = $state(true);
  let frameStyle = $state<FrameStyle>("none");
  let scale = $state(3);
  let errorCorrectionLevel = $state("M");

  // WiFi QR states
  let wifiSsid = $state("");
  let wifiPassword = $state("");
  let wifiEncryption = $state<WifiEncryption>("WPA");
  let wifiHidden = $state(false);

  // QR Reader states
  let readerMode = $state<ReaderMode>("file");
  let readerResult = $state("");
  let readerError = $state("");
  let readerImagePreview = $state<string | null>(null);
  let readerSupported = $state(true);
  let readerCopied = $state(false);
  let cameraStream: MediaStream | null = null;
  let cameraVideoElement = $state<HTMLVideoElement | null>(null);
  let cameraActive = $state(false);
  let scanInterval: number | null = null;

  // Screen capture states
  let screenStream: MediaStream | null = null;
  let screenVideoElement = $state<HTMLVideoElement | null>(null);
  let screenActive = $state(false);
  
  // Screen region selection states
  let screenRegionEnabled = $state(false);
  let screenRegion = $state<{ x: number; y: number; width: number; height: number } | null>(null);
  let screenRegionSelecting = $state(false);
  let screenRegionStart = $state<{ x: number; y: number } | null>(null);
  let screenCanvasElement = $state<HTMLCanvasElement | null>(null);

  // File Transfer (sender) states
  let fileTransferFile = $state<File | null>(null);
  let fileTransferState = $state<FileTransferState>("idle");
  let fileTransferFps = $state(12);
  let fileTransferBlockSize = $state(512);
  let fileTransferEc = $state<ErrorCorrectionLevel>("L");
  let fileTransferDisplaySize = $state(400);
  let fileTransferDragOver = $state(false);
  let fileTransferPreparing = $state(false);
  let fileTransferCanvas = $state<HTMLCanvasElement | null>(null);
  let fileTransferStats = $state<SenderStats>({ framesEmitted: 0, bytesPerSecond: 0, passSeconds: 0 });
  /** Reactive snapshot of the sender; the sender itself is deliberately not $state. */
  let fileTransferInfo = $state<{
    blockCount: number;
    blockSize: number;
    payloadLength: number;
    rawLength: number;
    gzip: boolean;
    qrVersion: number;
    qrModules: number;
  } | null>(null);

  let transferSender: TransferSender | null = null;
  let matrixPainter: MatrixPainter | null = null;
  let transferRaf: number | null = null;
  let transferTimer: number | null = null;
  let transferLastFrameAt = 0;
  let transferLastRafAt = 0;
  let transferLastStatsAt = 0;

  // File Receive states
  const fileReceiver = new TransferReceiver();
  let fileReceiveProgress = $state<ReceiverProgress | null>(null);
  let fileReceiveResult = $state<{ name: string; size: number; verified: boolean } | null>(null);
  let fileReceiveBytes: Uint8Array | null = null;
  let fileReceiveComplete = $state(false);
  let fileReceiveError = $state("");
  let scanBackend = $state<string | null>(null);

  // Legacy (sequential JSON) receive state, kept for backwards compatibility.
  // The Map itself is not reactive (Svelte 5 does not proxy Map); `legacyCount`
  // is the reactive projection the template renders from.
  let legacyChunks = new Map<number, string>();
  let legacyCount = $state(0);
  let legacyMetadata = $state<{ name: string; total: number; hash?: string } | null>(null);

  let scanner: QrScanner | null = null;
  let scannerIsQrOnly = false;
  let scanBusy = false;
  let scanFrameHandle: number | null = null;
  let scanFrameTarget: VideoFrameCallbackHost | null = null;

  // Output states
  let outputCanvas: HTMLCanvasElement;
  let outputSvg = $state("");
  let outputAscii = $state("");
  let error = $state("");
  let copied = $state(false);
  let downloaded = $state(false);

  const frameConfigs: Record<FrameStyle, { padding: number; borderWidth: number; borderRadius: number }> = {
    none: { padding: 0, borderWidth: 0, borderRadius: 0 },
    simple: { padding: 16, borderWidth: 2, borderRadius: 0 },
    rounded: { padding: 16, borderWidth: 2, borderRadius: 12 },
    bold: { padding: 20, borderWidth: 6, borderRadius: 0 },
    double: { padding: 20, borderWidth: 4, borderRadius: 0 },
  };

  const getWifiString = (): string => {
    const escape = (str: string) => str.replace(/([\\;,:"])/g, "\\$1");
    const encType = wifiEncryption === "nopass" ? "nopass" : wifiEncryption;
    const password = wifiEncryption === "nopass" ? "" : escape(wifiPassword);
    const hidden = wifiHidden ? "H:true;" : "";
    return `WIFI:T:${encType};S:${escape(wifiSsid)};P:${password};${hidden};`;
  };

  const getCurrentText = (): string => {
    if (activeTab === "wifi") {
      return getWifiString();
    }
    return inputText;
  };

  const generateBarcode = async () => {
    error = "";

    const text = getCurrentText();
    if (!text.trim()) {
      error = "Please enter text or data to encode";
      outputSvg = "";
      outputAscii = "";
      return;
    }

    try {
      const barcodeType = barcodeTypes.find((t) => t.id === selectedType);
      const is2D = barcodeType?.category === "2d";

      // Build options
      const options: Record<string, unknown> = {
        bcid: selectedType,
        text: text,
        scale: scale,
        includetext: includeText && !is2D,
        textxalign: "center",
        barcolor: foregroundColor.replace("#", ""),
      };

      // Only set background color if not transparent
      if (!transparentBackground) {
        options.backgroundcolor = backgroundColor.replace("#", "");
      }

      // Add error correction for QR codes
      if (selectedType === "qrcode") {
        options.eclevel = errorCorrectionLevel;
      }

      if (outputFormat === "svg") {
        // Generate SVG
        outputAscii = "";
        let svg = bwipjs.toSVG(options as unknown as Parameters<typeof bwipjs.toSVG>[0]);
        
        // Ensure SVG has width and height attributes for proper display
        const parser = new DOMParser();
        const doc = parser.parseFromString(svg, "image/svg+xml");
        const svgElement = doc.querySelector("svg");
        
        if (svgElement) {
          // Get dimensions from viewBox if width/height not set
          if (!svgElement.getAttribute("width") || !svgElement.getAttribute("height")) {
            const viewBox = svgElement.getAttribute("viewBox");
            if (viewBox) {
              const parts = viewBox.split(/[\s,]+/);
              if (parts.length === 4) {
                svgElement.setAttribute("width", parts[2]);
                svgElement.setAttribute("height", parts[3]);
              }
            }
          }
          svg = new XMLSerializer().serializeToString(doc);
        }
        
        outputSvg = svg;
        applyFrameToSvg();
      } else if (outputFormat === "ascii") {
        // For ASCII, we need to generate a canvas first then convert
        outputSvg = "";
        await generateAscii(options);
      } else {
        // Generate PNG to canvas
        outputSvg = "";
        outputAscii = "";
        if (outputCanvas) {
          await bwipjs.toCanvas(outputCanvas, options as unknown as Parameters<typeof bwipjs.toCanvas>[1]);
          applyFrameToCanvas();
        }
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to generate barcode";
    }
  };

  const generateAscii = async (options: Record<string, unknown>) => {
    // Create a temporary canvas for ASCII conversion
    const tempCanvas = document.createElement("canvas");
    await bwipjs.toCanvas(tempCanvas, {
      ...options,
      scale: 1, // Use scale 1 for ASCII
    } as Parameters<typeof bwipjs.toCanvas>[1]);

    const ctx = tempCanvas.getContext("2d");
    if (!ctx) {
      error = "Failed to get canvas context";
      return;
    }

    const imageData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const { data, width, height } = imageData;

    // Block characters for different fill levels (from empty to full)
    // Using Unicode block elements for better visual representation
    const blocks = [
      " ",  // Empty
      "\u2591", // Light shade
      "\u2592", // Medium shade
      "\u2593", // Dark shade
      "\u2588", // Full block
    ];

    let ascii = "";

    // Process 2 rows at a time for better aspect ratio with block characters
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x++) {
        // Sample the pixel (or average of 2 vertical pixels if available)
        const idx1 = (y * width + x) * 4;
        const idx2 = y + 1 < height ? ((y + 1) * width + x) * 4 : idx1;

        const r = (data[idx1] + data[idx2]) / 2;
        const g = (data[idx1 + 1] + data[idx2 + 1]) / 2;
        const b = (data[idx1 + 2] + data[idx2 + 2]) / 2;

        const brightness = (r + g + b) / 3;
        // Invert: dark pixels = full blocks, light pixels = empty
        const blockIndex = Math.floor(((255 - brightness) / 255) * (blocks.length - 1));
        ascii += blocks[blockIndex];
      }
      ascii += "\n";
    }

    outputAscii = ascii;
  };

  const applyFrameToSvg = () => {
    if (frameStyle === "none" || !outputSvg) return;

    const config = frameConfigs[frameStyle];
    const parser = new DOMParser();
    const doc = parser.parseFromString(outputSvg, "image/svg+xml");
    const svgElement = doc.querySelector("svg");

    if (!svgElement) return;

    // Get dimensions from width/height attributes or viewBox
    let originalWidth = parseFloat(svgElement.getAttribute("width") || "0");
    let originalHeight = parseFloat(svgElement.getAttribute("height") || "0");

    // If no width/height, try to get from viewBox
    if (!originalWidth || !originalHeight) {
      const viewBox = svgElement.getAttribute("viewBox");
      if (viewBox) {
        const parts = viewBox.split(/[\s,]+/);
        if (parts.length === 4) {
          originalWidth = parseFloat(parts[2]) || 100;
          originalHeight = parseFloat(parts[3]) || 100;
        }
      }
    }

    // Fallback defaults
    if (!originalWidth) originalWidth = 100;
    if (!originalHeight) originalHeight = 100;

    const newWidth = originalWidth + config.padding * 2;
    const newHeight = originalHeight + config.padding * 2;

    // Create frame rect
    const frameRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    frameRect.setAttribute("x", "0");
    frameRect.setAttribute("y", "0");
    frameRect.setAttribute("width", newWidth.toString());
    frameRect.setAttribute("height", newHeight.toString());
    frameRect.setAttribute("fill", transparentBackground ? "none" : backgroundColor);
    frameRect.setAttribute("stroke", foregroundColor);
    frameRect.setAttribute("stroke-width", config.borderWidth.toString());
    if (config.borderRadius > 0) {
      frameRect.setAttribute("rx", config.borderRadius.toString());
      frameRect.setAttribute("ry", config.borderRadius.toString());
    }

    // Wrap original content in a group with transform
    const content = svgElement.innerHTML;
    svgElement.innerHTML = "";
    svgElement.appendChild(frameRect);

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("transform", `translate(${config.padding}, ${config.padding})`);
    g.innerHTML = content;
    svgElement.appendChild(g);

    svgElement.setAttribute("width", newWidth.toString());
    svgElement.setAttribute("height", newHeight.toString());
    svgElement.setAttribute("viewBox", `0 0 ${newWidth} ${newHeight}`);

    outputSvg = new XMLSerializer().serializeToString(doc);
  };

  const applyFrameToCanvas = async () => {
    if (!outputCanvas) return;

    const ctx = outputCanvas.getContext("2d");
    if (!ctx) return;

    const config = frameConfigs[frameStyle];
    const originalWidth = outputCanvas.width;
    const originalHeight = outputCanvas.height;

    if (frameStyle !== "none") {
      // Get the current barcode image
      const imageData = ctx.getImageData(0, 0, originalWidth, originalHeight);

      // Resize canvas for frame
      const newWidth = originalWidth + config.padding * 2;
      const newHeight = originalHeight + config.padding * 2;
      outputCanvas.width = newWidth;
      outputCanvas.height = newHeight;

      // Draw background (only if not transparent)
      if (!transparentBackground) {
        ctx.fillStyle = backgroundColor;
        if (config.borderRadius > 0) {
          roundRect(ctx, 0, 0, newWidth, newHeight, config.borderRadius);
          ctx.fill();
        } else {
          ctx.fillRect(0, 0, newWidth, newHeight);
        }
      }

      // Draw border
      if (config.borderWidth > 0) {
        ctx.strokeStyle = foregroundColor;
        ctx.lineWidth = config.borderWidth;

        if (frameStyle === "double") {
          // Draw double border
          const offset = config.borderWidth + 2;
          ctx.strokeRect(offset / 2, offset / 2, newWidth - offset, newHeight - offset);
          ctx.strokeRect(offset * 2, offset * 2, newWidth - offset * 4, newHeight - offset * 4);
        } else if (config.borderRadius > 0) {
          roundRect(ctx, config.borderWidth / 2, config.borderWidth / 2, newWidth - config.borderWidth, newHeight - config.borderWidth, config.borderRadius);
          ctx.stroke();
        } else {
          ctx.strokeRect(config.borderWidth / 2, config.borderWidth / 2, newWidth - config.borderWidth, newHeight - config.borderWidth);
        }
      }

      // Draw barcode
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = originalWidth;
      tempCanvas.height = originalHeight;
      const tempCtx = tempCanvas.getContext("2d");
      if (tempCtx) {
        tempCtx.putImageData(imageData, 0, 0);
        ctx.drawImage(tempCanvas, config.padding, config.padding);
      }
    }
  };

  const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) => {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  };

  const handleCopy = async () => {
    try {
      if (outputFormat === "svg") {
        await navigator.clipboard.writeText(outputSvg);
      } else if (outputFormat === "ascii") {
        await navigator.clipboard.writeText(outputAscii);
      } else {
        const blob = await new Promise<Blob>((resolve) => {
          outputCanvas.toBlob((b) => resolve(b!), "image/png");
        });
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
      }
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      error = "Failed to copy to clipboard";
    }
  };

  const handleDownload = () => {
    try {
      let dataUrl: string;
      let filename: string;
      const baseName = activeTab === "wifi" ? "wifi-qr" : "barcode";

      if (outputFormat === "svg") {
        const blob = new Blob([outputSvg], { type: "image/svg+xml" });
        dataUrl = URL.createObjectURL(blob);
        filename = `${baseName}.svg`;
      } else if (outputFormat === "ascii") {
        const blob = new Blob([outputAscii], { type: "text/plain" });
        dataUrl = URL.createObjectURL(blob);
        filename = `${baseName}.txt`;
      } else {
        dataUrl = outputCanvas.toDataURL("image/png");
        filename = `${baseName}.png`;
      }

      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = filename;
      link.click();

      if (outputFormat === "svg" || outputFormat === "ascii") {
        URL.revokeObjectURL(dataUrl);
      }

      downloaded = true;
      setTimeout(() => (downloaded = false), 2000);
    } catch {
      error = "Failed to download";
    }
  };

  const handleClear = () => {
    inputText = "";
    wifiSsid = "";
    wifiPassword = "";
    outputSvg = "";
    outputAscii = "";
    error = "";
    if (outputCanvas) {
      const ctx = outputCanvas.getContext("2d");
      ctx?.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
    }
  };

  // QR Reader functions
  /**
   * One scanner instance for the whole component. The previous code built a
   * `BarcodeDetector` and a fresh `<canvas>` on every frame, which dominated
   * the per-frame cost during continuous scanning.
   */
  const getScanner = (): QrScanner => {
    // Receiving a file transfer only ever sees QR codes, and restricting the
    // format list keeps the native detector from also hunting for the twelve
    // 1D symbologies on every frame.
    const qrOnly = readerMode === "receive";
    if (scanner && scannerIsQrOnly !== qrOnly) {
      scanner.dispose();
      scanner = null;
    }
    if (!scanner) {
      scanner = new QrScanner({ qrOnly, tryHarder: false });
      scannerIsQrOnly = qrOnly;
    }
    return scanner;
  };

  /** Still images get the slow, thorough settings; there is no frame budget. */
  const detectInImage = async (image: HTMLImageElement): Promise<string | null> => {
    const still = new QrScanner({ qrOnly: false, tryHarder: true, maxDimension: 4096 });
    try {
      return await still.scan(image);
    } finally {
      still.dispose();
    }
  };

  const handleFileUpload = async (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    readerError = "";
    readerResult = "";

    // Create preview
    const reader = new FileReader();
    reader.onload = async (e) => {
      readerImagePreview = e.target?.result as string;
      
      // Create image for detection
      const img = new Image();
      img.onload = async () => {
        const result = await detectInImage(img);
        if (result) {
          handleScannedResult(result);
        } else if (!readerError) {
          readerError = "No barcode or QR code found in the image.";
        }
      };
      img.onerror = () => {
        readerError = "Failed to load image.";
      };
      img.src = readerImagePreview;
    };
    reader.readAsDataURL(file);
  };

  const startCamera = async () => {
    readerError = "";
    readerResult = "";

    // Check for secure context
    if (!window.isSecureContext && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
      readerError = "Camera access requires HTTPS.";
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      readerError = "Camera API is not available in your browser.";
      return;
    }

    try {
      // Resolution is the single biggest factor in how dense a QR the camera
      // can resolve; the browser default is often 640x480, which caps the
      // usable symbol version and therefore the bytes per frame.
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
      });
      await requestContinuousFocus(cameraStream);
      cameraActive = true;

      // Wait for video element to be available
      await new Promise<void>((resolve) => {
        const checkVideo = () => {
          if (cameraVideoElement) {
            resolve();
          } else {
            requestAnimationFrame(checkVideo);
          }
        };
        checkVideo();
      });

      if (cameraVideoElement && cameraStream) {
        cameraVideoElement.srcObject = cameraStream;
        await cameraVideoElement.play();
        startScanning();
      }
    } catch (e) {
      cameraActive = false;
      if (e instanceof Error) {
        if (e.name === "NotAllowedError") {
          readerError = "Camera access denied. Please allow camera access.";
        } else if (e.name === "NotFoundError") {
          readerError = "No camera found.";
        } else {
          readerError = `Camera error: ${e.message}`;
        }
      } else {
        readerError = "Failed to access camera.";
      }
    }
  };

  /**
   * Continuous autofocus is a non-standard constraint that only some mobile
   * browsers expose. Without it the camera tends to lock focus on the first
   * frame and never re-focus on the QR, so it is worth asking for.
   */
  const requestContinuousFocus = async (stream: MediaStream): Promise<void> => {
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    try {
      const capabilities = track.getCapabilities?.() as { focusMode?: string[] } | undefined;
      if (capabilities?.focusMode?.includes("continuous")) {
        await track.applyConstraints({
          advanced: [{ focusMode: "continuous" }],
        } as MediaTrackConstraints);
      }
    } catch {
      // Optional optimisation; ignore when unsupported.
    }
  };

  const stopCamera = () => {
    stopScanLoop();
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => { track.stop(); });
      cameraStream = null;
    }
    if (cameraVideoElement) {
      cameraVideoElement.srcObject = null;
    }
    cameraActive = false;
  };

  // Screen capture functions
  const startScreenCapture = async () => {
    readerError = "";
    readerResult = "";

    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      readerError = "Screen capture is not supported in your browser.";
      return;
    }

    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30 } },
        audio: false,
      } as DisplayMediaStreamOptions);

      screenActive = true;

      // Wait for video element to be available
      await new Promise<void>((resolve) => {
        const checkVideo = () => {
          if (screenVideoElement) {
            resolve();
          } else {
            requestAnimationFrame(checkVideo);
          }
        };
        checkVideo();
      });

      if (screenVideoElement && screenStream) {
        screenVideoElement.srcObject = screenStream;
        await screenVideoElement.play();
        startScreenScanning();
        
        // Handle when user stops sharing via browser UI
        screenStream.getVideoTracks()[0].onended = () => {
          stopScreenCapture();
        };
      }
    } catch (e) {
      screenActive = false;
      if (e instanceof Error) {
        if (e.name === "NotAllowedError") {
          readerError = "Screen capture cancelled or denied.";
        } else {
          readerError = `Screen capture error: ${e.message}`;
        }
      } else {
        readerError = "Failed to capture screen.";
      }
    }
  };

  const stopScreenCapture = () => {
    stopScanLoop();
    if (screenStream) {
      screenStream.getTracks().forEach((track) => { track.stop(); });
      screenStream = null;
    }
    if (screenVideoElement) {
      screenVideoElement.srcObject = null;
    }
    screenActive = false;
    screenRegion = null;
    screenRegionSelecting = false;
  };
  
  // Calculate the actual rendered video dimensions and offset (accounting for object-contain letterboxing)
  const getVideoRenderInfo = () => {
    if (!screenVideoElement || !screenRegionContainer) return null;
    
    const videoWidth = screenVideoElement.videoWidth;
    const videoHeight = screenVideoElement.videoHeight;
    const containerWidth = screenRegionContainer.clientWidth;
    const containerHeight = screenRegionContainer.clientHeight;
    
    if (videoWidth === 0 || videoHeight === 0 || containerWidth === 0 || containerHeight === 0) return null;
    
    const videoAspect = videoWidth / videoHeight;
    const containerAspect = containerWidth / containerHeight;
    
    let renderedWidth: number;
    let renderedHeight: number;
    let offsetX: number;
    let offsetY: number;
    
    if (videoAspect > containerAspect) {
      // Video is wider - letterbox top/bottom
      renderedWidth = containerWidth;
      renderedHeight = containerWidth / videoAspect;
      offsetX = 0;
      offsetY = (containerHeight - renderedHeight) / 2;
    } else {
      // Video is taller - letterbox left/right
      renderedHeight = containerHeight;
      renderedWidth = containerHeight * videoAspect;
      offsetX = (containerWidth - renderedWidth) / 2;
      offsetY = 0;
    }
    
    return {
      videoWidth,
      videoHeight,
      containerWidth,
      containerHeight,
      renderedWidth,
      renderedHeight,
      offsetX,
      offsetY,
      scaleX: videoWidth / renderedWidth,
      scaleY: videoHeight / renderedHeight,
    };
  };

  // Region selection handlers - coordinates relative to the container div
  let screenRegionContainer = $state<HTMLDivElement | null>(null);
  
  const handleRegionMouseDown = (e: MouseEvent) => {
    if (!screenRegionEnabled || !screenRegionContainer) return;
    
    const rect = screenRegionContainer.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    screenRegionSelecting = true;
    screenRegionStart = { x, y };
    screenRegion = { x, y, width: 0, height: 0 };
  };
  
  const handleRegionMouseMove = (e: MouseEvent) => {
    if (!screenRegionSelecting || !screenRegionStart || !screenRegionContainer) return;
    
    const rect = screenRegionContainer.getBoundingClientRect();
    const currentX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const currentY = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
    
    const x = Math.min(screenRegionStart.x, currentX);
    const y = Math.min(screenRegionStart.y, currentY);
    const width = Math.abs(currentX - screenRegionStart.x);
    const height = Math.abs(currentY - screenRegionStart.y);
    
    screenRegion = { x, y, width, height };
  };
  
  const handleRegionMouseUp = () => {
    screenRegionSelecting = false;
    screenRegionStart = null;
    
    // Clear region if too small
    if (screenRegion && (screenRegion.width < 20 || screenRegion.height < 20)) {
      screenRegion = null;
    }
  };
  
  const clearScreenRegion = () => {
    screenRegion = null;
    screenRegionSelecting = false;
    screenRegionStart = null;
  };

  /** Maps the on-screen selection rectangle into source video coordinates. */
  const getScreenRegionInSource = (): Region | null => {
    if (!screenRegionEnabled || !screenRegion) return null;

    const renderInfo = getVideoRenderInfo();
    if (!renderInfo) return null;

    // Undo the object-contain letterboxing before scaling to video pixels.
    const clampedX = Math.max(0, screenRegion.x - renderInfo.offsetX);
    const clampedY = Math.max(0, screenRegion.y - renderInfo.offsetY);
    const clampedWidth = Math.min(screenRegion.width, renderInfo.renderedWidth - clampedX);
    const clampedHeight = Math.min(screenRegion.height, renderInfo.renderedHeight - clampedY);
    if (clampedWidth <= 0 || clampedHeight <= 0) return null;

    return {
      x: Math.floor(clampedX * renderInfo.scaleX),
      y: Math.floor(clampedY * renderInfo.scaleY),
      width: Math.floor(clampedWidth * renderInfo.scaleX),
      height: Math.floor(clampedHeight * renderInfo.scaleY),
    };
  };

  /**
   * Scans one frame. Guarded against re-entry because a decode can outlast the
   * frame interval; the old `setInterval(async ...)` had no such guard, so slow
   * decodes queued up and the scanner fell further and further behind.
   */
  const scanTick = async (video: HTMLVideoElement, region: Region | null) => {
    if (scanBusy || video.readyState < 2) return;
    scanBusy = true;
    try {
      const result = await getScanner().scan(video, region ?? undefined);
      if (result) {
        scanBackend = getScanner().lastBackend;
        handleScannedResult(result);
      }
    } catch {
      // Ignore transient decode failures during continuous scanning.
    } finally {
      scanBusy = false;
    }
  };

  /**
   * Drives scanning from the video's own frame clock rather than a fixed timer.
   * That way the scanner runs exactly once per delivered frame - never wasting
   * work on a frame it has already seen, and never sitting idle while a new one
   * is available. Browsers without `requestVideoFrameCallback` (Firefox) fall
   * back to a short interval.
   */
  const startScanLoop = (getVideo: () => HTMLVideoElement | null, getRegion: () => Region | null) => {
    stopScanLoop();
    void getScanner().init();

    const video = getVideo() as VideoFrameCallbackHost | null;
    if (!video) return;

    if (typeof video.requestVideoFrameCallback === "function") {
      scanFrameTarget = video;
      const onFrame = () => {
        const current = getVideo() as VideoFrameCallbackHost | null;
        if (!current || scanFrameHandle === null) return;
        scanFrameHandle = current.requestVideoFrameCallback!(onFrame);
        void scanTick(current, getRegion());
      };
      scanFrameHandle = video.requestVideoFrameCallback(onFrame);
      return;
    }

    scanInterval = window.setInterval(() => {
      const current = getVideo();
      if (current) void scanTick(current, getRegion());
    }, 33);
  };

  const stopScanLoop = () => {
    if (scanInterval !== null) {
      clearInterval(scanInterval);
      scanInterval = null;
    }
    if (scanFrameHandle !== null) {
      // Cancel on the exact element the callback was registered against; the
      // camera and screen elements can be torn down independently.
      scanFrameTarget?.cancelVideoFrameCallback?.(scanFrameHandle);
      scanFrameHandle = null;
    }
    scanFrameTarget = null;
    scanBusy = false;
  };

  const startScreenScanning = () => {
    startScanLoop(() => screenVideoElement, getScreenRegionInSource);
  };

  const startScanning = () => {
    startScanLoop(() => cameraVideoElement, () => null);
  };

  const copyReaderResult = async () => {
    if (!readerResult) return;
    try {
      await navigator.clipboard.writeText(readerResult);
      readerCopied = true;
      setTimeout(() => { readerCopied = false; }, 2000);
    } catch {
      readerError = "Failed to copy to clipboard.";
    }
  };

  const clearReader = () => {
    readerResult = "";
    readerError = "";
    readerImagePreview = null;
    stopCamera();
    stopScreenCapture();
    clearFileReceive();
    scanBackend = null;
  };

  // ---------------------------------------------------------------- Sender

  const processFileForTransfer = async (file: File) => {
    stopFileTransferPlayback();
    fileTransferFile = file;
    fileTransferState = "idle";
    fileTransferInfo = null;
    fileTransferPreparing = true;
    transferSender = null;
    error = "";

    try {
      const sender = await TransferSender.create(file, {
        blockSize: fileTransferBlockSize,
        errorCorrection: fileTransferEc,
      });
      transferSender = sender;
      fileTransferInfo = {
        blockCount: sender.blockCount,
        blockSize: sender.blockSize,
        payloadLength: sender.payloadLength,
        rawLength: sender.rawLength,
        gzip: sender.gzip,
        qrVersion: sender.qrVersion,
        qrModules: sender.qrVersion * 4 + 17,
      };
      fileTransferStats = { framesEmitted: 0, bytesPerSecond: 0, passSeconds: 0 };
      fileTransferState = "ready";
      paintTransferFrame();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to prepare file";
      error = `Could not prepare transfer: ${message}. Try a smaller block size or a lower error correction level.`;
      transferSender = null;
      fileTransferFile = null;
    } finally {
      fileTransferPreparing = false;
    }
  };

  const paintTransferFrame = () => {
    if (!transferSender || !fileTransferCanvas) return;
    matrixPainter ??= new MatrixPainter();

    matrixPainter.paint(fileTransferCanvas, transferSender.next(), {
      quietZone: 3,
      targetSize: fileTransferDisplaySize,
    });

    // Refill the look-ahead queue immediately after painting, so the encode for
    // the next frame happens in the idle gap rather than delaying that frame.
    transferSender.prefetch();
  };

  /** Paints the next frame if one is due. Safe to call from either pump. */
  const pumpTransferFrame = (now: number) => {
    const period = 1000 / fileTransferFps;
    // Half a millisecond of slack so a frame due exactly on a refresh boundary
    // is not pushed to the following refresh by rounding.
    if (now - transferLastFrameAt < period - 0.5) return;
    transferLastFrameAt = now;

    paintTransferFrame();

    // Stats drive DOM updates, so refresh them well below the frame rate.
    if (now - transferLastStatsAt > 250) {
      transferLastStatsAt = now;
      fileTransferStats = transferSender!.stats();
    }
  };

  /**
   * Frame pump driven by requestAnimationFrame instead of setInterval.
   * setInterval cannot align to the display refresh, so frames were being shown
   * for an inconsistent number of refreshes and a camera sampling at a similar
   * rate would systematically miss some of them.
   */
  const transferLoop = (now: number) => {
    if (fileTransferState !== "playing") return;
    transferRaf = requestAnimationFrame(transferLoop);
    transferLastRafAt = now;
    pumpTransferFrame(now);
  };

  /**
   * Watchdog for the rAF pump. Browsers throttle requestAnimationFrame to about
   * one call per second - and stop it entirely for hidden documents - as soon as
   * the sending tab is no longer the frontmost one, which silently drops a
   * broadcast to ~1 fps the moment the user switches to the receiving tab.
   * Timers are throttled far less aggressively, so this takes over the pump
   * whenever rAF has stopped delivering, and stays out of the way otherwise so
   * the normal case keeps its refresh alignment.
   */
  const transferWatchdog = () => {
    if (fileTransferState !== "playing") return;
    const period = 1000 / fileTransferFps;
    transferTimer = window.setTimeout(transferWatchdog, Math.max(8, period / 2));

    const now = performance.now();
    // 200 ms is far longer than any real refresh interval, so a healthy rAF
    // never trips this and the two pumps never fight over the same frame.
    if (now - transferLastRafAt > 200) pumpTransferFrame(now);
  };

  const startFileTransferPlayback = () => {
    if (fileTransferState === "playing" || !transferSender) return;
    fileTransferState = "playing";
    transferLastFrameAt = 0;
    transferLastStatsAt = 0;
    // Assume rAF is healthy until proven otherwise, so the watchdog does not
    // fire a duplicate frame before the first animation callback arrives.
    transferLastRafAt = performance.now();
    transferRaf = requestAnimationFrame(transferLoop);
    transferWatchdog();
  };

  const stopFileTransferPlayback = () => {
    if (transferRaf !== null) {
      cancelAnimationFrame(transferRaf);
      transferRaf = null;
    }
    if (transferTimer !== null) {
      clearTimeout(transferTimer);
      transferTimer = null;
    }
    if (fileTransferState === "playing") fileTransferState = "ready";
  };

  const toggleFileTransferPlayback = () => {
    if (fileTransferState === "playing") stopFileTransferPlayback();
    else startFileTransferPlayback();
  };

  const clearFileTransfer = () => {
    stopFileTransferPlayback();
    transferSender = null;
    fileTransferFile = null;
    fileTransferInfo = null;
    fileTransferState = "idle";
    fileTransferStats = { framesEmitted: 0, bytesPerSecond: 0, passSeconds: 0 };
  };

  /** Re-prepares the current file when an encoding parameter changes. */
  const reprocessTransfer = () => {
    if (fileTransferFile) void processFileForTransfer(fileTransferFile);
  };

  const handleFileTransferDrop = async (event: DragEvent) => {
    event.preventDefault();
    fileTransferDragOver = false;
    const file = event.dataTransfer?.files?.[0];
    if (file) await processFileForTransfer(file);
  };

  const handleFileTransferSelect = async (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) await processFileForTransfer(file);
  };

  // ---------------------------------------------------------------- Receiver

  const refreshReceiveProgress = () => {
    fileReceiveProgress = fileReceiver.progress();
  };

  const completeReceive = async () => {
    try {
      const parsed = await fileReceiver.finish();
      fileReceiveBytes = parsed.bytes;
      fileReceiveResult = {
        name: parsed.meta.n || "received_file",
        size: parsed.bytes.length,
        verified: parsed.verified,
      };
      fileReceiveComplete = true;
      fileReceiveError = parsed.verified ? "" : "Checksum mismatch - the received file is corrupt.";
    } catch (e) {
      fileReceiveError = e instanceof Error ? e.message : "Failed to reassemble the file";
    }
  };

  /**
   * Legacy sequential-chunk receiver, retained so QR codes generated by the
   * previous version of this tool can still be read.
   */
  const processLegacyChunk = (data: string): boolean => {
    let chunk: LegacyChunk;
    try {
      chunk = JSON.parse(data) as LegacyChunk;
    } catch {
      return false;
    }
    if (chunk.t !== "file" || typeof chunk.i !== "number" || typeof chunk.c !== "number" || typeof chunk.d !== "string") {
      return false;
    }

    if (!legacyMetadata || legacyMetadata.total !== chunk.c) {
      legacyMetadata = { name: chunk.n || "received_file", total: chunk.c };
      legacyChunks = new Map();
      legacyCount = 0;
    } else if (chunk.n && legacyMetadata.name === "received_file") {
      legacyMetadata = { ...legacyMetadata, name: chunk.n };
    }
    if (chunk.h) legacyMetadata = { ...legacyMetadata, hash: chunk.h };

    if (!legacyChunks.has(chunk.i)) {
      // Mutate in place; the old code cloned the whole Map per chunk, which
      // made receiving a large file quadratic.
      legacyChunks.set(chunk.i, chunk.d);
      legacyCount = legacyChunks.size;
    }

    if (legacyChunks.size === chunk.c && !fileReceiveComplete) {
      void finishLegacyTransfer();
    }
    return true;
  };

  const finishLegacyTransfer = async () => {
    if (!legacyMetadata) return;
    let base64 = "";
    for (let i = 0; i < legacyMetadata.total; i++) {
      const part = legacyChunks.get(i);
      if (part === undefined) return;
      base64 += part;
    }

    try {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      let verified = true;
      if (legacyMetadata.hash) {
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        const hex = Array.from(new Uint8Array(digest))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")
          .substring(0, 16);
        verified = hex === legacyMetadata.hash;
      }

      fileReceiveBytes = bytes;
      fileReceiveResult = { name: legacyMetadata.name, size: bytes.length, verified };
      fileReceiveComplete = true;
      fileReceiveError = verified ? "" : "Checksum mismatch - the received file is corrupt.";
    } catch (e) {
      fileReceiveError = e instanceof Error ? e.message : "Failed to reassemble the file";
    }
  };

  const downloadReceivedFile = () => {
    if (!fileReceiveBytes || !fileReceiveResult) return;
    const blob = new Blob([fileReceiveBytes as BlobPart]);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileReceiveResult.name;
    link.click();
    URL.revokeObjectURL(url);
  };

  const clearFileReceive = () => {
    fileReceiver.reset();
    fileReceiveProgress = null;
    fileReceiveResult = null;
    fileReceiveBytes = null;
    fileReceiveComplete = false;
    fileReceiveError = "";
    legacyChunks = new Map();
    legacyCount = 0;
    legacyMetadata = null;
  };

  /** Routes a decoded string to the transfer receiver or to the plain result box. */
  const handleScannedResult = (result: string) => {
    if (fileReceiveComplete) return;

    const outcome = fileReceiver.accept(result);
    if (outcome !== "ignored") {
      if (readerMode !== "receive") readerMode = "receive";
      refreshReceiveProgress();
      if (outcome === "complete") void completeReceive();
      return;
    }

    if (result.startsWith('{"t":"file"') && processLegacyChunk(result)) {
      if (readerMode !== "receive") readerMode = "receive";
      return;
    }

    readerResult = result;
  };

  // Auto-generate on mount and when relevant inputs change
  onMount(() => {
    generateBarcode();
    // jsQR works everywhere, so reader is always supported
    readerSupported = true;
    
    return () => {
      stopCamera();
      stopScreenCapture();
      stopFileTransferPlayback();
      scanner?.dispose();
      scanner = null;
    };
  });

  // Reactive generation
  $effect(() => {
    // Dependencies for barcode generation
    const _ = [
      inputText,
      selectedType,
      outputFormat,
      foregroundColor,
      backgroundColor,
      transparentBackground,
      includeText,
      frameStyle,
      scale,
      errorCorrectionLevel,
      wifiSsid,
      wifiPassword,
      wifiEncryption,
      wifiHidden,
      activeTab,
    ];
    // The reader and transfer tabs share the `error` slot with the generator,
    // so running the generator there would clobber their messages (and burn
    // bwip-js time for output nobody is looking at).
    if (activeTab === "reader" || activeTab === "transfer") return;
    generateBarcode();
  });

  // The transfer canvas is inside a tab block, so it unmounts when the user
  // navigates away. Repaint the current frame whenever it comes back.
  $effect(() => {
    if (fileTransferCanvas && transferSender && fileTransferState === "ready") {
      paintTransferFrame();
    }
  });

  // Disable transparent background when ASCII format is selected
  $effect(() => {
    if (outputFormat === "ascii") {
      transparentBackground = false;
    }
  });

  let selectedTypeInfo = $derived(barcodeTypes.find((t) => t.id === selectedType));
  let is2D = $derived(selectedTypeInfo?.category === "2d");
  let groupedTypes = $derived({
    "2d": barcodeTypes.filter((t) => t.category === "2d"),
    "1d": barcodeTypes.filter((t) => t.category === "1d"),
  });
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Generate and scan barcodes and QR codes in various formats.
    </p>
  </header>

  <!-- Tabs -->
  <div class="flex gap-0 mb-4 border-b border-(--color-border)">
    <button
      onclick={() => {
        activeTab = "barcode";
        stopFileTransferPlayback();
      }}
      class="px-4 py-2 text-sm font-medium transition-colors {activeTab === 'barcode'
        ? 'text-(--color-text) border-b-2 border-(--color-accent)'
        : 'text-(--color-text-muted) hover:text-(--color-text)'}"
    >
      Barcode / QR
    </button>
    <button
      onclick={() => {
        activeTab = "wifi";
        selectedType = "qrcode";
        stopFileTransferPlayback();
      }}
      class="px-4 py-2 text-sm font-medium transition-colors {activeTab === 'wifi'
        ? 'text-(--color-text) border-b-2 border-(--color-accent)'
        : 'text-(--color-text-muted) hover:text-(--color-text)'}"
    >
      WiFi QR
    </button>
    <button
      onclick={() => {
        if (activeTab !== "reader") {
          activeTab = "reader";
          stopFileTransferPlayback();
          clearReader();
        }
      }}
      class="px-4 py-2 text-sm font-medium transition-colors {activeTab === 'reader'
        ? 'text-(--color-text) border-b-2 border-(--color-accent)'
        : 'text-(--color-text-muted) hover:text-(--color-text)'}"
    >
      QR Reader
    </button>
    <button
      onclick={() => {
        // Guarded: clicking the tab you are already on must not tear down a
        // broadcast that is in progress.
        if (activeTab !== "transfer") {
          activeTab = "transfer";
          clearFileTransfer();
        }
      }}
      class="px-4 py-2 text-sm font-medium transition-colors {activeTab === 'transfer'
        ? 'text-(--color-text) border-b-2 border-(--color-accent)'
        : 'text-(--color-text-muted) hover:text-(--color-text)'}"
    >
      File Transfer
    </button>
  </div>

  <div class="flex-1 flex flex-col lg:flex-row gap-4">
    <!-- Left Panel: Controls -->
    <div class="lg:w-1/2 flex flex-col gap-4 overflow-y-auto">
      {#if activeTab === "barcode"}
        <!-- Barcode Type Selection -->
        <div class="flex flex-col gap-2">
          <label for="barcode-type" class="text-xs tracking-wider text-(--color-text-light) font-medium">
            Barcode Type
          </label>
          <select
            id="barcode-type"
            bind:value={selectedType}
            class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer"
          >
            <optgroup label="2D Barcodes">
              {#each groupedTypes["2d"] as type}
                <option value={type.id}>{type.name}</option>
              {/each}
            </optgroup>
            <optgroup label="1D Barcodes">
              {#each groupedTypes["1d"] as type}
                <option value={type.id}>{type.name}</option>
              {/each}
            </optgroup>
          </select>
          <p class="text-xs text-(--color-text-muted)">{selectedTypeInfo?.description}</p>
        </div>

        <!-- Input Text -->
        <div class="flex flex-col gap-2">
          <label for="input-text" class="text-xs tracking-wider text-(--color-text-light) font-medium">
            Content
          </label>
          <textarea
            id="input-text"
            bind:value={inputText}
            placeholder="Enter text or data to encode..."
            rows="3"
            class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) font-mono resize-y"
          ></textarea>
        </div>
      {:else if activeTab === "wifi"}
        <!-- WiFi QR Generator -->
        <div class="flex flex-col gap-4 p-4 border border-(--color-border) bg-(--color-bg-alt)">
          <div class="text-xs tracking-wider text-(--color-text-light) font-medium">WiFi Network Details</div>

          <div class="flex flex-col gap-2">
            <label for="wifi-ssid" class="text-xs text-(--color-text-light)">Network Name (SSID)</label>
            <input
              id="wifi-ssid"
              type="text"
              bind:value={wifiSsid}
              placeholder="My WiFi Network"
              class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)"
            />
          </div>

          <div class="flex flex-col gap-2">
            <label for="wifi-encryption" class="text-xs text-(--color-text-light)">Security</label>
            <select
              id="wifi-encryption"
              bind:value={wifiEncryption}
              class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer"
            >
              <option value="WPA">WPA/WPA2/WPA3</option>
              <option value="WEP">WEP</option>
              <option value="nopass">No Password</option>
            </select>
          </div>

          {#if wifiEncryption !== "nopass"}
            <div class="flex flex-col gap-2">
              <label for="wifi-password" class="text-xs text-(--color-text-light)">Password</label>
              <input
                id="wifi-password"
                type="password"
                bind:value={wifiPassword}
                placeholder="Enter password"
                class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) font-mono"
              />
            </div>
          {/if}

          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" bind:checked={wifiHidden} class="w-4 h-4 accent-(--color-accent)" />
            <span class="text-sm text-(--color-text)">Hidden Network</span>
          </label>
        </div>
      {:else if activeTab === "reader"}
        <!-- QR Reader -->
        <div class="flex flex-col gap-4">
          <!-- Reader Mode Selection -->
          <div class="flex flex-col gap-2">
            <label class="text-xs tracking-wider text-(--color-text-light) font-medium">Scan Method</label>
            <div class="flex gap-2 flex-wrap">
              <button
                onclick={() => { readerMode = "file"; stopCamera(); stopScreenCapture(); clearFileReceive(); }}
                class="flex-1 px-4 py-2 text-sm border transition-colors {readerMode === 'file'
                  ? 'border-(--color-accent) bg-(--color-accent) text-(--color-btn-text)'
                  : 'border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:border-(--color-accent)'}"
              >
                Upload
              </button>
              <button
                onclick={() => { readerMode = "camera"; stopScreenCapture(); readerImagePreview = null; clearFileReceive(); }}
                class="flex-1 px-4 py-2 text-sm border transition-colors {readerMode === 'camera'
                  ? 'border-(--color-accent) bg-(--color-accent) text-(--color-btn-text)'
                  : 'border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:border-(--color-accent)'}"
              >
                Camera
              </button>
              <button
                onclick={() => { readerMode = "screen"; stopCamera(); readerImagePreview = null; clearFileReceive(); }}
                class="flex-1 px-4 py-2 text-sm border transition-colors {readerMode === 'screen'
                  ? 'border-(--color-accent) bg-(--color-accent) text-(--color-btn-text)'
                  : 'border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:border-(--color-accent)'}"
              >
                Screen
              </button>
              <button
                onclick={() => { readerMode = "receive"; stopCamera(); stopScreenCapture(); readerImagePreview = null; readerResult = ""; }}
                class="flex-1 px-4 py-2 text-sm border transition-colors {readerMode === 'receive'
                  ? 'border-(--color-accent) bg-(--color-accent) text-(--color-btn-text)'
                  : 'border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:border-(--color-accent)'}"
              >
                Receive File
              </button>
            </div>
          </div>

          {#if readerMode === "file"}
            <!-- File Upload -->
            <div class="flex flex-col gap-2">
              <label class="text-xs tracking-wider text-(--color-text-light) font-medium">Upload Image</label>
              <input
                type="file"
                accept="image/*"
                onchange={handleFileUpload}
                class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) file:mr-4 file:py-1 file:px-3 file:border-0 file:text-sm file:bg-(--color-accent) file:text-(--color-btn-text) file:cursor-pointer"
              />
              <p class="text-xs text-(--color-text-muted)">Select an image containing a QR code</p>
            </div>
          {:else if readerMode === "camera"}
            <!-- Camera Controls -->
            <div class="flex flex-col gap-2">
              {#if !cameraActive}
                <button
                  onclick={startCamera}
                  class="w-full px-4 py-2 text-sm font-medium bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) transition-colors"
                >
                  Start Camera
                </button>
                <p class="text-xs text-(--color-text-muted)">Point your camera at a QR code</p>
              {:else}
                <button
                  onclick={stopCamera}
                  class="w-full px-4 py-2 text-sm font-medium border border-(--color-border) text-(--color-text) hover:bg-(--color-bg-alt) transition-colors"
                >
                  Stop Camera
                </button>
              {/if}
            </div>
          {:else if readerMode === "screen"}
            <!-- Screen Capture Controls -->
            <div class="flex flex-col gap-4">
              <div class="flex flex-col gap-2">
                {#if !screenActive}
                  <button
                    onclick={startScreenCapture}
                    class="w-full px-4 py-2 text-sm font-medium bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) transition-colors"
                  >
                    Select Screen/Window
                  </button>
                  <p class="text-xs text-(--color-text-muted)">Choose a screen or window containing QR codes to scan</p>
                {:else}
                  <button
                    onclick={stopScreenCapture}
                    class="w-full px-4 py-2 text-sm font-medium border border-(--color-border) text-(--color-text) hover:bg-(--color-bg-alt) transition-colors"
                  >
                    Stop Screen Capture
                  </button>
                {/if}
              </div>
              
              <!-- Region Selection Controls -->
              {#if screenActive}
                <div class="flex flex-col gap-2 p-3 border border-(--color-border) bg-(--color-bg-alt)">
                  <div class="flex items-center justify-between">
                    <label class="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        bind:checked={screenRegionEnabled} 
                        onchange={() => { if (!screenRegionEnabled) clearScreenRegion(); }}
                        class="w-4 h-4 accent-(--color-accent)" 
                      />
                      <span class="text-sm text-(--color-text)">Select scan region</span>
                    </label>
                    {#if screenRegion}
                      <button
                        onclick={clearScreenRegion}
                        class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
                      >
                        Clear
                      </button>
                    {/if}
                  </div>
                  {#if screenRegionEnabled}
                    <p class="text-xs text-(--color-text-muted)">
                      {#if screenRegion}
                        Region: {Math.round(screenRegion.width)}x{Math.round(screenRegion.height)}px - Only this area will be scanned
                      {:else}
                        Click and drag on the preview to select a region
                      {/if}
                    </p>
                  {/if}
                </div>
              {/if}
            </div>
          {:else if readerMode === "receive"}
            <!-- Receive File Transfer -->
            <div class="flex flex-col gap-4">
              <!-- Source selection for receive mode -->
              <div class="flex flex-col gap-2">
                <label class="text-xs tracking-wider text-(--color-text-light) font-medium">Capture Source</label>
                <div class="flex gap-2">
                  {#if !cameraActive && !screenActive}
                    <button
                      onclick={startCamera}
                      class="flex-1 px-4 py-2 text-sm font-medium bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) transition-colors"
                    >
                      Use Camera
                    </button>
                    <button
                      onclick={startScreenCapture}
                      class="flex-1 px-4 py-2 text-sm font-medium bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) transition-colors"
                    >
                      Use Screen
                    </button>
                  {:else}
                    <button
                      onclick={() => { stopCamera(); stopScreenCapture(); }}
                      class="w-full px-4 py-2 text-sm font-medium border border-(--color-border) text-(--color-text) hover:bg-(--color-bg-alt) transition-colors"
                    >
                      Stop {cameraActive ? "Camera" : "Screen Capture"}
                    </button>
                  {/if}
                </div>
                <p class="text-xs text-(--color-text-muted)">
                  {#if cameraActive}
                    Scanning camera for QR codes...
                  {:else if screenActive}
                    Scanning screen for QR codes...
                  {:else}
                    Choose camera or screen to receive file transfer
                  {/if}
                </p>
              </div>
              
              <!-- Region Selection for Screen Capture in Receive Mode -->
              {#if screenActive}
                <div class="flex flex-col gap-2 p-3 border border-(--color-border) bg-(--color-bg-alt)">
                  <div class="flex items-center justify-between">
                    <label class="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        bind:checked={screenRegionEnabled} 
                        onchange={() => { if (!screenRegionEnabled) clearScreenRegion(); }}
                        class="w-4 h-4 accent-(--color-accent)" 
                      />
                      <span class="text-sm text-(--color-text)">Select scan region</span>
                    </label>
                    {#if screenRegion}
                      <button
                        onclick={clearScreenRegion}
                        class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
                      >
                        Clear
                      </button>
                    {/if}
                  </div>
                  {#if screenRegionEnabled}
                    <p class="text-xs text-(--color-text-muted)">
                      {#if screenRegion}
                        Region: {Math.round(screenRegion.width)}x{Math.round(screenRegion.height)}px
                      {:else}
                        Click and drag on the preview to select a region
                      {/if}
                    </p>
                  {/if}
                </div>
              {/if}

              <!-- Receive Progress -->
              {#if fileReceiveProgress}
                {@const p = fileReceiveProgress}
                <div class="flex flex-col gap-2 p-4 border border-(--color-border) bg-(--color-bg-alt)">
                  <div class="flex justify-between items-center">
                    <span class="text-xs tracking-wider text-(--color-text-light) font-medium">Receiving</span>
                    <span class="text-xs text-(--color-text-muted)">
                      {p.blocksDecoded} / {p.blockCount} blocks
                    </span>
                  </div>

                  <div class="w-full h-2 bg-(--color-bg) border border-(--color-border) overflow-hidden">
                    <div
                      class="h-full bg-(--color-accent) transition-all duration-150"
                      style="width: {p.percent}%"
                    ></div>
                  </div>

                  <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-(--color-text-muted)">
                    <span>Progress</span>
                    <span class="text-right text-(--color-text) font-mono">{p.percent.toFixed(1)}%</span>
                    <span>Payload</span>
                    <span class="text-right text-(--color-text) font-mono">
                      {(p.payloadLength / 1024).toFixed(1)} KB{p.gzip ? " (gzip)" : ""}
                    </span>
                    <span>Frames read</span>
                    <span class="text-right text-(--color-text) font-mono">
                      {p.framesAccepted}{p.framesDuplicate > 0 ? ` (+${p.framesDuplicate} repeat)` : ""}
                    </span>
                    {#if p.etaSeconds !== null}
                      <span>Remaining</span>
                      <span class="text-right text-(--color-text) font-mono">
                        {p.etaSeconds < 60
                          ? `${Math.ceil(p.etaSeconds)}s`
                          : `${Math.floor(p.etaSeconds / 60)}m ${Math.ceil(p.etaSeconds % 60)}s`}
                      </span>
                    {/if}
                  </div>

                  <!--
                    One cell per recovered block. Capped because a large transfer
                    can have thousands of blocks and rendering a node per block
                    would cost more than the decoding itself.
                  -->
                  {#if p.blockCount <= 512}
                    <div class="flex flex-wrap gap-0.5 mt-1">
                      {#each Array(p.blockCount) as _, i}
                        <div
                          class="w-2 h-2 {fileReceiver.has(i)
                            ? 'bg-(--color-accent)'
                            : 'bg-(--color-bg) border border-(--color-border)'}"
                        ></div>
                      {/each}
                    </div>
                  {/if}

                  <p class="text-xs text-(--color-text-muted)">
                    Every frame counts towards the total, so missed frames do not need to be recaptured.
                  </p>
                </div>
              {:else if legacyMetadata}
                <div class="flex flex-col gap-2 p-4 border border-(--color-border) bg-(--color-bg-alt)">
                  <div class="flex justify-between items-center">
                    <span class="text-xs tracking-wider text-(--color-text-light) font-medium">
                      Receiving (legacy format)
                    </span>
                    <span class="text-xs text-(--color-text-muted)">
                      {legacyCount} / {legacyMetadata.total} chunks
                    </span>
                  </div>
                  <div class="text-sm text-(--color-text) font-mono truncate">{legacyMetadata.name}</div>
                  <div class="w-full h-2 bg-(--color-bg) border border-(--color-border) overflow-hidden">
                    <div
                      class="h-full bg-(--color-accent) transition-all duration-300"
                      style="width: {(legacyCount / legacyMetadata.total) * 100}%"
                    ></div>
                  </div>
                </div>
              {:else}
                <div class="p-4 border border-dashed border-(--color-border) bg-(--color-bg-alt) text-center">
                  <p class="text-sm text-(--color-text-muted)">Waiting for file transfer QR codes...</p>
                  <p class="text-xs text-(--color-text-muted) mt-1">Scan QR codes from the sender's File Transfer tab</p>
                </div>
              {/if}

              {#if scanBackend}
                <p class="text-xs text-(--color-text-muted)">
                  Decoder: {scanBackend === "native"
                    ? "native BarcodeDetector"
                    : scanBackend === "zxing"
                      ? "zxing-wasm"
                      : "jsQR (slow fallback)"}
                </p>
              {/if}

              <!-- Download button when complete -->
              {#if fileReceiveComplete && fileReceiveResult}
                <button
                  onclick={downloadReceivedFile}
                  class="w-full px-4 py-2 text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition-colors"
                >
                  Download {fileReceiveResult.name} ({(fileReceiveResult.size / 1024).toFixed(1)} KB)
                </button>
                {#if fileReceiveResult.verified}
                  <p class="text-xs text-green-600 dark:text-green-400">Checksum verified.</p>
                {/if}
              {/if}

              <!-- Error -->
              {#if fileReceiveError}
                <div class="p-3 border border-red-500 bg-red-500/10 text-red-500 text-sm">
                  {fileReceiveError}
                </div>
              {/if}
            </div>
          {/if}

          <!-- Reader Result (for file/camera modes) -->
          {#if readerResult && readerMode !== "receive"}
            <div class="flex flex-col gap-2">
              <div class="flex justify-between items-center">
                <label class="text-xs tracking-wider text-(--color-text-light) font-medium">Result</label>
                <button
                  onclick={copyReaderResult}
                  class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
                >
                  {readerCopied ? "Copied!" : "Copy"}
                </button>
              </div>
              <div class="p-3 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm font-mono break-all">
                {readerResult}
              </div>
              {#if readerResult.startsWith("http://") || readerResult.startsWith("https://")}
                <a
                  href={readerResult}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-sm text-(--color-accent) hover:underline"
                >
                  Open Link
                </a>
              {/if}
            </div>
          {/if}

          <!-- Clear Button -->
          {#if readerResult || readerImagePreview || cameraActive || screenActive || fileReceiveProgress || legacyMetadata}
            <button
              onclick={clearReader}
              class="w-full px-4 py-2 text-sm border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              Clear
            </button>
          {/if}
        </div>
      {:else if activeTab === "transfer"}
        <!-- File Transfer -->
        <div class="flex flex-col gap-4">
          <!-- Block Size -->
          <div class="flex flex-col gap-2">
            <label for="block-size" class="text-xs tracking-wider text-(--color-text-light) font-medium">
              Data per QR
            </label>
            <select
              id="block-size"
              bind:value={fileTransferBlockSize}
              onchange={reprocessTransfer}
              class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer"
            >
              <option value={128}>128 bytes - poor lighting / long range</option>
              <option value={256}>256 bytes - phone camera, cautious</option>
              <option value={512}>512 bytes - phone camera, balanced</option>
              <option value={1024}>1 KB - good camera, close range</option>
              <option value={2048}>2 KB - screen sharing only</option>
            </select>
            <p class="text-xs text-(--color-text-muted)">
              Throughput scales with this directly. Raise it until the receiver starts missing frames.
            </p>
          </div>

          <!-- Frame rate -->
          <div class="flex flex-col gap-2">
            <label for="transfer-fps" class="text-xs tracking-wider text-(--color-text-light) font-medium">
              Frame Rate: {fileTransferFps} fps
            </label>
            <input
              id="transfer-fps"
              type="range"
              min="1"
              max="30"
              bind:value={fileTransferFps}
              class="w-full accent-(--color-accent)"
            />
            <div class="flex justify-between text-xs text-(--color-text-muted)">
              <span>1</span>
              <span>30</span>
            </div>
            <p class="text-xs text-(--color-text-muted)">
              Cameras deliver ~30 fps, so going beyond that only shows frames the receiver cannot capture.
            </p>
          </div>

          <!-- Error correction -->
          <div class="flex flex-col gap-2">
            <label for="transfer-ec" class="text-xs tracking-wider text-(--color-text-light) font-medium">
              Error Correction
            </label>
            <select
              id="transfer-ec"
              bind:value={fileTransferEc}
              onchange={reprocessTransfer}
              class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer"
            >
              <option value="L">Low (7%) - smallest symbol, fastest</option>
              <option value="M">Medium (15%)</option>
              <option value="Q">Quartile (25%)</option>
              <option value="H">High (30%) - largest symbol</option>
            </select>
            <p class="text-xs text-(--color-text-muted)">
              Low is usually best here: a damaged frame is simply skipped and the next one replaces it.
            </p>
          </div>

          <!-- Display size -->
          <div class="flex flex-col gap-2">
            <label for="transfer-size" class="text-xs tracking-wider text-(--color-text-light) font-medium">
              Display Size: {fileTransferDisplaySize}px
            </label>
            <input
              id="transfer-size"
              type="range"
              min="200"
              max="900"
              step="20"
              bind:value={fileTransferDisplaySize}
              onchange={() => { if (fileTransferState === "ready") paintTransferFrame(); }}
              class="w-full accent-(--color-accent)"
            />
          </div>

          <!-- File Drop Zone -->
          {#if fileTransferState === "idle"}
            <div
              class="flex flex-col items-center justify-center p-8 border-2 border-dashed transition-colors cursor-pointer {fileTransferDragOver
                ? 'border-(--color-accent) bg-(--color-accent)/10'
                : 'border-(--color-border) bg-(--color-bg-alt) hover:border-(--color-accent)'}"
              ondragover={(e) => { e.preventDefault(); fileTransferDragOver = true; }}
              ondragleave={() => { fileTransferDragOver = false; }}
              ondrop={handleFileTransferDrop}
              onclick={() => document.getElementById("file-transfer-input")?.click()}
              role="button"
              tabindex="0"
              onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") document.getElementById("file-transfer-input")?.click(); }}
            >
              <svg class="w-12 h-12 text-(--color-text-muted) mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p class="text-sm text-(--color-text)">Drop a file here or click to select</p>
              <p class="text-xs text-(--color-text-muted) mt-1">Recommended max size: 500KB</p>
              <input
                id="file-transfer-input"
                type="file"
                class="hidden"
                onchange={handleFileTransferSelect}
              />
            </div>
          {:else}
            <!-- File Info -->
            <div class="flex flex-col gap-2 p-4 border border-(--color-border) bg-(--color-bg-alt)">
              <div class="flex justify-between items-center">
                <span class="text-xs tracking-wider text-(--color-text-light) font-medium">File</span>
                <button
                  onclick={clearFileTransfer}
                  class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
                >
                  Clear
                </button>
              </div>
              <div class="text-sm text-(--color-text) font-mono truncate">{fileTransferFile?.name}</div>
              {#if fileTransferInfo}
                <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-(--color-text-muted)">
                  <span>Size</span>
                  <span class="text-right text-(--color-text)">
                    {((fileTransferFile?.size ?? 0) / 1024).toFixed(1)} KB
                  </span>
                  <span>On the wire</span>
                  <span class="text-right text-(--color-text)">
                    {(fileTransferInfo.payloadLength / 1024).toFixed(1)} KB
                    {#if fileTransferInfo.gzip}
                      <span class="text-green-600 dark:text-green-400">
                        (gzip {(100 - (fileTransferInfo.payloadLength / fileTransferInfo.rawLength) * 100).toFixed(0)}% smaller)
                      </span>
                    {/if}
                  </span>
                  <span>Blocks</span>
                  <span class="text-right text-(--color-text)">
                    {fileTransferInfo.blockCount} x {fileTransferInfo.blockSize} B
                  </span>
                  <span>Symbol</span>
                  <span class="text-right text-(--color-text)">
                    v{fileTransferInfo.qrVersion} ({fileTransferInfo.qrModules}x{fileTransferInfo.qrModules})
                  </span>
                </div>
              {/if}
            </div>

            <!-- Playback -->
            <div class="flex flex-col gap-4">
              <button
                onclick={toggleFileTransferPlayback}
                class="w-full px-4 py-2 text-sm font-medium transition-colors {fileTransferState === 'playing'
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover)'}"
              >
                {fileTransferState === "playing" ? "Stop Broadcasting" : "Start Broadcasting"}
              </button>

              {#if fileTransferState === "playing" && fileTransferInfo}
                <div class="grid grid-cols-2 gap-x-4 gap-y-1 p-3 border border-(--color-border) bg-(--color-bg-alt) text-xs text-(--color-text-muted)">
                  <span>Frames sent</span>
                  <span class="text-right text-(--color-text) font-mono">{fileTransferStats.framesEmitted}</span>
                  <span>Throughput</span>
                  <span class="text-right text-(--color-text) font-mono">
                    {(fileTransferStats.bytesPerSecond / 1024).toFixed(1)} KB/s
                  </span>
                  <span>One full pass</span>
                  <span class="text-right text-(--color-text) font-mono">
                    {fileTransferStats.passSeconds > 0 ? fileTransferStats.passSeconds.toFixed(1) + "s" : "-"}
                  </span>
                </div>
              {/if}

              <p class="text-xs text-(--color-text-muted)">
                Frames are fountain coded, so there is no beginning or end to line up.
                Point the receiver at the code at any time and leave it running until it reaches 100%.
              </p>
            </div>
          {/if}

          {#if fileTransferPreparing}
            <div class="p-3 border border-(--color-border) bg-(--color-bg-alt) text-sm text-(--color-text-muted)">
              Preparing file...
            </div>
          {/if}
        </div>
      {/if}

      {#if activeTab !== "reader" && activeTab !== "transfer"}

      <!-- Output Format -->
      <div class="flex flex-col gap-2">
        <label class="text-xs tracking-wider text-(--color-text-light) font-medium">Output Format</label>
        <div class="flex gap-2">
          {#each ["png", "svg", "ascii"] as format}
            <button
              onclick={() => (outputFormat = format as OutputFormat)}
              class="px-4 py-2 text-sm border transition-colors {outputFormat === format
                ? 'border-(--color-accent) bg-(--color-accent) text-(--color-btn-text)'
                : 'border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:border-(--color-accent)'}"
            >
              {format.toUpperCase()}
            </button>
          {/each}
        </div>
      </div>

      <!-- Colors -->
      <div class="flex flex-col gap-2">
        <div class="flex flex-wrap gap-4">
          <div class="flex flex-col gap-2 flex-1">
            <label for="fg-color" class="text-xs tracking-wider text-(--color-text-light) font-medium">
              Foreground
            </label>
            <div class="flex gap-2">
              <input
                id="fg-color"
                type="color"
                bind:value={foregroundColor}
                class="w-10 h-10 cursor-pointer border border-(--color-border)"
              />
              <input
                type="text"
                bind:value={foregroundColor}
                class="flex-1 px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) font-mono"
              />
            </div>
          </div>
          <div class="flex flex-col gap-2 flex-1">
            <label for="bg-color" class="text-xs tracking-wider text-(--color-text-light) font-medium">
              Background
            </label>
            <div class="flex gap-2">
              <input
                id="bg-color"
                type="color"
                bind:value={backgroundColor}
                disabled={transparentBackground || outputFormat === "ascii"}
                class="w-10 h-10 cursor-pointer border border-(--color-border) disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <input
                type="text"
                bind:value={backgroundColor}
                disabled={transparentBackground || outputFormat === "ascii"}
                class="flex-1 px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) font-mono disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          </div>
        </div>
        <label class="flex items-center gap-2 {outputFormat === 'ascii' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}">
          <input
            type="checkbox"
            bind:checked={transparentBackground}
            disabled={outputFormat === "ascii"}
            class="w-4 h-4 accent-(--color-accent) disabled:cursor-not-allowed"
          />
          <span class="text-sm text-(--color-text)">Transparent background</span>
        </label>
      </div>

      <!-- Scale -->
      <div class="flex flex-col gap-2">
        <label for="scale" class="text-xs tracking-wider text-(--color-text-light) font-medium">
          Scale: {scale}x
        </label>
        <input
          id="scale"
          type="range"
          min="1"
          max="10"
          bind:value={scale}
          class="w-full accent-(--color-accent)"
        />
      </div>

      <!-- QR Error Correction (only for QR codes) -->
      {#if selectedType === "qrcode"}
        <div class="flex flex-col gap-2">
          <label for="ec-level" class="text-xs tracking-wider text-(--color-text-light) font-medium">
            Error Correction
          </label>
          <select
            id="ec-level"
            bind:value={errorCorrectionLevel}
            class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer"
          >
            <option value="L">Low (7%)</option>
            <option value="M">Medium (15%)</option>
            <option value="Q">Quartile (25%)</option>
            <option value="H">High (30%)</option>
          </select>
          <p class="text-xs text-(--color-text-muted)">
            Higher levels allow more damage tolerance but increase code size.
          </p>
        </div>
      {/if}

      <!-- Include Text (1D barcodes only) -->
      {#if !is2D && activeTab === "barcode"}
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" bind:checked={includeText} class="w-4 h-4 accent-(--color-accent)" />
          <span class="text-sm text-(--color-text)">Include text below barcode</span>
        </label>
      {/if}

      <!-- Frame Style -->
      {#if outputFormat !== "ascii"}
        <div class="flex flex-col gap-2">
          <label for="frame-style" class="text-xs tracking-wider text-(--color-text-light) font-medium">
            Frame Style
          </label>
          <select
            id="frame-style"
            bind:value={frameStyle}
            class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer"
          >
            <option value="none">None</option>
            <option value="simple">Simple</option>
            <option value="rounded">Rounded</option>
            <option value="bold">Bold</option>
            <option value="double">Double</option>
          </select>
        </div>
      {/if}
      {/if}
    </div>

    <!-- Right Panel: Output -->
    <div class="lg:w-1/2 flex flex-col min-h-[300px]">
      {#if activeTab === "reader"}
        <!-- Reader Preview -->
        <div class="flex justify-between items-center mb-2">
          <span class="text-xs tracking-wider text-(--color-text-light) font-medium">
            {#if readerMode === "receive"}
              {cameraActive ? "Camera Feed" : screenActive ? "Screen Capture" : "Preview"}
            {:else if readerMode === "screen"}
              Screen Capture
            {:else}
              Preview
            {/if}
          </span>
        </div>

        <!-- Reader Error -->
        {#if readerError}
          <div class="mb-4 p-3 border border-red-500 bg-red-500/10 text-red-500 text-sm">
            {readerError}
          </div>
        {/if}

        <!-- Reader Preview Display -->
        <div class="flex-1 border border-(--color-border) bg-black overflow-hidden flex items-center justify-center relative">
          {#if (readerMode === "camera" || readerMode === "receive") && cameraActive}
            <video
              bind:this={cameraVideoElement}
              autoplay
              playsinline
              muted
              class="w-full h-full object-contain"
            ></video>
          {:else if (readerMode === "screen" || readerMode === "receive") && screenActive}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div 
              bind:this={screenRegionContainer}
              class="relative w-full h-full flex items-center justify-center"
              onmousedown={screenRegionEnabled ? handleRegionMouseDown : undefined}
              onmousemove={screenRegionEnabled ? handleRegionMouseMove : undefined}
              onmouseup={screenRegionEnabled ? handleRegionMouseUp : undefined}
              onmouseleave={screenRegionEnabled ? handleRegionMouseUp : undefined}
              style={screenRegionEnabled ? "cursor: crosshair;" : ""}
            >
              <video
                bind:this={screenVideoElement}
                autoplay
                playsinline
                muted
                class="w-full h-full object-contain"
              ></video>
              <!-- Region overlay -->
              {#if screenRegion && screenRegionEnabled}
                <div 
                  class="absolute border-2 border-green-500 bg-green-500/20 pointer-events-none"
                  style="left: {screenRegion.x}px; top: {screenRegion.y}px; width: {screenRegion.width}px; height: {screenRegion.height}px;"
                >
                  <div class="absolute -top-6 left-0 bg-green-500 text-white text-xs px-1 py-0.5 rounded">
                    Scan Region
                  </div>
                </div>
              {/if}
              <!-- Dim area outside region when selecting -->
              {#if screenRegionEnabled && !screenRegion}
                <div class="absolute inset-0 bg-black/30 pointer-events-none flex items-center justify-center">
                  <span class="text-white text-sm bg-black/50 px-3 py-1 rounded">Click and drag to select region</span>
                </div>
              {/if}
            </div>
          {:else if readerImagePreview}
            <img
              src={readerImagePreview}
              alt="Uploaded image"
              class="max-w-full max-h-full object-contain"
            />
          {:else}
            <div class="text-(--color-text-muted) text-sm text-center p-4">
              {#if readerMode === "file"}
                Upload an image to scan
              {:else if readerMode === "screen"}
                Select a screen or window to capture
              {:else if readerMode === "receive"}
                Choose camera or screen to receive file transfer
              {:else}
                Start camera to scan
              {/if}
            </div>
          {/if}
        </div>
      {:else if activeTab === "transfer"}
        <!-- File Transfer QR Output -->
        <div class="flex justify-between items-center mb-2">
          <span class="text-xs tracking-wider text-(--color-text-light) font-medium">
            QR Code
          </span>
          {#if fileTransferState === "playing"}
            <span class="text-xs text-(--color-accent)">
              Broadcasting at {fileTransferFps} fps
            </span>
          {/if}
        </div>

        <!-- Error Message -->
        {#if error}
          <div class="mb-4 p-3 border border-red-500 bg-red-500/10 text-red-500 text-sm">
            {error}
          </div>
        {/if}

        <!-- QR Display -->
        <div class="flex-1 border border-(--color-border) bg-white overflow-auto flex items-center justify-center p-4">
          <!--
            Kept mounted so the canvas reference survives play/stop toggles.
            Deliberately not `max-w-full`: the painter sizes the canvas to a
            whole number of device pixels per module, and letting the browser
            shrink it to fit would reintroduce the fractional module widths that
            make a dense QR unreadable. The container scrolls instead.
          -->
          <canvas
            bind:this={fileTransferCanvas}
            class="shrink-0 {fileTransferInfo ? '' : 'hidden'}"
          ></canvas>
          {#if !fileTransferInfo}
            <div class="text-gray-500 text-sm text-center">
              <svg class="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
              <p>Drop a file to generate QR codes</p>
              <p class="text-xs mt-1">The receiver will scan these codes to download the file</p>
            </div>
          {/if}
        </div>
      {:else}
        <!-- Generator Output -->
        <div class="flex justify-between items-center mb-2">
          <span class="text-xs tracking-wider text-(--color-text-light) font-medium">
            Output
          </span>
          <div class="flex gap-3">
            <button
              onclick={handleCopy}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
            <button
              onclick={handleDownload}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              {downloaded ? "Downloaded!" : "Download"}
            </button>
            <button
              onclick={handleClear}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              Clear
            </button>
          </div>
        </div>

        <!-- Error Message -->
        {#if error}
          <div class="mb-4 p-3 border border-red-500 bg-red-500/10 text-red-500 text-sm">
            {error}
          </div>
        {/if}

        <!-- Output Display -->
        <div class="flex-1 border border-(--color-border) bg-(--color-bg) overflow-auto flex items-center justify-center p-4">
          {#if outputFormat === "png"}
            <canvas bind:this={outputCanvas} class="max-w-full max-h-full"></canvas>
          {:else if outputFormat === "svg"}
            {#if outputSvg}
              <div class="max-w-full max-h-full">
                {@html outputSvg}
              </div>
            {:else}
              <div class="text-(--color-text-muted) text-sm">Enter content to generate barcode...</div>
            {/if}
          {:else if outputFormat === "ascii"}
            {#if outputAscii}
              <pre class="text-xs font-mono leading-none whitespace-pre max-w-full max-h-full text-(--color-text)">{outputAscii}</pre>
            {:else}
              <div class="text-(--color-text-muted) text-sm">Enter content to generate barcode...</div>
            {/if}
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>
