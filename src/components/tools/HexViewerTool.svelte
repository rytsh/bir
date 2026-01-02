<script lang="ts">
  import { onMount, tick } from "svelte";
  import {
    EditorView,
    createEditor,
    createDarkModeObserver,
    getInitialDarkMode,
    getEditorContent,
  } from "../../lib/codemirror.js";

  type InputMode = "text" | "file" | "base64";

  // State
  let inputMode = $state<InputMode>("text");
  let textInput = $state("");
  let fileInput = $state<File | null>(null);
  let base64Input = $state("");
  let isProcessing = $state(false);
  let copied = $state(false);
  let isDark = $state(false);
  let errorMessage = $state("");
  let rawBytes = $state<Uint8Array>(new Uint8Array(0));
  let hoveredOffset = $state<number | null>(null);

  // Configurable options
  let bytesPerRow = $state(16);
  let showOffset = $state(true);
  let showAscii = $state(true);
  let uppercase = $state(true);

  // Virtualization state
  let containerEl: HTMLDivElement;
  let scrollTop = $state(0);
  let containerHeight = $state(400);
  const ROW_HEIGHT = 24;
  const BUFFER_ROWS = 5;

  let inputEditorContainer: HTMLDivElement;
  let base64EditorContainer: HTMLDivElement;
  let inputEditor: EditorView;
  let base64Editor: EditorView;

  // Search state
  let searchQuery = $state("");
  let searchResultsSet = $state<Set<number>>(new Set());
  let searchResultsArray = $state<number[]>([]);
  let currentSearchIndex = $state(0);
  let isSearching = $state(false);

  // Derived values
  let byteCount = $derived(rawBytes.length);
  let totalRows = $derived(Math.ceil(byteCount / bytesPerRow));
  
  // Virtualization calculations
  let startRow = $derived(Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS));
  let endRow = $derived(Math.min(totalRows, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + BUFFER_ROWS));
  let visibleRows = $derived.by(() => {
    const rows: number[] = [];
    for (let i = startRow; i < endRow; i++) {
      rows.push(i);
    }
    return rows;
  });

  const createInputEditor = () => {
    if (!inputEditorContainer) return;
    const content = getEditorContent(inputEditor);
    if (inputEditor) inputEditor.destroy();

    inputEditor = createEditor({
      container: inputEditorContainer,
      config: {
        dark: isDark,
        placeholderText: "Enter text to view as hex...",
        onUpdate: (content) => {
          textInput = content;
        },
      },
      initialContent: content || textInput,
    });
  };

  const createBase64Editor = () => {
    if (!base64EditorContainer) return;
    const content = getEditorContent(base64Editor);
    if (base64Editor) base64Editor.destroy();

    base64Editor = createEditor({
      container: base64EditorContainer,
      config: {
        dark: isDark,
        placeholderText: "Paste Base64 encoded data...",
        onUpdate: (content) => {
          base64Input = content;
        },
      },
      initialContent: content || base64Input,
    });
  };

  const formatHex = (byte: number): string => {
    const hex = byte.toString(16).padStart(2, "0");
    return uppercase ? hex.toUpperCase() : hex;
  };

  const formatOffset = (offset: number): string => {
    const hex = offset.toString(16).padStart(8, "0");
    return uppercase ? hex.toUpperCase() : hex;
  };

  // Get ASCII representation with proper non-printable handling
  const getAsciiChar = (byte: number): { char: string; printable: boolean } => {
    // Standard printable ASCII
    if (byte >= 0x20 && byte <= 0x7e) {
      return { char: String.fromCharCode(byte), printable: true };
    }
    // Common control characters - show as dot
    if (byte < 0x20 || byte === 0x7f) {
      return { char: ".", printable: false };
    }
    // Extended ASCII (128-255) - show the actual character
    if (byte >= 0x80 && byte <= 0xff) {
      // Use CP437/DOS encoding symbols for better visualization
      const cp437 = [
        "Ç","ü","é","â","ä","à","å","ç","ê","ë","è","ï","î","ì","Ä","Å",
        "É","æ","Æ","ô","ö","ò","û","ù","ÿ","Ö","Ü","¢","£","¥","₧","ƒ",
        "á","í","ó","ú","ñ","Ñ","ª","º","¿","⌐","¬","½","¼","¡","«","»",
        "░","▒","▓","│","┤","╡","╢","╖","╕","╣","║","╗","╝","╜","╛","┐",
        "└","┴","┬","├","─","┼","╞","╟","╚","╔","╩","╦","╠","═","╬","╧",
        "╨","╤","╥","╙","╘","╒","╓","╫","╪","┘","┌","█","▄","▌","▐","▀",
        "α","ß","Γ","π","Σ","σ","µ","τ","Φ","Θ","Ω","δ","∞","φ","ε","∩",
        "≡","±","≥","≤","⌠","⌡","÷","≈","°","∙","·","√","ⁿ","²","■","□"
      ];
      return { char: cp437[byte - 0x80], printable: true };
    }
    return { char: ".", printable: false };
  };

  // Column headers
  let columnHeaders = $derived.by(() => {
    const headers: string[] = [];
    for (let i = 0; i < bytesPerRow; i++) {
      headers.push(formatHex(i));
    }
    return headers;
  });

  // Get row data for a given row index
  const getRowData = (rowIndex: number) => {
    const offset = rowIndex * bytesPerRow;
    const offsetHex = formatOffset(offset);
    const bytes: { offset: number; value: number; hex: string; ascii: string; printable: boolean }[] = [];
    
    for (let i = 0; i < bytesPerRow; i++) {
      const byteOffset = offset + i;
      if (byteOffset < rawBytes.length) {
        const value = rawBytes[byteOffset];
        const { char, printable } = getAsciiChar(value);
        bytes.push({
          offset: byteOffset,
          value,
          hex: formatHex(value),
          ascii: char,
          printable,
        });
      }
    }
    
    return { offset, offsetHex, bytes };
  };

  // Generate plain text for copy
  const generatePlainText = (): string => {
    if (rawBytes.length === 0) return "";

    const lines: string[] = [];
    const rowCount = Math.ceil(rawBytes.length / bytesPerRow);

    for (let row = 0; row < rowCount; row++) {
      const offset = row * bytesPerRow;
      const parts: string[] = [];

      if (showOffset) {
        parts.push(formatOffset(offset));
      }

      const hexParts: string[] = [];
      for (let i = 0; i < bytesPerRow; i++) {
        const byteOffset = offset + i;
        if (byteOffset < rawBytes.length) {
          hexParts.push(formatHex(rawBytes[byteOffset]));
        } else {
          hexParts.push("  ");
        }
      }
      parts.push(hexParts.join(" "));

      if (showAscii) {
        let ascii = "";
        for (let i = 0; i < bytesPerRow; i++) {
          const byteOffset = offset + i;
          if (byteOffset < rawBytes.length) {
            const { char } = getAsciiChar(rawBytes[byteOffset]);
            ascii += char;
          } else {
            ascii += " ";
          }
        }
        parts.push(ascii);
      }

      lines.push(parts.join("  "));
    }

    return lines.join("\n");
  };

  const getDataFromInput = async (): Promise<Uint8Array> => {
    if (inputMode === "text") {
      return new TextEncoder().encode(textInput);
    } else if (inputMode === "file") {
      if (!fileInput) {
        throw new Error("No file selected");
      }
      const buffer = await fileInput.arrayBuffer();
      return new Uint8Array(buffer);
    } else if (inputMode === "base64") {
      if (!base64Input.trim()) {
        throw new Error("No Base64 data provided");
      }
      try {
        const cleaned = base64Input.replace(/\s/g, "");
        const binaryString = atob(cleaned);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
      } catch {
        throw new Error("Invalid Base64 data");
      }
    }

    throw new Error("Invalid input mode");
  };

  const handleConvert = async () => {
    isProcessing = true;
    errorMessage = "";
    rawBytes = new Uint8Array(0);
    searchResultsSet = new Set();
    searchResultsArray = [];
    currentSearchIndex = 0;

    try {
      rawBytes = await getDataFromInput();

      if (searchQuery.trim()) {
        performSearch();
      }
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : "Conversion failed";
    } finally {
      isProcessing = false;
    }
  };

  const performSearch = () => {
    if (!searchQuery.trim() || rawBytes.length === 0) {
      searchResultsSet = new Set();
      searchResultsArray = [];
      currentSearchIndex = 0;
      isSearching = false;
      return;
    }

    isSearching = true;
    const query = searchQuery.trim();
    const resultsSet = new Set<number>();
    const matchStarts: number[] = []; // Track match start positions

    // Try to parse as hex sequence first (e.g., "48 65 6c 6c 6f" or "48656c6c6f")
    const hexPattern = query.replace(/\s+/g, "");
    const isHexQuery = /^[0-9a-fA-F]+$/.test(hexPattern) && hexPattern.length % 2 === 0;

    if (isHexQuery && hexPattern.length >= 2) {
      // Convert hex string to bytes
      const searchBytes: number[] = [];
      for (let i = 0; i < hexPattern.length; i += 2) {
        searchBytes.push(parseInt(hexPattern.substring(i, i + 2), 16));
      }

      // Search for byte sequence
      for (let i = 0; i <= rawBytes.length - searchBytes.length; i++) {
        let match = true;
        for (let j = 0; j < searchBytes.length; j++) {
          if (rawBytes[i + j] !== searchBytes[j]) {
            match = false;
            break;
          }
        }
        if (match) {
          matchStarts.push(i);
          // Add all bytes in the match to the results set
          for (let j = 0; j < searchBytes.length; j++) {
            resultsSet.add(i + j);
          }
        }
      }
    }

    // Also search as ASCII string (case-insensitive)
    const queryLower = query.toLowerCase();
    const queryBytes = new TextEncoder().encode(queryLower);
    
    if (queryBytes.length > 0) {
      for (let i = 0; i <= rawBytes.length - queryBytes.length; i++) {
        let match = true;
        for (let j = 0; j < queryBytes.length; j++) {
          // Case-insensitive comparison for ASCII letters
          const dataByte = rawBytes[i + j];
          const queryByte = queryBytes[j];
          const dataLower = dataByte >= 0x41 && dataByte <= 0x5a ? dataByte + 0x20 : dataByte;
          if (dataLower !== queryByte) {
            match = false;
            break;
          }
        }
        if (match) {
          // Check if this match start is already recorded (from hex search)
          if (!matchStarts.includes(i)) {
            matchStarts.push(i);
          }
          // Add all bytes in the match to the results set
          for (let j = 0; j < queryBytes.length; j++) {
            resultsSet.add(i + j);
          }
        }
      }
    }

    matchStarts.sort((a, b) => a - b);
    searchResultsSet = resultsSet;
    searchResultsArray = matchStarts; // Navigate by match starts, not individual bytes
    currentSearchIndex = matchStarts.length > 0 ? 0 : -1;
    isSearching = false;
  };

  const navigateSearch = (direction: "next" | "prev") => {
    if (searchResultsArray.length === 0) return;

    if (direction === "next") {
      currentSearchIndex = (currentSearchIndex + 1) % searchResultsArray.length;
    } else {
      currentSearchIndex =
        (currentSearchIndex - 1 + searchResultsArray.length) % searchResultsArray.length;
    }

    hoveredOffset = searchResultsArray[currentSearchIndex];
    
    // Scroll to the result
    const targetRow = Math.floor(searchResultsArray[currentSearchIndex] / bytesPerRow);
    const targetScrollTop = targetRow * ROW_HEIGHT - containerHeight / 2;
    if (containerEl) {
      containerEl.scrollTop = Math.max(0, targetScrollTop);
    }
  };

  const handleCopy = () => {
    const text = generatePlainText();
    if (text) {
      navigator.clipboard.writeText(text);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    }
  };

  const handleFileChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      fileInput = target.files[0];
    }
  };

  const handleClear = () => {
    textInput = "";
    fileInput = null;
    base64Input = "";
    rawBytes = new Uint8Array(0);
    errorMessage = "";
    searchQuery = "";
    searchResultsSet = new Set();
    searchResultsArray = [];
    currentSearchIndex = 0;
    hoveredOffset = null;
    if (inputEditor) {
      inputEditor.dispatch({
        changes: { from: 0, to: inputEditor.state.doc.length, insert: "" },
      });
    }
    if (base64Editor) {
      base64Editor.dispatch({
        changes: { from: 0, to: base64Editor.state.doc.length, insert: "" },
      });
    }
  };

  const handleScroll = (e: Event) => {
    const target = e.target as HTMLDivElement;
    scrollTop = target.scrollTop;
  };

  const isHighlighted = (offset: number): boolean => hoveredOffset === offset;
  const isSearchMatch = (offset: number): boolean => searchResultsSet.has(offset);
  const isCurrentSearchMatch = (offset: number): boolean => {
    return searchResultsArray.length > 0 && 
           currentSearchIndex >= 0 && 
           searchResultsArray[currentSearchIndex] === offset;
  };

  onMount(() => {
    isDark = getInitialDarkMode();

    const cleanup = createDarkModeObserver((newIsDark) => {
      if (newIsDark !== isDark) {
        isDark = newIsDark;
        createInputEditor();
        createBase64Editor();
      }
    });

    tick().then(() => {
      createInputEditor();
      createBase64Editor();
      if (containerEl) {
        containerHeight = containerEl.clientHeight;
      }
    });

    // ResizeObserver for container
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        containerHeight = entry.contentRect.height;
      }
    });
    
    if (containerEl) {
      resizeObserver.observe(containerEl);
    }

    return () => {
      cleanup();
      inputEditor?.destroy();
      base64Editor?.destroy();
      resizeObserver.disconnect();
    };
  });

  $effect(() => {
    if (inputMode === "text") {
      tick().then(() => createInputEditor());
    } else if (inputMode === "base64") {
      tick().then(() => createBase64Editor());
    }
  });

  let debounceTimer: ReturnType<typeof setTimeout>;
  let searchDebounceTimer: ReturnType<typeof setTimeout>;
  let lastTextInput = "";
  let lastBase64Input = "";
  let lastFile: File | null = null;

  const triggerAutoConvert = (immediate = false) => {
    clearTimeout(debounceTimer);
    if (immediate) {
      handleConvert();
    } else {
      debounceTimer = setTimeout(() => {
        handleConvert();
      }, 300);
    }
  };

  $effect(() => {
    const currentText = textInput;
    if (inputMode === "text" && currentText !== lastTextInput) {
      lastTextInput = currentText;
      if (currentText === "") {
        rawBytes = new Uint8Array(0);
        errorMessage = "";
      } else {
        triggerAutoConvert();
      }
    }
  });

  $effect(() => {
    const currentBase64 = base64Input;
    if (inputMode === "base64" && currentBase64 !== lastBase64Input) {
      lastBase64Input = currentBase64;
      if (currentBase64 === "") {
        rawBytes = new Uint8Array(0);
        errorMessage = "";
      } else {
        triggerAutoConvert();
      }
    }
  });

  $effect(() => {
    const currentFile = fileInput;
    if (inputMode === "file" && currentFile && currentFile !== lastFile) {
      lastFile = currentFile;
      triggerAutoConvert(true);
    }
  });

  // Debounced search
  let lastSearchQuery = "";
  $effect(() => {
    const currentQuery = searchQuery;
    if (currentQuery !== lastSearchQuery) {
      lastSearchQuery = currentQuery;
      clearTimeout(searchDebounceTimer);
      
      if (!currentQuery.trim()) {
        searchResultsSet = new Set();
        searchResultsArray = [];
        currentSearchIndex = 0;
        isSearching = false;
      } else {
        isSearching = true;
        searchDebounceTimer = setTimeout(() => {
          performSearch();
        }, 300);
      }
    }
  });

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Midpoint for visual separator (half of bytesPerRow)
  let midpoint = $derived(Math.floor(bytesPerRow / 2) - 1);
