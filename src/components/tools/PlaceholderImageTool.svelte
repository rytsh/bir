<script lang="ts">
  let width = $state(800);
  let height = $state(600);
  let backgroundColor = $state("#cccccc");
  let textColor = $state("#666666");
  let text = $state("");
  let fontSize = $state(0);
  let fontFamily = $state("sans-serif");
  let outputFormat = $state<"png" | "jpeg" | "svg">("png");
  let generatedImage = $state("");
  let svgCode = $state("");
  let copied = $state<string | null>(null);

  const presetSizes = [
    { name: "Square S", width: 150, height: 150 },
    { name: "Square M", width: 300, height: 300 },
    { name: "Square L", width: 600, height: 600 },
    { name: "Banner", width: 728, height: 90 },
    { name: "Leaderboard", width: 970, height: 250 },
    { name: "Rectangle", width: 300, height: 250 },
    { name: "HD", width: 1280, height: 720 },
    { name: "Full HD", width: 1920, height: 1080 },
    { name: "Social", width: 1200, height: 630 },
    { name: "Instagram", width: 1080, height: 1080 },
    { name: "Twitter", width: 1500, height: 500 },
    { name: "Thumbnail", width: 150, height: 150 },
  ];

  let displayText = $derived(text || `${width} x ${height}`);
  let autoFontSize = $derived(fontSize > 0 ? fontSize : Math.min(width, height) / 8);

  function generateImage() {
    if (outputFormat === "svg") {
      generateSvg();
    } else {
      generateCanvas();
    }
  }

  function generateCanvas() {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);

    // Text
    ctx.fillStyle = textColor;
    ctx.font = `${autoFontSize}px ${fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(displayText, width / 2, height / 2);

    const mimeType = outputFormat === "jpeg" ? "image/jpeg" : "image/png";
    generatedImage = canvas.toDataURL(mimeType, 0.92);
  }

  function generateSvg() {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect fill="${backgroundColor}" width="${width}" height="${height}"/>
  <text fill="${textColor}" font-family="${fontFamily}" font-size="${autoFontSize}" x="50%" y="50%" dominant-baseline="middle" text-anchor="middle">${displayText}</text>
</svg>`;
    svgCode = svg;
    generatedImage = `data:image/svg+xml;base64,${btoa(svg)}`;
  }

  function downloadImage() {
    if (!generatedImage) return;

    const ext = outputFormat;
    const link = document.createElement("a");
    link.href = generatedImage;
    link.download = `placeholder-${width}x${height}.${ext}`;
    link.click();
  }

  function copyDataUrl() {
    if (!generatedImage) return;
    navigator.clipboard.writeText(generatedImage);
    copied = "url";
    setTimeout(() => { copied = null; }, 2000);
  }

  function copyImgTag() {
    if (!generatedImage) return;
    const tag = `<img src="${generatedImage}" width="${width}" height="${height}" alt="Placeholder ${width}x${height}" />`;
    navigator.clipboard.writeText(tag);
    copied = "img";
    setTimeout(() => { copied = null; }, 2000);
  }

  function copySvgCode() {
    if (!svgCode) return;
    navigator.clipboard.writeText(svgCode);
    copied = "svg";
    setTimeout(() => { copied = null; }, 2000);
  }

  function applyPreset(preset: typeof presetSizes[0]) {
    width = preset.width;
    height = preset.height;
  }

  function swapDimensions() {
    const temp = width;
    width = height;
    height = temp;
  }

  // Auto-generate on parameter change
  $effect(() => {
    // Track dependencies
    const _ = [width, height, backgroundColor, textColor, text, fontSize, fontFamily, outputFormat];
    generateImage();
  });
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Generate placeholder images with custom dimensions, colors, and text.
    </p>
  </header>

  <div class="flex flex-col lg:flex-row gap-6 flex-1">
    <!-- Controls -->
    <div class="lg:w-80 flex flex-col gap-4">
      <!-- Dimensions -->
      <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3 block">
          Dimensions
        </span>
        <div class="flex gap-2 mb-3">
          <div class="flex-1">
            <label class="text-xs text-(--color-text-muted) mb-1 block">Width</label>
            <input
              type="number"
              min="1"
              max="4096"
              bind:value={width}
              class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)"
            />
          </div>
          <div class="flex items-end pb-1">
            <button
              onclick={swapDimensions}
              class="p-2 border border-(--color-border) text-(--color-text) hover:bg-(--color-bg) transition-colors"
              title="Swap dimensions"
            >
              ↔
            </button>
          </div>
          <div class="flex-1">
            <label class="text-xs text-(--color-text-muted) mb-1 block">Height</label>
            <input
              type="number"
              min="1"
              max="4096"
              bind:value={height}
              class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)"
            />
          </div>
        </div>
      </div>

      <!-- Preset Sizes -->
      <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3 block">
          Presets
        </span>
        <div class="grid grid-cols-3 gap-2">
          {#each presetSizes as preset}
            <button
              onclick={() => applyPreset(preset)}
              class="px-2 py-1 text-xs border border-(--color-border) text-(--color-text) hover:bg-(--color-bg) transition-colors"
              title="{preset.width}x{preset.height}"
            >
              {preset.name}
            </button>
          {/each}
        </div>
      </div>

      <!-- Colors -->
      <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3 block">
          Colors
        </span>
        <div class="flex gap-4">
          <div class="flex-1">
            <label class="text-xs text-(--color-text-muted) mb-1 block">Background</label>
            <div class="flex items-center gap-2">
              <div
                class="w-8 h-8 border border-(--color-border) relative cursor-pointer shrink-0"
                style="background-color: {backgroundColor}"
              >
                <input
                  type="color"
                  bind:value={backgroundColor}
                  class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>
              <input
                type="text"
                bind:value={backgroundColor}
                class="w-full px-2 py-1 border border-(--color-border) bg-(--color-bg) text-(--color-text) font-mono text-xs focus:outline-none focus:border-(--color-accent)"
              />
            </div>
          </div>
          <div class="flex-1">
            <label class="text-xs text-(--color-text-muted) mb-1 block">Text</label>
            <div class="flex items-center gap-2">
              <div
                class="w-8 h-8 border border-(--color-border) relative cursor-pointer shrink-0"
                style="background-color: {textColor}"
              >
                <input
                  type="color"
                  bind:value={textColor}
                  class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>
              <input
                type="text"
                bind:value={textColor}
                class="w-full px-2 py-1 border border-(--color-border) bg-(--color-bg) text-(--color-text) font-mono text-xs focus:outline-none focus:border-(--color-accent)"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Text Options -->
      <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3 block">
          Text
        </span>
        <div class="mb-3">
          <label class="text-xs text-(--color-text-muted) mb-1 block">Custom Text (empty for dimensions)</label>
          <input
            type="text"
            bind:value={text}
            placeholder="{width} x {height}"
            class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)"
          />
        </div>
        <div class="mb-3">
          <label class="text-xs text-(--color-text-muted) mb-1 block">Font Size (0 for auto): {fontSize || 'auto'}</label>
          <input
            type="range"
            min="0"
            max="200"
            bind:value={fontSize}
            class="w-full accent-(--color-accent)"
          />
        </div>
        <div>
          <label class="text-xs text-(--color-text-muted) mb-1 block">Font Family</label>
          <select
            bind:value={fontFamily}
            class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer"
          >
            <option value="sans-serif">Sans-serif</option>
            <option value="serif">Serif</option>
            <option value="monospace">Monospace</option>
            <option value="Arial">Arial</option>
            <option value="Helvetica">Helvetica</option>
            <option value="Georgia">Georgia</option>
          </select>
        </div>
      </div>

      <!-- Output Format -->
      <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3 block">
          Format
        </span>
        <div class="flex gap-2">
          {#each ["png", "jpeg", "svg"] as format}
            <button
              onclick={() => outputFormat = format as "png" | "jpeg" | "svg"}
              class="flex-1 px-3 py-2 text-sm font-medium transition-colors {outputFormat === format ? 'bg-(--color-accent) text-(--color-btn-text)' : 'border border-(--color-border) text-(--color-text) hover:bg-(--color-bg)'}"
            >
              {format.toUpperCase()}
            </button>
          {/each}
        </div>
      </div>
    </div>

    <!-- Preview and Output -->
    <div class="flex-1 flex flex-col gap-4">
      <!-- Preview -->
      <div>
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2 block">
          Preview
        </span>
        <div
          class="w-full min-h-[200px] border border-(--color-border) flex items-center justify-center p-4 overflow-auto"
          style="background: repeating-conic-gradient(#80808020 0% 25%, transparent 0% 50%) 50% / 20px 20px"
        >
          {#if generatedImage}
            <img
              src={generatedImage}
              alt="Placeholder {width}x{height}"
              style="max-width: 100%; max-height: 400px;"
            />
          {/if}
        </div>
      </div>

      <!-- SVG Code (only shown when SVG format is selected) -->
      {#if outputFormat === "svg" && svgCode}
        <div>
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2 block">
            SVG Code
          </span>
          <div class="relative">
            <pre class="p-4 border border-(--color-border) bg-(--color-bg-alt) text-xs font-mono text-(--color-text) overflow-auto max-h-[200px]"><code>{svgCode}</code></pre>
            <button
              onclick={copySvgCode}
              class="absolute top-2 right-2 px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg) text-(--color-text) hover:bg-(--color-bg-alt) transition-colors"
            >
              {copied === "svg" ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      {/if}

      <!-- Actions -->
      <div class="flex flex-wrap gap-2">
        <button
          onclick={downloadImage}
          disabled={!generatedImage}
          class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50"
        >
          Download
        </button>
        <button
          onclick={copyDataUrl}
          disabled={!generatedImage}
          class="px-4 py-2 border border-(--color-border) text-(--color-text) text-sm font-medium hover:bg-(--color-bg-alt) transition-colors disabled:opacity-50"
        >
          {copied === "url" ? "Copied!" : "Copy Data URL"}
        </button>
        <button
          onclick={copyImgTag}
          disabled={!generatedImage}
          class="px-4 py-2 border border-(--color-border) text-(--color-text) text-sm font-medium hover:bg-(--color-bg-alt) transition-colors disabled:opacity-50"
        >
          {copied === "img" ? "Copied!" : "Copy <img> Tag"}
        </button>
      </div>

      <!-- Info -->
      <div class="p-3 border border-(--color-border) bg-(--color-bg-alt) text-xs text-(--color-text-muted)">
        <p>Dimensions: {width} x {height}px | Format: {outputFormat.toUpperCase()} | Font Size: {autoFontSize}px</p>
      </div>
    </div>
  </div>
</div>
