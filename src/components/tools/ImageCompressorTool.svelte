<script lang="ts">
  let imageFile = $state<File | null>(null);
  let imageSrc = $state("");
  let compressedImage = $state("");
  let quality = $state(80);
  let maxWidth = $state(0);
  let maxHeight = $state(0);
  let outputFormat = $state<"jpeg" | "png" | "webp">("jpeg");
  let errorMessage = $state("");
  let isProcessing = $state(false);

  interface ImageStats {
    width: number;
    height: number;
    size: number;
  }

  let originalStats = $state<ImageStats | null>(null);
  let compressedStats = $state<ImageStats | null>(null);

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
    compressedImage = "";
    compressedStats = null;

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      imageSrc = result;

      const img = new Image();
      img.onload = () => {
        originalStats = {
          width: img.width,
          height: img.height,
          size: file.size,
        };
        maxWidth = img.width;
        maxHeight = img.height;
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  }

  async function compressImage() {
    if (!imageSrc || !originalStats) return;

    isProcessing = true;
    errorMessage = "";

    try {
      const img = new Image();
      img.src = imageSrc;
      await new Promise((resolve) => { img.onload = resolve; });

      // Calculate new dimensions
      let newWidth = originalStats.width;
      let newHeight = originalStats.height;

      if (maxWidth > 0 && maxWidth < originalStats.width) {
        newWidth = maxWidth;
        newHeight = Math.round((maxWidth / originalStats.width) * originalStats.height);
      }

      if (maxHeight > 0 && maxHeight < newHeight) {
        newHeight = maxHeight;
        newWidth = Math.round((maxHeight / originalStats.height) * originalStats.width);
      }

      const canvas = document.createElement("canvas");
      canvas.width = newWidth;
      canvas.height = newHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not get canvas context");

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, newWidth, newHeight);

      const mimeType = `image/${outputFormat}`;
      const compressedDataUrl = canvas.toDataURL(mimeType, quality / 100);

      compressedImage = compressedDataUrl;

      // Calculate compressed size
      const base64Length = compressedDataUrl.split(",")[1]?.length || 0;
      const compressedSize = Math.ceil((base64Length * 3) / 4);

      compressedStats = {
        width: newWidth,
        height: newHeight,
        size: compressedSize,
      };
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : "Compression failed";
    } finally {
      isProcessing = false;
    }
  }

  function downloadImage() {
    if (!compressedImage) return;

    const link = document.createElement("a");
    link.href = compressedImage;
    link.download = `compressed.${outputFormat}`;
    link.click();
  }

  function clear() {
    imageFile = null;
    imageSrc = "";
    compressedImage = "";
    originalStats = null;
    compressedStats = null;
    errorMessage = "";
    maxWidth = 0;
    maxHeight = 0;
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  }

  let savings = $derived(() => {
    if (!originalStats || !compressedStats) return 0;
    return Math.round((1 - compressedStats.size / originalStats.size) * 100);
  });

  let compressionRatio = $derived(() => {
    if (!originalStats || !compressedStats) return "1:1";
    const ratio = originalStats.size / compressedStats.size;
    return `${ratio.toFixed(1)}:1`;
  });
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Compress JPEG, PNG, and WebP images to reduce file size.
    </p>
  </header>

  {#if errorMessage}
    <div class="mb-4 p-3 border border-red-500 bg-red-500/10 text-red-500 text-sm">
      {errorMessage}
    </div>
  {/if}

  <div class="flex flex-col lg:flex-row gap-6 flex-1">
    <!-- Input -->
    <div class="flex-1 flex flex-col">
      {#if !imageSrc}
        <div
          ondrop={handleDrop}
          ondragover={handleDragOver}
          class="flex-1 min-h-[300px] border-2 border-dashed border-(--color-border) flex flex-col items-center justify-center p-4 hover:border-(--color-accent) transition-colors cursor-pointer"
        >
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onchange={handleFileChange}
            class="hidden"
            id="compressor-input"
          />
          <label for="compressor-input" class="cursor-pointer text-center">
            <div class="text-4xl mb-2">🗜️</div>
            <p class="text-sm text-(--color-text)">Drop an image or click to select</p>
            <p class="text-xs text-(--color-text-muted) mt-1">Supports JPEG, PNG, WebP</p>
          </label>
        </div>
      {:else}
        <div class="flex-1 flex flex-col gap-4">
          <div class="grid grid-cols-2 gap-4 flex-1">
            <!-- Original -->
            <div class="flex flex-col">
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">
                  Original
                </span>
                <button
                  onclick={clear}
                  class="text-xs text-(--color-text-muted) hover:text-(--color-text)"
                >
                  Clear
                </button>
              </div>
              <div class="flex-1 min-h-[200px] border border-(--color-border) bg-(--color-bg-alt) flex items-center justify-center p-2 overflow-hidden">
                <img src={imageSrc} alt="Original" class="max-w-full max-h-full object-contain" />
              </div>
              {#if originalStats}
                <div class="mt-2 text-xs text-(--color-text-muted) text-center">
                  {originalStats.width} x {originalStats.height}px | {formatFileSize(originalStats.size)}
                </div>
              {/if}
            </div>

            <!-- Compressed -->
            <div class="flex flex-col">
              <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2">
                Compressed
              </span>
              <div class="flex-1 min-h-[200px] border border-(--color-border) bg-(--color-bg-alt) flex items-center justify-center p-2 overflow-hidden">
                {#if compressedImage}
                  <img src={compressedImage} alt="Compressed" class="max-w-full max-h-full object-contain" />
                {:else}
                  <p class="text-sm text-(--color-text-muted)">Compressed image</p>
                {/if}
              </div>
              {#if compressedStats}
                <div class="mt-2 text-xs text-(--color-text-muted) text-center">
                  {compressedStats.width} x {compressedStats.height}px | {formatFileSize(compressedStats.size)}
                </div>
              {/if}
            </div>
          </div>

          {#if compressedStats && originalStats}
            <div class="p-4 border border-(--color-border) bg-(--color-bg-alt) flex flex-wrap gap-4 justify-center">
              <div class="text-center">
                <span class="text-xs text-(--color-text-muted) block">Original</span>
                <span class="text-lg font-bold text-(--color-text)">{formatFileSize(originalStats.size)}</span>
              </div>
              <div class="text-center">
                <span class="text-xs text-(--color-text-muted) block">Compressed</span>
                <span class="text-lg font-bold text-(--color-text)">{formatFileSize(compressedStats.size)}</span>
              </div>
              <div class="text-center">
                <span class="text-xs text-(--color-text-muted) block">Savings</span>
                <span class="text-lg font-bold {savings() > 0 ? 'text-green-500' : 'text-red-500'}">{savings()}%</span>
              </div>
              <div class="text-center">
                <span class="text-xs text-(--color-text-muted) block">Ratio</span>
                <span class="text-lg font-bold text-(--color-text)">{compressionRatio()}</span>
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Controls -->
    {#if imageSrc}
      <div class="lg:w-72 flex flex-col gap-4">
        <!-- Quality -->
        <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3 block">
            Quality: {quality}%
          </span>
          <input
            type="range"
            min="1"
            max="100"
            bind:value={quality}
            class="w-full accent-(--color-accent)"
          />
          <div class="flex justify-between text-xs text-(--color-text-muted) mt-1">
            <span>Low</span>
            <span>High</span>
          </div>
        </div>

        <!-- Max Dimensions -->
        <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3 block">
            Max Dimensions (0 = no resize)
          </span>
          <div class="flex gap-2">
            <div class="flex-1">
              <label class="text-xs text-(--color-text-muted) mb-1 block">Width</label>
              <input
                type="number"
                min="0"
                max="10000"
                bind:value={maxWidth}
                class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)"
              />
            </div>
            <div class="flex-1">
              <label class="text-xs text-(--color-text-muted) mb-1 block">Height</label>
              <input
                type="number"
                min="0"
                max="10000"
                bind:value={maxHeight}
                class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)"
              />
            </div>
          </div>
        </div>

        <!-- Output Format -->
        <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3 block">
            Output Format
          </span>
          <div class="flex gap-2">
            {#each ["jpeg", "png", "webp"] as format}
              <button
                onclick={() => outputFormat = format as "jpeg" | "png" | "webp"}
                class="flex-1 px-3 py-2 text-sm font-medium transition-colors {outputFormat === format ? 'bg-(--color-accent) text-(--color-btn-text)' : 'border border-(--color-border) text-(--color-text) hover:bg-(--color-bg)'}"
              >
                {format.toUpperCase()}
              </button>
            {/each}
          </div>
          <p class="mt-2 text-xs text-(--color-text-muted)">
            {#if outputFormat === "jpeg"}
              Best for photos. Lossy compression.
            {:else if outputFormat === "png"}
              Best for graphics. Lossless, larger files.
            {:else}
              Modern format. Better compression.
            {/if}
          </p>
        </div>

        <!-- Quick Presets -->
        <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3 block">
            Quick Presets
          </span>
          <div class="grid grid-cols-2 gap-2">
            <button
              onclick={() => { quality = 90; }}
              class="px-2 py-1 text-xs border border-(--color-border) text-(--color-text) hover:bg-(--color-bg) transition-colors"
            >
              High (90%)
            </button>
            <button
              onclick={() => { quality = 80; }}
              class="px-2 py-1 text-xs border border-(--color-border) text-(--color-text) hover:bg-(--color-bg) transition-colors"
            >
              Medium (80%)
            </button>
            <button
              onclick={() => { quality = 60; }}
              class="px-2 py-1 text-xs border border-(--color-border) text-(--color-text) hover:bg-(--color-bg) transition-colors"
            >
              Low (60%)
            </button>
            <button
              onclick={() => { quality = 40; }}
              class="px-2 py-1 text-xs border border-(--color-border) text-(--color-text) hover:bg-(--color-bg) transition-colors"
            >
              Very Low (40%)
            </button>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex flex-col gap-2">
          <button
            onclick={compressImage}
            disabled={isProcessing}
            class="w-full px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50"
          >
            {isProcessing ? "Compressing..." : "Compress Image"}
          </button>
          {#if compressedImage}
            <button
              onclick={downloadImage}
              class="w-full px-4 py-2 border border-(--color-border) text-(--color-text) text-sm font-medium hover:bg-(--color-bg-alt) transition-colors"
            >
              Download
            </button>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>
