<script lang="ts">
  import {
    ansiBrightColors,
    ansiColors,
    ansiEscapeFormats,
    allAnsiColors as allColors,
    formatAnsiEscapes,
    getAnsiEscapeFormat,
    getAnsiBgColorHex as getBgColorHex,
    getAnsiColorHex as getColorHex,
    getAnsiFgColorHex as getFgColorHex,
    getAnsiStyleCodes,
    getAnsiStyleCss,
    type AnsiEscapeFormat,
    type AnsiStyleState,
  } from "../../lib/ansi.js";

  type TabMode = "generate" | "preview";
  
  let activeTab = $state<TabMode>("generate");

  // Generator state
  let previewText = $state("Hello, World!");
  let fgColor = $state(7);
  let bgColor = $state(0);
  let bold = $state(false);
  let dim = $state(false);
  let italic = $state(false);
  let underline = $state(false);
  let blink = $state(false);
  let reverse = $state(false);
  let hidden = $state(false);
  let strikethrough = $state(false);
  let copiedAnsi = $state(false);
  let escapeFormat = $state<AnsiEscapeFormat>("caret");

  // Preview state
  let ansiInput = $state("\\x1b[1;31mHello\\x1b[0m \\x1b[32mWorld\\x1b[0m!");
  let wrapInput = $state(false);
  let wrapPreview = $state(false);
  let fullscreen = $state(false);

  const getEscapePrefix = () => {
    return getAnsiEscapeFormat(escapeFormat).referencePrefix;
  };

  const getCurrentStyle = (): AnsiStyleState => ({
    bold,
    dim,
    italic,
    underline,
    blink,
    reverse,
    hidden,
    strikethrough,
  });

  const generateAnsiCode = (): string => {
    const codes: string[] = [];
    codes.push(...getAnsiStyleCodes(getCurrentStyle()));
    
    if (fgColor < 8) {
      codes.push((30 + fgColor).toString());
    } else {
      codes.push((90 + (fgColor - 8)).toString());
    }
    
    if (bgColor < 8) {
      codes.push((40 + bgColor).toString());
    } else {
      codes.push((100 + (bgColor - 8)).toString());
    }

    return formatAnsiEscapes(`\x1b[${codes.join(";")}m${previewText}\x1b[0m`, escapeFormat);
  };

  const ansiCode = $derived(generateAnsiCode());

  const getPreviewStyle = (): string => {
    return getAnsiStyleCss(getCurrentStyle(), getColorHex(fgColor), getColorHex(bgColor));
  };

  const previewStyle = $derived(getPreviewStyle());

  const copyAnsiCode = () => {
    navigator.clipboard.writeText(ansiCode);
    copiedAnsi = true;
    setTimeout(() => {
      copiedAnsi = false;
    }, 1500);
  };

  // ANSI Parser for Preview tab
  interface StyledSegment extends AnsiStyleState {
    text: string;
    fg: string;
    bg: string;
  }

  const parseAnsiText = (input: string): StyledSegment[] => {
    const segments: StyledSegment[] = [];
    
    const ESC = String.fromCharCode(0x1b);
    
    let normalized = input
      .replace(/\\x1b/gi, ESC)
      .replace(/\\u001b/gi, ESC)
      .replace(/\\033/g, ESC)
      .replace(/\\e/g, ESC);
    
    const ansiRegex = new RegExp(ESC + "\\[([0-9;]*)m", "g");
    
    let currentStyle = {
      fg: "#cccccc",
      bg: "#000000",
      bold: false,
      dim: false,
      italic: false,
      underline: false,
      blink: false,
      reverse: false,
      hidden: false,
      strikethrough: false,
    };
    
    let lastIndex = 0;
    const matches = Array.from(normalized.matchAll(ansiRegex));
    
    for (const match of matches) {
      if (match.index !== undefined && match.index > lastIndex) {
        const text = normalized.slice(lastIndex, match.index);
        if (text) {
          segments.push({
            text,
            ...currentStyle,
          });
        }
      }
      
      const codes = match[1].split(";").map((c) => parseInt(c, 10) || 0);
      
      for (const code of codes) {
        if (code === 0) {
          currentStyle = {
            fg: "#cccccc",
            bg: "#000000",
            bold: false,
            dim: false,
            italic: false,
            underline: false,
            blink: false,
            reverse: false,
            hidden: false,
            strikethrough: false,
          };
        } else if (code === 1) {
          currentStyle.bold = true;
        } else if (code === 2) {
          currentStyle.dim = true;
        } else if (code === 3) {
          currentStyle.italic = true;
        } else if (code === 4) {
          currentStyle.underline = true;
        } else if (code === 5 || code === 6) {
          currentStyle.blink = true;
        } else if (code === 7) {
          currentStyle.reverse = true;
        } else if (code === 8) {
          currentStyle.hidden = true;
        } else if (code === 9) {
          currentStyle.strikethrough = true;
        } else if (code === 22) {
          currentStyle.bold = false;
          currentStyle.dim = false;
        } else if (code === 23) {
          currentStyle.italic = false;
        } else if (code === 24) {
          currentStyle.underline = false;
        } else if (code === 25) {
          currentStyle.blink = false;
        } else if (code === 27) {
          currentStyle.reverse = false;
        } else if (code === 28) {
          currentStyle.hidden = false;
        } else if (code === 29) {
          currentStyle.strikethrough = false;
        } else if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) {
          currentStyle.fg = getFgColorHex(code);
        } else if ((code >= 40 && code <= 47) || (code >= 100 && code <= 107)) {
          currentStyle.bg = getBgColorHex(code);
        }
      }
      
      if (match.index !== undefined) {
        lastIndex = match.index + match[0].length;
      }
    }
    
    if (lastIndex < normalized.length) {
      const text = normalized.slice(lastIndex);
      if (text) {
        segments.push({
          text,
          ...currentStyle,
        });
      }
    }
    
    if (segments.length === 0 && input) {
      segments.push({
        text: input,
        fg: "#cccccc",
        bg: "#000000",
        bold: false,
        dim: false,
        italic: false,
        underline: false,
        blink: false,
        reverse: false,
        hidden: false,
        strikethrough: false,
      });
    }
    
    return segments;
  };

  const getSegmentStyle = (segment: StyledSegment): string => {
    return getAnsiStyleCss(segment, segment.fg, segment.bg);
  };

  const parsedSegments = $derived(parseAnsiText(ansiInput));
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Generate ANSI escape codes for colored terminal text or preview existing ANSI text.
    </p>
  </header>

  <!-- Tabs -->
  <div class="flex gap-2 mb-4 border-b border-(--color-border)">
    <button
      onclick={() => (activeTab = "generate")}
      class="px-4 py-2 text-sm font-medium transition-colors {activeTab === 'generate'
        ? 'text-(--color-accent) border-b-2 border-(--color-accent) -mb-px'
        : 'text-(--color-text-muted) hover:text-(--color-text)'}"
    >
      Generate
    </button>
    <button
      onclick={() => (activeTab = "preview")}
      class="px-4 py-2 text-sm font-medium transition-colors {activeTab === 'preview'
        ? 'text-(--color-accent) border-b-2 border-(--color-accent) -mb-px'
        : 'text-(--color-text-muted) hover:text-(--color-text)'}"
    >
      Preview
    </button>
  </div>

  <!-- Generate Tab -->
  {#if activeTab === "generate"}
    <div class="flex flex-col gap-6">
      <!-- Text Input and Escape Format -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-2">
            Preview Text
          </label>
          <input
            type="text"
            bind:value={previewText}
            class="w-full px-3 py-2 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text)"
          />
        </div>
        <div>
          <div class="flex justify-between items-center mb-2">
            <label class="block text-xs tracking-wider text-(--color-text-light) font-medium">
              Escape Format
            </label>
            <span class="text-xs text-(--color-text-muted)">
              {getAnsiEscapeFormat(escapeFormat).description}
            </span>
          </div>
          <select
            bind:value={escapeFormat}
            class="w-full px-3 py-2 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text)"
          >
            {#each ansiEscapeFormats as format}
              <option value={format.id}>{format.name}</option>
            {/each}
          </select>
        </div>
      </div>

      <!-- Color Pickers -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-2">
            Foreground Color
          </label>
          <div class="grid grid-cols-8 gap-1">
            {#each allColors as color}
              <button
                onclick={() => (fgColor = color.code)}
                class="w-8 h-8 border-2 transition-all {fgColor === color.code
                  ? 'border-(--color-accent) scale-110'
                  : 'border-transparent'}"
                style="background-color: {color.hex}"
                title={color.name}
              ></button>
            {/each}
          </div>
        </div>

        <div>
          <label class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-2">
            Background Color
          </label>
          <div class="grid grid-cols-8 gap-1">
            {#each allColors as color}
              <button
                onclick={() => (bgColor = color.code)}
                class="w-8 h-8 border-2 transition-all {bgColor === color.code
                  ? 'border-(--color-accent) scale-110'
                  : 'border-transparent'}"
                style="background-color: {color.hex}"
                title={color.name}
              ></button>
            {/each}
          </div>
        </div>
      </div>

      <!-- Style Options -->
      <div>
        <label class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-2">
          Text Style
        </label>
        <div class="flex flex-wrap gap-4">
          <label class="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" bind:checked={bold} class="accent-(--color-accent)" />
            <span class="font-bold">Bold</span>
          </label>
          <label class="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" bind:checked={dim} class="accent-(--color-accent)" />
            <span class="opacity-50">Dim</span>
          </label>
          <label class="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" bind:checked={italic} class="accent-(--color-accent)" />
            <span class="italic">Italic</span>
          </label>
          <label class="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" bind:checked={underline} class="accent-(--color-accent)" />
            <span class="underline">Underline</span>
          </label>
          <label class="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" bind:checked={blink} class="accent-(--color-accent)" />
            <span>Blink</span>
          </label>
          <label class="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" bind:checked={reverse} class="accent-(--color-accent)" />
            <span>Reverse</span>
          </label>
          <label class="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" bind:checked={hidden} class="accent-(--color-accent)" />
            <span>Hidden</span>
          </label>
          <label class="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" bind:checked={strikethrough} class="accent-(--color-accent)" />
            <span class="line-through">Strikethrough</span>
          </label>
        </div>
      </div>

      <!-- Preview -->
      <div>
        <label class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-2">
          Preview
        </label>
        <div
          class="p-6 font-mono text-xl border border-(--color-border)"
          style={previewStyle}
        >
          {previewText || "Enter text above..."}
        </div>
      </div>

      <!-- ANSI Code Output -->
      <div>
        <div class="flex justify-between items-center mb-2">
          <label class="block text-xs tracking-wider text-(--color-text-light) font-medium">
            ANSI Escape Code
          </label>
          <button
            onclick={copyAnsiCode}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            {copiedAnsi ? "Copied!" : "Copy"}
          </button>
        </div>
        <div class="p-3 font-mono text-sm border border-(--color-border) bg-(--color-bg-alt) break-all">
          {ansiCode}
        </div>
      </div>

      <!-- Reference Tables -->
      <div class="flex flex-col lg:flex-row gap-6">
        <!-- Color Code Reference -->
        <div class="flex-1">
          <label class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-2">
            Color Code Reference
          </label>
          <div class="overflow-auto border border-(--color-border)">
            <table class="w-full text-sm">
              <thead class="bg-(--color-bg-alt) border-b border-(--color-border)">
                <tr>
                  <th class="px-2 py-1.5 text-left font-medium text-(--color-text-light)">Color</th>
                  <th class="px-2 py-1.5 text-left font-medium text-(--color-text-light)">FG</th>
                  <th class="px-2 py-1.5 text-left font-medium text-(--color-text-light)">BG</th>
                </tr>
              </thead>
              <tbody>
                {#each ansiColors as color, i}
                  <tr class="border-b border-(--color-border)">
                    <td class="px-2 py-1">
                      <div class="flex items-center gap-2">
                        <span class="w-3 h-3 inline-block border border-(--color-border)" style="background-color: {color.hex}"></span>
                        <span class="text-xs">{color.name}</span>
                      </div>
                    </td>
                    <td class="px-2 py-1 font-mono text-xs">{getEscapePrefix()}{30 + i}m</td>
                    <td class="px-2 py-1 font-mono text-xs">{getEscapePrefix()}{40 + i}m</td>
                  </tr>
                {/each}
                {#each ansiBrightColors as color, i}
                  <tr class="border-b border-(--color-border)">
                    <td class="px-2 py-1">
                      <div class="flex items-center gap-2">
                        <span class="w-3 h-3 inline-block border border-(--color-border)" style="background-color: {color.hex}"></span>
                        <span class="text-xs">{color.name}</span>
                      </div>
                    </td>
                    <td class="px-2 py-1 font-mono text-xs">{getEscapePrefix()}{90 + i}m</td>
                    <td class="px-2 py-1 font-mono text-xs">{getEscapePrefix()}{100 + i}m</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Style Codes Reference -->
        <div class="flex-1">
          <label class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-2">
            Style Code Reference
          </label>
          <div class="overflow-auto border border-(--color-border)">
            <table class="w-full text-sm">
              <thead class="bg-(--color-bg-alt) border-b border-(--color-border)">
                <tr>
                  <th class="px-2 py-1.5 text-left font-medium text-(--color-text-light)">Style</th>
                  <th class="px-2 py-1.5 text-left font-medium text-(--color-text-light)">Enable</th>
                  <th class="px-2 py-1.5 text-left font-medium text-(--color-text-light)">Disable</th>
                </tr>
              </thead>
              <tbody>
                <tr class="border-b border-(--color-border)">
                  <td class="px-2 py-1.5 font-bold text-xs">Bold</td>
                  <td class="px-2 py-1.5 font-mono text-xs">{getEscapePrefix()}1m</td>
                  <td class="px-2 py-1.5 font-mono text-xs">{getEscapePrefix()}22m</td>
                </tr>
                <tr class="border-b border-(--color-border)">
                  <td class="px-2 py-1.5 opacity-50 text-xs">Dim/Faint</td>
                  <td class="px-2 py-1.5 font-mono text-xs">{getEscapePrefix()}2m</td>
                  <td class="px-2 py-1.5 font-mono text-xs">{getEscapePrefix()}22m</td>
                </tr>
                <tr class="border-b border-(--color-border)">
                  <td class="px-2 py-1.5 italic text-xs">Italic</td>
                  <td class="px-2 py-1.5 font-mono text-xs">{getEscapePrefix()}3m</td>
                  <td class="px-2 py-1.5 font-mono text-xs">{getEscapePrefix()}23m</td>
                </tr>
                <tr class="border-b border-(--color-border)">
                  <td class="px-2 py-1.5 underline text-xs">Underline</td>
                  <td class="px-2 py-1.5 font-mono text-xs">{getEscapePrefix()}4m</td>
                  <td class="px-2 py-1.5 font-mono text-xs">{getEscapePrefix()}24m</td>
                </tr>
                <tr class="border-b border-(--color-border)">
                  <td class="px-2 py-1.5 text-xs">Blink (slow)</td>
                  <td class="px-2 py-1.5 font-mono text-xs">{getEscapePrefix()}5m</td>
                  <td class="px-2 py-1.5 font-mono text-xs">{getEscapePrefix()}25m</td>
                </tr>
                <tr class="border-b border-(--color-border)">
                  <td class="px-2 py-1.5 text-xs">Blink (rapid)</td>
                  <td class="px-2 py-1.5 font-mono text-xs">{getEscapePrefix()}6m</td>
                  <td class="px-2 py-1.5 font-mono text-xs">{getEscapePrefix()}25m</td>
                </tr>
                <tr class="border-b border-(--color-border)">
                  <td class="px-2 py-1.5 text-xs">Reverse/Inverse</td>
                  <td class="px-2 py-1.5 font-mono text-xs">{getEscapePrefix()}7m</td>
                  <td class="px-2 py-1.5 font-mono text-xs">{getEscapePrefix()}27m</td>
                </tr>
                <tr class="border-b border-(--color-border)">
                  <td class="px-2 py-1.5 text-xs">Hidden/Conceal</td>
                  <td class="px-2 py-1.5 font-mono text-xs">{getEscapePrefix()}8m</td>
                  <td class="px-2 py-1.5 font-mono text-xs">{getEscapePrefix()}28m</td>
                </tr>
                <tr class="border-b border-(--color-border)">
                  <td class="px-2 py-1.5 line-through text-xs">Strikethrough</td>
                  <td class="px-2 py-1.5 font-mono text-xs">{getEscapePrefix()}9m</td>
                  <td class="px-2 py-1.5 font-mono text-xs">{getEscapePrefix()}29m</td>
                </tr>
                <tr class="border-b border-(--color-border)">
                  <td class="px-2 py-1.5 text-xs">Reset All</td>
                  <td class="px-2 py-1.5 font-mono text-xs">{getEscapePrefix()}0m</td>
                  <td class="px-2 py-1.5 font-mono text-xs">-</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Preview Tab -->
  {#if activeTab === "preview"}
    <div class="flex flex-col gap-4 flex-1">
      <!-- Example Snippets (moved to top) -->
      <div>
        <label class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-2">
          Example Snippets
        </label>
        <div class="flex flex-wrap gap-2">
          <button
            onclick={() => (ansiInput = "\\x1b[31mError:\\x1b[0m Something went wrong")}
            class="px-3 py-1.5 text-xs border border-(--color-border) bg-(--color-bg-alt) hover:border-(--color-accent) transition-colors"
          >
            Error message
          </button>
          <button
            onclick={() => (ansiInput = "\\x1b[32m✓\\x1b[0m Build \\x1b[1msuccessful\\x1b[0m")}
            class="px-3 py-1.5 text-xs border border-(--color-border) bg-(--color-bg-alt) hover:border-(--color-accent) transition-colors"
          >
            Success message
          </button>
          <button
            onclick={() => (ansiInput = "\\x1b[33m⚠ Warning:\\x1b[0m \\x1b[3mDeprecated function\\x1b[0m")}
            class="px-3 py-1.5 text-xs border border-(--color-border) bg-(--color-bg-alt) hover:border-(--color-accent) transition-colors"
          >
            Warning
          </button>
          <button
            onclick={() => (ansiInput = "\\x1b[1;34m===\\x1b[0m \\x1b[4mTest Results\\x1b[0m \\x1b[1;34m===\\x1b[0m\\n\\x1b[32mPassed: 42\\x1b[0m | \\x1b[31mFailed: 3\\x1b[0m | \\x1b[33mSkipped: 5\\x1b[0m")}
            class="px-3 py-1.5 text-xs border border-(--color-border) bg-(--color-bg-alt) hover:border-(--color-accent) transition-colors"
          >
            Test results
          </button>
          <button
            onclick={() => (ansiInput = "\\x1b[90m2024-01-15 10:30:45\\x1b[0m \\x1b[36m[INFO]\\x1b[0m Server started on \\x1b[4mhttp://localhost:3000\\x1b[0m")}
            class="px-3 py-1.5 text-xs border border-(--color-border) bg-(--color-bg-alt) hover:border-(--color-accent) transition-colors"
          >
            Log entry
          </button>
          <button
            onclick={() => (ansiInput = "Price: \\x1b[9m$99.99\\x1b[0m \\x1b[1;32m$49.99\\x1b[0m \\x1b[33m(50% off!)\\x1b[0m")}
            class="px-3 py-1.5 text-xs border border-(--color-border) bg-(--color-bg-alt) hover:border-(--color-accent) transition-colors"
          >
            Strikethrough
          </button>
          <button
            onclick={() => (ansiInput = "\\x1b[1mBold\\x1b[0m \\x1b[2mDim\\x1b[0m \\x1b[3mItalic\\x1b[0m \\x1b[4mUnderline\\x1b[0m \\x1b[7mReverse\\x1b[0m \\x1b[9mStrike\\x1b[0m")}
            class="px-3 py-1.5 text-xs border border-(--color-border) bg-(--color-bg-alt) hover:border-(--color-accent) transition-colors"
          >
            All styles
          </button>
        </div>
      </div>

      <!-- Side by side layout -->
      <div class="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
        <!-- ANSI Input (left) -->
        <div class="flex flex-col min-h-0 overflow-hidden">
          <div class="flex justify-between items-center mb-2">
            <label class="block text-xs tracking-wider text-(--color-text-light) font-medium">
              ANSI Text Input
            </label>
            <label class="flex items-center gap-2 text-xs text-(--color-text-muted) cursor-pointer">
              <input type="checkbox" bind:checked={wrapInput} class="accent-(--color-accent)" />
              Wrap
            </label>
          </div>
          <textarea
            bind:value={ansiInput}
            class="flex-1 w-full min-h-40 px-3 py-2 text-sm font-mono border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) resize-none overflow-auto {wrapInput ? 'whitespace-pre-wrap' : 'whitespace-pre'}"
            placeholder="Paste ANSI text here, e.g.: \x1b[31mRed text\x1b[0m"
          ></textarea>
          <p class="text-xs text-(--color-text-muted) mt-1">
            Supports \x1b[...m, \u001b[...m, \033[...m, and \e[...m escape formats
          </p>
        </div>

        <!-- Rendered Preview (right) -->
        <div class="flex flex-col min-h-0 overflow-hidden">
          <div class="flex justify-between items-center mb-2">
            <label class="block text-xs tracking-wider text-(--color-text-light) font-medium">
              Rendered Preview
            </label>
            <div class="flex items-center gap-3">
              <label class="flex items-center gap-2 text-xs text-(--color-text-muted) cursor-pointer">
                <input type="checkbox" bind:checked={wrapPreview} class="accent-(--color-accent)" />
                Wrap
              </label>
              <button
                onclick={() => (fullscreen = true)}
                class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
                title="Fullscreen"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                </svg>
              </button>
            </div>
          </div>
          <div
            class="flex-1 min-h-40 p-4 font-mono text-sm border border-(--color-border) overflow-auto {wrapPreview ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'}"
            style="background-color: #000000;"
          >
            {#each parsedSegments as segment}
              <span
                style={getSegmentStyle(segment)}
              >{segment.text}</span>
            {/each}
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<!-- Fullscreen Modal -->
{#if fullscreen}
  <div class="fixed inset-0 z-50 flex flex-col" style="background-color: #000000;">
    <div class="flex justify-between items-center p-4 border-b border-gray-800">
      <span class="text-sm text-(--color-text-light) font-medium">ANSI Preview</span>
      <div class="flex items-center gap-4">
        <label class="flex items-center gap-2 text-xs text-(--color-text-muted) cursor-pointer">
          <input type="checkbox" bind:checked={wrapPreview} class="accent-(--color-accent)" />
          Wrap
        </label>
        <button
          onclick={() => (fullscreen = false)}
          class="text-gray-400 hover:text-white transition-colors"
          title="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    </div>
    <div class="flex-1 p-6 font-mono text-sm overflow-auto {wrapPreview ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'}">
      {#each parsedSegments as segment}
        <span
          style={getSegmentStyle(segment)}
        >{segment.text}</span>
      {/each}
    </div>
  </div>
{/if}
