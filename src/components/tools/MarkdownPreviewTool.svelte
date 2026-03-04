<script lang="ts">
  import { EditorView } from "@codemirror/view";
  import { markdown } from "@codemirror/lang-markdown";
  import {
    createDarkModeObserver,
    getInitialDarkMode,
    createTheme,
    editorHeightExtension,
    createEditor,
    updateEditorContent,
    getEditorContent,
    type DarkModeCleanup,
  } from "../../lib/codemirror.js";
  import { onMount } from "svelte";

  type ViewMode = "split" | "editor" | "preview";

  let isDark = $state(getInitialDarkMode());
  let copied = $state<"markdown" | "html" | null>(null);
  let previewHtml = $state("");
  let editorContainer = $state<HTMLDivElement | undefined>(undefined);
  let previewContainer = $state<HTMLDivElement | undefined>(undefined);
  let editor = $state<EditorView | undefined>(undefined);
  let renderTimer = $state<ReturnType<typeof setTimeout> | undefined>(undefined);
  let darkModeCleanup: DarkModeCleanup | undefined;
  let mermaidLoaded = $state(false);
  let markedModule: typeof import("marked") | undefined;
  let hljs: typeof import("highlight.js") | undefined;
  let katexModule: typeof import("katex") | undefined;
  let viewMode = $state<ViewMode>("split");

  const sampleMarkdown = `# Markdown Preview

Welcome to the **Markdown Preview** tool. It supports _GitHub Flavored Markdown_ with extras.

## Features

- [x] GitHub Flavored Markdown (tables, strikethrough, task lists)
- [x] Mermaid diagrams
- [x] Syntax-highlighted code blocks
- [x] KaTeX math rendering
- [ ] Your next great idea

## Code Blocks

\`\`\`typescript
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

console.log(greet("World"));
\`\`\`

\`\`\`json
{
  "name": "markdown-preview",
  "version": "1.0.0",
  "features": ["GFM", "Mermaid", "KaTeX", "Syntax Highlighting"],
  "enabled": true
}
\`\`\`

\`\`\`yaml
server:
  host: localhost
  port: 8080
  features:
    - name: markdown
      enabled: true
    - name: mermaid
      enabled: true
\`\`\`

## Table

| Feature | Status |
|---------|--------|
| GFM Tables | Supported |
| ~~Strikethrough~~ | Supported |
| Task Lists | Supported |
| Mermaid | Supported |

## Math (KaTeX)

Inline math: $E = mc^2$

Block math:

$$
\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}
$$

## Mermaid Diagram

\`\`\`mermaid
graph TD
    A[Markdown Input] --> B{Parser}
    B --> C[HTML Output]
    B --> D[Mermaid Diagrams]
    B --> E[KaTeX Math]
    B --> F[Highlighted Code]
    C --> G[Preview Panel]
    D --> G
    E --> G
    F --> G
\`\`\`

## Sequence Diagram

\`\`\`mermaid
sequenceDiagram
    participant User
    participant Editor
    participant Parser
    participant Preview
    User->>Editor: Type markdown
    Editor->>Parser: Debounced input
    Parser->>Preview: Rendered HTML
    Preview-->>User: Live preview
\`\`\`

---

> **Tip:** Edit the markdown on the left and see the live preview here!
`;

  function toggleView(panel: "editor" | "preview"): void {
    if (viewMode === panel) {
      viewMode = "split";
    } else {
      viewMode = panel;
    }
  }

  async function loadMarked(): Promise<typeof import("marked")> {
    if (!markedModule) {
      markedModule = await import("marked");
    }
    return markedModule;
  }

  async function loadHljs(): Promise<typeof import("highlight.js")> {
    if (!hljs) {
      const mod = await import("highlight.js");
      hljs = mod;
    }
    return hljs;
  }

  async function loadKatex(): Promise<typeof import("katex")> {
    if (!katexModule) {
      katexModule = await import("katex");
    }
    return katexModule;
  }

  async function renderMermaidBlocks(): Promise<void> {
    if (!previewContainer) return;

    const mermaidBlocks = previewContainer.querySelectorAll("code.language-mermaid");
    if (mermaidBlocks.length === 0) return;

    try {
      const mermaidMod = await import("mermaid");
      const mermaid = mermaidMod.default;

      mermaid.initialize({
        startOnLoad: false,
        theme: isDark ? "dark" : "default",
        securityLevel: "loose",
      });
      mermaidLoaded = true;

      for (let i = 0; i < mermaidBlocks.length; i++) {
        const codeEl = mermaidBlocks[i] as HTMLElement;
        const preEl = codeEl.parentElement;
        if (!preEl || preEl.tagName !== "PRE") continue;

        const graphDefinition = codeEl.textContent || "";
        const id = `mermaid-${Date.now()}-${i}`;

        try {
          const { svg } = await mermaid.render(id, graphDefinition);
          const wrapper = document.createElement("div");
          wrapper.className = "mermaid-diagram";
          wrapper.innerHTML = svg;
          preEl.replaceWith(wrapper);
        } catch {
          // Leave the code block as-is if mermaid can't render it
        }
      }
    } catch {
      // Mermaid failed to load, leave code blocks as-is
    }
  }

  function createKatexExtension(katex: typeof import("katex")) {
    const inlineRule = /^\$([^\$\n]+?)\$/;
    const blockRule = /^\$\$\n?([\s\S]+?)\n?\$\$/;

    return {
      extensions: [
        {
          name: "katex-block",
          level: "block" as const,
          start(src: string) {
            return src.indexOf("$$");
          },
          tokenizer(src: string) {
            const match = blockRule.exec(src);
            if (match) {
              return {
                type: "katex-block",
                raw: match[0],
                text: match[1].trim(),
              };
            }
            return undefined;
          },
          renderer(token: { text: string }) {
            try {
              return `<div class="katex-block">${katex.default.renderToString(token.text, { displayMode: true, throwOnError: false })}</div>`;
            } catch {
              return `<div class="katex-block katex-error">${token.text}</div>`;
            }
          },
        },
        {
          name: "katex-inline",
          level: "inline" as const,
          start(src: string) {
            return src.indexOf("$");
          },
          tokenizer(src: string) {
            const match = inlineRule.exec(src);
            if (match) {
              return {
                type: "katex-inline",
                raw: match[0],
                text: match[1].trim(),
              };
            }
            return undefined;
          },
          renderer(token: { text: string }) {
            try {
              return katex.default.renderToString(token.text, { displayMode: false, throwOnError: false });
            } catch {
              return `<span class="katex-error">${token.text}</span>`;
            }
          },
        },
      ],
    };
  }

  async function renderMarkdown(input: string): Promise<string> {
    const [{ marked }, hljsMod, katex] = await Promise.all([
      loadMarked(),
      loadHljs(),
      loadKatex(),
    ]);

    marked.setOptions({
      gfm: true,
      breaks: false,
    });

    marked.use(createKatexExtension(katex));

    marked.use({
      renderer: {
        code({ text, lang }: { text: string; lang?: string }) {
          if (lang === "mermaid") {
            return `<pre><code class="language-mermaid">${text}</code></pre>`;
          }
          if (lang && hljsMod.default.getLanguage(lang)) {
            const highlighted = hljsMod.default.highlight(text, { language: lang }).value;
            return `<pre><code class="hljs language-${lang}">${highlighted}</code></pre>`;
          }
          const autoHighlighted = hljsMod.default.highlightAuto(text).value;
          return `<pre><code class="hljs">${autoHighlighted}</code></pre>`;
        },
      },
    });

    const html = await marked.parse(input);
    return html;
  }

  async function updatePreview(input: string): Promise<void> {
    try {
      previewHtml = await renderMarkdown(input);
      await new Promise((r) => setTimeout(r, 0));
      await renderMermaidBlocks();
    } catch {
      previewHtml = `<p class="error">Error rendering markdown</p>`;
    }
  }

  function scheduleRender(content: string): void {
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
      updatePreview(content);
    }, 150);
  }

  async function handleCopy(type: "markdown" | "html"): Promise<void> {
    try {
      const text = type === "markdown" ? getEditorContent(editor) : previewHtml;
      await navigator.clipboard.writeText(text);
      copied = type;
      setTimeout(() => (copied = null), 2000);
    } catch {
      // Clipboard access denied
    }
  }

  function handleClear(): void {
    if (editor) {
      updateEditorContent(editor, "");
      previewHtml = "";
    }
  }

  function handleLoadSample(): void {
    if (editor) {
      updateEditorContent(editor, sampleMarkdown);
    }
  }

  onMount(() => {
    if (!editorContainer) return;

    editor = createEditor({
      container: editorContainer,
      config: {
        dark: isDark,
        placeholderText: "Type or paste your markdown here...",
        language: markdown(),
        onUpdate: (content: string) => {
          scheduleRender(content);
        },
      },
      initialContent: sampleMarkdown,
    });

    updatePreview(sampleMarkdown);

    darkModeCleanup = createDarkModeObserver((dark: boolean) => {
      isDark = dark;
      if (editor && editorContainer) {
        const content = getEditorContent(editor);
        editor.destroy();
        editor = createEditor({
          container: editorContainer,
          config: {
            dark,
            placeholderText: "Type or paste your markdown here...",
            language: markdown(),
            onUpdate: (c: string) => {
              scheduleRender(c);
            },
          },
          initialContent: content,
        });
        mermaidLoaded = false;
        updatePreview(content);
      }
    });

    return () => {
      if (darkModeCleanup) darkModeCleanup();
      if (editor) editor.destroy();
      if (renderTimer) clearTimeout(renderTimer);
    };
  });
