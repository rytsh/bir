<script lang="ts">
  interface Glyph {
    char: string;
    codePoint: number;
    name: string;
  }

  let fontName = $state("Custom Font");
  let glyphs = $state<Glyph[]>([]);
  let loading = $state(false);
  let error = $state("");
  let copied = $state<string | null>(null);
  let fontFace = $state<FontFace | null>(null);
  let searchQuery = $state("");
  let urlInput = $state("");
  let showUrlInput = $state(false);

  let fileInput: HTMLInputElement;

  const NOTO_EMOJI_URL = "https://cdn.jsdelivr.net/gh/googlefonts/noto-emoji@main/fonts/NotoColorEmoji.ttf";

  const getCodePointName = (codePoint: number): string => {
    return `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
  };

  // Detect font format from magic bytes
  const detectFontFormat = (buffer: ArrayBuffer): string => {
    const data = new DataView(buffer);
    const magic = data.getUint32(0);
    
    // WOFF2
    if (magic === 0x774F4632) return "woff2";
    // WOFF
    if (magic === 0x774F4646) return "woff";
    // TrueType/OpenType
    if (magic === 0x00010000 || magic === 0x4F54544F) return "ttf";
    // TrueType collection
    if (magic === 0x74746366) return "ttc";
    
    return "unknown";
  };

  // Parse TTF/OTF cmap table to get supported code points
  const parseTTFCodePoints = (buffer: ArrayBuffer): number[] => {
    const data = new DataView(buffer);
    const codePoints = new Set<number>();

    try {
      const numTables = data.getUint16(4);
      let cmapOffset = 0;
      
      for (let i = 0; i < numTables; i++) {
        const tableOffset = 12 + i * 16;
        const tag = String.fromCharCode(
          data.getUint8(tableOffset),
          data.getUint8(tableOffset + 1),
          data.getUint8(tableOffset + 2),
          data.getUint8(tableOffset + 3)
        );
        if (tag === "cmap") {
          cmapOffset = data.getUint32(tableOffset + 8);
          break;
        }
      }

      if (cmapOffset === 0) return [];

      const numSubtables = data.getUint16(cmapOffset + 2);
      
      for (let i = 0; i < numSubtables; i++) {
        const subtableOffset = cmapOffset + 4 + i * 8;
        const platformID = data.getUint16(subtableOffset);
        const offset = data.getUint32(subtableOffset + 4);
        
        const tableStart = cmapOffset + offset;
        const format = data.getUint16(tableStart);

        if (format === 4 && (platformID === 3 || platformID === 0)) {
          const segCount = data.getUint16(tableStart + 6) / 2;
          const endCodesOffset = tableStart + 14;
          const startCodesOffset = endCodesOffset + segCount * 2 + 2;
          const idDeltaOffset = startCodesOffset + segCount * 2;
          const idRangeOffset = idDeltaOffset + segCount * 2;

          for (let j = 0; j < segCount; j++) {
            const endCode = data.getUint16(endCodesOffset + j * 2);
            const startCode = data.getUint16(startCodesOffset + j * 2);
            const idDelta = data.getInt16(idDeltaOffset + j * 2);
            const idRangeOffsetValue = data.getUint16(idRangeOffset + j * 2);

            if (startCode === 0xFFFF) continue;

            for (let code = startCode; code <= endCode; code++) {
              let glyphIndex: number;
              if (idRangeOffsetValue === 0) {
                glyphIndex = (code + idDelta) & 0xFFFF;
              } else {
                const glyphIndexOffset = idRangeOffset + j * 2 + idRangeOffsetValue + (code - startCode) * 2;
                glyphIndex = data.getUint16(glyphIndexOffset);
                if (glyphIndex !== 0) {
                  glyphIndex = (glyphIndex + idDelta) & 0xFFFF;
                }
              }
              if (glyphIndex !== 0) {
                codePoints.add(code);
              }
            }
          }
        }
        
        if (format === 12 && (platformID === 3 || platformID === 0)) {
          const numGroups = data.getUint32(tableStart + 12);
          const groupsOffset = tableStart + 16;

          for (let j = 0; j < numGroups; j++) {
            const groupOffset = groupsOffset + j * 12;
            const startCharCode = data.getUint32(groupOffset);
            const endCharCode = data.getUint32(groupOffset + 4);
            
            for (let code = startCharCode; code <= endCharCode; code++) {
              codePoints.add(code);
            }
          }
        }
      }
    } catch {
      return [];
    }

    return Array.from(codePoints).sort((a, b) => a - b);
  };

  // Unicode ranges to scan for canvas-based fallback
  const UNICODE_RANGES = [
    [0x0020, 0x007F], // Basic Latin
    [0x00A0, 0x00FF], // Latin-1 Supplement
    [0x0100, 0x017F], // Latin Extended-A
    [0x0180, 0x024F], // Latin Extended-B
    [0x0250, 0x02AF], // IPA Extensions
    [0x0370, 0x03FF], // Greek
    [0x0400, 0x04FF], // Cyrillic
    [0x0500, 0x052F], // Cyrillic Supplement
    [0x0530, 0x058F], // Armenian
    [0x0590, 0x05FF], // Hebrew
    [0x0600, 0x06FF], // Arabic
    [0x0900, 0x097F], // Devanagari
    [0x10300, 0x1032F], // Old Italic
    [0x10330, 0x1034F], // Gothic
    [0x10380, 0x1039F], // Ugaritic
    [0x103A0, 0x103DF], // Old Persian
    [0x10400, 0x1044F], // Deseret
    [0x10450, 0x1047F], // Shavian
    [0x10480, 0x104AF], // Osmanya
    [0x10800, 0x1083F], // Cypriot Syllabary
    [0x10900, 0x1091F], // Phoenician
    [0x10920, 0x1093F], // Lydian
    [0x10A00, 0x10A5F], // Kharoshthi
    [0x10C00, 0x10C4F], // Old Turkic
    [0x2000, 0x206F], // General Punctuation
    [0x20A0, 0x20CF], // Currency Symbols
    [0x2100, 0x214F], // Letterlike Symbols
    [0x2190, 0x21FF], // Arrows
    [0x2200, 0x22FF], // Mathematical Operators
    [0x2300, 0x23FF], // Miscellaneous Technical
    [0x2500, 0x257F], // Box Drawing
    [0x25A0, 0x25FF], // Geometric Shapes
    [0x2600, 0x26FF], // Miscellaneous Symbols
    [0x2700, 0x27BF], // Dingbats
    [0x1F300, 0x1F5FF], // Misc Symbols and Pictographs
    [0x1F600, 0x1F64F], // Emoticons
    [0x1F680, 0x1F6FF], // Transport and Map
    [0x1F900, 0x1F9FF], // Supplemental Symbols
  ];

  // Canvas-based glyph detection for WOFF/WOFF2
  const detectGlyphsWithCanvas = async (fontFamily: string): Promise<number[]> => {
    const codePoints: number[] = [];
    
    await document.fonts.ready;
    
    const canvas = document.createElement("canvas");
    canvas.width = 50;
    canvas.height = 50;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    
    // Helper to get pixel signature (count + hash of positions)
    const getPixelSignature = (): { count: number; hash: number } => {
      const imgData = ctx.getImageData(0, 0, 50, 50).data;
      let count = 0;
      let hash = 0;
      for (let i = 3; i < imgData.length; i += 4) {
        if (imgData[i] > 0) {
          count++;
          hash = (hash * 31 + i) >>> 0;
        }
      }
      return { count, hash };
    };
    
    // Get signatures for known missing glyphs using multiple test chars
    const missingSignatures = new Set<string>();
    const testMissingChars = ["\uFFFF", "\uFFFE", "\u0000", "\u0001"];
    for (const testChar of testMissingChars) {
      ctx.clearRect(0, 0, 50, 50);
      ctx.font = `32px "${fontFamily}"`;
      ctx.fillText(testChar, 0, 32);
      const sig = getPixelSignature();
      missingSignatures.add(`${sig.count}:${sig.hash}`);
    }
    // Also add empty (0 pixels) as missing
    missingSignatures.add("0:0");
    
    for (const [start, end] of UNICODE_RANGES) {
      for (let cp = start; cp <= end; cp++) {
        if (cp < 0x20) continue;
        if (cp >= 0x7F && cp < 0xA0) continue;
        
        try {
          const char = String.fromCodePoint(cp);
          
          ctx.clearRect(0, 0, 50, 50);
          ctx.font = `32px "${fontFamily}"`;
          ctx.fillText(char, 0, 32);
          
          const sig = getPixelSignature();
          const sigKey = `${sig.count}:${sig.hash}`;
          
          // Has visible pixels and different from missing glyph signatures
          if (sig.count > 0 && !missingSignatures.has(sigKey)) {
            codePoints.push(cp);
          }
        } catch {
          // Invalid code point
        }
      }
    }
    
    return codePoints;
  };

  const extractGlyphs = async (buffer: ArrayBuffer, fontFamily: string): Promise<Glyph[]> => {
    const format = detectFontFormat(buffer);
    let codePoints: number[] = [];
    
    if (format === "ttf") {
      codePoints = parseTTFCodePoints(buffer);
    }
    
    // Fallback to canvas detection for WOFF/WOFF2 or if TTF parsing failed
    if (codePoints.length === 0) {
      codePoints = await detectGlyphsWithCanvas(fontFamily);
    }
    
    const result: Glyph[] = [];
    for (const codePoint of codePoints) {
      if (codePoint < 0x20) continue;
      if (codePoint >= 0x7F && codePoint < 0xA0) continue;
      if (codePoint >= 0xE000 && codePoint <= 0xF8FF) continue;
      if (codePoint >= 0xF0000) continue;

      try {
        const char = String.fromCodePoint(codePoint);
        result.push({
          char,
          codePoint,
          name: getCodePointName(codePoint),
        });
      } catch {
        // Invalid code point
      }
    }

    return result;
  };

  const loadFontFromFile = async (file: File) => {
    loading = true;
    error = "";
    glyphs = [];

    try {
      const buffer = await file.arrayBuffer();
      const fontFamilyName = `CustomFont_${Date.now()}`;
      
      if (fontFace) {
        document.fonts.delete(fontFace);
      }

      const newFontFace = new FontFace(fontFamilyName, buffer);
      await newFontFace.load();
      document.fonts.add(newFontFace);
      fontFace = newFontFace;

      fontName = file.name.replace(/\.(ttf|otf|woff|woff2)$/i, "");
      glyphs = await extractGlyphs(buffer, fontFamilyName);

      if (glyphs.length === 0) {
        error = "No supported glyphs found in this font";
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load font";
    } finally {
      loading = false;
    }
  };

  const loadFontFromUrl = async (url: string, name: string) => {
    loading = true;
    error = "";
    glyphs = [];

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const buffer = await response.arrayBuffer();
      const fontFamilyName = `CustomFont_${Date.now()}`;

      if (fontFace) {
        document.fonts.delete(fontFace);
      }

      const newFontFace = new FontFace(fontFamilyName, buffer);
      await newFontFace.load();
      document.fonts.add(newFontFace);
      fontFace = newFontFace;

      fontName = name;
      glyphs = await extractGlyphs(buffer, fontFamilyName);

      if (glyphs.length === 0) {
        error = "No supported glyphs found in this font";
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load font from URL";
    } finally {
      loading = false;
    }
  };

  const handleFileSelect = (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      loadFontFromFile(file);
    }
    input.value = "";
  };

  const handleCopyGlyph = async (glyph: Glyph) => {
    try {
      await navigator.clipboard.writeText(glyph.char);
      copied = glyph.name;
      setTimeout(() => (copied = null), 1500);
    } catch {
      error = "Failed to copy to clipboard";
    }
  };

  const handleLoadFromUrl = () => {
    if (!urlInput.trim()) {
      error = "Please enter a URL";
      return;
    }
    const urlPath = urlInput.split("/").pop() || "Custom Font";
    const name = urlPath.replace(/\.(ttf|otf|woff|woff2)$/i, "");
    loadFontFromUrl(urlInput.trim(), name);
    showUrlInput = false;
    urlInput = "";
  };

  const filteredGlyphs = $derived(
    searchQuery
      ? glyphs.filter(
          (g) =>
            g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            g.char.includes(searchQuery) ||
            g.codePoint.toString(16).includes(searchQuery.toLowerCase())
        )
      : glyphs
  );
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <h1 class="text-xl font-medium text-(--color-text) mb-2">
      Font Glyphs Viewer
    </h1>
    <p class="text-sm text-(--color-text-muted)">
      Load a font file to view and copy its available glyphs. Click on any glyph to copy it.
    </p>
  </header>

  <!-- Hidden file input -->
  <input
    type="file"
    accept=".ttf,.otf,.woff,.woff2"
    bind:this={fileInput}
    onchange={handleFileSelect}
    class="hidden"
  />

  <!-- Controls -->
  <div class="mb-4 flex flex-wrap gap-3 items-center">
    <button
      onclick={() => fileInput?.click()}
      disabled={loading}
      class="px-3 py-1.5 text-sm font-medium bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50"
    >
      {loading ? "Loading..." : "Load Font File"}
    </button>
    
    <button
      onclick={() => { showUrlInput = !showUrlInput; }}
      disabled={loading}
      class="px-3 py-1.5 text-sm font-medium border border-(--color-border) text-(--color-text) hover:bg-(--color-border) transition-colors disabled:opacity-50"
    >
      From URL
    </button>
    
    <button
      onclick={() => loadFontFromUrl(NOTO_EMOJI_URL, "Noto Color Emoji")}
      disabled={loading}
      class="px-3 py-1.5 text-sm font-medium border border-(--color-border) text-(--color-text) hover:bg-(--color-border) transition-colors disabled:opacity-50"
    >
      Load Noto Emoji
    </button>
  </div>

  <!-- URL Input -->
  {#if showUrlInput}
    <div class="mb-4 flex gap-2 items-center">
      <input
        type="url"
        bind:value={urlInput}
        placeholder="Enter font URL (.ttf, .otf, .woff, .woff2)..."
        class="flex-1 px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
        onkeydown={(e) => e.key === "Enter" && handleLoadFromUrl()}
      />
      <button
        onclick={handleLoadFromUrl}
        disabled={loading}
        class="px-3 py-1.5 text-sm font-medium bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50"
      >
        Load
      </button>
      <button
        onclick={() => { showUrlInput = false; urlInput = ""; }}
        class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
      >
        Cancel
      </button>
    </div>
  {/if}

  <!-- Search and Info -->
  {#if glyphs.length > 0}
    <div class="mb-4 flex flex-wrap gap-4 items-center justify-between">
      <div class="flex items-center gap-3">
        <span class="text-sm font-medium text-(--color-text)">{fontName}</span>
        <span class="text-xs text-(--color-text-muted)">
          {filteredGlyphs.length} of {glyphs.length} glyphs
        </span>
      </div>
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Search glyphs..."
        class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) focus:outline-none focus:border-(--color-accent) w-48"
      />
    </div>
  {/if}

  <!-- Error -->
  {#if error}
    <div class="mb-4 p-3 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm">
      {error}
    </div>
  {/if}

  <!-- Loading -->
  {#if loading}
    <div class="flex-1 flex items-center justify-center">
      <div class="text-center">
        <div class="text-lg text-(--color-text-muted)">Loading font...</div>
      </div>
    </div>
  {:else if glyphs.length === 0}
    <div class="flex-1 flex items-center justify-center">
      <div class="text-center text-(--color-text-muted)">
        <p class="mb-2">No font loaded</p>
        <p class="text-sm text-(--color-text-light)">Upload a font file or load Noto Emoji to view glyphs</p>
      </div>
    </div>
  {:else}
    <!-- Glyphs Grid -->
    <div class="flex-1 overflow-auto border border-(--color-border) bg-(--color-bg-alt) p-2">
      <div class="grid grid-cols-[repeat(auto-fill,minmax(60px,1fr))] gap-1">
        {#each filteredGlyphs as glyph}
          <button
            onclick={() => handleCopyGlyph(glyph)}
            class="aspect-square flex flex-col items-center justify-center p-1 border border-(--color-border) hover:bg-(--color-border) hover:border-(--color-accent) transition-colors cursor-pointer {copied === glyph.name ? 'bg-green-500/30 border-green-500' : ''}"
            title="{glyph.name} - Click to copy"
          >
            <span 
              class="text-2xl leading-none"
              style="font-family: '{fontFace?.family}', sans-serif;"
            >
              {glyph.char}
            </span>
            <span class="text-[9px] text-(--color-text-light) mt-1 truncate w-full text-center">
              {glyph.name}
            </span>
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>
