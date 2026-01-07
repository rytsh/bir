<script lang="ts">
  import figlet from "figlet";

  // Tab state
  type Tab = "generator" | "editor";
  let activeTab = $state<Tab>("generator");

  // ASCII block characters for the editor
  const blockCharacters = [
    { category: "Full Blocks", chars: ["█", "▓", "▒", "░"] },
    { category: "Half Blocks", chars: ["▀", "▄", "▌", "▐"] },
    { category: "Quarter Blocks", chars: ["▖", "▗", "▘", "▙", "▚", "▛", "▜", "▝", "▞", "▟"] },
    { category: "Box Drawing - Light", chars: ["─", "│", "┌", "┐", "└", "┘", "├", "┤", "┬", "┴", "┼"] },
    { category: "Box Drawing - Heavy", chars: ["━", "┃", "┏", "┓", "┗", "┛", "┣", "┫", "┳", "┻", "╋"] },
    { category: "Box Drawing - Double", chars: ["═", "║", "╔", "╗", "╚", "╝", "╠", "╣", "╦", "╩", "╬"] },
    { category: "Box Drawing - Rounded", chars: ["╭", "╮", "╯", "╰"] },
    { category: "Box Drawing - Mixed", chars: ["╒", "╓", "╕", "╖", "╘", "╙", "╛", "╜", "╞", "╟", "╡", "╢", "╤", "╥", "╧", "╨", "╪", "╫"] },
    { category: "Arrows", chars: ["←", "→", "↑", "↓", "↔", "↕", "↖", "↗", "↘", "↙", "⇐", "⇒", "⇑", "⇓", "⇔", "⇕"] },
    { category: "Geometric Shapes", chars: ["■", "□", "▪", "▫", "▬", "▭", "▮", "▯", "▰", "▱", "▲", "△", "▴", "▵", "▶", "▷", "▸", "▹", "►", "▻", "▼", "▽", "▾", "▿", "◀", "◁", "◂", "◃", "◄", "◅", "◆", "◇", "◈", "◉", "◊", "○", "◌", "◍", "◎", "●", "◐", "◑", "◒", "◓", "◔", "◕", "◖", "◗"] },
    { category: "Stars & Misc", chars: ["★", "☆", "✦", "✧", "✩", "✪", "✫", "✬", "✭", "✮", "✯", "✰", "❂", "❃", "❄", "❅", "❆", "❇", "❈", "❉", "❊", "❋"] },
    { category: "Dingbats", chars: ["✓", "✔", "✕", "✖", "✗", "✘", "✙", "✚", "✛", "✜", "✝", "✞", "✟", "✠", "✡", "✢", "✣", "✤", "✥"] },
    { category: "Lines & Dashes", chars: ["‐", "‑", "‒", "–", "—", "―", "⁃", "⁄", "⁊"] },
  ];

  // Editor state
  let editorContent = $state("");
  let editorCopied = $state(false);
  let charCopied = $state<string | null>(null);
  let editorTextarea: HTMLTextAreaElement | null = $state(null);
  let cursorLine = $state(1);
  let cursorColumn = $state(1);
  
  // Editor mode: 'text' for textarea, 'grid' for canvas
  type EditorMode = "text" | "grid";
  let editorMode = $state<EditorMode>("text");
  
  // Font settings
  // System fonts (no download needed)
  // Google Fonts monospace fonts (will be loaded dynamically)
  const availableEditorFonts = [
    // System fonts (always available)
    { name: "Courier New", value: "Courier New", isSystem: true },
    { name: "Consolas", value: "Consolas", isSystem: true },
    { name: "Monaco", value: "Monaco", isSystem: true },
    { name: "Menlo", value: "Menlo", isSystem: true },
    // Google Fonts (loaded on demand)
    { name: "Fira Code", value: "Fira Code", isSystem: false },
    { name: "JetBrains Mono", value: "JetBrains Mono", isSystem: false },
    { name: "Source Code Pro", value: "Source Code Pro", isSystem: false },
    { name: "IBM Plex Mono", value: "IBM Plex Mono", isSystem: false },
    { name: "Roboto Mono", value: "Roboto Mono", isSystem: false },
    { name: "Ubuntu Mono", value: "Ubuntu Mono", isSystem: false },
    { name: "Inconsolata", value: "Inconsolata", isSystem: false },
    { name: "Space Mono", value: "Space Mono", isSystem: false },
    { name: "PT Mono", value: "PT Mono", isSystem: false },
    { name: "Noto Sans Mono", value: "Noto Sans Mono", isSystem: false },
    { name: "Red Hat Mono", value: "Red Hat Mono", isSystem: false },
    { name: "Anonymous Pro", value: "Anonymous Pro", isSystem: false },
    { name: "Cousine", value: "Cousine", isSystem: false },
    { name: "Share Tech Mono", value: "Share Tech Mono", isSystem: false },
    { name: "Overpass Mono", value: "Overpass Mono", isSystem: false },
  ];
  
  let selectedFontName = $state("Courier New");
  let customFontName = $state("");
  let useCustomFont = $state(false);
  let editorFontSize = $state(14);
  let fontLoading = $state(false);
  let loadedGoogleFonts = $state(new Set<string>());
  
  // Load Google Font dynamically
  async function loadGoogleFont(fontName: string): Promise<void> {
    if (loadedGoogleFonts.has(fontName)) return;
    
    // Check if it's a known Google Font from our list
    const font = availableEditorFonts.find(f => f.value === fontName);
    if (font?.isSystem) return;
    
    fontLoading = true;
    
    try {
      // Create link element for Google Fonts
      const linkId = `google-font-${fontName.replace(/\s+/g, '-').toLowerCase()}`;
      
      // Check if already loaded in DOM
      if (document.getElementById(linkId)) {
        loadedGoogleFonts = new Set([...loadedGoogleFonts, fontName]);
        fontLoading = false;
        return;
      }
      
      const link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName).replace(/%20/g, '+')}:wght@400;700&display=swap`;
      
      // Wait for font to load
      await new Promise<void>((resolve, reject) => {
        link.onload = () => resolve();
        link.onerror = () => reject(new Error(`Failed to load font: ${fontName}`));
        document.head.appendChild(link);
      });
      
      // Wait a bit for font to be ready
      await document.fonts.ready;
      
      loadedGoogleFonts = new Set([...loadedGoogleFonts, fontName]);
    } catch (e) {
      console.error(`Failed to load Google Font: ${fontName}`, e);
    } finally {
      fontLoading = false;
    }
  }
  
  // Load font when selection changes
  $effect(() => {
    if (!useCustomFont) {
      const font = availableEditorFonts.find(f => f.value === selectedFontName);
      if (font && !font.isSystem) {
        loadGoogleFont(selectedFontName);
      }
    }
  });
  
  // Try to load custom font from Google Fonts when user types
  function tryLoadCustomFont() {
    if (customFontName.trim()) {
      loadGoogleFont(customFontName.trim());
    }
  }
  
  // Computed font family CSS value
  const editorFontFamily = $derived(
    useCustomFont && customFontName.trim()
      ? `'${customFontName.trim()}', monospace`
      : `'${selectedFontName}', monospace`
  );
  
  // Grid/Canvas state
  let gridRows = $state(20);
  let gridCols = $state(60);
  let selectedBrush = $state("█");
  let isDrawing = $state(false);
  let gridData = $state<string[][]>([]);
  let gridZoom = $state(100); // Zoom percentage (50-200%)
  
  // Computed cell size based on zoom
  const gridCellSize = $derived(Math.round(16 * (gridZoom / 100))); // Base size 16px
  const gridFontSize = $derived(Math.round(12 * (gridZoom / 100))); // Base font 12px
  
  // Initialize grid
  function initGrid() {
    gridData = Array.from({ length: gridRows }, () => 
      Array.from({ length: gridCols }, () => " ")
    );
  }
  
  // Initialize on first load
  $effect(() => {
    if (gridData.length === 0) {
      initGrid();
    }
  });
  
  // Resize grid (preserving content)
  function resizeGrid(newRows: number, newCols: number) {
    const newGrid = Array.from({ length: newRows }, (_, r) => 
      Array.from({ length: newCols }, (_, c) => 
        gridData[r]?.[c] ?? " "
      )
    );
    gridData = newGrid;
    gridRows = newRows;
    gridCols = newCols;
  }
  
  // Draw on grid cell
  function drawCell(row: number, col: number, erase = false) {
    if (row >= 0 && row < gridRows && col >= 0 && col < gridCols) {
      gridData[row][col] = erase ? " " : selectedBrush;
      gridData = [...gridData]; // Trigger reactivity
    }
  }
  
  // Handle mouse events for drawing
  function handleGridMouseDown(row: number, col: number, e: MouseEvent) {
    isDrawing = true;
    drawCell(row, col, e.button === 2 || e.ctrlKey || e.metaKey); // Right-click or Ctrl/Cmd to erase
  }
  
  function handleGridMouseEnter(row: number, col: number, e: MouseEvent) {
    if (isDrawing) {
      drawCell(row, col, e.ctrlKey || e.metaKey);
    }
  }
  
  function handleGridMouseUp() {
    isDrawing = false;
  }
  
  // Convert grid to text
  function gridToText(): string {
    return gridData.map(row => row.join("").trimEnd()).join("\n").trimEnd();
  }
  
  // Convert text to grid
  function textToGrid(text: string) {
    const lines = text.split("\n");
    const maxCols = Math.max(gridCols, ...lines.map(l => l.length));
    const maxRows = Math.max(gridRows, lines.length);
    
    gridData = Array.from({ length: maxRows }, (_, r) => 
      Array.from({ length: maxCols }, (_, c) => 
        lines[r]?.[c] ?? " "
      )
    );
    gridRows = maxRows;
    gridCols = maxCols;
  }
  
  // Clear grid
  function clearGrid() {
    initGrid();
  }
  
  // Copy grid content
  function copyGridContent() {
    const text = gridToText();
    if (text.trim()) {
      navigator.clipboard.writeText(text);
      editorCopied = true;
      setTimeout(() => {
        editorCopied = false;
      }, 2000);
    }
  }
  
  // Sync between modes
  function switchToGridMode() {
    if (editorContent.trim()) {
      textToGrid(editorContent);
    }
    editorMode = "grid";
  }
  
  function switchToTextMode() {
    editorContent = gridToText();
    editorMode = "text";
  }

  // Update cursor position from textarea
  function updateCursorPosition() {
    if (!editorTextarea) return;
    
    const text = editorTextarea.value;
    const selStart = editorTextarea.selectionStart;
    
    // Calculate line and column
    const textBeforeCursor = text.substring(0, selStart);
    const lines = textBeforeCursor.split("\n");
    cursorLine = lines.length;
    cursorColumn = lines[lines.length - 1].length + 1;
  }

  // Derived: line numbers for display
  const editorLines = $derived(editorContent.split("\n"));
  const lineCount = $derived(editorLines.length);

  function copyChar(char: string) {
    navigator.clipboard.writeText(char);
    charCopied = char;
    setTimeout(() => {
      charCopied = null;
    }, 1000);
  }

  function insertChar(char: string) {
    if (editorMode === "grid") {
      selectedBrush = char;
    } else {
      // Insert at cursor position if textarea is focused
      if (editorTextarea && document.activeElement === editorTextarea) {
        const start = editorTextarea.selectionStart;
        const end = editorTextarea.selectionEnd;
        editorContent = editorContent.substring(0, start) + char + editorContent.substring(end);
        // Set cursor position after inserted char
        setTimeout(() => {
          if (editorTextarea) {
            editorTextarea.selectionStart = editorTextarea.selectionEnd = start + 1;
            editorTextarea.focus();
            updateCursorPosition();
          }
        }, 0);
      } else {
        editorContent += char;
      }
    }
  }

  function copyEditorContent() {
    if (editorContent) {
      navigator.clipboard.writeText(editorContent);
      editorCopied = true;
      setTimeout(() => {
        editorCopied = false;
      }, 2000);
    }
  }

  function clearEditor() {
    editorContent = "";
    cursorLine = 1;
    cursorColumn = 1;
  }

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
      Generate ASCII art text using various stylized fonts, or create your own using block characters.
    </p>
  </header>

  <!-- Tabs -->
  <div class="flex border-b border-(--color-border) mb-4">
    <button
      onclick={() => activeTab = "generator"}
      class="px-4 py-2 text-sm font-medium transition-colors {activeTab === 'generator' ? 'text-(--color-text) border-b-2 border-(--color-accent)' : 'text-(--color-text-muted) hover:text-(--color-text)'}"
    >
      Generator
    </button>
    <button
      onclick={() => activeTab = "editor"}
      class="px-4 py-2 text-sm font-medium transition-colors {activeTab === 'editor' ? 'text-(--color-text) border-b-2 border-(--color-accent)' : 'text-(--color-text-muted) hover:text-(--color-text)'}"
    >
      Editor
    </button>
  </div>

  {#if activeTab === "generator"}
  <!-- Generator Tab Controls -->
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
    <div class="relative flex-1 min-h-48 border border-(--color-border) bg-[#1a1a1a] overflow-auto">
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
  {:else}
  <!-- Editor Tab - Left sidebar with controls, Right side with canvas -->
  <div class="flex-1 flex min-h-0 overflow-hidden gap-4">
    <!-- Left Sidebar: Mode, Settings, Brushes -->
    <div class="w-64 shrink-0 flex flex-col gap-4 overflow-hidden">
      <!-- Mode Toggle -->
      <div class="flex flex-col gap-2">
        <span class="text-xs tracking-wider text-(--color-text-light) font-medium">Mode</span>
        <div class="flex border border-(--color-border)">
          <button
            onclick={switchToTextMode}
            class="flex-1 px-3 py-1.5 text-xs transition-colors {editorMode === 'text' ? 'bg-(--color-accent) text-white' : 'bg-(--color-bg) text-(--color-text) hover:bg-(--color-bg-hover)'}"
          >
            Text
          </button>
          <button
            onclick={switchToGridMode}
            class="flex-1 px-3 py-1.5 text-xs transition-colors {editorMode === 'grid' ? 'bg-(--color-accent) text-white' : 'bg-(--color-bg) text-(--color-text) hover:bg-(--color-bg-hover)'}"
          >
            Grid
          </button>
        </div>
      </div>
      
      {#if editorMode === "text"}
        <!-- Font Settings (Text Mode) -->
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <span class="text-xs tracking-wider text-(--color-text-light) font-medium">Font</span>
            {#if fontLoading}
              <span class="text-xs text-(--color-accent)">Loading...</span>
            {/if}
          </div>
          
          <!-- Custom font toggle -->
          <label class="flex items-center gap-2 text-xs text-(--color-text)">
            <input
              type="checkbox"
              bind:checked={useCustomFont}
              class="accent-(--color-accent)"
            />
            Use custom font
          </label>
          
          {#if useCustomFont}
            <!-- Custom font input -->
            <input
              type="text"
              bind:value={customFontName}
              onblur={tryLoadCustomFont}
              onkeydown={(e) => e.key === 'Enter' && tryLoadCustomFont()}
              placeholder="Enter font name..."
              class="w-full px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg) text-(--color-text) placeholder:text-(--color-text-muted)"
            />
            <span class="text-xs text-(--color-text-muted)">
              Enter any Google Font name or system font
            </span>
          {:else}
            <!-- Font dropdown -->
            <select
              bind:value={selectedFontName}
              class="w-full px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg) text-(--color-text)"
            >
              <optgroup label="System Fonts">
                {#each availableEditorFonts.filter(f => f.isSystem) as font}
                  <option value={font.value}>{font.name}</option>
                {/each}
              </optgroup>
              <optgroup label="Google Fonts (auto-download)">
                {#each availableEditorFonts.filter(f => !f.isSystem) as font}
                  <option value={font.value}>
                    {font.name}{loadedGoogleFonts.has(font.value) ? ' ✓' : ''}
                  </option>
                {/each}
              </optgroup>
            </select>
          {/if}
        </div>
        
        <!-- Font Size -->
        <div class="flex flex-col gap-2">
          <span class="text-xs tracking-wider text-(--color-text-light) font-medium">Size: {editorFontSize}px</span>
          <input
            type="range"
            min="8"
            max="32"
            step="1"
            bind:value={editorFontSize}
            class="w-full h-1.5 accent-(--color-accent)"
          />
        </div>
      {:else}
        <!-- Grid Settings -->
        <div class="flex flex-col gap-2">
          <span class="text-xs tracking-wider text-(--color-text-light) font-medium">Grid Size</span>
          <div class="flex items-center gap-2">
            <div class="flex flex-col gap-1">
              <label class="text-xs text-(--color-text-muted)">Rows</label>
              <input
                type="number"
                min="5"
                max="100"
                bind:value={gridRows}
                onchange={() => resizeGrid(gridRows, gridCols)}
                class="w-full px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg) text-(--color-text)"
              />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs text-(--color-text-muted)">Cols</label>
              <input
                type="number"
                min="5"
                max="200"
                bind:value={gridCols}
                onchange={() => resizeGrid(gridRows, gridCols)}
                class="w-full px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg) text-(--color-text)"
              />
            </div>
          </div>
        </div>
        
        <!-- Zoom Control -->
        <div class="flex flex-col gap-2">
          <span class="text-xs tracking-wider text-(--color-text-light) font-medium">Zoom: {gridZoom}%</span>
          <div class="flex items-center gap-2">
            <input
              type="range"
              min="50"
              max="200"
              step="10"
              bind:value={gridZoom}
              class="flex-1 h-1.5 accent-(--color-accent)"
            />
            <button
              onclick={() => gridZoom = 100}
              class="px-2 py-0.5 text-xs border border-(--color-border) bg-(--color-bg) text-(--color-text) hover:bg-(--color-bg-hover)"
              title="Reset zoom to 100%"
            >
              Reset
            </button>
          </div>
        </div>
        
        <!-- Current Brush -->
        <div class="flex flex-col gap-2">
          <span class="text-xs tracking-wider text-(--color-text-light) font-medium">Current Brush</span>
          <div class="flex items-center gap-2">
            <span class="w-10 h-10 flex items-center justify-center text-xl border-2 border-(--color-accent) bg-[#1a1a1a] text-white">
              {selectedBrush}
            </span>
            <span class="text-xs text-(--color-text-muted)">Click character below to change</span>
          </div>
        </div>
      {/if}

      <!-- Block Characters Reference -->
      <div class="flex flex-col gap-2 flex-1 min-h-0">
        <span class="text-xs tracking-wider text-(--color-text-light) font-medium shrink-0">
          {editorMode === "grid" ? "Brushes" : "Characters"}
        </span>
        <div class="flex-1 overflow-auto">
          <div class="flex flex-col gap-2">
            {#each blockCharacters as group}
              <div class="flex flex-col gap-1">
                <span class="text-xs text-(--color-text-muted)">{group.category}</span>
                <div class="flex flex-wrap gap-0.5">
                  {#each group.chars as char}
                    <button
                      onclick={() => insertChar(char)}
                      oncontextmenu={(e) => { e.preventDefault(); copyChar(char); }}
                      class="w-6 h-6 flex items-center justify-center text-sm border border-(--color-border) bg-(--color-bg) hover:bg-(--color-bg-hover) hover:border-(--color-accent) transition-colors cursor-pointer {charCopied === char ? 'bg-(--color-accent) text-white' : selectedBrush === char && editorMode === 'grid' ? 'border-(--color-accent) border-2 bg-(--color-accent)/20' : 'text-(--color-text)'}"
                      title="{editorMode === 'grid' ? 'Click to select brush' : 'Click to insert'}, right-click to copy"
                    >
                      {char}
                    </button>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        </div>
      </div>
    </div>

    <!-- Right Side: Editor Area -->
    <div class="flex-1 flex flex-col min-h-0 min-w-0">
      <!-- Header -->
      <div class="flex justify-between items-center mb-2 shrink-0">
        <span class="text-xs tracking-wider text-(--color-text-light) font-medium">Your ASCII Art</span>
        <div class="flex items-center gap-3">
          {#if editorMode === "text"}
            <span class="text-xs text-(--color-text-muted)">
              Ln {cursorLine}, Col {cursorColumn} | {lineCount} lines, {editorContent.length} chars
            </span>
          {:else}
            <span class="text-xs text-(--color-text-muted)">
              {gridRows}×{gridCols} | Click to draw, Ctrl+Click to erase
            </span>
          {/if}
          <button
            onclick={editorMode === "text" ? clearEditor : clearGrid}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            Clear
          </button>
          <button
            onclick={editorMode === "text" ? copyEditorContent : copyGridContent}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            {editorCopied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
      
      {#if editorMode === "text"}
        <!-- Text Editor with Line Numbers -->
        <div class="flex-1 min-h-0 border border-(--color-border) bg-[#1a1a1a] flex overflow-hidden">
          <!-- Line Numbers -->
          <div 
            class="py-3 px-2 bg-[#252525] border-r border-(--color-border) text-right select-none shrink-0 overflow-y-auto overflow-x-hidden" 
            style="font-family: {editorFontFamily}; font-size: {editorFontSize}px; line-height: 1.2;"
          >
            {#each editorLines as _, i}
              <div class="text-gray-500" style="height: {editorFontSize * 1.2}px; line-height: {editorFontSize * 1.2}px;">{i + 1}</div>
            {/each}
          </div>
          <!-- Textarea Container -->
          <div class="flex-1 min-w-0 relative">
            <textarea
              bind:this={editorTextarea}
              bind:value={editorContent}
              oninput={updateCursorPosition}
              onclick={updateCursorPosition}
              onkeyup={updateCursorPosition}
              placeholder="Create your ASCII art here...&#10;Click characters to insert them, or type directly.&#10;Use Enter for new lines."
              class="absolute inset-0 w-full h-full p-3 text-white bg-transparent resize-none outline-none placeholder:text-gray-500"
              style="font-family: {editorFontFamily}; font-size: {editorFontSize}px; line-height: 1.2;"
            ></textarea>
          </div>
        </div>
      {:else}
        <!-- Grid/Canvas Editor -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div 
          class="flex-1 min-h-0 border border-(--color-border) bg-[#1a1a1a] overflow-auto"
          onmouseup={handleGridMouseUp}
          onmouseleave={handleGridMouseUp}
        >
          <div class="inline-block min-w-full">
            <!-- Column Numbers -->
            <div class="sticky top-0 z-10 flex bg-[#252525] border-b border-(--color-border)">
              <div class="shrink-0 sticky left-0 bg-[#252525] z-20" style="width: 32px; height: {Math.max(20, gridCellSize)}px;"></div>
              {#each Array(gridCols) as _, c}
                <div 
                  class="flex items-center justify-center text-gray-500 shrink-0"
                  style="width: {gridCellSize}px; height: {Math.max(20, gridCellSize)}px; font-size: {Math.max(8, gridFontSize * 0.7)}px;"
                >
                  {(c + 1) % 10 === 0 ? (c + 1) : (c + 1) % 5 === 0 ? '·' : ''}
                </div>
              {/each}
            </div>
            
            <!-- Grid Rows -->
            {#each gridData as row, r}
              <div class="flex">
                <!-- Row Number -->
                <div 
                  class="shrink-0 flex items-center justify-end pr-1 bg-[#252525] border-r border-(--color-border) sticky left-0 z-10"
                  style="width: 32px; height: {gridCellSize}px;"
                >
                  <span class="text-gray-500" style="font-size: {Math.max(8, gridFontSize * 0.75)}px;">{r + 1}</span>
                </div>
                <!-- Grid Cells -->
                {#each row as cell, c}
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="flex items-center justify-center cursor-crosshair hover:bg-[#333] border-r border-b border-[#2a2a2a] shrink-0 select-none"
                    style="width: {gridCellSize}px; height: {gridCellSize}px; font-family: 'Courier New', Courier, monospace; font-size: {gridFontSize}px; line-height: 1;"
                    onmousedown={(e) => handleGridMouseDown(r, c, e)}
                    onmouseenter={(e) => handleGridMouseEnter(r, c, e)}
                    oncontextmenu={(e) => { e.preventDefault(); drawCell(r, c, true); }}
                  >
                    <span class="text-white">{cell}</span>
                  </div>
                {/each}
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>
  {/if}
</div>
