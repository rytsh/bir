<script lang="ts">
  type ShadowType = "box" | "text";

  interface BoxShadow {
    offsetX: number;
    offsetY: number;
    blur: number;
    spread: number;
    color: string;
    inset: boolean;
  }

  interface TextShadow {
    offsetX: number;
    offsetY: number;
    blur: number;
    color: string;
  }

  let shadowType = $state<ShadowType>("box");
  let copied = $state<string | null>(null);

  // Box shadow state
  let boxShadows = $state<BoxShadow[]>([
    { offsetX: 4, offsetY: 4, blur: 10, spread: 0, color: "#00000040", inset: false },
  ]);

  // Text shadow state
  let textShadows = $state<TextShadow[]>([
    { offsetX: 2, offsetY: 2, blur: 4, color: "#00000080" },
  ]);

  // Preview options
  let previewBgColor = $state("#ffffff");
  let previewBoxColor = $state("#3b82f6");
  let previewText = $state("Shadow");
  let previewTextColor = $state("#1f2937");

  function addBoxShadow() {
    boxShadows = [...boxShadows, { offsetX: 4, offsetY: 4, blur: 10, spread: 0, color: "#00000040", inset: false }];
  }

  function removeBoxShadow(index: number) {
    if (boxShadows.length > 1) {
      boxShadows = boxShadows.filter((_, i) => i !== index);
    }
  }

  function updateBoxShadow(index: number, field: keyof BoxShadow, value: number | string | boolean) {
    boxShadows = boxShadows.map((shadow, i) =>
      i === index ? { ...shadow, [field]: value } : shadow
    );
  }

  function addTextShadow() {
    textShadows = [...textShadows, { offsetX: 2, offsetY: 2, blur: 4, color: "#00000080" }];
  }

  function removeTextShadow(index: number) {
    if (textShadows.length > 1) {
      textShadows = textShadows.filter((_, i) => i !== index);
    }
  }

  function updateTextShadow(index: number, field: keyof TextShadow, value: number | string) {
    textShadows = textShadows.map((shadow, i) =>
      i === index ? { ...shadow, [field]: value } : shadow
    );
  }

  let boxShadowCss = $derived(
    boxShadows.map((s) =>
      `${s.inset ? "inset " : ""}${s.offsetX}px ${s.offsetY}px ${s.blur}px ${s.spread}px ${s.color}`
    ).join(", ")
  );

  let textShadowCss = $derived(
    textShadows.map((s) =>
      `${s.offsetX}px ${s.offsetY}px ${s.blur}px ${s.color}`
    ).join(", ")
  );

  let fullCss = $derived(
    shadowType === "box"
      ? `box-shadow: ${boxShadowCss};`
      : `text-shadow: ${textShadowCss};`
  );

  function copyToClipboard(text: string, type: string) {
    navigator.clipboard.writeText(text);
    copied = type;
    setTimeout(() => { copied = null; }, 2000);
  }

  function resetBoxShadows() {
    boxShadows = [{ offsetX: 4, offsetY: 4, blur: 10, spread: 0, color: "#00000040", inset: false }];
  }

  function resetTextShadows() {
    textShadows = [{ offsetX: 2, offsetY: 2, blur: 4, color: "#00000080" }];
  }

  const boxPresets = [
    { name: "Subtle", shadows: [{ offsetX: 0, offsetY: 1, blur: 3, spread: 0, color: "#00000020", inset: false }] },
    { name: "Medium", shadows: [{ offsetX: 0, offsetY: 4, blur: 6, spread: -1, color: "#00000030", inset: false }] },
    { name: "Large", shadows: [{ offsetX: 0, offsetY: 10, blur: 15, spread: -3, color: "#00000030", inset: false }] },
    { name: "Sharp", shadows: [{ offsetX: 5, offsetY: 5, blur: 0, spread: 0, color: "#00000050", inset: false }] },
    { name: "Inset", shadows: [{ offsetX: 0, offsetY: 2, blur: 4, spread: 0, color: "#00000040", inset: true }] },
    { name: "Glow", shadows: [{ offsetX: 0, offsetY: 0, blur: 20, spread: 0, color: "#3b82f680", inset: false }] },
  ];

  const textPresets = [
    { name: "Subtle", shadows: [{ offsetX: 1, offsetY: 1, blur: 2, color: "#00000040" }] },
    { name: "Sharp", shadows: [{ offsetX: 2, offsetY: 2, blur: 0, color: "#00000060" }] },
    { name: "Neon", shadows: [{ offsetX: 0, offsetY: 0, blur: 10, color: "#3b82f6" }] },
    { name: "Embossed", shadows: [{ offsetX: 1, offsetY: 1, blur: 0, color: "#ffffff80" }, { offsetX: -1, offsetY: -1, blur: 0, color: "#00000040" }] },
  ];
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Generate CSS box-shadow and text-shadow with visual preview.
    </p>
  </header>

  <!-- Shadow Type Toggle -->
  <div class="mb-4 flex gap-2">
    <button
      onclick={() => shadowType = "box"}
      class="px-4 py-2 text-sm font-medium transition-colors {shadowType === 'box' ? 'bg-(--color-accent) text-(--color-btn-text)' : 'border border-(--color-border) text-(--color-text) hover:bg-(--color-bg-alt)'}"
    >
      Box Shadow
    </button>
    <button
      onclick={() => shadowType = "text"}
      class="px-4 py-2 text-sm font-medium transition-colors {shadowType === 'text' ? 'bg-(--color-accent) text-(--color-btn-text)' : 'border border-(--color-border) text-(--color-text) hover:bg-(--color-bg-alt)'}"
    >
      Text Shadow
    </button>
  </div>

  <div class="flex flex-col lg:flex-row gap-6 flex-1">
    <!-- Controls -->
    <div class="lg:w-96 flex flex-col gap-4 overflow-y-auto">
      {#if shadowType === "box"}
        <!-- Box Shadow Controls -->
        {#each boxShadows as shadow, index}
          <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
            <div class="flex items-center justify-between mb-3">
              <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">
                Shadow {index + 1}
              </span>
              {#if boxShadows.length > 1}
                <button
                  onclick={() => removeBoxShadow(index)}
                  class="text-xs text-red-500 hover:text-red-700"
                >
                  Remove
                </button>
              {/if}
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-xs text-(--color-text-muted) mb-1 block">Offset X</label>
                <input
                  type="range"
                  min="-50"
                  max="50"
                  value={shadow.offsetX}
                  oninput={(e) => updateBoxShadow(index, "offsetX", parseInt((e.target as HTMLInputElement).value))}
                  class="w-full accent-(--color-accent)"
                />
                <span class="text-xs text-(--color-text)">{shadow.offsetX}px</span>
              </div>
              <div>
                <label class="text-xs text-(--color-text-muted) mb-1 block">Offset Y</label>
                <input
                  type="range"
                  min="-50"
                  max="50"
                  value={shadow.offsetY}
                  oninput={(e) => updateBoxShadow(index, "offsetY", parseInt((e.target as HTMLInputElement).value))}
                  class="w-full accent-(--color-accent)"
                />
                <span class="text-xs text-(--color-text)">{shadow.offsetY}px</span>
              </div>
              <div>
                <label class="text-xs text-(--color-text-muted) mb-1 block">Blur</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={shadow.blur}
                  oninput={(e) => updateBoxShadow(index, "blur", parseInt((e.target as HTMLInputElement).value))}
                  class="w-full accent-(--color-accent)"
                />
                <span class="text-xs text-(--color-text)">{shadow.blur}px</span>
              </div>
              <div>
                <label class="text-xs text-(--color-text-muted) mb-1 block">Spread</label>
                <input
                  type="range"
                  min="-50"
                  max="50"
                  value={shadow.spread}
                  oninput={(e) => updateBoxShadow(index, "spread", parseInt((e.target as HTMLInputElement).value))}
                  class="w-full accent-(--color-accent)"
                />
                <span class="text-xs text-(--color-text)">{shadow.spread}px</span>
              </div>
            </div>

            <div class="flex items-center gap-3 mt-3">
              <div class="flex items-center gap-2">
                <div
                  class="w-8 h-8 border border-(--color-border) relative cursor-pointer"
                  style="background-color: {shadow.color}"
                >
                  <input
                    type="color"
                    value={shadow.color.slice(0, 7)}
                    oninput={(e) => updateBoxShadow(index, "color", (e.target as HTMLInputElement).value + shadow.color.slice(7))}
                    class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                </div>
                <input
                  type="text"
                  value={shadow.color}
                  oninput={(e) => updateBoxShadow(index, "color", (e.target as HTMLInputElement).value)}
                  class="w-24 px-2 py-1 border border-(--color-border) bg-(--color-bg) text-(--color-text) font-mono text-xs focus:outline-none focus:border-(--color-accent)"
                />
              </div>
              <label class="flex items-center gap-2 text-sm text-(--color-text) cursor-pointer">
                <input
                  type="checkbox"
                  checked={shadow.inset}
                  onchange={(e) => updateBoxShadow(index, "inset", (e.target as HTMLInputElement).checked)}
                  class="accent-(--color-accent)"
                />
                Inset
              </label>
            </div>
          </div>
        {/each}

        <div class="flex gap-2">
          <button
            onclick={addBoxShadow}
            class="flex-1 px-3 py-2 border border-(--color-border) text-(--color-text) text-sm font-medium hover:bg-(--color-bg-alt) transition-colors"
          >
            + Add Shadow
          </button>
          <button
            onclick={resetBoxShadows}
            class="px-3 py-2 border border-(--color-border) text-(--color-text) text-sm font-medium hover:bg-(--color-bg-alt) transition-colors"
          >
            Reset
          </button>
        </div>

        <!-- Box Shadow Presets -->
        <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3 block">
            Presets
          </span>
          <div class="grid grid-cols-3 gap-2">
            {#each boxPresets as preset}
              <button
                onclick={() => boxShadows = preset.shadows}
                class="px-2 py-1 text-xs border border-(--color-border) text-(--color-text) hover:bg-(--color-bg) transition-colors"
              >
                {preset.name}
              </button>
            {/each}
          </div>
        </div>
      {:else}
        <!-- Text Shadow Controls -->
        {#each textShadows as shadow, index}
          <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
            <div class="flex items-center justify-between mb-3">
              <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">
                Shadow {index + 1}
              </span>
              {#if textShadows.length > 1}
                <button
                  onclick={() => removeTextShadow(index)}
                  class="text-xs text-red-500 hover:text-red-700"
                >
                  Remove
                </button>
              {/if}
            </div>

            <div class="grid grid-cols-3 gap-3">
              <div>
                <label class="text-xs text-(--color-text-muted) mb-1 block">Offset X</label>
                <input
                  type="range"
                  min="-20"
                  max="20"
                  value={shadow.offsetX}
                  oninput={(e) => updateTextShadow(index, "offsetX", parseInt((e.target as HTMLInputElement).value))}
                  class="w-full accent-(--color-accent)"
                />
                <span class="text-xs text-(--color-text)">{shadow.offsetX}px</span>
              </div>
              <div>
                <label class="text-xs text-(--color-text-muted) mb-1 block">Offset Y</label>
                <input
                  type="range"
                  min="-20"
                  max="20"
                  value={shadow.offsetY}
                  oninput={(e) => updateTextShadow(index, "offsetY", parseInt((e.target as HTMLInputElement).value))}
                  class="w-full accent-(--color-accent)"
                />
                <span class="text-xs text-(--color-text)">{shadow.offsetY}px</span>
              </div>
              <div>
                <label class="text-xs text-(--color-text-muted) mb-1 block">Blur</label>
                <input
                  type="range"
                  min="0"
                  max="30"
                  value={shadow.blur}
                  oninput={(e) => updateTextShadow(index, "blur", parseInt((e.target as HTMLInputElement).value))}
                  class="w-full accent-(--color-accent)"
                />
                <span class="text-xs text-(--color-text)">{shadow.blur}px</span>
              </div>
            </div>

            <div class="flex items-center gap-2 mt-3">
              <div
                class="w-8 h-8 border border-(--color-border) relative cursor-pointer"
                style="background-color: {shadow.color}"
              >
                <input
                  type="color"
                  value={shadow.color.slice(0, 7)}
                  oninput={(e) => updateTextShadow(index, "color", (e.target as HTMLInputElement).value)}
                  class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>
              <input
                type="text"
                value={shadow.color}
                oninput={(e) => updateTextShadow(index, "color", (e.target as HTMLInputElement).value)}
                class="w-24 px-2 py-1 border border-(--color-border) bg-(--color-bg) text-(--color-text) font-mono text-xs focus:outline-none focus:border-(--color-accent)"
              />
            </div>
          </div>
        {/each}

        <div class="flex gap-2">
          <button
            onclick={addTextShadow}
            class="flex-1 px-3 py-2 border border-(--color-border) text-(--color-text) text-sm font-medium hover:bg-(--color-bg-alt) transition-colors"
          >
            + Add Shadow
          </button>
          <button
            onclick={resetTextShadows}
            class="px-3 py-2 border border-(--color-border) text-(--color-text) text-sm font-medium hover:bg-(--color-bg-alt) transition-colors"
          >
            Reset
          </button>
        </div>

        <!-- Text Shadow Presets -->
        <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3 block">
            Presets
          </span>
          <div class="grid grid-cols-2 gap-2">
            {#each textPresets as preset}
              <button
                onclick={() => textShadows = preset.shadows}
                class="px-2 py-1 text-xs border border-(--color-border) text-(--color-text) hover:bg-(--color-bg) transition-colors"
              >
                {preset.name}
              </button>
            {/each}
          </div>
        </div>

        <!-- Text Preview Options -->
        <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3 block">
            Preview Text
          </span>
          <input
            type="text"
            bind:value={previewText}
            class="w-full px-2 py-1 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)"
          />
        </div>
      {/if}

      <!-- Preview Background Color -->
      <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3 block">
          Preview Colors
        </span>
        <div class="flex gap-3">
          <div class="flex items-center gap-2">
            <span class="text-xs text-(--color-text-muted)">BG</span>
            <div
              class="w-8 h-8 border border-(--color-border) relative cursor-pointer"
              style="background-color: {previewBgColor}"
            >
              <input
                type="color"
                bind:value={previewBgColor}
                class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>
          </div>
          {#if shadowType === "box"}
            <div class="flex items-center gap-2">
              <span class="text-xs text-(--color-text-muted)">Box</span>
              <div
                class="w-8 h-8 border border-(--color-border) relative cursor-pointer"
                style="background-color: {previewBoxColor}"
              >
                <input
                  type="color"
                  bind:value={previewBoxColor}
                  class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>
            </div>
          {:else}
            <div class="flex items-center gap-2">
              <span class="text-xs text-(--color-text-muted)">Text</span>
              <div
                class="w-8 h-8 border border-(--color-border) relative cursor-pointer"
                style="background-color: {previewTextColor}"
              >
                <input
                  type="color"
                  bind:value={previewTextColor}
                  class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>
            </div>
          {/if}
        </div>
      </div>
    </div>

    <!-- Preview and Output -->
    <div class="flex-1 flex flex-col gap-4">
      <!-- Preview -->
      <div class="flex-1 min-h-[200px]">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2 block">
          Preview
        </span>
        <div
          class="w-full h-full min-h-[200px] border border-(--color-border) flex items-center justify-center"
          style="background-color: {previewBgColor}"
        >
          {#if shadowType === "box"}
            <div
              class="w-32 h-32"
              style="background-color: {previewBoxColor}; box-shadow: {boxShadowCss};"
            ></div>
          {:else}
            <span
              class="text-4xl font-bold"
              style="color: {previewTextColor}; text-shadow: {textShadowCss};"
            >
              {previewText}
            </span>
          {/if}
        </div>
      </div>

      <!-- CSS Output -->
      <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">
            CSS Code
          </span>
          <button
            onclick={() => copyToClipboard(fullCss, "css")}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            {copied === "css" ? "Copied!" : "Copy"}
          </button>
        </div>
        <pre class="font-mono text-sm text-(--color-text) whitespace-pre-wrap break-all">{fullCss}</pre>
      </div>
    </div>
  </div>
</div>