</script>

<div class="h-full flex flex-col overflow-hidden">
  <header class="mb-4 shrink-0">
    <p class="text-sm text-(--color-text-muted)">
      View hex dump of text, files, or Base64 data. Hover to highlight bytes.
    </p>
  </header>

  <!-- Controls -->
  <div class="mb-4 flex flex-col gap-4 shrink-0">
    <div class="flex flex-wrap gap-4 items-end">
      <div>
        <label for="input-mode" class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-2">
          Input
        </label>
        <select
          id="input-mode"
          bind:value={inputMode}
          class="w-32 px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer"
        >
          <option value="text">Text</option>
          <option value="file">File</option>
          <option value="base64">Base64</option>
        </select>
      </div>

      <div>
        <label for="bytes-per-row" class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-2">
          Columns
        </label>
        <select
          id="bytes-per-row"
          bind:value={bytesPerRow}
          class="w-20 px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer"
        >
          <option value={8}>8</option>
          <option value={16}>16</option>
          <option value={32}>32</option>
        </select>
      </div>

      <button
        onclick={handleConvert}
        disabled={isProcessing}
        class="px-6 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50"
      >
        {isProcessing ? "Processing..." : "Convert"}
      </button>

      <button
        onclick={handleClear}
        class="px-4 py-2 border border-(--color-border) text-(--color-text) text-sm font-medium hover:bg-(--color-bg-alt) transition-colors"
      >
        Clear
      </button>
    </div>

    <div class="flex flex-wrap gap-4 items-center">
      <label class="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" bind:checked={showOffset} class="w-4 h-4 cursor-pointer accent-(--color-accent)" />
        <span class="text-sm text-(--color-text)">Offset</span>
      </label>
      <label class="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" bind:checked={showAscii} class="w-4 h-4 cursor-pointer accent-(--color-accent)" />
        <span class="text-sm text-(--color-text)">ASCII</span>
      </label>
      <label class="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" bind:checked={uppercase} class="w-4 h-4 cursor-pointer accent-(--color-accent)" />
        <span class="text-sm text-(--color-text)">Uppercase</span>
      </label>
    </div>
  </div>

  <!-- Input Area -->
  <div class="mb-4 min-h-[100px] flex flex-col shrink-0">
    <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2">
      {inputMode === "text" ? "Text Input" : inputMode === "file" ? "File Input" : "Base64 Input"}
    </span>

    {#if inputMode === "text"}
      <div bind:this={inputEditorContainer} class="flex-1 border border-(--color-border) overflow-hidden bg-(--color-bg)"></div>
    {:else if inputMode === "file"}
      <div class="flex items-center border border-(--color-border) bg-(--color-bg) p-4">
        <input type="file" id="file-input" onchange={handleFileChange} class="hidden" />
        <label for="file-input" class="inline-block px-6 py-3 bg-(--color-bg-alt) border border-(--color-border) text-(--color-text) text-sm cursor-pointer hover:bg-(--color-border) transition-colors">
          {fileInput ? fileInput.name : "Choose a file..."}
        </label>
        {#if fileInput}
          <p class="ml-2 text-xs text-(--color-text-muted)">Size: {formatFileSize(fileInput.size)}</p>
        {/if}
      </div>
    {:else if inputMode === "base64"}
      <div bind:this={base64EditorContainer} class="flex-1 border border-(--color-border) overflow-hidden bg-(--color-bg)"></div>
    {/if}
  </div>

  {#if errorMessage}
    <div class="mb-4 p-3 border border-red-500 bg-red-500/10 text-red-500 text-sm shrink-0">{errorMessage}</div>
  {/if}

  <!-- Search Bar -->
  <div class="mb-2 flex items-center gap-2 shrink-0">
    <input
      type="text"
      bind:value={searchQuery}
      placeholder="Search hex or ASCII..."
      class="w-48 px-3 py-1.5 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm font-mono focus:outline-none focus:border-(--color-accent)"
    />
    {#if isSearching}
      <span class="text-xs text-(--color-text-muted)">Searching...</span>
    {:else if searchResultsArray.length > 0}
      <span class="text-xs text-(--color-text-muted) font-mono">{currentSearchIndex + 1}/{searchResultsArray.length}</span>
      <button onclick={() => navigateSearch("prev")} class="px-2 py-1 text-xs border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-bg-alt) transition-colors">Prev</button>
      <button onclick={() => navigateSearch("next")} class="px-2 py-1 text-xs border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-bg-alt) transition-colors">Next</button>
    {:else if searchQuery.trim() && byteCount > 0}
      <span class="text-xs text-(--color-text-muted)">No matches</span>
    {/if}

    <div class="flex-1"></div>

    {#if byteCount > 0}
      <span class="text-xs text-(--color-text-muted) font-mono">{formatFileSize(byteCount)}</span>
    {/if}

    <button
      onclick={handleCopy}
      disabled={byteCount === 0}
      class="px-3 py-1 text-xs border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-bg-alt) transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  </div>

  <!-- Hex Output with Virtualization -->
  <div
    bind:this={containerEl}
    onscroll={handleScroll}
    onmouseleave={() => (hoveredOffset = null)}
    class="flex-1 min-h-0 border border-(--color-border) bg-(--color-bg) overflow-auto font-mono text-sm"
  >
    {#if byteCount > 0}
      <!-- Header -->
      <div class="sticky top-0 z-10 bg-(--color-bg-alt) border-b border-(--color-border) flex" style="height: {ROW_HEIGHT}px;">
        {#if showOffset}
          <div class="w-24 shrink-0 px-2 flex items-center text-xs text-(--color-text-muted) font-medium">Offset</div>
        {/if}
        <div class="flex items-center">
          {#each columnHeaders as header, i}
            <div 
              class="w-7 text-center text-xs text-(--color-text-muted) {i === midpoint ? 'mr-2' : ''}"
            >{header}</div>
          {/each}
        </div>
        {#if showAscii}
          <div class="px-2 flex items-center text-xs text-(--color-text-muted) font-medium ml-2">ASCII</div>
        {/if}
      </div>

      <!-- Virtual scroll container -->
      <div style="height: {totalRows * ROW_HEIGHT}px; position: relative;">
        {#each visibleRows as rowIndex (rowIndex)}
          {@const row = getRowData(rowIndex)}
          <div
            class="absolute left-0 right-0 flex items-center hover:bg-(--color-bg-alt)/50"
            style="top: {rowIndex * ROW_HEIGHT}px; height: {ROW_HEIGHT}px;"
          >
            {#if showOffset}
              <div class="w-24 shrink-0 px-2 text-(--color-text-muted) select-none">{row.offsetHex}</div>
            {/if}
            <div class="flex">
              {#each row.bytes as byte, i}
                <div
                  class="w-7 text-center cursor-pointer {i === midpoint ? 'mr-2' : ''} {isHighlighted(byte.offset) ? 'bg-(--color-accent) text-(--color-btn-text)' : isCurrentSearchMatch(byte.offset) ? 'bg-amber-400 text-black' : isSearchMatch(byte.offset) ? 'bg-amber-400/30' : 'hover:bg-(--color-border)'}"
                  onmouseenter={() => (hoveredOffset = byte.offset)}
                  title="0x{byte.offset.toString(16).toUpperCase().padStart(8, '0')} = {byte.value}"
                >{byte.hex}</div>
              {/each}
              {#each Array(bytesPerRow - row.bytes.length) as _, i}
                <div class="w-7 text-center text-(--color-text-muted)/30 {row.bytes.length + i === midpoint ? 'mr-2' : ''}">..</div>
              {/each}
            </div>
            {#if showAscii}
              <div class="flex ml-2 px-2">
                {#each row.bytes as byte}
                  <div
                    class="w-[1ch] text-center cursor-pointer {isHighlighted(byte.offset) ? 'bg-(--color-accent) text-(--color-btn-text)' : isCurrentSearchMatch(byte.offset) ? 'bg-amber-400 text-black' : isSearchMatch(byte.offset) ? 'bg-amber-400/30' : 'hover:bg-(--color-border)'} {byte.printable ? 'text-(--color-text)' : 'text-(--color-text-muted)'}"
                    onmouseenter={() => (hoveredOffset = byte.offset)}
                    title="0x{byte.offset.toString(16).toUpperCase().padStart(8, '0')} = {byte.value}"
                  >{byte.ascii}</div>
                {/each}
                {#each Array(bytesPerRow - row.bytes.length) as _}
                  <div class="w-[1ch] text-center text-(--color-text-muted)/30">.</div>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {:else}
      <div class="p-6 text-center text-(--color-text-muted)">
        <p>No data to display</p>
        <p class="mt-2 text-xs">Enter text, upload a file, or paste Base64 data above</p>
      </div>
    {/if}
  </div>
</div>
