<script lang="ts">
  import {
    env,
    pipeline,
    type ImageSegmentationPipeline,
    RawImage,
  } from "@huggingface/transformers";

  // Configuration for transformers.js
  env.allowLocalModels = false;

  // Available devices
  const DEVICES = [
    { value: "auto", label: "Auto" },
    { value: "webgpu", label: "WebGPU (Fastest)" },
    { value: "wasm", label: "WASM (Standard)" },
    { value: "cpu", label: "CPU (Slowest)" },
  ];

  // Available models
  const MODELS = [
    { value: "briaai/RMBG-1.4", label: "RMBG-1.4 (General Purpose)" },
    { value: "Xenova/modnet", label: "MODNet (Portrait/Matting)" },
  ];

  let imageFile = $state<File | null>(null);
  let imageSrc = $state("");
  let processedImage = $state("");
  let isProcessing = $state(false);
  let progress = $state(0);
  let statusMessage = $state("");
  let errorMessage = $state("");
  let showOriginal = $state(false);
  let previewBackground = $state<"transparent" | "white" | "black">(
    "transparent",
  );

  // Stats
  let originalSize = $state(0);
  let processedSize = $state(0);
  let imageWidth = $state(0);
  let imageHeight = $state(0);

  // Settings
  let selectedDevice = $state("auto");
  let selectedModel = $state("briaai/RMBG-1.4");

  let segmenter = $state<ImageSegmentationPipeline | null>(null);
  let currentModelId = $state("");

  async function initModel() {
    // Re-initialize if model changed or segmenter not exists
    if (segmenter && currentModelId === selectedModel) {
      return segmenter;
    }

    try {
      statusMessage = `Loading ${selectedModel}...`;

      // Update environment based on device selection
      if (selectedDevice === "webgpu") {
        // specific check if needed, but 'webgpu' as backend name usually works if supported
        // env.backends.onnx.wasm.numThreads = 1; // sometimes needed
      }

      const instance = await pipeline("image-segmentation", selectedModel, {
        device: selectedDevice as any,
        progress_callback: (p: any) => {
          if (p.status === "progress") {
            progress = p.progress;
          } else if (p.status === "ready") {
            progress = 100;
          }
        },
      });

      segmenter = instance as ImageSegmentationPipeline;
      currentModelId = selectedModel;
      return segmenter;
    } catch (err: any) {
      errorMessage = `Failed to load model: ${err.message}`;
      if (selectedDevice === "webgpu") {
        errorMessage +=
          ". WebGPU might not be available or supported in this browser.";
      }
      throw err;
    }
  }

  function handleFileChange(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      loadImage(target.files[0]);
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith("image/")) {
        loadImage(file);
      } else {
        errorMessage = "Please drop an image file";
      }
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
  }

  function loadImage(file: File) {
    imageFile = file;
    errorMessage = "";
    processedImage = "";
    progress = 0;
    statusMessage = "";

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      imageSrc = result;
      originalSize = file.size;

      const img = new Image();
      img.onload = () => {
        imageWidth = img.width;
        imageHeight = img.height;
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  }

  function formatFileSize(bytes: number): string {
    if (bytes === 0) return "0 B";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  }

  async function removeBackground() {
    if (!imageSrc) return;

    try {
      isProcessing = true;
      errorMessage = "";
      statusMessage = "Processing image...";
      progress = 0;

      const model = await initModel();

      statusMessage = "Removing background...";
      const result = await model(imageSrc);

      // Handle the output properly
      // RMBG-1.4 and MODNet might handle output differently in transformers.js versions
      // Usually result is { mask: RawImage } or just RawImage

      let mask: RawImage;

      // Debug logging to understand structure if it fails again
      // console.log("Model Result:", result);

      if ((result as any).mask && (result as any).mask instanceof RawImage) {
        mask = (result as any).mask;
      } else if (result instanceof RawImage) {
        mask = result;
      } else if (Array.isArray(result) && result[0]?.mask instanceof RawImage) {
        mask = result[0].mask;
      } else {
        // Try to coerce whatever we got to an image if it looks like one, or fail gracefully
        if (typeof (result as any).toCanvas === "function") {
          // It is a RawImage-like object
          mask = result as unknown as RawImage;
        } else {
          throw new Error("Unexpected model output format");
        }
      }

      // Convert result to canvas/blob for display
      const canvas = mask.toCanvas();

      // If the model returns just a mask (white/black), we need to apply it to the original image
      // But image-segmentation pipeline typically returns the masked image or we might need to composite it.
      // RMBG-1.4 usually returns the RGBA image directly? No, it returns a mask actually in some cases.
      // Let's check documentation for RMBG-1.4 in transformers.js.
      // Actually image-segmentation pipeline usually returns { mask: RawImage, label: string }[] OR just the mask RawImage.
      // But typically we want the RGBA result.
      // Transformers.js pipeline behavior: 'image-segmentation' usually returns masks.
      // For background removal specifically, current pipeline implementation tries to be helpful.
      // If we simply get a black/white mask, we need to composite.

      // However, for RMBG-1.4 specific pipeline usage often implies getting the alpha matte.
      // Let's assume 'canvas' contains the mask.

      // If we look at addyosmani/bg-remove code or similar implementations:
      // They often use specific post-processing.
      // But let's look at what we likely have.

      // If the model is RMBG-1.4, it returns an alpha matte.
      // We need to apply this alpha matte to the original image.

      // Load original image to canvas
      const originalImg = new Image();
      originalImg.crossOrigin = "anonymous";
      await new Promise((resolve) => {
        originalImg.onload = resolve;
        originalImg.src = imageSrc;
      });

      const outCanvas = document.createElement("canvas");
      outCanvas.width = originalImg.width;
      outCanvas.height = originalImg.height;
      const ctx = outCanvas.getContext("2d");

      if (!ctx) throw new Error("Could not create canvas context");

      // Draw original
      ctx.drawImage(originalImg, 0, 0);

      // Get image data
      const imgData = ctx.getImageData(0, 0, outCanvas.width, outCanvas.height);
      const pixelData = imgData.data;

      // Get mask data
      // Ensure mask is resized to match original if needed, but usually it matches
      let maskData: Uint8ClampedArray | undefined;

      if (
        canvas.width !== outCanvas.width ||
        canvas.height !== outCanvas.height
      ) {
        // Resize mask canvas if needed
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = outCanvas.width;
        tempCanvas.height = outCanvas.height;
        const tempCtx = tempCanvas.getContext("2d");
        if (tempCtx) {
          tempCtx.drawImage(canvas, 0, 0, outCanvas.width, outCanvas.height);
          maskData = tempCtx.getImageData(
            0,
            0,
            outCanvas.width,
            outCanvas.height,
          ).data;
        }
      } else {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          maskData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        }
      }

      if (maskData) {
        // Apply mask to alpha channel
        // Mask is likely grayscale (R=G=B=Mask/Alpha) or just Alpha
        for (let i = 0; i < pixelData.length; i += 4) {
          // Use red channel of mask as alpha
          // If mask is 255 (white) keep, 0 (black) remove
          // RMBG-1.4 returns 0-255 values
          pixelData[i + 3] = maskData[i];
        }
        ctx.putImageData(imgData, 0, 0);
        processedImage = outCanvas.toDataURL("image/png");
      } else {
        processedImage = canvas.toDataURL("image/png");
      }

      // Calculate processed size
      const base64Length = processedImage.split(",")[1]?.length || 0;
      processedSize = Math.ceil((base64Length * 3) / 4);

      statusMessage = "Done!";
    } catch (err: any) {
      errorMessage = `Error processing image: ${err.message}`;
      console.error(err);
    } finally {
      isProcessing = false;
    }
  }

  function downloadImage() {
    if (!processedImage) return;
    const link = document.createElement("a");
    link.href = processedImage;
    link.download = `bg-removed-${Date.now()}.png`;
    link.click();
  }

  function clear() {
    imageFile = null;
    imageSrc = "";
    processedImage = "";
    errorMessage = "";
    statusMessage = "";
    statusMessage = "";
    progress = 0;
    originalSize = 0;
    processedSize = 0;
    imageWidth = 0;
    imageHeight = 0;
  }
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Remove backgrounds from images instantly in your browser using AI. All
      processing happens locally on your device.
    </p>
  </header>

  {#if errorMessage}
    <div
      class="mb-4 p-3 border border-red-500 bg-red-500/10 text-red-500 text-sm"
    >
      {errorMessage}
    </div>
  {/if}

  <div class="flex flex-col lg:flex-row gap-6 flex-1">
    <!-- Controls -->
    <div class="lg:w-80 flex flex-col gap-4">
      <div
        class="px-4 py-2 border border-(--color-border) bg-(--color-bg-alt) flex flex-col gap-2"
      >
        <h3
          class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium"
        >
          Settings
        </h3>

        <!-- Device Selection -->
        <div>
          <label
            for="device-select"
            class="block text-xs text-(--color-text-muted) mb-1">Device</label
          >
          <select
            id="device-select"
            bind:value={selectedDevice}
            disabled={isProcessing}
            class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer"
          >
            {#each DEVICES as device}
              <option value={device.value}>{device.label}</option>
            {/each}
          </select>
        </div>

        <!-- Model Selection -->
        <div>
          <label
            for="model-select"
            class="block text-xs text-(--color-text-muted) mb-1">Model</label
          >
          <select
            id="model-select"
            bind:value={selectedModel}
            disabled={isProcessing}
            class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer"
          >
            {#each MODELS as model}
              <option value={model.value}>{model.label}</option>
            {/each}
          </select>
          {#if selectedModel === "Xenova/modnet" && selectedDevice !== "webgpu"}
            <p class="text-xs text-yellow-500 mt-1">
              Note: MODNet is optimized for WebGPU.
            </p>
          {/if}
        </div>

        <div class="h-px bg-(--color-border) my-2"></div>

        <button
          onclick={removeBackground}
          disabled={isProcessing || !!processedImage || !imageSrc}
          class="w-full px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {#if isProcessing}
            Processing...
          {:else if processedImage}
            Background Removed
          {:else}
            Remove Background
          {/if}
        </button>

        {#if processedImage}
          <button
            onclick={downloadImage}
            class="w-full px-4 py-2 border border-(--color-border) text-(--color-text) text-sm font-medium hover:bg-(--color-bg) transition-all"
          >
            Download Result
          </button>

          <button
            onclick={() => (processedImage = "")}
            class="w-full px-4 py-2 text-sm text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            Reset
          </button>
        {/if}
      </div>

      <div
        class="px-4 py-2 bg-blue-500/10 border border-blue-500/20 text-blue-500 text-xs leading-relaxed"
      >
        <p>
          <strong>Note:</strong> The first time you use a model, it will download
          (~30-50MB). WebGPU offers significantly faster performance on supported
          devices.
        </p>
      </div>

      <!-- About Models -->
      <div
        class="px-4 py-2 border border-(--color-border) bg-(--color-bg-alt) flex flex-col gap-2"
      >
        <details>
          <summary
            class="text-sm cursor-pointer text-(--color-text-muted) hover:text-(--color-accent) transition-colors"
          >
            About Models
          </summary>
          <div class="flex flex-col gap-1 text-xs text-(--color-text-muted)">
            <a
              href="https://huggingface.co/briaai/RMBG-1.4"
              target="_blank"
              rel="noopener noreferrer"
              class="hover:text-(--color-accent) transition-colors flex items-center gap-1"
            >
              RMBG-1.4 (Bria AI) ↗
            </a>
            <a
              href="https://huggingface.co/Xenova/modnet"
              target="_blank"
              rel="noopener noreferrer"
              class="hover:text-(--color-accent) transition-colors flex items-center gap-1"
            >
              MODNet (Xenova) ↗
            </a>
            <a
              href="https://huggingface.co/docs/transformers.js"
              target="_blank"
              rel="noopener noreferrer"
              class="hover:text-(--color-accent) transition-colors flex items-center gap-1"
            >
              Transformers.js ↗
            </a>
          </div>
        </details>
      </div>
    </div>

    <!-- Input / Preview -->
    <div class="flex-1 flex flex-col">
      {#if !imageSrc}
        <div
          ondrop={handleDrop}
          ondragover={handleDragOver}
          role="region"
          aria-label="Image handling area"
          class="flex-1 min-h-[400px] border-2 border-dashed border-(--color-border) flex flex-col items-center justify-center p-4 hover:border-(--color-accent) transition-colors cursor-pointer"
        >
          <input
            type="file"
            accept="image/*"
            onchange={handleFileChange}
            class="hidden"
            id="image-input"
          />
          <label
            for="image-input"
            class="cursor-pointer text-center w-full h-full flex flex-col items-center justify-center"
          >
            <div class="text-5xl mb-4">🪄</div>
            <p class="text-lg font-medium text-(--color-text) mb-2">
              Drop an image here or click to select
            </p>
            <p class="text-sm text-(--color-text-muted)">
              Supports PNG, JPG, WebP
            </p>
          </label>
        </div>
      {:else}
        <div class="flex-1 flex flex-col">
          <div class="flex items-center justify-between mb-2">
            <span
              class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium"
            >
              {processedImage ? "Result" : "Original Image"}
            </span>
            <div class="flex items-center gap-3">
              {#if imageWidth > 0 && imageHeight > 0}
                <div class="mt-2 text-xs text-(--color-text-muted) text-center">
                  {imageWidth} x {imageHeight}px • {showOriginal
                    ? formatFileSize(originalSize)
                    : processedImage
                      ? formatFileSize(processedSize)
                      : formatFileSize(originalSize)}
                </div>
              {/if}
              {#if processedImage}
                <div
                  class="flex items-center border border-(--color-border) overflow-hidden"
                >
                  <button
                    onclick={() => (previewBackground = "transparent")}
                    class="w-10 h-6 flex items-center justify-center bg-(--color-bg-alt) hover:opacity-80 transition-opacity"
                    title="Transparent"
                    aria-label="Transparent background"
                  >
                    <div
                      class="w-8 h-3 bg-[linear-gradient(45deg,#808080_25%,transparent_25%,transparent_75%,#808080_75%,#808080),linear-gradient(45deg,#808080_25%,transparent_25%,transparent_75%,#808080_75%,#808080)] bg-[length:6px_6px] bg-[position:0_0,3px_3px] opacity-40"
                    ></div>
                  </button>
                  <button
                    onclick={() => (previewBackground = "white")}
                    class="w-10 h-6 bg-white hover:opacity-90 transition-opacity border-l border-(--color-border)"
                    title="White"
                    aria-label="White background"
                  ></button>
                  <button
                    onclick={() => (previewBackground = "black")}
                    class="w-10 h-6 bg-black hover:opacity-90 transition-opacity border-l border-(--color-border)"
                    title="Black"
                    aria-label="Black background"
                  ></button>
                </div>
              {/if}
              <button
                onclick={() => (showOriginal = !showOriginal)}
                class="text-xs flex items-center gap-1 px-2 py-1 border border-(--color-border) text-(--color-text-muted) hover:bg-(--color-accent) hover:text-(--color-btn-text) transition-colors"
              >
                {showOriginal ? "Original" : "Result"}
              </button>
              <button
                onclick={clear}
                class="text-xs text-(--color-text-muted) hover:text-(--color-text)"
                disabled={isProcessing}
              >
                Clear
              </button>
            </div>
          </div>
          <div
            class="flex-1 min-h-[400px] border border-(--color-border) flex items-center justify-center p-4 overflow-hidden relative {previewBackground ===
            'transparent'
              ? 'bg-checkerboard'
              : previewBackground === 'white'
                ? 'bg-white'
                : 'bg-black'}"
          >
            <img
              src={showOriginal ? imageSrc : processedImage || imageSrc}
              alt="Preview"
              class="max-w-full max-h-full object-contain relative z-10"
            />

            {#if isProcessing}
              <div
                class="absolute inset-0 bg-(--color-bg)/80 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center z-20"
              >
                <div class="w-full max-w-xs">
                  <p class="text-sm font-medium mb-2">{statusMessage}</p>
                  <div
                    class="h-2 w-full bg-(--color-border) rounded-full overflow-hidden"
                  >
                    <div
                      class="h-full bg-(--color-accent) transition-all duration-300"
                      style="width: {progress}%"
                    ></div>
                  </div>
                  <p class="text-xs text-(--color-text-muted) mt-2">
                    {Math.round(progress)}%
                  </p>
                </div>
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  /* Checkerboard background for transparency */
  .bg-checkerboard {
    background-color: var(--color-bg-alt);
  }

  .bg-checkerboard::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 0;
    background-image: linear-gradient(45deg, #80808022 25%, transparent 25%),
      linear-gradient(-45deg, #80808022 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #80808022 75%),
      linear-gradient(-45deg, transparent 75%, #80808022 75%);
    background-size: 20px 20px;
    background-position:
      0 0,
      0 10px,
      10px -10px,
      -10px 0px;
  }
</style>
