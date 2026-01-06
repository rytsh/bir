<script lang="ts">
  type Mode = "encode" | "decode";

  let mode = $state<Mode>("encode");
  let imageFile = $state<File | null>(null);
  let base64Input = $state("");
  let base64Output = $state("");
  let imagePreview = $state("");
  let decodedImage = $state("");
  let copied = $state(false);
  let errorMessage = $state("");
  let imageInfo = $state<{ width: number; height: number; type: string; size: string } | null>(null);

  function handleFileChange(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      imageFile = target.files[0];
      errorMessage = "";
      encodeImage();
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith("image/")) {
        imageFile = file;
        errorMessage = "";
        encodeImage();
      } else {
        errorMessage = "Please drop an image file";
      }
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
  }

  function encodeImage() {
    if (!imageFile) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      base64Output = result;
      imagePreview = result;

      // Get image dimensions
      const img = new Image();
      img.onload = () => {
        imageInfo = {
          width: img.width,
          height: img.height,
          type: imageFile!.type,
          size: formatFileSize(imageFile!.size),
        };
      };
      img.src = result;
    };
    reader.onerror = () => {
      errorMessage = "Failed to read the image file";
    };
    reader.readAsDataURL(imageFile);
  }

  function decodeBase64() {
    errorMessage = "";
    decodedImage = "";

    if (!base64Input.trim()) {
      errorMessage = "Please enter a Base64 string";
      return;
    }

    let dataUrl = base64Input.trim();

    // If it doesn't have data URL prefix, try to add one
    if (!dataUrl.startsWith("data:")) {
      dataUrl = `data:image/png;base64,${dataUrl}`;
    }

    // Validate by trying to create an image
    const img = new Image();
    img.onload = () => {
      decodedImage = dataUrl;
      imageInfo = {
        width: img.width,
        height: img.height,
        type: dataUrl.split(";")[0].split(":")[1] || "image/png",
        size: formatFileSize(Math.ceil((dataUrl.length * 3) / 4)),
      };
    };
    img.onerror = () => {
      errorMessage = "Invalid Base64 image data";
    };
    img.src = dataUrl;
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  }

  function copyToClipboard() {
    navigator.clipboard.writeText(base64Output);
    copied = true;
    setTimeout(() => {
      copied = false;
    }, 2000);
  }

  function downloadImage() {
    if (!decodedImage) return;

    const link = document.createElement("a");
    link.href = decodedImage;
    link.download = "decoded-image.png";
    link.click();
  }

  function clear() {
    imageFile = null;
    base64Input = "";
    base64Output = "";
    imagePreview = "";
    decodedImage = "";
    errorMessage = "";
    imageInfo = null;
  }
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Convert images to Base64 data URIs or decode Base64 strings back to images.
    </p>
  </header>

  <!-- Mode Selection -->
  <div class="mb-4 flex gap-2">
    <button
      onclick={() => { mode = "encode"; clear(); }}
      class="px-4 py-2 text-sm font-medium transition-colors {mode === 'encode' ? 'bg-(--color-accent) text-(--color-btn-text)' : 'border border-(--color-border) text-(--color-text) hover:bg-(--color-bg-alt)'}"
    >
      Encode Image
    </button>
    <button
      onclick={() => { mode = "decode"; clear(); }}
      class="px-4 py-2 text-sm font-medium transition-colors {mode === 'decode' ? 'bg-(--color-accent) text-(--color-btn-text)' : 'border border-(--color-border) text-(--color-text) hover:bg-(--color-bg-alt)'}"
    >
      Decode Base64
    </button>
  </div>

  {#if errorMessage}
    <div class="mb-4 p-3 border border-red-500 bg-red-500/10 text-red-500 text-sm">
      {errorMessage}
    </div>
  {/if}

  {#if mode === "encode"}
    <div class="flex flex-col lg:flex-row gap-4 flex-1">
      <!-- Drop Zone -->
      <div class="flex-1 flex flex-col">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2">
          Input Image
        </span>
        <div
          ondrop={handleDrop}
          ondragover={handleDragOver}
          class="flex-1 min-h-[200px] border-2 border-dashed border-(--color-border) flex flex-col items-center justify-center p-4 hover:border-(--color-accent) transition-colors cursor-pointer"
        >
          <input
            type="file"
            accept="image/*"
            onchange={handleFileChange}
            class="hidden"
            id="file-input"
          />
          {#if imagePreview}
            <img src={imagePreview} alt="Preview" class="max-h-48 max-w-full object-contain mb-4" />
            {#if imageInfo}
              <div class="text-xs text-(--color-text-muted) text-center">
                <p>{imageInfo.width} x {imageInfo.height}px</p>
                <p>{imageInfo.type} - {imageInfo.size}</p>
              </div>
            {/if}
          {:else}
            <label for="file-input" class="cursor-pointer text-center">
              <div class="text-4xl mb-2">🖼️</div>
              <p class="text-sm text-(--color-text)">Drop an image here or click to select</p>
              <p class="text-xs text-(--color-text-muted) mt-1">Supports PNG, JPG, GIF, SVG, WebP</p>
            </label>
          {/if}
        </div>
        {#if imagePreview}
          <label for="file-input" class="mt-2 text-center text-sm text-(--color-accent) cursor-pointer hover:underline">
            Choose a different image
          </label>
        {/if}
      </div>

      <!-- Output -->
      <div class="flex-1 flex flex-col">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">
            Base64 Output
          </span>
          {#if base64Output}
            <button
              onclick={copyToClipboard}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          {/if}
        </div>
        <textarea
          readonly
          value={base64Output}
          placeholder="Base64 data URI will appear here..."
          class="flex-1 min-h-[200px] p-3 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) font-mono text-xs resize-none focus:outline-none"
        ></textarea>
        {#if base64Output}
          <p class="mt-2 text-xs text-(--color-text-muted)">
            Length: {base64Output.length.toLocaleString()} characters
          </p>
        {/if}
      </div>
    </div>
  {:else}
    <div class="flex flex-col lg:flex-row gap-4 flex-1">
      <!-- Input -->
      <div class="flex-1 flex flex-col">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2">
          Base64 Input
        </span>
        <textarea
          bind:value={base64Input}
          placeholder="Paste Base64 string or data URI here..."
          class="flex-1 min-h-[200px] p-3 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) font-mono text-xs resize-none focus:outline-none focus:border-(--color-accent)"
        ></textarea>
        <div class="mt-2 flex gap-2">
          <button
            onclick={decodeBase64}
            class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors"
          >
            Decode
          </button>
          <button
            onclick={clear}
            class="px-4 py-2 border border-(--color-border) text-(--color-text) text-sm font-medium hover:bg-(--color-bg-alt) transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      <!-- Output -->
      <div class="flex-1 flex flex-col">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2">
          Decoded Image
        </span>
        <div class="flex-1 min-h-[200px] border border-(--color-border) bg-(--color-bg-alt) flex flex-col items-center justify-center p-4">
          {#if decodedImage}
            <img src={decodedImage} alt="Decoded" class="max-h-48 max-w-full object-contain mb-4" />
            {#if imageInfo}
              <div class="text-xs text-(--color-text-muted) text-center mb-4">
                <p>{imageInfo.width} x {imageInfo.height}px</p>
                <p>{imageInfo.type}</p>
              </div>
            {/if}
            <button
              onclick={downloadImage}
              class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors"
            >
              Download Image
            </button>
          {:else}
            <div class="text-center text-(--color-text-muted)">
              <div class="text-4xl mb-2">🖼️</div>
              <p class="text-sm">Decoded image will appear here</p>
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>
