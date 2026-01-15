<script lang="ts">
  import { onMount } from "svelte";
  import bwipjs from "@bwip-js/browser";
  import jsQR from "jsqr";

  type TabType = "barcode" | "wifi" | "reader" | "transfer";
  type OutputFormat = "png" | "svg" | "ascii";
  type FrameStyle = "none" | "simple" | "rounded" | "bold" | "double";
  type WifiEncryption = "WPA" | "WEP" | "nopass";
  type ReaderMode = "file" | "camera" | "screen" | "receive";
  type FileTransferState = "idle" | "ready" | "playing";

  interface FileTransferChunk {
    t: "file";           // type identifier
    n?: string;          // filename (only in first chunk)
    i: number;           // chunk index (0-based)
    c: number;           // total chunks
    d: string;           // chunk data (base64 encoded)
    h?: string;          // file hash (only in last chunk)
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
  let screenScanInterval: number | null = null;
  
  // Screen region selection states
  let screenRegionEnabled = $state(false);
  let screenRegion = $state<{ x: number; y: number; width: number; height: number } | null>(null);
  let screenRegionSelecting = $state(false);
  let screenRegionStart = $state<{ x: number; y: number } | null>(null);
  let screenCanvasElement = $state<HTMLCanvasElement | null>(null);

  // File Transfer (sender) states
  let fileTransferFile = $state<File | null>(null);
  let fileTransferChunks = $state<string[]>([]);
  let fileTransferCurrentIndex = $state(0);
  let fileTransferState = $state<FileTransferState>("idle");
  let fileTransferSpeed = $state(1000);
  let fileTransferChunkSize = $state(400); // Default to medium - ~300 bytes per QR
  let fileTransferScale = $state(4); // QR code scale
  let fileTransferInterval: number | null = null;
  let fileTransferQrSvg = $state("");
  let fileTransferDragOver = $state(false);

  // File Receive states
  let fileReceiveChunks = $state<Map<number, string>>(new Map());
  let fileReceiveMetadata = $state<{ name: string; total: number; hash?: string } | null>(null);
  let fileReceiveComplete = $state(false);
  let fileReceiveError = $state("");

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
  const checkBarcodeDetectorSupport = (): boolean => {
    return "BarcodeDetector" in window;
  };

  // Convert image source to ImageData for jsQR
  const getImageData = (source: HTMLImageElement | HTMLVideoElement): ImageData | null => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    if (source instanceof HTMLVideoElement) {
      canvas.width = source.videoWidth;
      canvas.height = source.videoHeight;
    } else {
      canvas.width = source.naturalWidth || source.width;
      canvas.height = source.naturalHeight || source.height;
    }

    if (canvas.width === 0 || canvas.height === 0) return null;

    ctx.drawImage(source, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  };

  // Fallback QR detection using jsQR library
  const detectWithJsQR = (source: HTMLImageElement | HTMLVideoElement): string | null => {
    const imageData = getImageData(source);
    if (!imageData) return null;

    const code = jsQR(imageData.data, imageData.width, imageData.height);
    return code?.data || null;
  };

  const detectBarcode = async (imageSource: HTMLImageElement | HTMLVideoElement): Promise<string | null> => {
    // Try native BarcodeDetector first (faster and supports more formats)
    if (checkBarcodeDetectorSupport()) {
      try {
        // @ts-expect-error BarcodeDetector is not in TypeScript's lib yet
        const barcodeDetector = new BarcodeDetector({
          formats: ["qr_code", "ean_13", "ean_8", "code_128", "code_39", "code_93", "codabar", "data_matrix", "itf", "pdf417", "aztec", "upc_a", "upc_e"],
        });
        const barcodes = await barcodeDetector.detect(imageSource);
        
        if (barcodes.length > 0) {
          return barcodes[0].rawValue;
        }
      } catch {
        // Fall through to jsQR
      }
    }

    // Fallback to jsQR for QR codes (works on all browsers including iOS)
    try {
      const result = detectWithJsQR(imageSource);
      if (result) {
        return result;
      }
    } catch {
      // Ignore jsQR errors
    }

    return null;
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
        const result = await detectBarcode(img);
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
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
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

  const stopCamera = () => {
    if (scanInterval) {
      clearInterval(scanInterval);
      scanInterval = null;
    }
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
        video: true,
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
    if (screenScanInterval) {
      clearInterval(screenScanInterval);
      screenScanInterval = null;
    }
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

  const getScreenRegionImageData = (): ImageData | null => {
    if (!screenVideoElement || !screenRegion) return null;
    
    const renderInfo = getVideoRenderInfo();
    if (!renderInfo) return null;
    
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    
    // Adjust region coordinates for letterboxing offset
    const adjustedX = screenRegion.x - renderInfo.offsetX;
    const adjustedY = screenRegion.y - renderInfo.offsetY;
    
    // Clamp to video bounds
    const clampedX = Math.max(0, adjustedX);
    const clampedY = Math.max(0, adjustedY);
    const clampedWidth = Math.min(screenRegion.width, renderInfo.renderedWidth - clampedX);
    const clampedHeight = Math.min(screenRegion.height, renderInfo.renderedHeight - clampedY);
    
    if (clampedWidth <= 0 || clampedHeight <= 0) return null;
    
    // Scale to actual video coordinates
    const srcX = Math.floor(clampedX * renderInfo.scaleX);
    const srcY = Math.floor(clampedY * renderInfo.scaleY);
    const srcWidth = Math.floor(clampedWidth * renderInfo.scaleX);
    const srcHeight = Math.floor(clampedHeight * renderInfo.scaleY);
    
    if (srcWidth <= 0 || srcHeight <= 0) return null;
    
    canvas.width = srcWidth;
    canvas.height = srcHeight;
    
    ctx.drawImage(
      screenVideoElement,
      srcX, srcY, srcWidth, srcHeight,
      0, 0, srcWidth, srcHeight
    );
    
    return ctx.getImageData(0, 0, srcWidth, srcHeight);
  };
  
  const detectBarcodeInRegion = async (): Promise<string | null> => {
    if (!screenRegionEnabled || !screenRegion) {
      // No region, scan full video
      if (screenVideoElement) {
        return await detectBarcode(screenVideoElement);
      }
      return null;
    }
    
    const imageData = getScreenRegionImageData();
    if (!imageData) {
      return null;
    }
    
    // Try jsQR first (works well for QR codes)
    try {
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });
      if (code?.data) {
        return code.data;
      }
    } catch {
      // jsQR failed, continue
    }
    
    // Try with inverted colors
    try {
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "attemptBoth",
      });
      if (code?.data) {
        return code.data;
      }
    } catch {
      // jsQR failed
    }
    
    return null;
  };

  const startScreenScanning = () => {
    if (screenScanInterval) {
      clearInterval(screenScanInterval);
    }

    screenScanInterval = window.setInterval(async () => {
      if (!screenVideoElement || !screenActive) return;

      try {
        const result = await detectBarcodeInRegion();
        if (result) {
          handleScannedResult(result);
        }
      } catch {
        // Ignore scan errors during continuous scanning
      }
    }, 300); // Scan every 300ms for screen (can be faster than camera)
  };

  const startScanning = () => {
    if (scanInterval) {
      clearInterval(scanInterval);
    }

    scanInterval = window.setInterval(async () => {
      if (!cameraVideoElement || !cameraActive) return;

      try {
        const result = await detectBarcode(cameraVideoElement);
        if (result) {
          handleScannedResult(result);
        }
      } catch {
        // Ignore scan errors during continuous scanning
      }
    }, 500); // Scan every 500ms
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
    // Clear file receive state
    fileReceiveChunks = new Map();
    fileReceiveMetadata = null;
    fileReceiveComplete = false;
    fileReceiveError = "";
  };

  // File Transfer Functions
  const computeFileHash = async (data: ArrayBuffer): Promise<string> => {
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").substring(0, 16);
  };

  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  };

  const processFileForTransfer = async (file: File) => {
    fileTransferFile = file;
    fileTransferState = "idle";
    fileTransferCurrentIndex = 0;
    fileTransferChunks = [];
    error = "";

    try {
      const arrayBuffer = await file.arrayBuffer();
      const fileHash = await computeFileHash(arrayBuffer);
      const base64Data = arrayBufferToBase64(arrayBuffer);
      
      // QR codes in alphanumeric mode can hold ~4296 characters, binary ~2953 bytes
      // Our JSON uses mixed characters, so we target conservative limits
      // The JSON structure: {"t":"file","i":0,"c":10,"d":"BASE64DATA","n":"file.txt","h":"hash"}
      // overhead is roughly: 40 chars + filename length + 16 char hash = ~80 chars max
      // 
      // fileTransferChunkSize represents the MAX BASE64 DATA per chunk (not raw bytes)
      // This directly controls how much base64 data goes in the "d" field
      const base64ChunkSize = fileTransferChunkSize;
      const totalChunks = Math.ceil(base64Data.length / base64ChunkSize);
      
      const chunks: string[] = [];
      for (let i = 0; i < totalChunks; i++) {
        const start = i * base64ChunkSize;
        const end = Math.min(start + base64ChunkSize, base64Data.length);
        const chunkData = base64Data.substring(start, end);
        
        const chunk: FileTransferChunk = {
          t: "file",
          i: i,
          c: totalChunks,
          d: chunkData,
        };
        
        // Add filename to first chunk
        if (i === 0) {
          chunk.n = file.name;
        }
        
        // Add hash to last chunk
        if (i === totalChunks - 1) {
          chunk.h = fileHash;
        }
        
        chunks.push(JSON.stringify(chunk));
      }
      
      fileTransferChunks = chunks;
      fileTransferState = "ready";
      generateTransferQr();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to process file";
      console.error("File transfer error:", e);
    }
  };

  const generateTransferQr = () => {
    if (fileTransferChunks.length === 0) {
      fileTransferQrSvg = "";
      return;
    }

    try {
      const currentChunk = fileTransferChunks[fileTransferCurrentIndex];
      
      let svg = bwipjs.toSVG({
        bcid: "qrcode",
        text: currentChunk,
        scale: fileTransferScale,
        barcolor: "000000",
        backgroundcolor: "ffffff",
      } as Parameters<typeof bwipjs.toSVG>[0]);
      
      // Ensure SVG has proper width/height for display
      const parser = new DOMParser();
      const doc = parser.parseFromString(svg, "image/svg+xml");
      const svgElement = doc.querySelector("svg");
      
      if (svgElement) {
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
      
      fileTransferQrSvg = svg;
      error = ""; // Clear any previous error
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "Failed to generate QR code";
      error = `QR generation failed: ${errorMsg}. Try smaller chunk size.`;
      fileTransferQrSvg = "";
      console.error("QR generation error:", e);
    }
  };

  const handleFileTransferDrop = async (event: DragEvent) => {
    event.preventDefault();
    fileTransferDragOver = false;
    
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      await processFileForTransfer(file);
    }
  };

  const handleFileTransferSelect = async (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      await processFileForTransfer(file);
    }
  };

  const startFileTransferPlayback = () => {
    if (fileTransferState === "playing") return;
    fileTransferState = "playing";
    
    fileTransferInterval = window.setInterval(() => {
      if (fileTransferCurrentIndex < fileTransferChunks.length - 1) {
        fileTransferCurrentIndex++;
        generateTransferQr();
      } else {
        // Loop back to start
        fileTransferCurrentIndex = 0;
        generateTransferQr();
      }
    }, fileTransferSpeed);
  };

  const stopFileTransferPlayback = () => {
    if (fileTransferInterval) {
      clearInterval(fileTransferInterval);
      fileTransferInterval = null;
    }
    if (fileTransferState === "playing") {
      fileTransferState = "ready";
    }
  };

  const goToNextChunk = () => {
    if (fileTransferCurrentIndex < fileTransferChunks.length - 1) {
      fileTransferCurrentIndex++;
      generateTransferQr();
    }
  };

  const goToPrevChunk = () => {
    if (fileTransferCurrentIndex > 0) {
      fileTransferCurrentIndex--;
      generateTransferQr();
    }
  };

  const goToChunk = (index: number) => {
    if (index >= 0 && index < fileTransferChunks.length) {
      fileTransferCurrentIndex = index;
      generateTransferQr();
    }
  };

  const clearFileTransfer = () => {
    stopFileTransferPlayback();
    fileTransferFile = null;
    fileTransferChunks = [];
    fileTransferCurrentIndex = 0;
    fileTransferState = "idle";
    fileTransferQrSvg = "";
  };

  // File Receive Functions
  const processReceivedChunk = (data: string) => {
    try {
      const chunk = JSON.parse(data) as FileTransferChunk;
      
      // Validate it's a file transfer chunk
      if (chunk.t !== "file" || typeof chunk.i !== "number" || typeof chunk.c !== "number" || typeof chunk.d !== "string") {
        return false;
      }
      
      // Initialize or update metadata
      if (!fileReceiveMetadata) {
        // Create metadata even if we don't have the filename yet
        fileReceiveMetadata = {
          name: chunk.n || "received_file",
          total: chunk.c,
        };
      } else {
        // Update filename if we get it later (from chunk 0)
        if (chunk.n && fileReceiveMetadata.name === "received_file") {
          fileReceiveMetadata = { ...fileReceiveMetadata, name: chunk.n };
        }
      }
      
      // Store hash from last chunk
      if (chunk.h) {
        fileReceiveMetadata = { ...fileReceiveMetadata, hash: chunk.h };
      }
      
      // Store chunk data
      if (!fileReceiveChunks.has(chunk.i)) {
        const newChunks = new Map(fileReceiveChunks);
        newChunks.set(chunk.i, chunk.d);
        fileReceiveChunks = newChunks;
        
        console.log(`Received chunk ${chunk.i + 1}/${chunk.c}, total received: ${newChunks.size}`);
        
        // Check if complete - use newChunks.size since fileReceiveChunks update is async
        if (newChunks.size === chunk.c) {
          console.log("All chunks received! Transfer complete.");
          fileReceiveComplete = true;
        }
      } else {
        // Even if chunk already exists, check for completion (in case we missed setting it)
        if (fileReceiveChunks.size === chunk.c && !fileReceiveComplete) {
          console.log("All chunks already received! Marking complete.");
          fileReceiveComplete = true;
        }
      }
      
      return true;
    } catch (e) {
      console.error("Error processing chunk:", e);
      return false;
    }
  };

  const downloadReceivedFile = async () => {
    if (!fileReceiveMetadata || !fileReceiveComplete) return;
    
    try {
      // Reconstruct base64 data from chunks
      let base64Data = "";
      for (let i = 0; i < fileReceiveMetadata.total; i++) {
        const chunk = fileReceiveChunks.get(i);
        if (!chunk) {
          fileReceiveError = `Missing chunk ${i}`;
          return;
        }
        base64Data += chunk;
      }
      
      // Convert to ArrayBuffer
      const arrayBuffer = base64ToArrayBuffer(base64Data);
      
      // Verify hash if available
      if (fileReceiveMetadata.hash) {
        const computedHash = await computeFileHash(arrayBuffer);
        if (computedHash !== fileReceiveMetadata.hash) {
          fileReceiveError = "File hash mismatch - transfer may be corrupted";
          return;
        }
      }
      
      // Create blob and download
      const blob = new Blob([arrayBuffer]);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileReceiveMetadata.name || "received_file";
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      fileReceiveError = e instanceof Error ? e.message : "Failed to download file";
    }
  };

  const clearFileReceive = () => {
    fileReceiveChunks = new Map();
    fileReceiveMetadata = null;
    fileReceiveComplete = false;
    fileReceiveError = "";
  };

  // Modified barcode detection to handle file transfer chunks
  const handleScannedResult = (result: string) => {
    // Try to parse as file transfer chunk
    if (readerMode === "receive" || result.startsWith('{"t":"file"')) {
      const isChunk = processReceivedChunk(result);
      if (isChunk) {
        // Auto-switch to receive mode if not already
        if (readerMode !== "receive") {
          readerMode = "receive";
        }
        return;
      }
    }
    
    // Regular barcode result
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
    generateBarcode();
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
      onclick={() => (activeTab = "barcode")}
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
      }}
      class="px-4 py-2 text-sm font-medium transition-colors {activeTab === 'wifi'
        ? 'text-(--color-text) border-b-2 border-(--color-accent)'
        : 'text-(--color-text-muted) hover:text-(--color-text)'}"
    >
      WiFi QR
    </button>
    <button
      onclick={() => {
        activeTab = "reader";
        clearReader();
      }}
      class="px-4 py-2 text-sm font-medium transition-colors {activeTab === 'reader'
        ? 'text-(--color-text) border-b-2 border-(--color-accent)'
        : 'text-(--color-text-muted) hover:text-(--color-text)'}"
    >
      QR Reader
    </button>
    <button
      onclick={() => {
        activeTab = "transfer";
        clearFileTransfer();
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
              {#if fileReceiveMetadata}
                <div class="flex flex-col gap-2 p-4 border border-(--color-border) bg-(--color-bg-alt)">
                  <div class="flex justify-between items-center">
                    <span class="text-xs tracking-wider text-(--color-text-light) font-medium">Receiving File</span>
                    <span class="text-xs text-(--color-text-muted)">
                      {fileReceiveChunks.size} / {fileReceiveMetadata.total} chunks
                    </span>
                  </div>
                  <div class="text-sm text-(--color-text) font-mono truncate">
                    {fileReceiveMetadata.name || "Unknown file"}
                  </div>
                  <!-- Progress bar -->
                  <div class="w-full h-2 bg-(--color-bg) border border-(--color-border) overflow-hidden">
                    <div
                      class="h-full bg-(--color-accent) transition-all duration-300"
                      style="width: {(fileReceiveChunks.size / fileReceiveMetadata.total) * 100}%"
                    ></div>
                  </div>
                  <!-- Chunk indicators -->
                  <div class="flex flex-wrap gap-1">
                    {#each Array(fileReceiveMetadata.total) as _, i}
                      <div
                        class="w-3 h-3 border {fileReceiveChunks.has(i) ? 'bg-(--color-accent) border-(--color-accent)' : 'bg-(--color-bg) border-(--color-border)'}"
                        title="Chunk {i + 1}"
                      ></div>
                    {/each}
                  </div>
                </div>
              {:else}
                <div class="p-4 border border-dashed border-(--color-border) bg-(--color-bg-alt) text-center">
                  <p class="text-sm text-(--color-text-muted)">Waiting for file transfer QR codes...</p>
                  <p class="text-xs text-(--color-text-muted) mt-1">Scan QR codes from the sender's File Transfer tab</p>
                </div>
              {/if}

              <!-- Download button when complete -->
              {#if fileReceiveComplete}
                <button
                  onclick={downloadReceivedFile}
                  class="w-full px-4 py-2 text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition-colors"
                >
                  Download {fileReceiveMetadata?.name || "File"}
                </button>
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
          {#if readerResult || readerImagePreview || cameraActive || fileReceiveMetadata}
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
          <!-- Chunk Size Configuration -->
          <div class="flex flex-col gap-2">
            <label for="chunk-size" class="text-xs tracking-wider text-(--color-text-light) font-medium">
              Chunk Size
            </label>
            <select
              id="chunk-size"
              bind:value={fileTransferChunkSize}
              disabled={fileTransferState !== "idle"}
              class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value={200}>Small (~150 bytes/QR) - most reliable</option>
              <option value={400}>Medium (~300 bytes/QR) - balanced</option>
              <option value={800}>Large (~600 bytes/QR) - fewer codes</option>
            </select>
            <p class="text-xs text-(--color-text-muted)">Smaller chunks scan more reliably but generate more QR codes</p>
          </div>

          <!-- QR Scale -->
          <div class="flex flex-col gap-2">
            <label for="transfer-scale" class="text-xs tracking-wider text-(--color-text-light) font-medium">
              QR Code Size: {fileTransferScale}x
            </label>
            <input
              id="transfer-scale"
              type="range"
              min="2"
              max="10"
              bind:value={fileTransferScale}
              onchange={() => generateTransferQr()}
              class="w-full accent-(--color-accent)"
            />
            <div class="flex justify-between text-xs text-(--color-text-muted)">
              <span>Small</span>
              <span>Large</span>
            </div>
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
              <div class="text-xs text-(--color-text-muted)">
                {fileTransferFile ? (fileTransferFile.size / 1024).toFixed(1) : 0} KB
                ({fileTransferChunks.length} QR codes)
              </div>
            </div>

            <!-- Playback Controls -->
            <div class="flex flex-col gap-4">
              <!-- Progress -->
              <div class="flex flex-col gap-2">
                <div class="flex justify-between items-center">
                  <span class="text-xs tracking-wider text-(--color-text-light) font-medium">Progress</span>
                  <span class="text-sm text-(--color-text)">
                    {fileTransferCurrentIndex + 1} / {fileTransferChunks.length}
                  </span>
                </div>
                <!-- Progress bar -->
                <div class="w-full h-2 bg-(--color-bg) border border-(--color-border) overflow-hidden">
                  <div
                    class="h-full bg-(--color-accent) transition-all duration-150"
                    style="width: {((fileTransferCurrentIndex + 1) / fileTransferChunks.length) * 100}%"
                  ></div>
                </div>
                <!-- Clickable progress -->
                <input
                  type="range"
                  min="0"
                  max={fileTransferChunks.length - 1}
                  bind:value={fileTransferCurrentIndex}
                  oninput={() => generateTransferQr()}
                  class="w-full accent-(--color-accent)"
                />
              </div>

              <!-- Navigation buttons -->
              <div class="flex gap-2">
                <button
                  onclick={goToPrevChunk}
                  disabled={fileTransferCurrentIndex === 0}
                  class="flex-1 px-4 py-2 text-sm border border-(--color-border) text-(--color-text) hover:bg-(--color-bg-alt) transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                {#if fileTransferState === "playing"}
                  <button
                    onclick={stopFileTransferPlayback}
                    class="flex-1 px-4 py-2 text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors"
                  >
                    Stop
                  </button>
                {:else}
                  <button
                    onclick={startFileTransferPlayback}
                    class="flex-1 px-4 py-2 text-sm font-medium bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) transition-colors"
                  >
                    Play
                  </button>
                {/if}
                <button
                  onclick={goToNextChunk}
                  disabled={fileTransferCurrentIndex === fileTransferChunks.length - 1}
                  class="flex-1 px-4 py-2 text-sm border border-(--color-border) text-(--color-text) hover:bg-(--color-bg-alt) transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>

              <!-- Speed control -->
              <div class="flex flex-col gap-2">
                <label for="transfer-speed" class="text-xs tracking-wider text-(--color-text-light) font-medium">
                  Speed: {fileTransferSpeed}ms
                </label>
                <input
                  id="transfer-speed"
                  type="range"
                  min="200"
                  max="2000"
                  step="100"
                  bind:value={fileTransferSpeed}
                  class="w-full accent-(--color-accent)"
                />
                <div class="flex justify-between text-xs text-(--color-text-muted)">
                  <span>Fast (200ms)</span>
                  <span>Slow (2000ms)</span>
                </div>
              </div>
            </div>
          {/if}

          <!-- Warning for large files -->
          {#if fileTransferFile && fileTransferFile.size > 100 * 1024}
            <div class="p-3 border border-yellow-500 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 text-sm">
              Large file detected ({(fileTransferFile.size / 1024).toFixed(0)}KB).
              This will generate {fileTransferChunks.length} QR codes and may take a while to scan.
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
          {#if fileTransferQrSvg}
            <span class="text-xs text-(--color-text-muted)">
              Chunk {fileTransferCurrentIndex + 1} of {fileTransferChunks.length}
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
          {#if fileTransferQrSvg}
            <div class="max-w-full max-h-full">
              {@html fileTransferQrSvg}
            </div>
          {:else}
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
