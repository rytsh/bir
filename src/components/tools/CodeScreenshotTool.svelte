<script lang="ts">
  import { toPng, toSvg } from "html-to-image";
  import hljs from "highlight.js";

  type WindowStyle = "macos" | "windows" | "none";

  const themes: Record<string, { bg: string; text: string; name: string; styles: Record<string, string> }> = {
    "dark-modern": {
      name: "Dark Modern",
      bg: "#1e1e1e",
      text: "#d4d4d4",
      styles: {
        "hljs-keyword": "#569cd6",
        "hljs-string": "#ce9178",
        "hljs-number": "#b5cea8",
        "hljs-comment": "#6a9955",
        "hljs-function": "#dcdcaa",
        "hljs-title": "#dcdcaa",
        "hljs-params": "#9cdcfe",
        "hljs-built_in": "#4ec9b0",
        "hljs-type": "#4ec9b0",
        "hljs-attr": "#9cdcfe",
        "hljs-variable": "#9cdcfe",
        "hljs-literal": "#569cd6",
        "hljs-meta": "#c586c0",
        "hljs-selector-class": "#d7ba7d",
        "hljs-selector-tag": "#569cd6",
        "hljs-property": "#9cdcfe",
        "hljs-punctuation": "#d4d4d4",
      },
    },
    monokai: {
      name: "Monokai",
      bg: "#272822",
      text: "#f8f8f2",
      styles: {
        "hljs-keyword": "#f92672",
        "hljs-string": "#e6db74",
        "hljs-number": "#ae81ff",
        "hljs-comment": "#75715e",
        "hljs-function": "#a6e22e",
        "hljs-title": "#a6e22e",
        "hljs-params": "#fd971f",
        "hljs-built_in": "#66d9ef",
        "hljs-type": "#66d9ef",
        "hljs-attr": "#a6e22e",
        "hljs-variable": "#f8f8f2",
        "hljs-literal": "#ae81ff",
        "hljs-meta": "#f92672",
        "hljs-selector-class": "#a6e22e",
        "hljs-selector-tag": "#f92672",
        "hljs-property": "#66d9ef",
        "hljs-punctuation": "#f8f8f2",
      },
    },
    github: {
      name: "GitHub Light",
      bg: "#ffffff",
      text: "#24292e",
      styles: {
        "hljs-keyword": "#d73a49",
        "hljs-string": "#032f62",
        "hljs-number": "#005cc5",
        "hljs-comment": "#6a737d",
        "hljs-function": "#6f42c1",
        "hljs-title": "#6f42c1",
        "hljs-params": "#24292e",
        "hljs-built_in": "#005cc5",
        "hljs-type": "#005cc5",
        "hljs-attr": "#e36209",
        "hljs-variable": "#005cc5",
        "hljs-literal": "#005cc5",
        "hljs-meta": "#d73a49",
        "hljs-selector-class": "#6f42c1",
        "hljs-selector-tag": "#22863a",
        "hljs-property": "#005cc5",
        "hljs-punctuation": "#24292e",
      },
    },
    nord: {
      name: "Nord",
      bg: "#2e3440",
      text: "#d8dee9",
      styles: {
        "hljs-keyword": "#81a1c1",
        "hljs-string": "#a3be8c",
        "hljs-number": "#b48ead",
        "hljs-comment": "#616e88",
        "hljs-function": "#88c0d0",
        "hljs-title": "#88c0d0",
        "hljs-params": "#d8dee9",
        "hljs-built_in": "#88c0d0",
        "hljs-type": "#8fbcbb",
        "hljs-attr": "#8fbcbb",
        "hljs-variable": "#d8dee9",
        "hljs-literal": "#81a1c1",
        "hljs-meta": "#5e81ac",
        "hljs-selector-class": "#8fbcbb",
        "hljs-selector-tag": "#81a1c1",
        "hljs-property": "#88c0d0",
        "hljs-punctuation": "#eceff4",
      },
    },
    dracula: {
      name: "Dracula",
      bg: "#282a36",
      text: "#f8f8f2",
      styles: {
        "hljs-keyword": "#ff79c6",
        "hljs-string": "#f1fa8c",
        "hljs-number": "#bd93f9",
        "hljs-comment": "#6272a4",
        "hljs-function": "#50fa7b",
        "hljs-title": "#50fa7b",
        "hljs-params": "#ffb86c",
        "hljs-built_in": "#8be9fd",
        "hljs-type": "#8be9fd",
        "hljs-attr": "#50fa7b",
        "hljs-variable": "#f8f8f2",
        "hljs-literal": "#bd93f9",
        "hljs-meta": "#ff79c6",
        "hljs-selector-class": "#50fa7b",
        "hljs-selector-tag": "#ff79c6",
        "hljs-property": "#66d9ef",
        "hljs-punctuation": "#f8f8f2",
      },
    },
  };

  const backgrounds = [
    { name: "Midnight", value: "linear-gradient(135deg, #0c0c1d 0%, #1a1a2e 50%, #16213e 100%)" },
    { name: "Ocean", value: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" },
    { name: "Sunset", value: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)" },
    { name: "Forest", value: "linear-gradient(135deg, #11998e 0%, #38ef7d 100%)" },
    { name: "Fire", value: "linear-gradient(135deg, #f12711 0%, #f5af19 100%)" },
    { name: "Sky", value: "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)" },
    { name: "Charcoal", value: "linear-gradient(135deg, #232526 0%, #414345 100%)" },
  ];

  const defaultCode = `function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

// Calculate the 10th Fibonacci number
const result = fibonacci(10);
console.log(\`Fibonacci(10) = \${result}\`);`;

  let code = $state(defaultCode);
  let language = $state("javascript");
  let themeId = $state("dark-modern");
  let windowStyle = $state<WindowStyle>("macos");
  let bgIndex = $state(0);
  let transparentBg = $state(false);
  let padding = $state(32);
  let fontSize = $state(14);
  let showLineNumbers = $state(true);
  let borderRadius = $state(12);
  let exporting = $state(false);
  let copiedNotice = $state(false);

  let captureRef = $state<HTMLDivElement | null>(null);

  const theme = $derived(themes[themeId]);
  const background = $derived(transparentBg ? "transparent" : backgrounds[bgIndex].value);

  const highlighted = $derived.by(() => {
    try {
      const result = hljs.highlight(code, { language });
      return result.value;
    } catch {
      try {
        const result = hljs.highlightAuto(code);
        return result.value;
      } catch {
        return code.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      }
    }
  });

  const lines = $derived(code.split("\n"));

  function buildInlineStyles(): string {
    if (!theme) return "";
    return Object.entries(theme.styles)
      .map(([cls, color]) => `.${cls} { color: ${color} !important; }`)
      .join("\n");
  }

  async function exportPng() {
    if (!captureRef) return;
    exporting = true;
    try {
      const dataUrl = await toPng(captureRef, { pixelRatio: 2, cacheBust: true });
      const link = document.createElement("a");
      link.download = "code-screenshot.png";
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Export PNG failed:", err);
    }
    exporting = false;
  }

  async function exportSvg() {
    if (!captureRef) return;
    exporting = true;
    try {
      const dataUrl = await toSvg(captureRef, { cacheBust: true });
      const link = document.createElement("a");
      link.download = "code-screenshot.svg";
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Export SVG failed:", err);
    }
    exporting = false;
  }

  async function copyToClipboard() {
    if (!captureRef) return;
    exporting = true;
    try {
      const dataUrl = await toPng(captureRef, { pixelRatio: 2, cacheBust: true });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      copiedNotice = true;
      setTimeout(() => { copiedNotice = false; }, 2000);
    } catch (err) {
      console.error("Copy to clipboard failed:", err);
    }
    exporting = false;
  }

  const languages = [
    "javascript", "typescript", "python", "java", "c", "cpp", "csharp", "go",
    "rust", "ruby", "php", "swift", "kotlin", "scala", "html", "css", "sql",
    "bash", "json", "yaml", "xml", "markdown", "dockerfile", "plaintext",
  ];
</script>

<div class="h-full flex flex-col gap-4">
  <header class="flex-none">
    <p class="text-(--color-text-muted) text-sm">
      Create beautiful code screenshots with syntax highlighting, custom themes, and gradient backgrounds. Export as PNG or SVG.
    </p>
  </header>

  <div class="flex-1 flex flex-col lg:flex-row gap-4 min-h-0 overflow-auto">
    <!-- Settings panel -->
    <div class="lg:w-72 flex-none flex flex-col gap-3">
      <!-- Language -->
      <div class="flex flex-col gap-1">
        <label class="text-xs font-medium text-(--color-text-muted) uppercase tracking-wide">Language</label>
        <select
          bind:value={language}
          class="px-2 py-1.5 bg-(--color-bg) border border-(--color-border) text-(--color-text) text-sm focus:border-(--color-text-light) outline-none cursor-pointer"
        >
          {#each languages as lang}
            <option value={lang}>{lang}</option>
          {/each}
        </select>
      </div>

      <!-- Theme -->
      <div class="flex flex-col gap-1">
        <label class="text-xs font-medium text-(--color-text-muted) uppercase tracking-wide">Theme</label>
        <select
          bind:value={themeId}
          class="px-2 py-1.5 bg-(--color-bg) border border-(--color-border) text-(--color-text) text-sm focus:border-(--color-text-light) outline-none cursor-pointer"
        >
          {#each Object.entries(themes) as [id, t]}
            <option value={id}>{t.name}</option>
          {/each}
        </select>
      </div>

      <!-- Background -->
      <div class="flex flex-col gap-1.5">
        <label class="text-xs font-medium text-(--color-text-muted) uppercase tracking-wide">Background</label>
        <label class="flex items-center gap-2 text-sm text-(--color-text-muted) cursor-pointer">
          <input type="checkbox" bind:checked={transparentBg} class="w-4 h-4 accent-(--color-text) cursor-pointer" />
          Transparent
        </label>
        {#if !transparentBg}
          <div class="flex flex-wrap gap-1.5">
            {#each backgrounds as bg, i}
              <button
                onclick={() => { bgIndex = i; }}
                class="w-7 h-7 border-2 transition-all {bgIndex === i ? 'border-(--color-accent) scale-110' : 'border-(--color-border)'}"
                style="background: {bg.value}"
                title={bg.name}
              ></button>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Window style -->
      <div class="flex flex-col gap-1">
        <label class="text-xs font-medium text-(--color-text-muted) uppercase tracking-wide">Window Style</label>
        <div class="flex gap-1.5">
          {#each [["macos", "macOS"], ["windows", "Windows"], ["none", "None"]] as [val, label]}
            <button
              onclick={() => { windowStyle = val as WindowStyle; }}
              class="flex-1 px-2 py-1 text-xs font-medium transition-colors border {windowStyle === val
                ? 'bg-(--color-accent) text-(--color-btn-text) border-(--color-accent)'
                : 'bg-(--color-bg-alt) text-(--color-text-muted) border-(--color-border) hover:text-(--color-text)'}"
            >
              {label}
            </button>
          {/each}
        </div>
      </div>

      <!-- Font size -->
      <div class="flex flex-col gap-1">
        <div class="flex items-center justify-between">
          <label class="text-xs font-medium text-(--color-text-muted) uppercase tracking-wide">Font Size</label>
          <span class="text-xs font-mono text-(--color-text)">{fontSize}px</span>
        </div>
        <input type="range" min="10" max="24" step="1" bind:value={fontSize} class="w-full accent-(--color-accent)" />
      </div>

      <!-- Padding -->
      <div class="flex flex-col gap-1">
        <div class="flex items-center justify-between">
          <label class="text-xs font-medium text-(--color-text-muted) uppercase tracking-wide">Padding</label>
          <span class="text-xs font-mono text-(--color-text)">{padding}px</span>
        </div>
        <input type="range" min="0" max="64" step="4" bind:value={padding} class="w-full accent-(--color-accent)" />
      </div>

      <!-- Border radius -->
      <div class="flex flex-col gap-1">
        <div class="flex items-center justify-between">
          <label class="text-xs font-medium text-(--color-text-muted) uppercase tracking-wide">Border Radius</label>
          <span class="text-xs font-mono text-(--color-text)">{borderRadius}px</span>
        </div>
        <input type="range" min="0" max="24" step="2" bind:value={borderRadius} class="w-full accent-(--color-accent)" />
      </div>

      <!-- Line numbers -->
      <label class="flex items-center gap-2 text-sm text-(--color-text-muted) cursor-pointer">
        <input type="checkbox" bind:checked={showLineNumbers} class="accent-(--color-accent)" />
        Show line numbers
      </label>

      <!-- Export buttons -->
      <div class="flex flex-col gap-1.5 mt-2">
        <button
          onclick={exportPng}
          disabled={exporting}
          class="px-3 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50"
        >
          Export PNG
        </button>
        <button
          onclick={exportSvg}
          disabled={exporting}
          class="px-3 py-2 bg-(--color-bg-alt) border border-(--color-border) text-(--color-text-muted) text-sm font-medium hover:text-(--color-text) transition-colors disabled:opacity-50"
        >
          Export SVG
        </button>
        <button
          onclick={copyToClipboard}
          disabled={exporting}
          class="px-3 py-2 bg-(--color-bg-alt) border border-(--color-border) text-(--color-text-muted) text-sm font-medium hover:text-(--color-text) transition-colors disabled:opacity-50"
        >
          {copiedNotice ? "Copied!" : "Copy to Clipboard"}
        </button>
      </div>
    </div>

    <!-- Main area: code editor + preview -->
    <div class="flex-1 flex flex-col gap-4 min-w-0">
      <!-- Code input -->
      <div class="flex flex-col gap-1">
        <label class="text-xs font-medium text-(--color-text-muted) uppercase tracking-wide">Code</label>
        <textarea
          bind:value={code}
          class="h-40 px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-sm resize-y focus:border-(--color-text-light) outline-none"
          spellcheck="false"
          placeholder="Paste your code here..."
        ></textarea>
      </div>

      <!-- Preview -->
      <div class="flex flex-col gap-1">
        <label class="text-xs font-medium text-(--color-text-muted) uppercase tracking-wide">Preview</label>
        <div class="overflow-auto border border-(--color-border) bg-(--color-bg-alt)" style="{transparentBg ? 'background-image: repeating-conic-gradient(#d0d0d0 0% 25%, #f0f0f0 0% 50%); background-size: 16px 16px;' : ''}">
          <!-- Capture area -->
          <div
            bind:this={captureRef}
            style="background: {background}; padding: {padding}px;"
          >
            {@html `<style>${buildInlineStyles()}</style>`}
            <!-- Code window -->
            <div
              style="background: {theme.bg}; border-radius: {borderRadius}px; overflow: hidden; box-shadow: 0 20px 68px rgba(0,0,0,0.55);"
            >
              <!-- Window chrome -->
              {#if windowStyle === "macos"}
                <div style="padding: 12px 16px; display: flex; gap: 8px; align-items: center;">
                  <div style="width: 12px; height: 12px; border-radius: 50%; background: #ff5f57;"></div>
                  <div style="width: 12px; height: 12px; border-radius: 50%; background: #febc2e;"></div>
                  <div style="width: 12px; height: 12px; border-radius: 50%; background: #28c840;"></div>
                </div>
              {:else if windowStyle === "windows"}
                <div style="padding: 8px 12px; display: flex; justify-content: flex-end; gap: 12px; align-items: center;">
                  <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="{theme.text}" opacity="0.5"/></svg>
                  <svg width="10" height="10" viewBox="0 0 10 10"><rect width="10" height="10" fill="none" stroke="{theme.text}" stroke-width="1" opacity="0.5"/></svg>
                  <svg width="10" height="10" viewBox="0 0 10 10"><line x1="0" y1="0" x2="10" y2="10" stroke="{theme.text}" stroke-width="1.2" opacity="0.5"/><line x1="10" y1="0" x2="0" y2="10" stroke="{theme.text}" stroke-width="1.2" opacity="0.5"/></svg>
                </div>
              {/if}

              <!-- Code content -->
              <div style="padding: {windowStyle === 'none' ? '16px' : '0 16px 16px 16px'}; overflow-x: auto;">
                <pre style="margin: 0; font-family: 'IBM Plex Mono', 'SF Mono', 'Fira Code', monospace; font-size: {fontSize}px; line-height: 1.6; color: {theme.text}; display: flex; gap: 16px;">{#if showLineNumbers}<code style="color: {theme.text}; opacity: 0.3; user-select: none; text-align: right; min-width: {lines.length > 99 ? '2.5em' : '1.5em'};">{lines.map((_, i) => i + 1).join("\n")}</code>{/if}<code style="flex: 1;">{@html highlighted}</code></pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
