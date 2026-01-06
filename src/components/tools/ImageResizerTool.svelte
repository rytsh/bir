<script lang="ts">
  let imageFile = $state<File | null>(null);
  let imageSrc = $state("");
  let originalWidth = $state(0);
  let originalHeight = $state(0);
  let newWidth = $state(0);
  let newHeight = $state(0);
  let lockAspectRatio = $state(true);
  let outputFormat = $state<"png" | "jpeg" | "webp">("png");
  let quality = $state(92);
  let errorMessage = $state("");
  let processedImage = $state("");

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

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      imageSrc = result;

      const img = new Image();
      img.onload = () => {
        originalWidth = img.width;
        originalHeight = img.height;
        newWidth = img.width;
        newHeight = img.height;
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  }

  function updateWidth(value: number) {
    newWidth = Math.max(1, value);
    if (lockAspectRatio && originalWidth > 0) {
      newHeight = Math.round((newWidth / originalWidth) * originalHeight);
    }
  }

  function updateHeight(value: number) {
    newHeight = Math.max(1, value);
    if (lockAspectRatio && originalHeight > 0) {
      newWidth = Math.round((newHeight / originalHeight) * originalWidth);
    }
  }

  function resizeImage() {
    if (!imageSrc) return;

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = newWidth;
      canvas.height = newHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Enable image smoothing for better quality
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      ctx.drawImage(img, 0, 0, newWidth, newHeight);

      const mimeType = `image/${outputFormat}`;
      const q = outputFormat === "png" ? undefined : quality / 100;
      processedImage = canvas.toDataURL(mimeType, q);
    };
    img.src = imageSrc;
  }

  function downloadImage() {
    if (!processedImage) return;

    const link = document.createElement("a");
    link.href = processedImage;
    link.download = `resized-${newWidth}x${newHeight}.${outputFormat}`;
    link.click();
  }

  function reset() {
    if (originalWidth && originalHeight) {
      newWidth = originalWidth;
      newHeight = originalHeight;
      processedImage = "";
    }
  }

  function clear() {
    imageFile = null;
    imageSrc = "";
    originalWidth = 0;
    originalHeight = 0;
    newWidth = 0;
    newHeight = 0;
    processedImage = "";
    errorMessage = "";
  }

  function applyPreset(scale: number) {
    newWidth = Math.round(originalWidth * scale);
    newHeight = Math.round(originalHeight * scale);
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  }

  let processedSize = $derived(() => {
    if (!processedImage) return "";
    const base64Length = processedImage.split(",")[1]?.length || 0;
    const bytes = Math.ceil((base64Length * 3) / 4);
    return formatFileSize(bytes);
  });
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Resize and scale images in browser with aspect ratio control.
    </p>
  </header>

  {#if errorMessage}
    <div class="mb-4 p-3 border border-red-500 bg-red-500/10 text-red-500 text-sm">
      {errorMessage}
    </div>
  {/if}

  <div class="flex flex-col lg:flex-row gap-6 flex-1">
    <!-- Input / Preview -->
    <div class="flex-1 flex flex-col">
      {#if !imageSrc}
        <div
          ondrop={handleDrop}
          ondragover={handleDragOver}
          class="flex-1 min-h-[300px] border-2 border-dashed border-(--color-border) flex flex-col items-center justify-center p-4 hover:border-(--color-accent) transition-colors cursor-pointer"
        >
          <input
            type="file"
            accept="image/*"
            onchange={handleFileChange}
            class="hidden"
            id="image-input"
          />
          <label for="image-input" class="cursor-pointer text-center">
            <div class="text-4xl mb-2">📏</div>
            <p class="text-sm text-(--color-text)">Drop an image here or click to select</p>
            <p class="text-xs text-(--color-text-muted) mt-1">Supports PNG, JPG, GIF, WebP</p>
          </label>
        </div>
      {:else}
        <div class="flex-1 flex flex-col">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">
              {processedImage ? "Resized Image" : "Original Image"}
            </span>
            <button
              onclick={clear}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text)"
            >
              Clear
            </button>
          </div>
          <div class="flex-1 min-h-[300px] border border-(--color-border) bg-(--color-bg-alt) flex items-center justify-center p-4 overflow-hidden">
            <img
              src={processedImage || imageSrc}
              alt="Preview"
              class="max-w-full max-h-full object-contain"
            />
          </div>
          <div class="mt-2 text-xs text-(--color-text-muted) text-center">
            {#if processedImage}
              {newWidth} x {newHeight}px - {processedSize()}
            {:else}
              Original: {originalWidth} x {originalHeight}px - {imageFile ? formatFileSize(imageFile.size) : ""}
            {/if}
          </div>
        </div>
      {/if}
    </div>

    <!-- Controls -->
    {#if imageSrc}
      <div class="lg:w-80 flex flex-col gap-4">
        <!-- Dimensions -->
        <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3 block">
            Dimensions
          </span>

          <div class="flex gap-3 mb-3 items-center">
            <div class="flex-1">
              <label class="text-xs text-(--color-text-muted) mb-1 block">Width</label>
              <input
                type="number"
                min="1"
                max="10000"
                value={newWidth}
                oninput={(e) => updateWidth(parseInt((e.target as HTMLInputElement).value) || 1)}
                class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)"
              />
            </div>
            <button
              onclick={() => lockAspectRatio = !lockAspectRatio}
              class="p-1 border transition-colors bg-transparent text-(--color-text) border-(--color-border) hover:border-(--color-accent)"
              title={lockAspectRatio ? "Unlock aspect ratio" : "Lock aspect ratio"}
            >
              {lockAspectRatio ? "🔗" : "🔓"}
            </button>
            <div class="flex-1">
              <label class="text-xs text-(--color-text-muted) mb-1 block">Height</label>
              <input
                type="number"
                min="1"
                max="10000"
                value={newHeight}
                oninput={(e) => updateHeight(parseInt((e.target as HTMLInputElement).value) || 1)}
                class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)"
              />
            </div>
          </div>

          <button
            onclick={reset}
            class="w-full px-3 py-1 text-xs border border-(--color-border) text-(--color-text) hover:bg-(--color-bg) transition-colors"
          >
            Reset to Original
          </button>
        </div>

        <!-- Quick Scale -->
        <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3 block">
            Quick Scale
          </span>
          <div class="grid grid-cols-4 gap-2">
            {#each [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3] as scale}
              <button
                onclick={() => applyPreset(scale)}
                class="px-2 py-1 text-xs border border-(--color-border) text-(--color-text) hover:bg-(--color-bg) transition-colors"
              >
                {scale * 100}%
              </button>
            {/each}
          </div>
        </div>

        <!-- Output Format -->
        <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3 block">
            Output Format
          </span>
          <select
            bind:value={outputFormat}
            class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer mb-3"
          >
            <option value="png">PNG</option>
            <option value="jpeg">JPEG</option>
            <option value="webp">WebP</option>
          </select>

          {#if outputFormat !== "png"}
            <div>
              <label class="text-xs text-(--color-text-muted) mb-1 block">Quality: {quality}%</label>
              <input
                type="range"
                min="1"
                max="100"
                bind:value={quality}
                class="w-full accent-(--color-accent)"
              />
            </div>
          {/if}
        </div>

        <!-- Actions -->
        <div class="flex flex-col gap-2">
          <button
            onclick={resizeImage}
            class="w-full px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors"
          >
            Resize Image
          </button>
          {#if processedImage}
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
