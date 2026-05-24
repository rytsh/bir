<script lang="ts">
  interface Glyph {
    char: string;
    codePoint: number;
    name: string;
    block: string;
    isPrivateUse: boolean;
  }

  interface UnicodeBlock {
    name: string;
    start: number;
    end: number;
  }

  type CopyMode = "char" | "codePoint" | "html" | "css";

  let fontName = $state("Custom Font");
  let fontFormat = $state("");
  let fileDetails = $state("");
  let glyphs = $state<Glyph[]>([]);
  let loading = $state(false);
  let error = $state("");
  let copied = $state<string | null>(null);
  let fontFace = $state<FontFace | null>(null);
  let searchQuery = $state("");
  let urlInput = $state("");
  let showUrlInput = $state(false);
  let selectedBlock = $state("all");
  let showPrivateUse = $state(true);
  let copyMode = $state<CopyMode>("char");
  let glyphSize = $state(32);
  let previewText = $state("The quick brown fox jumps over 13 lazy dogs. ğüşiöç ĞÜŞİÖÇ 0123456789");
  let selectedGlyph = $state<Glyph | null>(null);

  let fileInput: HTMLInputElement;

  const NOTO_EMOJI_URL = "https://cdn.jsdelivr.net/gh/googlefonts/noto-emoji@main/fonts/NotoColorEmoji.ttf";
  const NOTO_OLD_TURKIC_CSS_URL = "https://fonts.googleapis.com/css2?family=Noto+Sans+Old+Turkic";
  const OLD_TURKIC_SAMPLE = "𐱅𐰇𐰼𐰜";

  const UNICODE_BLOCKS: UnicodeBlock[] = [
    { name: "Basic Latin", start: 0x0000, end: 0x007F },
    { name: "Latin-1 Supplement", start: 0x0080, end: 0x00FF },
    { name: "Latin Extended-A", start: 0x0100, end: 0x017F },
    { name: "Latin Extended-B", start: 0x0180, end: 0x024F },
    { name: "IPA Extensions", start: 0x0250, end: 0x02AF },
    { name: "Spacing Modifier Letters", start: 0x02B0, end: 0x02FF },
    { name: "Combining Diacritical Marks", start: 0x0300, end: 0x036F },
    { name: "Greek and Coptic", start: 0x0370, end: 0x03FF },
    { name: "Cyrillic", start: 0x0400, end: 0x04FF },
    { name: "Armenian", start: 0x0530, end: 0x058F },
    { name: "Hebrew", start: 0x0590, end: 0x05FF },
    { name: "Arabic", start: 0x0600, end: 0x06FF },
    { name: "Devanagari", start: 0x0900, end: 0x097F },
    { name: "Thai", start: 0x0E00, end: 0x0E7F },
    { name: "Georgian", start: 0x10A0, end: 0x10FF },
    { name: "Hangul Jamo", start: 0x1100, end: 0x11FF },
    { name: "Latin Extended Additional", start: 0x1E00, end: 0x1EFF },
    { name: "General Punctuation", start: 0x2000, end: 0x206F },
    { name: "Currency Symbols", start: 0x20A0, end: 0x20CF },
    { name: "Letterlike Symbols", start: 0x2100, end: 0x214F },
    { name: "Number Forms", start: 0x2150, end: 0x218F },
    { name: "Arrows", start: 0x2190, end: 0x21FF },
    { name: "Mathematical Operators", start: 0x2200, end: 0x22FF },
    { name: "Miscellaneous Technical", start: 0x2300, end: 0x23FF },
    { name: "Box Drawing", start: 0x2500, end: 0x257F },
    { name: "Block Elements", start: 0x2580, end: 0x259F },
    { name: "Geometric Shapes", start: 0x25A0, end: 0x25FF },
    { name: "Miscellaneous Symbols", start: 0x2600, end: 0x26FF },
    { name: "Dingbats", start: 0x2700, end: 0x27BF },
    { name: "CJK Symbols and Punctuation", start: 0x3000, end: 0x303F },
    { name: "Hiragana", start: 0x3040, end: 0x309F },
    { name: "Katakana", start: 0x30A0, end: 0x30FF },
    { name: "CJK Unified Ideographs", start: 0x4E00, end: 0x9FFF },
    { name: "Hangul Syllables", start: 0xAC00, end: 0xD7AF },
    { name: "Private Use Area", start: 0xE000, end: 0xF8FF },
    { name: "Alphabetic Presentation Forms", start: 0xFB00, end: 0xFB4F },
    { name: "Arabic Presentation Forms-A", start: 0xFB50, end: 0xFDFF },
    { name: "Arabic Presentation Forms-B", start: 0xFE70, end: 0xFEFF },
    { name: "Old Turkic", start: 0x10C00, end: 0x10C4F },
    { name: "Symbols and Pictographs", start: 0x1F300, end: 0x1F5FF },
    { name: "Emoticons", start: 0x1F600, end: 0x1F64F },
    { name: "Transport and Map Symbols", start: 0x1F680, end: 0x1F6FF },
    { name: "Supplemental Symbols", start: 0x1F900, end: 0x1F9FF },
    { name: "Supplementary Private Use-A", start: 0xF0000, end: 0xFFFFD },
    { name: "Supplementary Private Use-B", start: 0x100000, end: 0x10FFFD },
  ];

  const getCodePointName = (codePoint: number): string => {
    return `U+${formatCodePoint(codePoint)}`;
  };

  const formatCodePoint = (codePoint: number): string => {
    const width = codePoint > 0xFFFF ? 6 : 4;
    return codePoint.toString(16).toUpperCase().padStart(width, "0");
  };

  const isControlCodePoint = (codePoint: number): boolean => {
    return codePoint < 0x20 || (codePoint >= 0x7F && codePoint < 0xA0);
  };

  const isPrivateUseCodePoint = (codePoint: number): boolean => {
    return (
      (codePoint >= 0xE000 && codePoint <= 0xF8FF) ||
      (codePoint >= 0xF0000 && codePoint <= 0xFFFFD) ||
      (codePoint >= 0x100000 && codePoint <= 0x10FFFD)
    );
  };

  const getUnicodeBlock = (codePoint: number): string => {
    return UNICODE_BLOCKS.find((block) => codePoint >= block.start && codePoint <= block.end)?.name || "Other";
  };

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFontFormatLabel = (format: string): string => {
    const labels: Record<string, string> = {
      ttf: "TTF/OTF",
      woff: "WOFF",
      woff2: "WOFF2",
      ttc: "TTC",
    };
    return labels[format] || "Unknown format";
  };

  const extractFontUrlFromCss = (css: string): string => {
    const fontUrls = Array.from(css.matchAll(/url\(([^)]+)\)/g))
      .map((match) => match[1].trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean);

    return fontUrls.find((url) => /\.(woff2?|ttf|otf)(\?|$)/i.test(url)) || fontUrls[0] || "";
  };

  const getNameFromUrl = (url: string): string => {
    try {
      const parsed = new URL(url);
      const family = parsed.searchParams.get("family");
      if (family) return family.split(":")[0].replace(/\+/g, " ");

      const urlPath = parsed.pathname.split("/").pop() || "Custom Font";
      return urlPath.replace(/\.(ttf|otf|ttc|woff|woff2)$/i, "") || "Custom Font";
    } catch {
      const urlPath = url.split("?")[0].split("#")[0].split("/").pop() || "Custom Font";
      return urlPath.replace(/\.(ttf|otf|ttc|woff|woff2)$/i, "");
    }
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
      const magic = data.getUint32(0);
      let sfntOffset = 0;

      if (magic === 0x74746366) {
        const numFonts = data.getUint32(8);
        if (numFonts === 0 || data.byteLength < 16) return [];
        sfntOffset = data.getUint32(12);
      }

      if (sfntOffset + 12 > data.byteLength) return [];

      const numTables = data.getUint16(sfntOffset + 4);
      let cmapOffset = 0;
      
      for (let i = 0; i < numTables; i++) {
        const tableOffset = sfntOffset + 12 + i * 16;
        if (tableOffset + 16 > data.byteLength) break;

        const tag = String.fromCharCode(
          data.getUint8(tableOffset),
          data.getUint8(tableOffset + 1),
          data.getUint8(tableOffset + 2),
          data.getUint8(tableOffset + 3)
        );
        if (tag === "cmap") {
          const rawOffset = data.getUint32(tableOffset + 8);
          cmapOffset = rawOffset;

          if (cmapOffset + 4 > data.byteLength && sfntOffset + rawOffset + 4 <= data.byteLength) {
            cmapOffset = sfntOffset + rawOffset;
          }
          break;
        }
      }

      if (cmapOffset === 0) return [];
      if (cmapOffset + 4 > data.byteLength) return [];

      const numSubtables = data.getUint16(cmapOffset + 2);
      
      for (let i = 0; i < numSubtables; i++) {
        const subtableOffset = cmapOffset + 4 + i * 8;
        if (subtableOffset + 8 > data.byteLength) break;

        const platformID = data.getUint16(subtableOffset);
        const offset = data.getUint32(subtableOffset + 4);
        
        const tableStart = cmapOffset + offset;
        if (tableStart + 2 > data.byteLength) continue;

        const format = data.getUint16(tableStart);

        if (format === 4 && (platformID === 3 || platformID === 0)) {
          if (tableStart + 14 > data.byteLength) continue;

          const segCount = data.getUint16(tableStart + 6) / 2;
          const endCodesOffset = tableStart + 14;
          const startCodesOffset = endCodesOffset + segCount * 2 + 2;
          const idDeltaOffset = startCodesOffset + segCount * 2;
          const idRangeOffset = idDeltaOffset + segCount * 2;

          if (idRangeOffset + segCount * 2 > data.byteLength) continue;

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
                if (glyphIndexOffset + 2 > data.byteLength) continue;

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
          if (tableStart + 16 > data.byteLength) continue;

          const numGroups = data.getUint32(tableStart + 12);
          const groupsOffset = tableStart + 16;

          for (let j = 0; j < numGroups; j++) {
            const groupOffset = groupsOffset + j * 12;
            if (groupOffset + 12 > data.byteLength) break;

            const startCharCode = data.getUint32(groupOffset);
            const endCharCode = Math.min(data.getUint32(groupOffset + 4), 0x10FFFF);
            if (startCharCode > endCharCode) continue;
            
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
    [0xE000, 0xF8FF], // Private Use Area for icon fonts
    [0x1F300, 0x1F5FF], // Misc Symbols and Pictographs
    [0x1F600, 0x1F64F], // Emoticons
    [0x1F680, 0x1F6FF], // Transport and Map
    [0x1F900, 0x1F9FF], // Supplemental Symbols
    [0xF0000, 0xF0FFF], // First slice of Supplementary Private Use-A
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
    
    if (format === "ttf" || format === "ttc") {
      codePoints = parseTTFCodePoints(buffer);
    }
    
    // Fallback to canvas detection for WOFF/WOFF2 or if TTF parsing failed
    if (codePoints.length === 0) {
      codePoints = await detectGlyphsWithCanvas(fontFamily);
    }
    
    const result: Glyph[] = [];
    for (const codePoint of codePoints) {
      if (codePoint > 0x10FFFF) continue;
      if (codePoint >= 0xD800 && codePoint <= 0xDFFF) continue;
      if (isControlCodePoint(codePoint)) continue;

      try {
        const char = String.fromCodePoint(codePoint);
        result.push({
          char,
          codePoint,
          name: getCodePointName(codePoint),
          block: getUnicodeBlock(codePoint),
          isPrivateUse: isPrivateUseCodePoint(codePoint),
        });
      } catch {
        // Invalid code point
      }
    }

    return result;
  };

  const resetLoadedFontState = (): void => {
    error = "";
    glyphs = [];
    selectedGlyph = null;
    selectedBlock = "all";
    searchQuery = "";
    copied = null;
    fontFormat = "";
    fileDetails = "";
  };

  const loadFontFromFile = async (file: File) => {
    loading = true;
    resetLoadedFontState();

    try {
      const buffer = await file.arrayBuffer();
      const format = detectFontFormat(buffer);
      const fontFamilyName = `CustomFont_${Date.now()}`;
      
      if (fontFace) {
        document.fonts.delete(fontFace);
      }

      const newFontFace = new FontFace(fontFamilyName, buffer);
      await newFontFace.load();
      document.fonts.add(newFontFace);
      fontFace = newFontFace;

      fontName = file.name.replace(/\.(ttf|otf|ttc|woff|woff2)$/i, "");
      fontFormat = getFontFormatLabel(format);
      fileDetails = `${fontFormat} · ${formatBytes(file.size)}`;
      glyphs = await extractGlyphs(buffer, fontFamilyName);
      selectedGlyph = glyphs[0] || null;

      if (glyphs.length === 0) {
        error = "No supported glyphs found in this font";
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load font";
    } finally {
      loading = false;
    }
  };

  const loadFontFromUrl = async (url: string, name: string, nextPreviewText = "") => {
    loading = true;
    resetLoadedFontState();

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type") || "";
      let buffer: ArrayBuffer;

      if (contentType.includes("text/css") || url.includes("fonts.googleapis.com/css")) {
        const css = await response.text();
        const fontUrl = extractFontUrlFromCss(css);
        if (!fontUrl) throw new Error("No font URL found in stylesheet");

        const fontResponse = await fetch(new URL(fontUrl, url).href);
        if (!fontResponse.ok) {
          throw new Error(`HTTP ${fontResponse.status}: ${fontResponse.statusText}`);
        }

        buffer = await fontResponse.arrayBuffer();
      } else {
        buffer = await response.arrayBuffer();
      }

      const format = detectFontFormat(buffer);
      const fontFamilyName = `CustomFont_${Date.now()}`;

      if (fontFace) {
        document.fonts.delete(fontFace);
      }

      const newFontFace = new FontFace(fontFamilyName, buffer);
      await newFontFace.load();
      document.fonts.add(newFontFace);
      fontFace = newFontFace;

      fontName = name;
      fontFormat = getFontFormatLabel(format);
      fileDetails = `${fontFormat} · ${formatBytes(buffer.byteLength)}`;
      glyphs = await extractGlyphs(buffer, fontFamilyName);
      selectedGlyph = glyphs[0] || null;
      if (nextPreviewText) previewText = nextPreviewText;
      if (availableBlocks.includes("Old Turkic")) selectedBlock = "Old Turkic";

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

  const getCopyValue = (glyph: Glyph): string => {
    const hex = formatCodePoint(glyph.codePoint);

    if (copyMode === "codePoint") return glyph.name;
    if (copyMode === "html") return `&#x${hex};`;
    if (copyMode === "css") return `\\${hex}`;
    return glyph.char;
  };

  const handleCopyText = async (text: string, copiedKey: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      copied = copiedKey;
      setTimeout(() => (copied = null), 1500);
    } catch {
      error = "Failed to copy to clipboard";
    }
  };

  const handleCopyGlyph = async (glyph: Glyph): Promise<void> => {
    selectedGlyph = glyph;
    await handleCopyText(getCopyValue(glyph), glyph.name);
  };

  const handleCopyVisibleGlyphs = async (): Promise<void> => {
    if (filteredGlyphs.length === 0) return;

    const separator = copyMode === "char" ? "" : "\n";
    await handleCopyText(filteredGlyphs.map((glyph) => getCopyValue(glyph)).join(separator), "visible");
  };

  const handleLoadFromUrl = () => {
    if (!urlInput.trim()) {
      error = "Please enter a URL";
      return;
    }
    const url = urlInput.trim();
    loadFontFromUrl(url, getNameFromUrl(url));
    showUrlInput = false;
    urlInput = "";
  };

  const matchesSearch = (glyph: Glyph, query: string): boolean => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return true;

    const hex = formatCodePoint(glyph.codePoint).toLowerCase();
    const codePointName = glyph.name.toLowerCase();
    const decimal = glyph.codePoint.toString(10);
    const withoutPrefix = normalized.replace(/^u\+/, "");

    return (
      glyph.char.includes(query) ||
      glyph.block.toLowerCase().includes(normalized) ||
      codePointName.includes(normalized) ||
      hex.includes(withoutPrefix) ||
      decimal === normalized
    );
  };

  const availableBlocks = $derived(
    Array.from(new Set(glyphs.map((glyph) => glyph.block))).sort((a, b) => a.localeCompare(b))
  );

  const privateUseCount = $derived(glyphs.filter((glyph) => glyph.isPrivateUse).length);

  const filteredGlyphs = $derived(
    glyphs.filter(
      (glyph) =>
        (showPrivateUse || !glyph.isPrivateUse) &&
        (selectedBlock === "all" || glyph.block === selectedBlock) &&
        matchesSearch(glyph, searchQuery)
    )
  );
</script>

<div class="h-full min-h-0 flex flex-col">
  <header class="shrink-0 mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Inspect local or remote font files, including icon fonts that store glyphs in Unicode Private Use ranges.
    </p>
  </header>

  <input
    type="file"
    accept=".ttf,.otf,.ttc,.woff,.woff2"
    bind:this={fileInput}
    onchange={handleFileSelect}
    class="hidden"
  />

  <div class="shrink-0 mb-4 flex flex-wrap gap-3 items-center">
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

    <button
      onclick={() => loadFontFromUrl(NOTO_OLD_TURKIC_CSS_URL, "Noto Sans Old Turkic", OLD_TURKIC_SAMPLE)}
      disabled={loading}
      class="px-3 py-1.5 text-sm font-medium border border-(--color-border) text-(--color-text) hover:bg-(--color-border) transition-colors disabled:opacity-50"
    >
      Load Old Turkic
    </button>

    {#if glyphs.length > 0}
      <button
        onclick={handleCopyVisibleGlyphs}
        disabled={filteredGlyphs.length === 0}
        class="px-3 py-1.5 text-sm font-medium border border-(--color-border) text-(--color-text) hover:bg-(--color-border) transition-colors disabled:opacity-50"
      >
        {copied === "visible" ? "Copied visible" : "Copy visible"}
      </button>
    {/if}
  </div>

  {#if showUrlInput}
    <div class="shrink-0 mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
      <input
        type="url"
        bind:value={urlInput}
        placeholder="Enter font URL (.ttf, .otf, .ttc, .woff, .woff2)..."
        class="flex-1 px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
        onkeydown={(e) => e.key === "Enter" && handleLoadFromUrl()}
      />
      <div class="flex gap-2 items-center">
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
    </div>
  {/if}

  {#if glyphs.length > 0}
    <div class="shrink-0 mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
      <section class="border border-(--color-border) bg-(--color-bg-alt) p-3">
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3">
          <h2 class="text-sm font-semibold text-(--color-text)">{fontName}</h2>
          <span class="text-xs text-(--color-text-muted)">{fileDetails}</span>
          <span class="text-xs text-(--color-text-muted)">{filteredGlyphs.length} of {glyphs.length} glyphs</span>
          {#if privateUseCount > 0}
            <span class="text-xs text-(--color-text-muted)">{privateUseCount} private-use</span>
          {/if}
        </div>
        <input
          type="text"
          bind:value={previewText}
          autocomplete="off"
          autocapitalize="off"
          class="w-full px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
        />
        <div
          class="mt-3 min-h-16 overflow-auto border border-(--color-border) bg-(--color-bg) p-3 text-(--color-text)"
          style:font-family={fontFace ? `"${fontFace.family}", sans-serif` : "sans-serif"}
          style:font-size={`${glyphSize}px`}
        >
          {previewText || "Type preview text above"}
        </div>
      </section>

      <section class="border border-(--color-border) bg-(--color-bg-alt) p-3">
        <label class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-2">SELECTED GLYPH</label>
        {#if selectedGlyph}
          <div class="flex items-center gap-3">
            <div
              class="w-16 h-16 flex items-center justify-center border border-(--color-border) bg-(--color-bg) text-(--color-text)"
              style:font-family={fontFace ? `"${fontFace.family}", sans-serif` : "sans-serif"}
              style:font-size={`${Math.max(glyphSize, 36)}px`}
            >
              {selectedGlyph.char}
            </div>
            <div class="min-w-0 text-xs text-(--color-text-muted)">
              <div class="font-mono text-(--color-text)">{selectedGlyph.name}</div>
              <div class="truncate">{selectedGlyph.block}</div>
              <div>Decimal {selectedGlyph.codePoint}</div>
            </div>
          </div>
          <div class="mt-3 grid grid-cols-2 gap-2">
            <button onclick={() => handleCopyText(selectedGlyph.char, `${selectedGlyph.name}-char`)} class="px-2 py-1 text-xs border border-(--color-border) hover:bg-(--color-border)">Copy char</button>
            <button onclick={() => handleCopyText(selectedGlyph.name, `${selectedGlyph.name}-code`)} class="px-2 py-1 text-xs border border-(--color-border) hover:bg-(--color-border)">Copy U+</button>
            <button onclick={() => handleCopyText(`&#x${formatCodePoint(selectedGlyph.codePoint)};`, `${selectedGlyph.name}-html`)} class="px-2 py-1 text-xs border border-(--color-border) hover:bg-(--color-border)">Copy HTML</button>
            <button onclick={() => handleCopyText(`\\${formatCodePoint(selectedGlyph.codePoint)}`, `${selectedGlyph.name}-css`)} class="px-2 py-1 text-xs border border-(--color-border) hover:bg-(--color-border)">Copy CSS</button>
          </div>
        {:else}
          <p class="text-xs text-(--color-text-muted)">Select a glyph to inspect codepoint and copy formats.</p>
        {/if}
      </section>
    </div>

    <div class="shrink-0 mb-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_150px_220px]">
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Search glyph, U+0041, e000, decimal, or block..."
        class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
      />
      <select
        bind:value={selectedBlock}
        class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
      >
        <option value="all">All Unicode blocks</option>
        {#each availableBlocks as block}
          <option value={block}>{block}</option>
        {/each}
      </select>
      <select
        bind:value={copyMode}
        class="px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
      >
        <option value="char">Copy char</option>
        <option value="codePoint">Copy U+</option>
        <option value="html">Copy HTML</option>
        <option value="css">Copy CSS</option>
      </select>
      <label class="flex items-center gap-2 px-3 py-1.5 border border-(--color-border) bg-(--color-bg-alt) text-xs text-(--color-text-muted)">
        <span>Size</span>
        <input type="range" min="20" max="72" step="2" bind:value={glyphSize} class="flex-1" />
        <span class="w-8 text-right">{glyphSize}px</span>
      </label>
    </div>

    {#if privateUseCount > 0}
      <label class="shrink-0 mb-3 flex items-center gap-2 text-xs text-(--color-text-muted)">
        <input type="checkbox" bind:checked={showPrivateUse} />
        Show Private Use glyphs for icon fonts
      </label>
    {/if}
  {/if}

  {#if error}
    <div class="shrink-0 mb-4 p-3 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm">
      {error}
    </div>
  {/if}

  {#if loading}
    <div class="flex-1 min-h-0 flex items-center justify-center">
      <div class="text-center">
        <div class="text-lg text-(--color-text-muted)">Loading font and scanning glyphs...</div>
      </div>
    </div>
  {:else if glyphs.length === 0}
    <div class="flex-1 min-h-0 flex items-center justify-center border border-dashed border-(--color-border) bg-(--color-bg-alt)">
      <div class="max-w-md text-center text-(--color-text-muted) p-6">
        <p class="mb-2 text-(--color-text)">No font loaded</p>
        <p class="text-sm text-(--color-text-light)">
          Upload TTF, OTF, TTC, WOFF, or WOFF2. Private Use glyphs are included, so icon fonts should show their symbols instead of appearing empty.
        </p>
      </div>
    </div>
  {:else}
    <div class="flex-1 min-h-0 overflow-auto border border-(--color-border) bg-(--color-bg-alt) p-2">
      {#if filteredGlyphs.length === 0}
        <div class="h-full flex items-center justify-center text-sm text-(--color-text-muted)">
          No glyphs match the current filters.
        </div>
      {:else}
        <div class="grid gap-1" style:grid-template-columns={`repeat(auto-fill, minmax(${Math.max(64, glyphSize + 36)}px, 1fr))`}>
          {#each filteredGlyphs as glyph}
            <button
              onclick={() => handleCopyGlyph(glyph)}
              class="aspect-square min-h-20 flex flex-col items-center justify-center p-1 border border-(--color-border) hover:bg-(--color-border) hover:border-(--color-accent) transition-colors cursor-pointer {copied === glyph.name ? 'bg-green-500/30 border-green-500' : ''} {selectedGlyph?.codePoint === glyph.codePoint ? 'ring-1 ring-(--color-accent)' : ''}"
              title="{glyph.name} · {glyph.block} · Click to copy"
            >
              <span
                class="leading-none text-(--color-text)"
                style:font-family={fontFace ? `"${fontFace.family}", sans-serif` : "sans-serif"}
                style:font-size={`${glyphSize}px`}
              >
                {glyph.char}
              </span>
              <span class="text-[9px] text-(--color-text-light) mt-1 truncate w-full text-center">
                {glyph.name}
              </span>
              {#if glyph.isPrivateUse}
                <span class="text-[8px] text-(--color-text-muted)">PUA</span>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>
