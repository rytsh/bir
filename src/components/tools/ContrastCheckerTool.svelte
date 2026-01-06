<script lang="ts">
  let foregroundColor = $state("#1f2937");
  let backgroundColor = $state("#ffffff");
  let sampleText = $state("The quick brown fox jumps over the lazy dog");
  let copied = $state<string | null>(null);

  interface WcagResult {
    ratio: number;
    aa: { normal: boolean; large: boolean };
    aaa: { normal: boolean; large: boolean };
  }

  function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : null;
  }

  function getLuminance(r: number, g: number, b: number): number {
    const [rs, gs, bs] = [r, g, b].map((c) => {
      c = c / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  }

  function getContrastRatio(color1: string, color2: string): number {
    const rgb1 = hexToRgb(color1);
    const rgb2 = hexToRgb(color2);
    if (!rgb1 || !rgb2) return 1;

    const lum1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
    const lum2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);

    const lighter = Math.max(lum1, lum2);
    const darker = Math.min(lum1, lum2);

    return (lighter + 0.05) / (darker + 0.05);
  }

  function checkWcag(ratio: number): WcagResult {
    return {
      ratio,
      aa: {
        normal: ratio >= 4.5,
        large: ratio >= 3,
      },
      aaa: {
        normal: ratio >= 7,
        large: ratio >= 4.5,
      },
    };
  }

  function swapColors() {
    const temp = foregroundColor;
    foregroundColor = backgroundColor;
    backgroundColor = temp;
  }

  function handleColorInput(type: "fg" | "bg", e: Event) {
    const target = e.target as HTMLInputElement;
    if (type === "fg") {
      foregroundColor = target.value;
    } else {
      backgroundColor = target.value;
    }
  }

  function handleHexInput(type: "fg" | "bg", e: Event) {
    const target = e.target as HTMLInputElement;
    let value = target.value;
    if (!value.startsWith("#")) {
      value = "#" + value;
    }
    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
      if (type === "fg") {
        foregroundColor = value;
      } else {
        backgroundColor = value;
      }
    }
  }

  function copyToClipboard(text: string, type: string) {
    navigator.clipboard.writeText(text);
    copied = type;
    setTimeout(() => { copied = null; }, 2000);
  }

  function randomColors() {
    const randomHex = () => "#" + Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0");
    foregroundColor = randomHex();
    backgroundColor = randomHex();
  }

  let contrastRatio = $derived(getContrastRatio(foregroundColor, backgroundColor));
  let wcagResult = $derived(checkWcag(contrastRatio));

  function getRatingClass(pass: boolean): string {
    return pass ? "text-green-500" : "text-red-500";
  }

  function getRatingText(pass: boolean): string {
    return pass ? "Pass" : "Fail";
  }

  let ratioColor = $derived(() => {
    if (contrastRatio >= 7) return "text-green-500";
    if (contrastRatio >= 4.5) return "text-yellow-500";
    if (contrastRatio >= 3) return "text-orange-500";
    return "text-red-500";
  });

  const presetCombinations = [
    { fg: "#000000", bg: "#ffffff", name: "Black on White" },
    { fg: "#ffffff", bg: "#000000", name: "White on Black" },
    { fg: "#1f2937", bg: "#f9fafb", name: "Dark Gray on Light" },
    { fg: "#1e40af", bg: "#dbeafe", name: "Blue on Light Blue" },
    { fg: "#dc2626", bg: "#fef2f2", name: "Red on Light Red" },
    { fg: "#059669", bg: "#d1fae5", name: "Green on Light Green" },
  ];
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Check WCAG color contrast ratios for accessibility compliance.
    </p>
  </header>

  <div class="flex flex-col lg:flex-row gap-6 flex-1">
    <!-- Controls -->
    <div class="lg:w-80 flex flex-col gap-4">
      <!-- Foreground Color -->
      <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3 block">
          Foreground (Text)
        </span>
        <div class="flex items-center gap-2">
          <div
            class="w-12 h-12 border border-(--color-border) relative cursor-pointer shrink-0"
            style="background-color: {foregroundColor}"
          >
            <input
              type="color"
              value={foregroundColor}
              oninput={(e) => handleColorInput("fg", e)}
              class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>
          <input
            type="text"
            value={foregroundColor}
            oninput={(e) => handleHexInput("fg", e)}
            class="flex-1 px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) font-mono text-sm focus:outline-none focus:border-(--color-accent)"
          />
        </div>
      </div>

      <!-- Swap Button -->
      <button
        onclick={swapColors}
        class="px-4 py-2 border border-(--color-border) text-(--color-text) text-sm font-medium hover:bg-(--color-bg-alt) transition-colors"
      >
        ↕ Swap Colors
      </button>

      <!-- Background Color -->
      <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3 block">
          Background
        </span>
        <div class="flex items-center gap-2">
          <div
            class="w-12 h-12 border border-(--color-border) relative cursor-pointer shrink-0"
            style="background-color: {backgroundColor}"
          >
            <input
              type="color"
              value={backgroundColor}
              oninput={(e) => handleColorInput("bg", e)}
              class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>
          <input
            type="text"
            value={backgroundColor}
            oninput={(e) => handleHexInput("bg", e)}
            class="flex-1 px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) font-mono text-sm focus:outline-none focus:border-(--color-accent)"
          />
        </div>
      </div>

      <!-- Presets -->
      <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3 block">
          Presets
        </span>
        <div class="grid grid-cols-2 gap-2">
          {#each presetCombinations as preset}
            <button
              onclick={() => { foregroundColor = preset.fg; backgroundColor = preset.bg; }}
              class="p-2 border border-(--color-border) hover:border-(--color-accent) transition-colors text-xs"
              style="background-color: {preset.bg}; color: {preset.fg};"
            >
              {preset.name}
            </button>
          {/each}
        </div>
        <button
          onclick={randomColors}
          class="mt-2 w-full px-3 py-2 border border-(--color-border) text-(--color-text) text-sm font-medium hover:bg-(--color-bg) transition-colors"
        >
          Random
        </button>
      </div>

      <!-- Sample Text -->
      <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3 block">
          Sample Text
        </span>
        <input
          type="text"
          bind:value={sampleText}
          class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)"
        />
      </div>
    </div>

    <!-- Results -->
    <div class="flex-1 flex flex-col gap-4">
      <!-- Contrast Ratio -->
      <div class="p-6 border border-(--color-border) bg-(--color-bg-alt) text-center">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2 block">
          Contrast Ratio
        </span>
        <div class="text-5xl font-bold {ratioColor()}">
          {contrastRatio.toFixed(2)}:1
        </div>
      </div>

      <!-- WCAG Results -->
      <div class="grid grid-cols-2 gap-4">
        <!-- WCAG AA -->
        <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3 block">
            WCAG AA
          </span>
          <div class="space-y-2">
            <div class="flex justify-between items-center">
              <span class="text-sm text-(--color-text)">Normal Text</span>
              <span class="text-sm font-medium {getRatingClass(wcagResult.aa.normal)}">
                {getRatingText(wcagResult.aa.normal)}
              </span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-(--color-text)">Large Text</span>
              <span class="text-sm font-medium {getRatingClass(wcagResult.aa.large)}">
                {getRatingText(wcagResult.aa.large)}
              </span>
            </div>
          </div>
          <p class="mt-2 text-xs text-(--color-text-muted)">
            Normal: 4.5:1 | Large: 3:1
          </p>
        </div>

        <!-- WCAG AAA -->
        <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3 block">
            WCAG AAA
          </span>
          <div class="space-y-2">
            <div class="flex justify-between items-center">
              <span class="text-sm text-(--color-text)">Normal Text</span>
              <span class="text-sm font-medium {getRatingClass(wcagResult.aaa.normal)}">
                {getRatingText(wcagResult.aaa.normal)}
              </span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-(--color-text)">Large Text</span>
              <span class="text-sm font-medium {getRatingClass(wcagResult.aaa.large)}">
                {getRatingText(wcagResult.aaa.large)}
              </span>
            </div>
          </div>
          <p class="mt-2 text-xs text-(--color-text-muted)">
            Normal: 7:1 | Large: 4.5:1
          </p>
        </div>
      </div>

      <!-- Preview -->
      <div class="flex-1 min-h-[200px]">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2 block">
          Preview
        </span>
        <div
          class="w-full h-full min-h-[200px] border border-(--color-border) p-4 flex flex-col gap-4"
          style="background-color: {backgroundColor}"
        >
          <p style="color: {foregroundColor}; font-size: 14px;">
            Normal Text (14px): {sampleText}
          </p>
          <p style="color: {foregroundColor}; font-size: 18px; font-weight: bold;">
            Large Text Bold (18px): {sampleText}
          </p>
          <p style="color: {foregroundColor}; font-size: 24px;">
            Large Text (24px): {sampleText}
          </p>
          <div class="flex gap-2 mt-2">
            <button
              style="background-color: {foregroundColor}; color: {backgroundColor};"
              class="px-4 py-2 text-sm font-medium"
            >
              Button
            </button>
            <a
              href="#"
              style="color: {foregroundColor};"
              class="underline text-sm flex items-center"
            >
              Link Example
            </a>
          </div>
        </div>
      </div>

      <!-- Copy CSS -->
      <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">
            CSS
          </span>
          <button
            onclick={() => copyToClipboard(`color: ${foregroundColor};\nbackground-color: ${backgroundColor};`, "css")}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            {copied === "css" ? "Copied!" : "Copy"}
          </button>
        </div>
        <pre class="font-mono text-sm text-(--color-text)">color: {foregroundColor};
background-color: {backgroundColor};</pre>
      </div>
    </div>
  </div>
</div>