</script>

<svelte:head>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.33/dist/katex.min.css" />
</svelte:head>

<div class="relative h-full min-h-0 overflow-hidden">
  <div class="absolute inset-0 flex flex-col">
  <header class="shrink-0 mb-3">
    <p class="text-sm text-(--color-text-muted)">
      Live markdown editor with preview. Supports GitHub Flavored Markdown, Mermaid diagrams, syntax-highlighted code blocks, and KaTeX math.
    </p>
  </header>

  <!-- Toolbar -->
  <div class="shrink-0 flex items-center gap-2 mb-3 flex-wrap">
    <button
      onclick={handleLoadSample}
      class="px-3 py-1.5 border border-(--color-border) text-(--color-text) text-xs font-medium hover:bg-(--color-bg-alt) transition-colors"
    >
      Load Sample
    </button>
    <button
      onclick={handleClear}
      class="px-3 py-1.5 border border-(--color-border) text-(--color-text) text-xs font-medium hover:bg-(--color-bg-alt) transition-colors"
    >
      Clear
    </button>
    <div class="flex-1"></div>
    <button
      onclick={() => handleCopy("markdown")}
      class="px-3 py-1.5 border border-(--color-border) text-(--color-text) text-xs font-medium hover:bg-(--color-bg-alt) transition-colors"
    >
      {copied === "markdown" ? "Copied!" : "Copy Markdown"}
    </button>
    <button
      onclick={() => handleCopy("html")}
      class="px-3 py-1.5 border border-(--color-border) text-(--color-text) text-xs font-medium hover:bg-(--color-bg-alt) transition-colors"
    >
      {copied === "html" ? "Copied!" : "Copy HTML"}
    </button>
  </div>

  <!-- Editor and Preview -->
  <div
    class="flex-1 grid gap-3 min-h-0 overflow-hidden"
    style:grid-template-columns={viewMode === "split" ? "1fr 1fr" : "1fr"}
    style:grid-template-rows="1fr"
  >
    <!-- Editor Panel (always in DOM, hidden via CSS) -->
    <div
      class="flex flex-col min-h-0 min-w-0 overflow-hidden"
      class:hidden={viewMode === "preview"}
    >
      <div class="shrink-0 flex items-center justify-between mb-2">
        <label class="text-xs tracking-wider text-(--color-text-light) font-medium">EDITOR</label>
        <button
          onclick={() => toggleView("editor")}
          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors flex items-center gap-1"
          title={viewMode === "editor" ? "Back to split view" : "Expand editor"}
        >
          {#if viewMode === "editor"}
            <!-- Shrink icon (back to split) -->
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" />
            </svg>
            Split
          {:else}
            <!-- Expand icon -->
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
            Expand
          {/if}
        </button>
      </div>
      <div
        bind:this={editorContainer}
        class="flex-1 border border-(--color-border) overflow-hidden min-h-0"
      ></div>
    </div>

    <!-- Preview Panel (always in DOM, hidden via CSS) -->
    <div
      class="flex flex-col min-h-0 min-w-0 overflow-hidden"
      class:hidden={viewMode === "editor"}
    >
      <div class="shrink-0 flex items-center justify-between mb-2">
        <label class="text-xs tracking-wider text-(--color-text-light) font-medium">PREVIEW</label>
        <button
          onclick={() => toggleView("preview")}
          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors flex items-center gap-1"
          title={viewMode === "preview" ? "Back to split view" : "Expand preview"}
        >
          {#if viewMode === "preview"}
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" />
            </svg>
            Split
          {:else}
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
            Expand
          {/if}
        </button>
      </div>
      <div
        bind:this={previewContainer}
        class="markdown-body flex-1 border border-(--color-border) bg-(--color-bg-alt) p-5 overflow-auto min-h-0"
      >
        {@html previewHtml}
      </div>
    </div>
  </div>
  </div>
</div>

<style>
  /* GitHub-like markdown body styling */
  :global(.markdown-body) {
    font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 15px;
    line-height: 1.7;
    color: var(--color-text);
    word-wrap: break-word;
  }

  :global(.markdown-body h1),
  :global(.markdown-body h2),
  :global(.markdown-body h3),
  :global(.markdown-body h4),
  :global(.markdown-body h5),
  :global(.markdown-body h6) {
    margin-top: 1.5em;
    margin-bottom: 0.5em;
    font-weight: 600;
    line-height: 1.3;
    color: var(--color-text);
  }

  :global(.markdown-body h1) {
    font-size: 1.8em;
    padding-bottom: 0.3em;
    border-bottom: 1px solid var(--color-border);
  }

  :global(.markdown-body h2) {
    font-size: 1.4em;
    padding-bottom: 0.25em;
    border-bottom: 1px solid var(--color-border);
  }

  :global(.markdown-body h3) {
    font-size: 1.15em;
  }

  :global(.markdown-body h4) {
    font-size: 1em;
  }

  :global(.markdown-body p) {
    margin-top: 0;
    margin-bottom: 1em;
  }

  :global(.markdown-body a) {
    color: #2563eb;
    text-decoration: none;
  }

  :global(.markdown-body a:hover) {
    text-decoration: underline;
  }

  :global(.markdown-body strong) {
    font-weight: 600;
  }

  :global(.markdown-body em) {
    font-style: italic;
  }

  :global(.markdown-body del) {
    text-decoration: line-through;
    opacity: 0.7;
  }

  :global(.markdown-body blockquote) {
    margin: 0 0 1em 0;
    padding: 0.5em 1em;
    border-left: 4px solid var(--color-accent);
    background: var(--color-bg);
    color: var(--color-text-muted);
  }

  :global(.markdown-body blockquote p:last-child) {
    margin-bottom: 0;
  }

  /* Remove trailing margin from last element in preview */
  :global(.markdown-body > *:last-child) {
    margin-bottom: 0;
  }

  :global(.markdown-body ul),
  :global(.markdown-body ol) {
    margin-top: 0;
    margin-bottom: 1em;
    padding-left: 2em;
  }

  :global(.markdown-body li) {
    margin-bottom: 0.25em;
  }

  :global(.markdown-body li + li) {
    margin-top: 0.25em;
  }

  /* Task list items (GFM) */
  :global(.markdown-body input[type="checkbox"]) {
    margin-right: 0.5em;
    vertical-align: middle;
  }

  :global(.markdown-body li:has(> input[type="checkbox"])) {
    list-style: none;
    margin-left: -1.5em;
  }

  /* Code */
  :global(.markdown-body code) {
    font-family: "IBM Plex Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    font-size: 0.875em;
    padding: 0.2em 0.4em;
    background: var(--color-bg);
    border-radius: 3px;
  }

  :global(.markdown-body pre) {
    margin-top: 0;
    margin-bottom: 1em;
    padding: 1em;
    overflow-x: auto;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    line-height: 1.5;
  }

  :global(.markdown-body pre code) {
    padding: 0;
    background: transparent;
    font-size: 0.85em;
    line-height: 1.6;
  }

  /* highlight.js theme overrides for light/dark */
  :global(.markdown-body .hljs) {
    background: transparent;
    color: inherit;
  }

  /* Tables (GFM) */
  :global(.markdown-body table) {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 1em;
  }

  :global(.markdown-body th),
  :global(.markdown-body td) {
    padding: 0.5em 1em;
    border: 1px solid var(--color-border);
    text-align: left;
  }

  :global(.markdown-body th) {
    font-weight: 600;
    background: var(--color-bg);
  }

  :global(.markdown-body tr:nth-child(even)) {
    background: var(--color-bg);
  }

  /* Horizontal rule */
  :global(.markdown-body hr) {
    height: 2px;
    margin: 1.5em 0;
    background-color: var(--color-border);
    border: 0;
  }

  /* Images */
  :global(.markdown-body img) {
    max-width: 100%;
    height: auto;
    border-radius: 4px;
    display: block;
  }

  /* Mermaid diagrams */
  :global(.markdown-body .mermaid-diagram) {
    margin: 1em 0;
    text-align: center;
    overflow-x: auto;
  }

  :global(.markdown-body .mermaid-diagram svg) {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 0 auto;
  }

  /* KaTeX */
  :global(.markdown-body .katex-block) {
    margin: 1em 0;
    text-align: center;
    overflow-x: auto;
    padding: 0.5em 0;
  }

  :global(.markdown-body .katex-error) {
    color: var(--color-error-text);
    font-family: "IBM Plex Mono", monospace;
    font-size: 0.85em;
  }

  /* Dark mode adjustments for links */
  :root.dark :global(.markdown-body a) {
    color: #60a5fa;
  }

  /* highlight.js dark mode */
  :root.dark :global(.markdown-body .hljs-keyword),
  :root.dark :global(.markdown-body .hljs-selector-tag),
  :root.dark :global(.markdown-body .hljs-built_in) {
    color: #c678dd;
  }

  :root.dark :global(.markdown-body .hljs-string),
  :root.dark :global(.markdown-body .hljs-attr) {
    color: #98c379;
  }

  :root.dark :global(.markdown-body .hljs-number),
  :root.dark :global(.markdown-body .hljs-literal) {
    color: #d19a66;
  }

  :root.dark :global(.markdown-body .hljs-comment) {
    color: #5c6370;
    font-style: italic;
  }

  :root.dark :global(.markdown-body .hljs-title),
  :root.dark :global(.markdown-body .hljs-function) {
    color: #61afef;
  }

  :root.dark :global(.markdown-body .hljs-type),
  :root.dark :global(.markdown-body .hljs-class) {
    color: #e5c07b;
  }

  /* Light mode hljs */
  :root:not(.dark) :global(.markdown-body .hljs-keyword),
  :root:not(.dark) :global(.markdown-body .hljs-selector-tag),
  :root:not(.dark) :global(.markdown-body .hljs-built_in) {
    color: #8959a8;
  }

  :root:not(.dark) :global(.markdown-body .hljs-string),
  :root:not(.dark) :global(.markdown-body .hljs-attr) {
    color: #718c00;
  }

  :root:not(.dark) :global(.markdown-body .hljs-number),
  :root:not(.dark) :global(.markdown-body .hljs-literal) {
    color: #f5871f;
  }

  :root:not(.dark) :global(.markdown-body .hljs-comment) {
    color: #8e908c;
    font-style: italic;
  }

  :root:not(.dark) :global(.markdown-body .hljs-title),
  :root:not(.dark) :global(.markdown-body .hljs-function) {
    color: #4271ae;
  }

  :root:not(.dark) :global(.markdown-body .hljs-type),
  :root:not(.dark) :global(.markdown-body .hljs-class) {
    color: #c18401;
  }
</style>
