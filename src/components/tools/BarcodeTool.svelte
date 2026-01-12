<script lang="ts">
  import { onMount } from "svelte";
  import bwipjs from "@bwip-js/browser";
  import jsQR from "jsqr";

  type TabType = "barcode" | "wifi" | "reader";
  type OutputFormat = "png" | "svg" | "ascii";
  type FrameStyle = "none" | "simple" | "rounded" | "bold" | "double";
  type WifiEncryption = "WPA" | "WEP" | "nopass";
  type ReaderMode = "file" | "camera";

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
          readerResult = result;
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

  const startScanning = () => {
    if (scanInterval) {
      clearInterval(scanInterval);
    }

    scanInterval = window.setInterval(async () => {
      if (!cameraVideoElement || !cameraActive) return;

      try {
        const result = await detectBarcode(cameraVideoElement);
        if (result) {
          readerResult = result;
          // Don't stop camera, just show result - user can continue scanning
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
  };

  // Auto-generate on mount and when relevant inputs change
  onMount(() => {
    generateBarcode();
    // jsQR works everywhere, so reader is always supported
    readerSupported = true;
    
    return () => {
      stopCamera();
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
            <div class="flex gap-2">
              <button
                onclick={() => { readerMode = "file"; stopCamera(); }}
                class="flex-1 px-4 py-2 text-sm border transition-colors {readerMode === 'file'
                  ? 'border-(--color-accent) bg-(--color-accent) text-(--color-btn-text)'
                  : 'border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:border-(--color-accent)'}"
              >
                Upload File
              </button>
              <button
                onclick={() => { readerMode = "camera"; readerImagePreview = null; }}
                class="flex-1 px-4 py-2 text-sm border transition-colors {readerMode === 'camera'
                  ? 'border-(--color-accent) bg-(--color-accent) text-(--color-btn-text)'
                  : 'border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:border-(--color-accent)'}"
              >
                Use Camera
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
          {:else}
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
          {/if}

          <!-- Reader Result -->
          {#if readerResult}
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
          {#if readerResult || readerImagePreview || cameraActive}
            <button
              onclick={clearReader}
              class="w-full px-4 py-2 text-sm border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              Clear
            </button>
          {/if}
        </div>
      {/if}

      {#if activeTab !== "reader"}

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
            Preview
          </span>
        </div>

        <!-- Reader Error -->
        {#if readerError}
          <div class="mb-4 p-3 border border-red-500 bg-red-500/10 text-red-500 text-sm">
            {readerError}
          </div>
        {/if}

        <!-- Reader Preview Display -->
        <div class="flex-1 border border-(--color-border) bg-black overflow-hidden flex items-center justify-center">
          {#if readerMode === "camera" && cameraActive}
            <video
              bind:this={cameraVideoElement}
              autoplay
              playsinline
              muted
              class="w-full h-full object-contain"
            ></video>
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
              {:else}
                Start camera to scan
              {/if}
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
