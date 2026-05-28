<script lang="ts">
  import figlet from "figlet";

  import {
    allAnsiColors,
    ansiEscapeFormats,
    ansiStyleOptions,
    createDefaultAnsiStyleState,
    formatAnsiEscapes,
    getAnsiBackgroundCode,
    getAnsiColorHex,
    getAnsiEscapeFormat,
    getAnsiForegroundCode,
    getAnsiStyleCodes,
    getAnsiStyleCss,
    type AnsiEscapeFormat,
    type AnsiStyleKey,
    type AnsiStyleState,
  } from "../../lib/ansi.js";

  // Tab state
  type Tab = "generator" | "editor" | "paint";
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

  // Whitespace visualization (display-only overlay; never copied)
  let showWhitespace = $state(false);
  let textareaScrollTop = $state(0);
  let textareaScrollLeft = $state(0);
  const whitespaceOverlayText = $derived(
    showWhitespace
      ? Array.from(editorContent).map((ch) => {
          if (ch === " ") return "·";
          if (ch === "\t") return "\t";
          if (ch === "\n") return "\n";
          return " ";
        }).join("")
      : ""
  );

  type ImageAsciiCharset = "standard" | "detailed" | "blocks" | "custom" | "braille";

  const imageAsciiCharsets: { value: ImageAsciiCharset; label: string; chars?: string }[] = [
    { value: "standard", label: "Standard", chars: "@%#*+=-:. " },
    { value: "detailed", label: "Detailed", chars: "$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,\"^`'. " },
    { value: "blocks", label: "Block shades", chars: "█▓▒░ " },
    { value: "custom", label: "Custom" },
    { value: "braille", label: "Braille dots" },
  ];

  const imageAsciiBackgrounds = [
    { value: " ", label: "Space" },
    { value: ".", label: "Dot" },
    { value: "·", label: "Middle dot" },
    { value: "░", label: "Light shade" },
    { value: "custom", label: "Custom" },
  ];

  let imageAsciiFile: File | null = $state(null);
  let imageAsciiFileName = $state("");
  let imageAsciiWidth = $state(90);
  let imageAsciiCharset = $state<ImageAsciiCharset>("standard");
  let imageAsciiCustomChars = $state("@%#*+=-:. ");
  let imageAsciiDetail = $state(100);
  let imageAsciiThreshold = $state(128);
  let imageAsciiBackground = $state(" ");
  let imageAsciiCustomBackground = $state("·");
  let imageAsciiInvert = $state(false);
  let imageAsciiLoading = $state(false);
  let imageAsciiError = $state("");

  type PaintMode = "fg" | "bg" | "both" | "style" | "full" | "empty" | "clearFg" | "clearBg" | "erase";

  interface PaintCell extends AnsiStyleState {
    char: string;
    fg: string | null;
    bg: string | null;
  }

  const paintPalette = allAnsiColors;
  const defaultPaintFg = getAnsiColorHex(7);
  const defaultPaintBg = getAnsiColorHex(0);

  const paintModes: { value: PaintMode; label: string }[] = [
    { value: "fg", label: "Text" },
    { value: "bg", label: "Background" },
    { value: "both", label: "Colors" },
    { value: "clearFg", label: "Clear text" },
    { value: "clearBg", label: "Clear bg" },
    { value: "style", label: "Style" },
    { value: "full", label: "Full" },
    { value: "empty", label: "Empty" },
    { value: "erase", label: "Reset" },
  ];

  let paintGrid = $state<PaintCell[][]>([]);
  let paintFg = $state(defaultPaintFg);
  let paintBg = $state(defaultPaintBg);
  let paintStyles = $state<AnsiStyleState>(createDefaultAnsiStyleState());
  let paintMode = $state<PaintMode>("fg");
  let isPainting = $state(false);
  let paintCopyFormat = $state<AnsiEscapeFormat>("octal");
  let paintCopied = $state<AnsiEscapeFormat | "plain" | null>(null);
  let paintBlinkOn = $state(true);

  // Paint history for undo/redo
  const MAX_PAINT_HISTORY = 50;
  let paintHistory = $state<PaintCell[][][]>([]);
  let paintHistoryIndex = $state(-1);
  let paintStrokeStartGrid: PaintCell[][] | null = null;
  const canPaintUndo = $derived(paintHistoryIndex > 0);
  const canPaintRedo = $derived(paintHistoryIndex >= 0 && paintHistoryIndex < paintHistory.length - 1);

  // Terminal preview
  type TerminalBgPreset = "dark" | "black" | "light" | "custom";
  const terminalBgPresets: { value: TerminalBgPreset; label: string; color: string }[] = [
    { value: "dark", label: "Dark", color: "#1a1a1a" },
    { value: "black", label: "Black", color: "#000000" },
    { value: "light", label: "Light", color: "#f5f5f5" },
    { value: "custom", label: "Custom", color: "" },
  ];

  interface TerminalFontOption {
    name: string;
    value: string;
    group: "web" | "nerd" | "system";
    googleFont?: boolean;
  }
  const terminalFonts: TerminalFontOption[] = [
    // Web fonts (auto-loaded from Google Fonts)
    { name: "JetBrains Mono", value: "JetBrains Mono", group: "web", googleFont: true },
    { name: "Fira Code", value: "Fira Code", group: "web", googleFont: true },
    { name: "Source Code Pro", value: "Source Code Pro", group: "web", googleFont: true },
    { name: "IBM Plex Mono", value: "IBM Plex Mono", group: "web", googleFont: true },
    { name: "Ubuntu Mono", value: "Ubuntu Mono", group: "web", googleFont: true },
    { name: "Inconsolata", value: "Inconsolata", group: "web", googleFont: true },
    // Nerd Fonts (require local install for full icon coverage)
    { name: "JetBrainsMono Nerd Font", value: "JetBrainsMono Nerd Font", group: "nerd" },
    { name: "FiraCode Nerd Font", value: "FiraCode Nerd Font", group: "nerd" },
    { name: "Hack Nerd Font", value: "Hack Nerd Font", group: "nerd" },
    { name: "MesloLGS NF", value: "MesloLGS NF", group: "nerd" },
    { name: "SauceCodePro Nerd Font", value: "SauceCodePro Nerd Font", group: "nerd" },
    { name: "DejaVuSansMono Nerd Font", value: "DejaVuSansMono Nerd Font", group: "nerd" },
    { name: "CaskaydiaCove Nerd Font", value: "CaskaydiaCove Nerd Font", group: "nerd" },
    { name: "Iosevka Nerd Font", value: "Iosevka Nerd Font", group: "nerd" },
    { name: "UbuntuMono Nerd Font", value: "UbuntuMono Nerd Font", group: "nerd" },
    // System monospace
    { name: "Monaco", value: "Monaco", group: "system" },
    { name: "Menlo", value: "Menlo", group: "system" },
    { name: "Consolas", value: "Consolas", group: "system" },
    { name: "Courier New", value: "Courier New", group: "system" },
  ];

  let terminalBgPreset = $state<TerminalBgPreset>("dark");
  let terminalCustomBg = $state("#1a1a1a");
  let terminalFontName = $state("Courier New");
  let terminalCustomFontName = $state("");
  let useTerminalCustomFont = $state(false);
  // Cell line-height multiplier — defaults to a slightly relaxed terminal feel
  let paintLineHeight = $state(1.1);

  const terminalBgColor = $derived(
    terminalBgPreset === "custom"
      ? terminalCustomBg
      : (terminalBgPresets.find((p) => p.value === terminalBgPreset)?.color ?? "#1a1a1a")
  );

  const terminalFontFamily = $derived(
    useTerminalCustomFont && terminalCustomFontName.trim()
      ? `'${terminalCustomFontName.trim()}', 'JetBrainsMono Nerd Font', 'JetBrains Mono', ui-monospace, monospace`
      : `'${terminalFontName}', 'JetBrainsMono Nerd Font', 'JetBrains Mono', ui-monospace, monospace`
  );

  // Paste-with-colors (terminal HTML/RTF import)
  let pasteVisible = $state(false);
  let pasteRef: HTMLDivElement | null = $state(null);
  let pasteError = $state("");

  // Pick a contrasting default text color for the canvas so unpainted (transparent)
  // chars stay readable on whatever background the user picked.
  const terminalDefaultFg = $derived.by(() => {
    const hex = terminalBgColor.replace("#", "");
    if (hex.length !== 6) return "#cccccc";
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    return luminance > 140 ? "#1f1f1f" : "#dcdcdc";
  });

  let viewZoom = $state(100);
  const viewZoomScale = $derived(viewZoom / 100);
  
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

  $effect(() => {
    const updatePaintBlink = () => {
      paintBlinkOn = Math.floor(Date.now() / 500) % 2 === 0;
    };

    updatePaintBlink();
    const interval = window.setInterval(updatePaintBlink, 125);

    return () => window.clearInterval(interval);
  });

  // Auto-focus the paste-catcher contenteditable when it opens
  $effect(() => {
    if (pasteVisible && pasteRef) {
      pasteRef.innerHTML = "";
      pasteRef.focus();
    }
  });

  // Auto-load Google Font for paint canvas when applicable
  $effect(() => {
    if (activeTab !== "paint") return;
    if (useTerminalCustomFont) {
      const custom = terminalCustomFontName.trim();
      if (custom) loadGoogleFont(custom);
      return;
    }
    const def = terminalFonts.find((f) => f.value === terminalFontName);
    if (def?.googleFont) {
      loadGoogleFont(terminalFontName);
    }
  });

  // Keyboard shortcuts for paint undo/redo (only while paint tab is active)
  $effect(() => {
    if (activeTab !== "paint") return;

    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) return;
      }
      const key = e.key.toLowerCase();
      if (key === "z") {
        e.preventDefault();
        if (e.shiftKey) paintRedo();
        else paintUndo();
      } else if (key === "y") {
        e.preventDefault();
        paintRedo();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
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

  function scaledPx(value: number): number {
    return Math.max(1, Math.round(value * viewZoomScale));
  }
  
  // Grid/Canvas state
  let gridRows = $state(20);
  let gridCols = $state(60);
  let selectedBrush = $state("█");
  let isDrawing = $state(false);
  let gridData = $state<string[][]>([]);
  
  // Computed cell size based on the global view zoom. Use the natural
  // monospace aspect ratio (~0.6 width : 1.2 height for each glyph).
  const gridFontSize = $derived(scaledPx(14));
  const gridCellWidth = $derived(Math.max(1, Math.round(gridFontSize * 0.6)));
  const gridCellHeight = $derived(Math.max(1, Math.round(gridFontSize * 1.2)));
  // Kept for backward-compat where a single "cell size" is referenced
  // (e.g. fixed-width gutters); use the height since rows are taller.
  const gridCellSize = $derived(gridCellHeight);
  
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

  function onTextareaScroll() {
    if (!editorTextarea) return;
    textareaScrollTop = editorTextarea.scrollTop;
    textareaScrollLeft = editorTextarea.scrollLeft;
  }

  // Sync overlay scroll when whitespace is toggled on or textarea ref appears
  $effect(() => {
    if (showWhitespace && editorTextarea) {
      textareaScrollTop = editorTextarea.scrollTop;
      textareaScrollLeft = editorTextarea.scrollLeft;
    }
  });

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

  function getImageAsciiChars(): string[] {
    const charset = imageAsciiCharset === "custom"
      ? imageAsciiCustomChars
      : imageAsciiCharsets.find((item) => item.value === imageAsciiCharset)?.chars ?? "@%#*+=-:. ";
    const chars = Array.from(charset);
    return imageAsciiInvert ? chars.reverse() : chars;
  }

  function applyImageDetail(luminance: number): number {
    const normalized = luminance / 255;
    const detail = Math.max(25, Math.min(250, imageAsciiDetail)) / 100;
    return Math.max(0, Math.min(1, (normalized - 0.5) * detail + 0.5)) * 255;
  }

  function formatImageAsciiLine(line: string): string {
    return getImageAsciiBackground() === " " ? line.trimEnd() : line;
  }

  function getImageAsciiBackground(): string {
    const value = imageAsciiBackground === "custom" ? imageAsciiCustomBackground : imageAsciiBackground;
    return Array.from(value)[0] ?? " ";
  }

  function applyImageAscii(ascii: string) {
    editorContent = ascii;
    textToGrid(ascii);
    cursorLine = 1;
    cursorColumn = 1;
  }

  async function loadImage(file: File): Promise<HTMLImageElement> {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;

    try {
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function imageDataLuminance(data: Uint8ClampedArray, width: number, x: number, y: number): { alpha: number; luminance: number } {
    const i = (y * width + x) * 4;
    const luminance = applyImageDetail(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
    return { alpha: data[i + 3], luminance };
  }

  function convertImageDataToCharacterAscii(data: Uint8ClampedArray, width: number, height: number): string {
    const chars = getImageAsciiChars();
    const background = getImageAsciiBackground();
    const lines: string[] = [];

    if (chars.length < 2) {
      throw new Error("Character set needs at least 2 characters.");
    }

    for (let y = 0; y < height; y++) {
      let line = "";
      for (let x = 0; x < width; x++) {
        const { alpha, luminance } = imageDataLuminance(data, width, x, y);
        if (alpha < 32) {
          line += background;
          continue;
        }

        const charIndex = Math.round((luminance / 255) * (chars.length - 1));
        const char = chars[charIndex];
        line += char === " " ? background : char;
      }
      lines.push(formatImageAsciiLine(line));
    }

    return lines.join("\n").trimEnd();
  }

  function convertImageDataToBrailleAscii(data: Uint8ClampedArray, width: number, height: number): string {
    const background = getImageAsciiBackground();
    const threshold = Math.max(0, Math.min(255, imageAsciiThreshold));
    const dotBits = [
      [0, 3],
      [1, 4],
      [2, 5],
      [6, 7],
    ];
    const lines: string[] = [];

    for (let y = 0; y < height; y += 4) {
      let line = "";
      for (let x = 0; x < width; x += 2) {
        let pattern = 0;

        for (let dy = 0; dy < 4; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const px = x + dx;
            const py = y + dy;
            if (px >= width || py >= height) continue;

            const { alpha, luminance } = imageDataLuminance(data, width, px, py);
            if (alpha < 32) continue;

            const dotOn = imageAsciiInvert ? luminance > threshold : luminance < threshold;
            if (dotOn) pattern |= 1 << dotBits[dy][dx];
          }
        }

        line += pattern === 0 && background !== " " ? background : String.fromCharCode(0x2800 + pattern);
      }
      lines.push(formatImageAsciiLine(line));
    }

    return lines.join("\n").trimEnd();
  }

  async function convertSelectedImageToAscii() {
    if (!imageAsciiFile) {
      imageAsciiError = "Choose an image first.";
      return;
    }

    imageAsciiLoading = true;
    imageAsciiError = "";

    try {
      const img = await loadImage(imageAsciiFile);
      const targetWidth = Math.max(20, Math.min(220, Math.round(imageAsciiWidth)));
      const isBraille = imageAsciiCharset === "braille";
      const canvasWidth = isBraille ? targetWidth * 2 : targetWidth;
      const targetHeight = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * targetWidth * (isBraille ? 0.5 : 0.48)));
      const canvasHeight = isBraille ? targetHeight * 4 : targetHeight;
      const canvas = document.createElement("canvas");
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not create canvas context.");

      ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
      const { data } = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
      const ascii = isBraille
        ? convertImageDataToBrailleAscii(data, canvasWidth, canvasHeight)
        : convertImageDataToCharacterAscii(data, canvasWidth, canvasHeight);

      applyImageAscii(ascii);
    } catch (e) {
      imageAsciiError = e instanceof Error ? e.message : "Failed to convert image.";
    } finally {
      imageAsciiLoading = false;
    }
  }

  async function onImageAsciiFileChange(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    imageAsciiFile = file;
    imageAsciiFileName = file.name;
    await convertSelectedImageToAscii();
  }

  function getCurrentEditorText(): string {
    return editorMode === "grid" ? gridToText() : editorContent;
  }

  // Cells start transparent (no fg/bg) so the terminal's native colors show
  // through wherever the user hasn't explicitly painted.
  function createPaintCell(char: string): PaintCell {
    return {
      char,
      fg: null,
      bg: null,
      ...createDefaultAnsiStyleState(),
    };
  }

  function createResetPaintCell(char: string): PaintCell {
    return {
      char,
      fg: null,
      bg: null,
      ...createDefaultAnsiStyleState(),
    };
  }

  function createEmptyCell(): PaintCell {
    return {
      char: " ",
      fg: null,
      bg: null,
      ...createDefaultAnsiStyleState(),
    };
  }

  // ---- Paste-with-colors -------------------------------------------------

  interface PasteStyle {
    fg: string | null;
    bg: string | null;
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strikethrough: boolean;
  }

  function parseHtmlElementToPaintGrid(root: HTMLElement): PaintCell[][] {
    const rows: PaintCell[][] = [[]];
    const colorCache = new Map<string, string | null>();
    const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "META", "LINK", "TITLE", "HEAD"]);
    const BLOCK_TAGS = new Set(["DIV", "P", "PRE", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "TR", "ARTICLE", "SECTION", "BLOCKQUOTE"]);

    const cssColorToHex = (val: string | null | undefined): string | null => {
      if (!val) return null;
      const key = val.trim();
      if (!key || key === "transparent" || key === "inherit" || key === "currentcolor") return null;
      if (colorCache.has(key)) return colorCache.get(key)!;
      const probe = document.createElement("div");
      probe.style.color = key;
      document.body.appendChild(probe);
      const computed = getComputedStyle(probe).color;
      document.body.removeChild(probe);
      const m = computed.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\)/);
      if (!m) {
        colorCache.set(key, null);
        return null;
      }
      const a = m[4] ? parseFloat(m[4]) : 1;
      if (a === 0) {
        colorCache.set(key, null);
        return null;
      }
      const r = parseInt(m[1], 10).toString(16).padStart(2, "0");
      const g = parseInt(m[2], 10).toString(16).padStart(2, "0");
      const b = parseInt(m[3], 10).toString(16).padStart(2, "0");
      const hex = `#${r}${g}${b}`;
      colorCache.set(key, hex);
      return hex;
    };

    const pushChar = (ch: string, style: PasteStyle) => {
      if (ch === "\n") {
        rows.push([]);
        return;
      }
      if (ch === "\r") return;
      rows[rows.length - 1].push({
        char: ch,
        fg: style.fg,
        bg: style.bg,
        ...createDefaultAnsiStyleState(),
        bold: style.bold,
        italic: style.italic,
        underline: style.underline,
        strikethrough: style.strikethrough,
      });
    };

    const walk = (node: Node, style: PasteStyle, preserveWhitespace: boolean) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? "";
        // In non-preserving contexts, ignore HTML indentation whitespace between
        // tags: text nodes whose whole content is whitespace AND contain a newline.
        // (Plain " " or " - " text nodes inline between spans are kept.)
        if (!preserveWhitespace && /^\s*[\n\r]\s*$/.test(text)) return;
        for (const ch of text) pushChar(ch, style);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node as HTMLElement;
      if (SKIP_TAGS.has(el.tagName)) return;
      if (el.tagName === "BR") {
        rows.push([]);
        return;
      }

      const next: PasteStyle = { ...style };
      const fg = cssColorToHex(el.style.color);
      if (fg) next.fg = fg;
      const bg = cssColorToHex(el.style.backgroundColor);
      if (bg) next.bg = bg;

      const fw = el.style.fontWeight;
      if (fw === "bold" || /^[7-9]00$/.test(fw)) next.bold = true;
      if (el.style.fontStyle === "italic") next.italic = true;

      const td = `${el.style.textDecoration} ${el.style.textDecorationLine}`;
      if (td.includes("underline")) next.underline = true;
      if (td.includes("line-through")) next.strikethrough = true;

      if (el.tagName === "B" || el.tagName === "STRONG") next.bold = true;
      if (el.tagName === "I" || el.tagName === "EM") next.italic = true;
      if (el.tagName === "U") next.underline = true;
      if (el.tagName === "S" || el.tagName === "STRIKE" || el.tagName === "DEL") next.strikethrough = true;

      const ws = el.style.whiteSpace || "";
      const childPreserves =
        preserveWhitespace ||
        el.tagName === "PRE" ||
        ws === "pre" ||
        ws === "pre-wrap" ||
        ws === "pre-line" ||
        ws === "break-spaces";

      for (const child of el.childNodes) walk(child, next, childPreserves);

      // Only treat a block element's end as a line break when we're NOT in a
      // whitespace-preserving context. Inside <pre> (or white-space: pre*),
      // the literal "\n" characters already break lines — counting both would
      // double every newline.
      if (BLOCK_TAGS.has(el.tagName) && !childPreserves && rows[rows.length - 1].length > 0) {
        rows.push([]);
      }
    };

    walk(
      root,
      { fg: null, bg: null, bold: false, italic: false, underline: false, strikethrough: false },
      false,
    );

    while (rows.length > 1 && rows[0].length === 0) rows.shift();
    while (rows.length > 1 && rows[rows.length - 1].length === 0) rows.pop();

    return rows;
  }

  function openPasteCatcher() {
    pasteVisible = true;
    pasteError = "";
  }

  function closePasteCatcher() {
    pasteVisible = false;
    pasteError = "";
    if (pasteRef) pasteRef.innerHTML = "";
  }

  function plainTextToPaintGrid(text: string): PaintCell[][] {
    const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    return lines.map((line) => Array.from(line).map((ch) => createPaintCell(ch)));
  }

  function applyPastedGrid(grid: PaintCell[][]) {
    paintGrid = grid;

    // Reflect the pasted chars back into the editor so both views agree.
    const text = grid.map((row) => row.map((c) => c.char).join("")).join("\n");
    editorContent = text;
    if (editorMode === "grid") {
      const lines = text.split("\n");
      const newRows = Math.max(1, lines.length);
      const newCols = Math.max(1, lines.reduce((max, line) => Math.max(max, Array.from(line).length), 0));
      gridData = lines.map((line) => {
        const cells = Array.from(line);
        while (cells.length < newCols) cells.push(" ");
        return cells;
      });
      while (gridData.length < newRows) {
        gridData.push(Array.from({ length: newCols }, () => " "));
      }
      gridRows = newRows;
      gridCols = newCols;
    }

    pushPaintHistory(paintGrid);
  }

  function onPasteInCatcher(e: ClipboardEvent) {
    // Read the terminal's own clipboard payload directly instead of letting the
    // browser mangle it inside the contenteditable (which doubled newlines).
    e.preventDefault();
    const cd = e.clipboardData;
    if (!cd) {
      pasteError = "Clipboard not available in this browser.";
      return;
    }

    const html = cd.getData("text/html");
    const plain = cd.getData("text/plain");

    try {
      let grid: PaintCell[][];
      if (html && html.trim()) {
        const doc = new DOMParser().parseFromString(html, "text/html");
        grid = parseHtmlElementToPaintGrid(doc.body);
        // If HTML parsing produced nothing usable, fall back to plain text.
        if (grid.length === 0 || grid.every((r) => r.length === 0)) {
          grid = plain ? plainTextToPaintGrid(plain) : grid;
        }
      } else if (plain) {
        grid = plainTextToPaintGrid(plain);
      } else {
        pasteError = "Clipboard is empty.";
        return;
      }

      if (grid.length === 0 || grid.every((r) => r.length === 0)) {
        pasteError = "No paintable content found in clipboard.";
        return;
      }

      applyPastedGrid(grid);
      closePasteCatcher();
    } catch (err) {
      pasteError = err instanceof Error ? err.message : String(err);
    }
  }

  function setPaintStyle(key: AnsiStyleKey, checked: boolean) {
    paintStyles = { ...paintStyles, [key]: checked };
  }

  function getPaintCellStyle(cell: PaintCell): string {
    // null fg/bg → inherit / transparent so the canvas's own colors show through
    return getAnsiStyleCss(
      { ...cell, blink: false },
      cell.fg ?? "inherit",
      cell.bg ?? "transparent",
    );
  }

  function getStylePreviewStyle(key: AnsiStyleKey): string {
    return getAnsiStyleCss(
      { ...createDefaultAnsiStyleState(), [key]: true },
      defaultPaintFg,
      defaultPaintBg,
    );
  }

  function syncPaintFromEditor() {
    const text = getCurrentEditorText();
    if (editorMode === "grid") {
      editorContent = text;
    }

    const lines = text ? text.split("\n") : [""];
    paintGrid = lines.map((line, rowIndex) =>
      Array.from(line || " ").map((char, colIndex) => {
        const existing = paintGrid[rowIndex]?.[colIndex];
        if (existing?.char === char) return existing;
        return createPaintCell(char);
      })
    );
    pushPaintHistory(paintGrid);
  }

  function pushPaintHistory(snapshot: PaintCell[][]) {
    const trimmed = paintHistory.slice(0, paintHistoryIndex + 1);
    trimmed.push(snapshot);
    while (trimmed.length > MAX_PAINT_HISTORY) {
      trimmed.shift();
    }
    paintHistory = trimmed;
    paintHistoryIndex = trimmed.length - 1;
  }

  function paintUndo() {
    if (paintHistoryIndex <= 0) return;
    paintHistoryIndex -= 1;
    paintGrid = paintHistory[paintHistoryIndex];
  }

  function paintRedo() {
    if (paintHistoryIndex < 0 || paintHistoryIndex >= paintHistory.length - 1) return;
    paintHistoryIndex += 1;
    paintGrid = paintHistory[paintHistoryIndex];
  }

  function setActiveTab(tab: Tab) {
    if (tab === "paint") {
      syncPaintFromEditor();
    }
    activeTab = tab;
  }

  function paintPlainText(): string {
    return paintGrid.map((row) => row.map((cell) => cell.char).join("").trimEnd()).join("\n").trimEnd();
  }

  function paintCellAnsiCodes(cell: PaintCell): string {
    const codes: string[] = [...getAnsiStyleCodes(cell)];
    if (cell.fg !== null) codes.push(getAnsiForegroundCode(cell.fg));
    if (cell.bg !== null) codes.push(getAnsiBackgroundCode(cell.bg));
    return codes.join(";");
  }

  function paintAnsiText(): string {
    return paintGrid.map((row) => {
      let line = "";
      // currentCodes "" = transparent run (no ANSI; terminal native fg/bg)
      // otherwise it's the ANSI parameter string for the current colored run
      let currentCodes = "";
      let currentText = "";

      const flushRun = () => {
        if (!currentText) return;
        if (currentCodes === "") {
          // Reset before raw text so previous coloring doesn't bleed onto it
          line += `\x1b[0m${currentText}`;
        } else {
          line += `\x1b[0;${currentCodes}m${currentText}`;
        }
        currentText = "";
      };

      for (const cell of row) {
        const codes = paintCellAnsiCodes(cell);
        if (codes !== currentCodes) {
          flushRun();
          currentCodes = codes;
        }
        currentText += cell.char;
      }

      flushRun();
      return `${line}\x1b[0m`;
    }).join("\n");
  }

  function applyPaintCell(row: number, col: number, erase = false) {
    if (!paintGrid[row]?.[col]) return;
    const next = paintGrid.map((line, rowIndex) =>
      rowIndex === row
        ? line.map((cell, colIndex) => {
            if (colIndex !== col) return cell;
            if (erase || paintMode === "erase") return createResetPaintCell(cell.char);
            if (paintMode === "empty") return createEmptyCell();
            if (paintMode === "clearFg") return { ...cell, fg: null };
            if (paintMode === "clearBg") return { ...cell, bg: null };
            if (paintMode === "fg") return { ...cell, fg: paintFg };
            if (paintMode === "bg") return { ...cell, bg: paintBg };
            if (paintMode === "both") return { ...cell, fg: paintFg, bg: paintBg };
            if (paintMode === "style") return { ...cell, ...paintStyles };
            return { ...cell, fg: paintFg, bg: paintBg, ...paintStyles };
          })
        : line
    );
    paintGrid = next;
  }

  function handlePaintMouseDown(row: number, col: number, e: MouseEvent) {
    isPainting = true;
    paintStrokeStartGrid = paintGrid;
    applyPaintCell(row, col, e.button === 2 || e.ctrlKey || e.metaKey);
  }

  function handlePaintMouseEnter(row: number, col: number, e: MouseEvent) {
    if (!isPainting) return;
    applyPaintCell(row, col, e.ctrlKey || e.metaKey);
  }

  function handlePaintMouseUp() {
    if (isPainting && paintStrokeStartGrid && paintGrid !== paintStrokeStartGrid) {
      pushPaintHistory(paintGrid);
    }
    isPainting = false;
    paintStrokeStartGrid = null;
  }

  async function copyPaintOutput(kind: "ansi" | "plain") {
    const text = kind === "ansi"
      ? formatAnsiEscapes(paintAnsiText(), paintCopyFormat)
      : paintPlainText();
    if (!text) return;
    await navigator.clipboard.writeText(text);
    paintCopied = kind === "ansi" ? paintCopyFormat : "plain";
    setTimeout(() => {
      paintCopied = null;
    }, 2000);
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

<div class="h-full min-h-0 flex flex-col">
  <header class="mb-4 shrink-0">
    <p class="text-sm text-(--color-text-muted)">
      Generate ASCII art text, convert images into ASCII/Braille, edit characters, and paint colored ANSI output.
    </p>
  </header>

  <!-- Tabs -->
  <div class="flex border-b border-(--color-border) mb-4 shrink-0">
    <button
      onclick={() => setActiveTab("generator")}
      class="px-4 py-2 text-sm font-medium transition-colors {activeTab === 'generator' ? 'text-(--color-text) border-b-2 border-(--color-accent)' : 'text-(--color-text-muted) hover:text-(--color-text)'}"
    >
      Generator
    </button>
    <button
      onclick={() => setActiveTab("editor")}
      class="px-4 py-2 text-sm font-medium transition-colors {activeTab === 'editor' ? 'text-(--color-text) border-b-2 border-(--color-accent)' : 'text-(--color-text-muted) hover:text-(--color-text)'}"
    >
      Editor
    </button>
    <button
      onclick={() => setActiveTab("paint")}
      class="px-4 py-2 text-sm font-medium transition-colors {activeTab === 'paint' ? 'text-(--color-text) border-b-2 border-(--color-accent)' : 'text-(--color-text-muted) hover:text-(--color-text)'}"
    >
      Paint
    </button>
  </div>

  <div class="mb-4 shrink-0 flex flex-wrap items-center gap-3 border border-(--color-border) bg-(--color-bg-alt) px-3 py-2">
    <label class="flex items-center gap-2 text-xs tracking-wider text-(--color-text-light) font-medium">
      View Zoom: {viewZoom}%
      <input
        type="range"
        min="50"
        max="250"
        step="10"
        bind:value={viewZoom}
        class="w-36 h-1.5 accent-(--color-accent)"
      />
    </label>
    <button
      onclick={() => (viewZoom = 100)}
      class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg) text-(--color-text-muted) hover:text-(--color-text) transition-colors"
    >
      Reset
    </button>
    <span class="text-xs text-(--color-text-muted)">Display only; font settings and copied output stay unchanged.</span>
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
          style="font-family: 'Courier New', Courier, monospace; font-size: {scaledPx(fontSize)}px; line-height: 1;"
        >{output || "ASCII art will appear here..."}</pre>
      {/if}
    </div>
  </div>
  {:else if activeTab === "editor"}
  <!-- Editor Tab - Left sidebar with controls, Right side with canvas -->
  <div class="flex-1 flex min-h-0 overflow-hidden gap-4">
    <!-- Left Sidebar: Mode, Settings, Brushes -->
    <div class="w-64 shrink-0 min-h-0 h-full flex flex-col gap-4 overflow-y-auto pr-1">
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

      <!-- Image to ASCII -->
      <div class="flex flex-col gap-2 border border-(--color-border) bg-(--color-bg-alt) p-2">
        <span class="text-xs tracking-wider text-(--color-text-light) font-medium">Image to ASCII</span>
        <label class="px-2 py-1.5 text-xs border border-(--color-border) bg-(--color-bg) text-(--color-text-muted) hover:text-(--color-text) cursor-pointer transition-colors text-center">
          Choose image
          <input type="file" accept="image/*" onchange={onImageAsciiFileChange} class="hidden" />
        </label>
        {#if imageAsciiFileName}
          <span class="text-[10px] text-(--color-text-muted) truncate" title={imageAsciiFileName}>{imageAsciiFileName}</span>
        {/if}

        <label class="flex flex-col gap-1 text-xs text-(--color-text-muted)">
          Width: {imageAsciiWidth} chars
          <input
            type="range"
            min="20"
            max="220"
            step="5"
            bind:value={imageAsciiWidth}
            class="w-full h-1.5 accent-(--color-accent)"
          />
        </label>

        <label class="flex flex-col gap-1 text-xs text-(--color-text-muted)">
          Character set
          <select
            bind:value={imageAsciiCharset}
            class="w-full px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg) text-(--color-text)"
          >
            {#each imageAsciiCharsets as charset (charset.value)}
              <option value={charset.value}>{charset.label}</option>
            {/each}
          </select>
        </label>

        {#if imageAsciiCharset === "custom"}
          <label class="flex flex-col gap-1 text-xs text-(--color-text-muted)">
            Custom chars (dark to light)
            <input
              type="text"
              bind:value={imageAsciiCustomChars}
              placeholder="@%#*+=-:. "
              class="w-full px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg) text-(--color-text) font-mono placeholder:text-(--color-text-muted)"
            />
          </label>
        {/if}

        <label class="flex flex-col gap-1 text-xs text-(--color-text-muted)">
          Detail: {imageAsciiDetail}%
          <input
            type="range"
            min="25"
            max="250"
            step="5"
            bind:value={imageAsciiDetail}
            class="w-full h-1.5 accent-(--color-accent)"
          />
        </label>

        {#if imageAsciiCharset === "braille"}
          <label class="flex flex-col gap-1 text-xs text-(--color-text-muted)">
            Braille threshold: {imageAsciiThreshold}
            <input
              type="range"
              min="0"
              max="255"
              step="1"
              bind:value={imageAsciiThreshold}
              class="w-full h-1.5 accent-(--color-accent)"
            />
          </label>
        {/if}

        <label class="flex flex-col gap-1 text-xs text-(--color-text-muted)">
          Background
          <select
            bind:value={imageAsciiBackground}
            class="w-full px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg) text-(--color-text)"
          >
            {#each imageAsciiBackgrounds as background (background.value)}
              <option value={background.value}>{background.label}</option>
            {/each}
          </select>
        </label>

        {#if imageAsciiBackground === "custom"}
          <label class="flex flex-col gap-1 text-xs text-(--color-text-muted)">
            Custom background
            <input
              type="text"
              maxlength="2"
              bind:value={imageAsciiCustomBackground}
              placeholder="·"
              class="w-full px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg) text-(--color-text) font-mono placeholder:text-(--color-text-muted)"
            />
          </label>
        {/if}

        <label class="flex items-center gap-2 text-xs text-(--color-text)">
          <input type="checkbox" bind:checked={imageAsciiInvert} class="accent-(--color-accent)" />
          Invert brightness
        </label>

        <button
          onclick={convertSelectedImageToAscii}
          disabled={!imageAsciiFile || imageAsciiLoading}
          class="px-2 py-1.5 text-xs border border-(--color-border) bg-(--color-bg) text-(--color-text-muted) hover:text-(--color-text) transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {imageAsciiLoading ? "Converting..." : "Convert into editor"}
        </button>

        {#if imageAsciiError}
          <span class="text-[10px] text-(--color-error-text)">{imageAsciiError}</span>
        {:else}
          <span class="text-[10px] text-(--color-text-muted)">Local only. The image is sampled in your browser.</span>
        {/if}
      </div>

      <!-- Block Characters Reference -->
      <div class="flex flex-col gap-2">
        <span class="text-xs tracking-wider text-(--color-text-light) font-medium">
          {editorMode === "grid" ? "Brushes" : "Characters"}
        </span>
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
            <button
              onclick={() => (showWhitespace = !showWhitespace)}
              class="text-xs {showWhitespace ? 'text-(--color-text)' : 'text-(--color-text-muted)'} hover:text-(--color-text) transition-colors"
              title="Toggle whitespace markers (display only — never copied)"
            >
              {showWhitespace ? "Hide ws" : "Show ws"}
            </button>
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
            style="font-family: {editorFontFamily}; font-size: {scaledPx(editorFontSize)}px; line-height: 1.2;"
          >
            {#each editorLines as _, i}
              <div class="text-gray-500" style="height: {scaledPx(editorFontSize * 1.2)}px; line-height: {scaledPx(editorFontSize * 1.2)}px;">{i + 1}</div>
            {/each}
          </div>
          <!-- Textarea Container -->
          <div class="flex-1 min-w-0 relative">
            {#if showWhitespace}
              <div
                class="absolute inset-0 overflow-hidden pointer-events-none select-none"
                aria-hidden="true"
              >
                <div
                  class="p-3"
                  style="font-family: {editorFontFamily}; font-size: {scaledPx(editorFontSize)}px; line-height: 1.2; white-space: pre-wrap; word-break: break-word; color: rgba(180,180,180,0.45); transform: translate({-textareaScrollLeft}px, {-textareaScrollTop}px); will-change: transform;"
                >{whitespaceOverlayText}</div>
              </div>
            {/if}
            <textarea
              bind:this={editorTextarea}
              bind:value={editorContent}
              oninput={updateCursorPosition}
              onclick={updateCursorPosition}
              onkeyup={updateCursorPosition}
              onscroll={onTextareaScroll}
              placeholder="Create your ASCII art here...&#10;Click characters to insert them, or type directly.&#10;Use Enter for new lines."
              class="absolute inset-0 w-full h-full p-3 text-white bg-transparent resize-none outline-none placeholder:text-gray-500"
              style="font-family: {editorFontFamily}; font-size: {scaledPx(editorFontSize)}px; line-height: 1.2;"
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
              <div class="shrink-0 sticky left-0 bg-[#252525] z-20" style="width: 32px; height: {Math.max(20, gridCellHeight)}px;"></div>
              {#each Array(gridCols) as _, c}
                <div 
                  class="flex items-center justify-center text-gray-500 shrink-0"
                  style="width: {gridCellWidth}px; height: {Math.max(20, gridCellHeight)}px; font-size: {Math.max(8, gridFontSize * 0.7)}px;"
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
                  style="width: 32px; height: {gridCellHeight}px;"
                >
                  <span class="text-gray-500" style="font-size: {Math.max(8, gridFontSize * 0.75)}px;">{r + 1}</span>
                </div>
                <!-- Grid Cells -->
                {#each row as cell, c}
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="flex items-center justify-center cursor-crosshair hover:bg-[#333] shrink-0 select-none"
                    style="width: {gridCellWidth}px; height: {gridCellHeight}px; font-family: 'Courier New', Courier, monospace; font-size: {gridFontSize}px; line-height: 1.2;"
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
  {:else if activeTab === "paint"}
  <!-- Paint Tab - colorize the current editor output -->
  <div class="flex-1 flex min-h-0 overflow-hidden gap-4">
    <!-- Paint controls -->
    <div class="w-64 shrink-0 min-h-0 h-full flex flex-col gap-4 overflow-y-auto pr-1">
      <div class="flex flex-col gap-2">
        <span class="text-xs tracking-wider text-(--color-text-light) font-medium">History</span>
        <div class="flex gap-2">
          <button
            onclick={paintUndo}
            disabled={!canPaintUndo}
            title="Undo (Ctrl+Z)"
            class="flex-1 px-2 py-1.5 text-xs border border-(--color-border) bg-(--color-bg) text-(--color-text-muted) hover:text-(--color-text) transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Undo
          </button>
          <button
            onclick={paintRedo}
            disabled={!canPaintRedo}
            title="Redo (Ctrl+Shift+Z / Ctrl+Y)"
            class="flex-1 px-2 py-1.5 text-xs border border-(--color-border) bg-(--color-bg) text-(--color-text-muted) hover:text-(--color-text) transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Redo
          </button>
        </div>
        <span class="text-xs text-(--color-text-muted)">
          {paintHistoryIndex >= 0 ? `Step ${paintHistoryIndex + 1} / ${paintHistory.length}` : "Nothing to undo"} — Ctrl+Z / Ctrl+Shift+Z
        </span>
      </div>

      <div class="flex flex-col gap-2">
        <span class="text-xs tracking-wider text-(--color-text-light) font-medium">Source</span>
        <button
          onclick={syncPaintFromEditor}
          class="px-2 py-1.5 text-xs border border-(--color-border) bg-(--color-bg) text-(--color-text-muted) hover:text-(--color-text) transition-colors"
        >
          Sync from editor
        </button>
        <button
          onclick={openPasteCatcher}
          class="px-2 py-1.5 text-xs border border-(--color-border) bg-(--color-bg) text-(--color-text-muted) hover:text-(--color-text) transition-colors"
        >
          Paste from terminal
        </button>
        {#if pasteVisible}
          <div
            bind:this={pasteRef}
            contenteditable="true"
            class="border border-(--color-accent) bg-(--color-bg) p-2 text-xs outline-none min-h-12 max-h-32 overflow-auto"
            style="white-space: pre; font-family: {terminalFontFamily};"
            onpaste={onPasteInCatcher}
          ></div>
          <div class="flex justify-between items-center gap-2">
            <span class="text-xs text-(--color-text-muted)">Focus the box and press {navigator.platform.includes("Mac") ? "⌘V" : "Ctrl+V"}.</span>
            <button
              onclick={closePasteCatcher}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              Cancel
            </button>
          </div>
          {#if pasteError}
            <span class="text-xs text-(--color-error-text)">{pasteError}</span>
          {/if}
        {/if}
        <span class="text-xs text-(--color-text-muted)">
          Sync replaces the canvas with the editor text. Paste imports colored output from Ghostty / Kitty / iTerm (Copy as HTML / Copy with Styles).
        </span>
      </div>

      <div class="flex flex-col gap-2">
        <span class="text-xs tracking-wider text-(--color-text-light) font-medium">Appearance</span>

        <div class="flex flex-col gap-1">
          <span class="text-xs text-(--color-text-muted)">Background</span>
          <div class="flex items-center gap-1 flex-wrap">
            {#each terminalBgPresets as preset (preset.value)}
              <button
                onclick={() => (terminalBgPreset = preset.value)}
                class="w-7 h-7 border text-[10px] flex items-center justify-center transition-colors {terminalBgPreset === preset.value
                  ? 'border-(--color-accent) ring-1 ring-(--color-accent)'
                  : 'border-(--color-border) hover:border-(--color-accent)'}"
                style={preset.value === "custom" ? "" : `background-color: ${preset.color}; color: ${preset.value === "light" ? "#333" : "#aaa"};`}
                title={preset.label}
              >
                {preset.value === "custom" ? "+" : ""}
              </button>
            {/each}
            {#if terminalBgPreset === "custom"}
              <input
                type="color"
                bind:value={terminalCustomBg}
                class="w-7 h-7 border border-(--color-border) cursor-pointer"
                title="Pick background color"
              />
            {/if}
          </div>
        </div>

        <div class="flex flex-col gap-1">
          <span class="text-xs text-(--color-text-muted)">Font</span>
          {#if useTerminalCustomFont}
            <input
              type="text"
              bind:value={terminalCustomFontName}
              placeholder="Locally installed font name"
              class="w-full px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg) text-(--color-text)"
            />
          {:else}
            <select
              bind:value={terminalFontName}
              class="w-full px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg) text-(--color-text)"
            >
              <optgroup label="Web (auto-load)">
                {#each terminalFonts.filter((f) => f.group === "web") as font (font.value)}
                  <option value={font.value}>{font.name}</option>
                {/each}
              </optgroup>
              <optgroup label="Nerd Fonts (install locally)">
                {#each terminalFonts.filter((f) => f.group === "nerd") as font (font.value)}
                  <option value={font.value}>{font.name}</option>
                {/each}
              </optgroup>
              <optgroup label="System">
                {#each terminalFonts.filter((f) => f.group === "system") as font (font.value)}
                  <option value={font.value}>{font.name}</option>
                {/each}
              </optgroup>
            </select>
          {/if}
          <button
            onclick={() => (useTerminalCustomFont = !useTerminalCustomFont)}
            class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg) text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            title="Toggle custom font name input"
          >
            {useTerminalCustomFont ? "Use list" : "Use custom"}
          </button>
        </div>

        <div class="flex flex-col gap-1">
          <div class="flex items-center justify-between">
            <span class="text-xs text-(--color-text-muted)">Line height</span>
            <span class="text-xs text-(--color-text-muted)">{paintLineHeight.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0.85"
            max="1.6"
            step="0.05"
            bind:value={paintLineHeight}
            class="w-full accent-(--color-accent)"
          />
          <button
            onclick={() => (paintLineHeight = 1.1)}
            class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg) text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            title="Reset to default (1.10)"
          >
            Reset to 1.10
          </button>
        </div>

        <span class="text-xs text-(--color-text-muted)">
          Default Courier New @ 1.10. Nerd Fonts need local install. Unpainted cells are transparent — they emit no ANSI codes, so the terminal's own colors show through (good for half-blocks like ▀ where only the top should be colored). Use <b>Empty</b> to wipe a cell back to transparent.
        </span>
      </div>

      <div class="flex flex-col gap-2">
        <span class="text-xs tracking-wider text-(--color-text-light) font-medium">Paint mode</span>
        <div class="grid grid-cols-2 gap-1">
          {#each paintModes as mode (mode.value)}
            <button
              onclick={() => (paintMode = mode.value)}
              class="px-2 py-1 text-xs border transition-colors {paintMode === mode.value
                ? 'bg-(--color-accent) text-white border-(--color-accent)'
                : 'bg-(--color-bg) text-(--color-text-muted) border-(--color-border) hover:text-(--color-text)'}"
            >
              {mode.label}
            </button>
          {/each}
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <label class="flex flex-col gap-1 text-xs text-(--color-text-muted)">
          Text color
          <input type="color" bind:value={paintFg} class="w-full h-8 border border-(--color-border) bg-(--color-bg) cursor-pointer" />
        </label>
        <label class="flex flex-col gap-1 text-xs text-(--color-text-muted)">
          Background
          <input type="color" bind:value={paintBg} class="w-full h-8 border border-(--color-border) bg-(--color-bg) cursor-pointer" />
        </label>
      </div>

      <div class="flex flex-col gap-2">
        <span class="text-xs tracking-wider text-(--color-text-light) font-medium">ANSI palette</span>
        <div class="grid grid-cols-6 gap-1">
          {#each paintPalette as color (color.code)}
            <button
              onclick={() => {
                if (paintMode === "bg") paintBg = color.hex;
                else paintFg = color.hex;
              }}
              class="w-7 h-7 border transition-colors {(paintMode === 'bg' ? paintBg : paintFg) === color.hex
                ? 'border-(--color-accent) ring-1 ring-(--color-accent)'
                : 'border-(--color-border) hover:border-(--color-accent)'}"
              style="background-color: {color.hex};"
              title={`${color.name} (${color.code})`}
            ></button>
          {/each}
        </div>
        <span class="text-xs text-(--color-text-muted)">Uses the same 16 ANSI colors as ANSI Colors. Palette sets text color, or background color in Background mode.</span>
      </div>

      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs tracking-wider text-(--color-text-light) font-medium">ANSI styles</span>
          <button
            onclick={() => (paintStyles = createDefaultAnsiStyleState())}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            Clear
          </button>
        </div>
        <div class="grid grid-cols-2 gap-1">
          {#each ansiStyleOptions as style (style.key)}
            <label class="flex items-center gap-2 px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg) text-(--color-text-muted) cursor-pointer hover:text-(--color-text) transition-colors">
              <input
                type="checkbox"
                checked={paintStyles[style.key]}
                onchange={(e) => setPaintStyle(style.key, (e.currentTarget as HTMLInputElement).checked)}
                class="accent-(--color-accent)"
              />
              <span style={style.key === "hidden" ? "" : getStylePreviewStyle(style.key)}>{style.label}</span>
            </label>
          {/each}
        </div>
        <span class="text-xs text-(--color-text-muted)">Use Style mode to paint only style flags, or Full mode to paint colors and styles together.</span>
      </div>

      <div class="flex flex-col gap-2">
        <span class="text-xs tracking-wider text-(--color-text-light) font-medium">Copy</span>
        <label class="flex flex-col gap-1 text-xs text-(--color-text-muted)">
          ANSI format
          <select
            bind:value={paintCopyFormat}
            class="w-full px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg) text-(--color-text)"
          >
            {#each ansiEscapeFormats as format (format.id)}
              <option value={format.id}>{format.name}</option>
            {/each}
          </select>
        </label>
        <span class="text-xs text-(--color-text-muted)">{getAnsiEscapeFormat(paintCopyFormat).description}</span>
        <div class="flex gap-2">
          <button
            onclick={() => copyPaintOutput("ansi")}
            title={getAnsiEscapeFormat(paintCopyFormat).shortLabel}
            class="flex-1 min-w-0 px-2 py-1.5 text-xs border border-(--color-border) bg-(--color-bg) text-(--color-text-muted) hover:text-(--color-text) transition-colors whitespace-nowrap overflow-hidden text-ellipsis"
          >
            {paintCopied === paintCopyFormat ? "Copied" : "Copy ANSI"}
          </button>
          <button
            onclick={() => copyPaintOutput("plain")}
            class="flex-1 px-2 py-1.5 text-xs border border-(--color-border) bg-(--color-bg) text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            {paintCopied === "plain" ? "Copied" : "Plain"}
          </button>
        </div>
      </div>
    </div>

    <!-- Paint canvas -->
    <div class="flex-1 flex flex-col min-h-0 min-w-0">
      <div class="flex justify-between items-center mb-2 shrink-0 gap-2">
        <span class="text-xs tracking-wider text-(--color-text-light) font-medium">Color Paint</span>
        <span class="text-xs text-(--color-text-muted) truncate">
          {paintGrid.length} lines{paintGrid[0]?.length ? `, ${paintGrid[0].length} cols` : ""} | Drag to paint, Ctrl+Click resets
        </span>
      </div>

      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="flex-1 min-h-0 border border-(--color-border) overflow-auto p-3 {paintBlinkOn ? 'paint-blink-on' : 'paint-blink-off'}"
        style="background-color: {terminalBgColor}; color: {terminalDefaultFg};"
        onmouseup={handlePaintMouseUp}
        onmouseleave={handlePaintMouseUp}
      >
        {#if paintGrid.length === 0 || !paintPlainText()}
          <div class="text-sm text-gray-500">
            Add or generate ASCII in the Editor tab, then open Paint or click Sync from editor.
          </div>
        {:else}
          <div class="inline-block min-w-full select-none">
            {#each paintGrid as row, r}
              <div class="flex">
                {#each row as cell, c}
                  <button
                    type="button"
                    class="flex items-center justify-center shrink-0 cursor-crosshair border-0 p-0 m-0 {cell.blink ? 'paint-blink' : ''}"
                    style="width: {Math.max(8, scaledPx(editorFontSize * 0.6))}px; height: {Math.max(8, scaledPx(editorFontSize * paintLineHeight))}px; font-family: {terminalFontFamily}; font-size: {scaledPx(editorFontSize)}px; line-height: {paintLineHeight}; white-space: pre; {getPaintCellStyle(cell)}"
                    onmousedown={(e) => handlePaintMouseDown(r, c, e)}
                    onmouseenter={(e) => handlePaintMouseEnter(r, c, e)}
                    oncontextmenu={(e) => { e.preventDefault(); applyPaintCell(r, c, true); }}
                    title="Click/drag to paint. Ctrl+Click or right-click resets this cell."
                  >{cell.char}</button>
                {/each}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>

  </div>
  {/if}
</div>

<style>
  .paint-blink-off .paint-blink {
    visibility: hidden;
  }
</style>
