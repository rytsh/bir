<script lang="ts">
  import figlet from "figlet";

  // Curated list of popular fonts - loaded on demand
  const availableFonts = [
    "Standard",
    "3-D",
    "3D-ASCII",
    "ANSI Shadow",
    "Banner",
    "Banner3-D",
    "Big",
    "Block",
    "Bloody",
    "Chunky",
    "Colossal",
    "Cyberlarge",
    "Delta Corps Priest 1",
    "Digital",
    "Doh",
    "Doom",
    "DOS Rebel",
    "Electronic",
    "Epic",
    "Fraktur",
    "Ghost",
    "Gothic",
    "Graffiti",
    "Isometric1",
    "Isometric3",
    "Ivrit",
    "Larry 3D",
    "Letters",
    "Ogre",
    "Rectangles",
    "Slant",
    "Small",
    "Small Slant",
    "Speed",
    "Stampatello",
    "Star Wars",
    "Stop",
    "Sub-Zero",
    "The Edge",
    "Thick",
    "Thin",
    "Train",
    "Trek",
    "Varsity",
    "Weird",
  ].sort();

  // Font import map for dynamic loading
  const fontImports: Record<string, () => Promise<{ default: string }>> = {
    "Standard": () => import("figlet/importable-fonts/Standard.js"),
    "3-D": () => import("figlet/importable-fonts/3-D.js"),
    "3D-ASCII": () => import("figlet/importable-fonts/3D-ASCII.js"),
    "ANSI Shadow": () => import("figlet/importable-fonts/ANSI Shadow.js"),
    "Banner": () => import("figlet/importable-fonts/Banner.js"),
    "Banner3-D": () => import("figlet/importable-fonts/Banner3-D.js"),
    "Big": () => import("figlet/importable-fonts/Big.js"),
    "Block": () => import("figlet/importable-fonts/Block.js"),
    "Bloody": () => import("figlet/importable-fonts/Bloody.js"),
    "Chunky": () => import("figlet/importable-fonts/Chunky.js"),
    "Colossal": () => import("figlet/importable-fonts/Colossal.js"),
    "Cyberlarge": () => import("figlet/importable-fonts/Cyberlarge.js"),
    "Delta Corps Priest 1": () => import("figlet/importable-fonts/Delta Corps Priest 1.js"),
    "Digital": () => import("figlet/importable-fonts/Digital.js"),
    "Doh": () => import("figlet/importable-fonts/Doh.js"),
    "Doom": () => import("figlet/importable-fonts/Doom.js"),
    "DOS Rebel": () => import("figlet/importable-fonts/DOS Rebel.js"),
    "Electronic": () => import("figlet/importable-fonts/Electronic.js"),
    "Epic": () => import("figlet/importable-fonts/Epic.js"),
    "Fraktur": () => import("figlet/importable-fonts/Fraktur.js"),
    "Ghost": () => import("figlet/importable-fonts/Ghost.js"),
    "Gothic": () => import("figlet/importable-fonts/Gothic.js"),
    "Graffiti": () => import("figlet/importable-fonts/Graffiti.js"),
    "Isometric1": () => import("figlet/importable-fonts/Isometric1.js"),
    "Isometric3": () => import("figlet/importable-fonts/Isometric3.js"),
    "Ivrit": () => import("figlet/importable-fonts/Ivrit.js"),
    "Larry 3D": () => import("figlet/importable-fonts/Larry 3D.js"),
    "Letters": () => import("figlet/importable-fonts/Letters.js"),
    "Ogre": () => import("figlet/importable-fonts/Ogre.js"),
    "Rectangles": () => import("figlet/importable-fonts/Rectangles.js"),
    "Slant": () => import("figlet/importable-fonts/Slant.js"),
    "Small": () => import("figlet/importable-fonts/Small.js"),
    "Small Slant": () => import("figlet/importable-fonts/Small Slant.js"),
    "Speed": () => import("figlet/importable-fonts/Speed.js"),
    "Stampatello": () => import("figlet/importable-fonts/Stampatello.js"),
    "Star Wars": () => import("figlet/importable-fonts/Star Wars.js"),
    "Stop": () => import("figlet/importable-fonts/Stop.js"),
    "Sub-Zero": () => import("figlet/importable-fonts/Sub-Zero.js"),
    "The Edge": () => import("figlet/importable-fonts/The Edge.js"),
    "Thick": () => import("figlet/importable-fonts/Thick.js"),
    "Thin": () => import("figlet/importable-fonts/Thin.js"),
    "Train": () => import("figlet/importable-fonts/Train.js"),
    "Trek": () => import("figlet/importable-fonts/Trek.js"),
    "Varsity": () => import("figlet/importable-fonts/Varsity.js"),
    "Weird": () => import("figlet/importable-fonts/Weird.js"),
  };

  // Track loaded fonts
  const loadedFonts = new Set<string>();

  // Layout options
  type LayoutOption = "default" | "full" | "fitted" | "controlled smushing" | "universal smushing";
  const layoutOptions: { value: LayoutOption; label: string }[] = [
    { value: "default", label: "Default" },
    { value: "full", label: "Full" },
    { value: "fitted", label: "Fitted" },
    { value: "controlled smushing", label: "Controlled Smushing" },
    { value: "universal smushing", label: "Universal Smushing" },
  ];

  // Print direction options
  type PrintDirection = 0 | 1;
  const printDirectionOptions: { value: PrintDirection; label: string }[] = [
    { value: 0, label: "Left to Right" },
    { value: 1, label: "Right to Left" },
  ];

  let inputText = $state("Hello");
  let selectedFont = $state("ANSI Shadow");
  let horizontalLayout = $state<LayoutOption>("default");
  let verticalLayout = $state<LayoutOption>("default");
  let printDirection = $state<PrintDirection>(0);
  let widthEnabled = $state(false);
  let width = $state(80);
  let whitespaceBreak = $state(true);
  let fontSize = $state(14);
  let copied = $state(false);
  let output = $state("");
  let loading = $state(false);
  let error = $state("");

  // Load font dynamically
  async function loadFont(fontName: string): Promise<boolean> {
    if (loadedFonts.has(fontName)) {
      return true;
    }

    const importFn = fontImports[fontName];
    if (!importFn) {
      return false;
    }

    try {
      const module = await importFn();
      figlet.parseFont(fontName, module.default);
      loadedFonts.add(fontName);
      return true;
    } catch (e) {
      console.error(`Failed to load font: ${fontName}`, e);
      return false;
    }
  }

  // Generate ASCII art
  async function generateArt() {
    if (!inputText.trim()) {
      output = "";
      error = "";
      return;
    }

    loading = true;
    error = "";

    try {
      const fontLoaded = await loadFont(selectedFont);
      if (!fontLoaded) {
        error = `Failed to load font: ${selectedFont}`;
        output = "";
        return;
      }

      const result = figlet.textSync(inputText, {
        font: selectedFont as figlet.Fonts,
        horizontalLayout: horizontalLayout,
        verticalLayout: verticalLayout,
        printDirection: printDirection,
        width: widthEnabled ? width : undefined,
        whitespaceBreak: widthEnabled ? whitespaceBreak : undefined,
      });
      output = result;
    } catch (e) {
      error = `Error generating ASCII art: ${e instanceof Error ? e.message : "Unknown error"}`;
      output = "";
    } finally {
      loading = false;
    }
  }

  // Regenerate when inputs change
  $effect(() => {
    // Track dependencies
    const _ = [inputText, selectedFont, horizontalLayout, verticalLayout, printDirection, widthEnabled, width, whitespaceBreak];
    generateArt();
  });

  const hasOutput = $derived(output.length > 0);

  const handleCopy = () => {
    if (output) {
      navigator.clipboard.writeText(output);
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 2000);
    }
  };

  const handleClear = () => {
    inputText = "";
    output = "";
    error = "";
  };
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Generate ASCII art text using various stylized fonts. Type your text and select a font to see the result.
    </p>
  </header>

  <!-- Controls -->
  <div class="mb-4 flex flex-wrap gap-4 items-end">
    <!-- Font selector -->
    <div class="flex flex-col gap-1">
      <label for="font" class="text-xs tracking-wider text-(--color-text-light) font-medium">Font</label>
      <select
        id="font"
        bind:value={selectedFont}
        class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text)"
      >
        {#each availableFonts as font}
          <option value={font}>{font}</option>
        {/each}
      </select>
    </div>

    <!-- Horizontal layout -->
    <div class="flex flex-col gap-1">
      <label for="hlayout" class="text-xs tracking-wider text-(--color-text-light) font-medium">Horizontal Layout</label>
      <select
        id="hlayout"
        bind:value={horizontalLayout}
        class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text)"
      >
        {#each layoutOptions as opt}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </select>
    </div>

    <!-- Vertical layout -->
    <div class="flex flex-col gap-1">
      <label for="vlayout" class="text-xs tracking-wider text-(--color-text-light) font-medium">Vertical Layout</label>
      <select
        id="vlayout"
        bind:value={verticalLayout}
        class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text)"
      >
        {#each layoutOptions as opt}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </select>
    </div>

    <!-- Print direction -->
    <div class="flex flex-col gap-1">
      <label for="direction" class="text-xs tracking-wider text-(--color-text-light) font-medium">Direction</label>
      <select
        id="direction"
        bind:value={printDirection}
        class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text)"
      >
        {#each printDirectionOptions as opt}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </select>
    </div>

    <!-- Width control -->
    <div class="flex flex-col gap-1">
      <label class="text-xs tracking-wider text-(--color-text-light) font-medium flex items-center gap-2">
        <input
          type="checkbox"
          bind:checked={widthEnabled}
          class="accent-(--color-accent)"
        />
        Max Width
      </label>
      <input
        id="width"
        type="number"
        min="20"
        max="500"
        step="10"
        bind:value={width}
        disabled={!widthEnabled}
        class="w-20 px-2 py-1.5 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text) disabled:opacity-50 disabled:cursor-not-allowed"
      />
    </div>

    <!-- Whitespace break -->
    <div class="flex flex-col gap-1">
      <label class="text-xs tracking-wider text-(--color-text-light) font-medium">Word Wrap</label>
      <label class="flex items-center gap-2 py-1.5 text-sm">
        <input
          type="checkbox"
          bind:checked={whitespaceBreak}
          disabled={!widthEnabled}
          class="accent-(--color-accent) disabled:opacity-50"
        />
        <span class={!widthEnabled ? "opacity-50" : ""}>Break on spaces</span>
      </label>
    </div>

    <!-- Font size slider -->
    <div class="flex flex-col gap-1">
      <label for="fontSize" class="text-xs tracking-wider text-(--color-text-light) font-medium">Size: {fontSize}px</label>
      <input
        id="fontSize"
        type="range"
        min="8"
        max="32"
        step="1"
        bind:value={fontSize}
        class="w-24 h-1.5 accent-(--color-accent)"
      />
    </div>
  </div>

  <!-- Input -->
  <div class="mb-4">
    <label for="input" class="text-xs tracking-wider text-(--color-text-light) font-medium mb-2 block">Input Text</label>
    <div class="relative">
      <input
        id="input"
        type="text"
        bind:value={inputText}
        placeholder="Type your text here..."
        class="w-full px-3 py-2 pr-9 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text) placeholder:text-(--color-text-muted)"
      />
      {#if inputText}
        <button
          onclick={handleClear}
          class="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          title="Clear"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      {/if}
    </div>
  </div>

  <!-- Output -->
  <div class="flex-1 flex flex-col min-h-0 overflow-hidden">
    <div class="flex justify-between items-center mb-2 shrink-0">
      <span class="text-xs tracking-wider text-(--color-text-light) font-medium">Output</span>
      <div class="flex items-center gap-3">
        <span class="text-xs text-(--color-text-muted)">
          {#if loading}
            Loading font...
          {:else if hasOutput}
            {output.split("\n").length} lines
          {/if}
        </span>
        {#if hasOutput}
          <button
            onclick={handleCopy}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        {/if}
      </div>
    </div>
    <div class="relative flex-1 min-h-0 border border-(--color-border) bg-[#1a1a1a]">
      <div class="absolute inset-0 overflow-auto">
        {#if error}
          <div class="p-4 text-sm text-red-500">{error}</div>
        {:else}
          <pre
            class="text-white m-0 p-3 whitespace-pre w-fit"
            style="font-family: 'Courier New', Courier, monospace; font-size: {fontSize}px; line-height: 1;"
          >{output || "ASCII art will appear here..."}</pre>
        {/if}
      </div>
    </div>
  </div>
</div>
