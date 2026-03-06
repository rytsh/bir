<script lang="ts">
  import { renderAsync } from "docx-preview";
  import TurndownService from "turndown";

  let file = $state<File | null>(null);
  let fileName = $state("");
  let fileSize = $state(0);
  let errorMessage = $state("");
  let isProcessing = $state(false);
  let isRendered = $state(false);
  let dragOver = $state(false);
  let previewContainer: HTMLDivElement | undefined = $state();
  let styleContainer: HTMLStyleElement | undefined = $state();

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  }

  function handleFileChange(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      loadFile(target.files[0]);
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      const ext = droppedFile.name.toLowerCase().split(".").pop();
      if (ext === "docx") {
        loadFile(droppedFile);
      } else {
        errorMessage = "Please drop a .docx file";
      }
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragOver = true;
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
  }

  async function loadFile(f: File) {
    file = f;
    fileName = f.name;
    fileSize = f.size;
    errorMessage = "";
    isProcessing = true;
    isRendered = false;

    try {
      const arrayBuffer = await f.arrayBuffer();

      // Wait for DOM update so containers are available
      await new Promise((r) => requestAnimationFrame(r));

      if (!previewContainer) {
        throw new Error("Preview container not ready");
      }

      // Clear previous content
      previewContainer.innerHTML = "";
      if (styleContainer) {
        styleContainer.innerHTML = "";
      }

      await renderAsync(arrayBuffer, previewContainer, styleContainer as unknown as HTMLElement, {
        className: "docx-preview",
        inWrapper: true,
        ignoreWidth: false,
        ignoreHeight: false,
        ignoreFonts: false,
        breakPages: true,
        ignoreLastRenderedPageBreak: false,
        experimental: false,
        trimXmlDeclaration: true,
        useBase64URL: true,
        renderHeaders: true,
        renderFooters: true,
        renderFootnotes: true,
        renderEndnotes: true,
      });

      isRendered = true;
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : "Failed to render document";
    } finally {
      isProcessing = false;
    }
  }

  /**
   * Checks if a list is ordered by examining the generated CSS rules.
   * Ordered lists use CSS counter formats like "decimal", "lower-alpha", "upper-roman".
   * Bullet lists use "disc", "circle", "square", or "bullet".
   */
  function isOrderedList(styleText: string, listSelector: string): boolean {
    // Find CSS rules targeting this specific list selector
    // Look for the :before pseudo-element content rule which contains the counter format
    // e.g., content: counter(docx-preview-num-1-0, decimal)
    const counterRegex = new RegExp(
      `${listSelector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^}]*counter\\([^,]+,\\s*(\\w[\\w-]*)\\)`,
    );
    const counterMatch = styleText.match(counterRegex);
    if (counterMatch) {
      const format = counterMatch[1].toLowerCase();
      const bulletFormats = ["disc", "circle", "square", "none"];
      return !bulletFormats.includes(format);
    }

    // Check for list-style-type directly on the element
    const listStyleRegex = new RegExp(
      `${listSelector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^}]*list-style-type:\\s*(\\w[\\w-]*)`,
    );
    const listStyleMatch = styleText.match(listStyleRegex);
    if (listStyleMatch) {
      const format = listStyleMatch[1].toLowerCase();
      const bulletFormats = ["disc", "circle", "square", "none"];
      return !bulletFormats.includes(format);
    }

    // Default to unordered
    return false;
  }

  /**
   * Preprocesses the docx-preview rendered DOM into semantic HTML.
   * docx-preview uses <p class="docx-preview_heading1"> instead of <h1>,
   * <span style="font-weight: bold"> instead of <strong>, etc.
   * This function clones the DOM and transforms it so Turndown can
   * produce proper Markdown output.
   */
  function preprocessDocxHtml(container: HTMLElement): HTMLElement {
    const clone = container.cloneNode(true) as HTMLElement;

    // Remove page headers/footers (not document content)
    for (const el of Array.from(clone.querySelectorAll("header, footer"))) {
      el.remove();
    }

    // Convert heading paragraphs: <p class="docx-preview_heading1"> -> <h1>
    const headingPattern = /docx-preview[_-]heading(\d)/i;
    for (const p of Array.from(clone.querySelectorAll("p"))) {
      const headingClass = Array.from(p.classList).find((cls) => headingPattern.test(cls));
      if (headingClass) {
        const match = headingClass.match(headingPattern);
        if (match) {
          const level = Math.min(parseInt(match[1], 10), 6);
          const heading = document.createElement(`h${level}`);
          heading.innerHTML = p.innerHTML;
          p.replaceWith(heading);
        }
      }
    }

    // Convert list paragraphs: <p class="docx-preview-num-{id}-{level}"> -> wrap in <ul>/<ol> with <li>
    // docx-preview generates class names as: {className}-num-{id}-{level}
    // With className "docx-preview", this becomes "docx-preview-num-1-0"
    const listPattern = /docx-preview-num-(\d+)-(\d+)/;
    const allParagraphs = Array.from(clone.querySelectorAll("p"));
    const styleText = styleContainer?.textContent || "";
    let i = 0;
    while (i < allParagraphs.length) {
      const p = allParagraphs[i];
      const matchedClass = Array.from(p.classList).find((cls) => listPattern.test(cls));
      const listMatch = matchedClass?.match(listPattern);

      if (listMatch && p.parentNode) {
        const listId = listMatch[1];
        const listLevel = listMatch[2];
        const items: Element[] = [p];
        let j = i + 1;
        while (j < allParagraphs.length) {
          const next = allParagraphs[j];
          const isListItem = Array.from(next.classList).some((c) =>
            new RegExp(`docx-preview-num-${listId}-\\d+`).test(c),
          );
          if (isListItem) {
            items.push(next);
            j++;
          } else {
            break;
          }
        }

        // Determine if ordered by checking the specific CSS rules for this list ID+level
        // Ordered lists use CSS counters with formats like "decimal", "lowerLetter", etc.
        // Bullet lists use format "bullet" or "disc"
        const listSelector = `docx-preview-num-${listId}-${listLevel}`;
        const isOrdered = isOrderedList(styleText, listSelector);

        const listEl = document.createElement(isOrdered ? "ol" : "ul");
        for (const item of items) {
          const li = document.createElement("li");
          li.innerHTML = item.innerHTML;
          listEl.appendChild(li);
        }

        items[0].parentNode?.insertBefore(listEl, items[0]);
        for (const item of items) {
          item.remove();
        }

        i = j;
      } else {
        i++;
      }
    }

    // Convert inline formatting on spans to semantic HTML elements
    for (const span of Array.from(clone.querySelectorAll("span"))) {
      const style = span.getAttribute("style") || "";
      const classes = Array.from(span.classList);

      const isBold = (style.includes("font-weight") &&
        (/bold|[7-9]00/.test(style))) ||
        classes.some((c) => /strong/i.test(c));

      const isItalic = (style.includes("font-style") && style.includes("italic")) ||
        classes.some((c) => /emphasis/i.test(c));

      const isStrikethrough = style.includes("text-decoration") && style.includes("line-through");

      if (!isBold && !isItalic && !isStrikethrough) continue;

      // Build nested semantic wrappers: <strong><em><del>content</del></em></strong>
      let content = span.innerHTML;
      if (isStrikethrough) content = `<del>${content}</del>`;
      if (isItalic) content = `<em>${content}</em>`;
      if (isBold) content = `<strong>${content}</strong>`;

      // Create a temporary container to parse the nested HTML
      const temp = document.createElement("span");
      temp.innerHTML = content;

      // Replace the original span with the wrapper's children
      while (temp.firstChild) {
        span.parentNode?.insertBefore(temp.firstChild, span);
      }
      span.remove();
    }

    return clone;
  }

  /**
   * Extracts only the docx-preview document styles, filtering out
   * global wildcard resets like `* { ... }` that would break
   * the exported HTML.
   */
  function getDocxStyles(): string {
    if (!styleContainer?.sheet) return "";
    const rules: string[] = [];
    for (const rule of Array.from(styleContainer.sheet.cssRules)) {
      const text = rule.cssText;
      // Skip wildcard resets (e.g., "* { margin: 0; ... }")
      if (/^\*\s*\{/.test(text.trim())) continue;
      rules.push(text);
    }
    return rules.join("\n");
  }

  function getRenderedHtml(): string {
    if (!previewContainer) return "";
    const styles = getDocxStyles();
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${fileName}</title>
<style>
${styles}
</style>
</head>
<body>
${previewContainer.innerHTML}
</body>
</html>`;
  }

  function exportHtml() {
    const html = getRenderedHtml();
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName.replace(/\.docx$/i, "") + ".html";
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportMarkdown() {
    if (!previewContainer) return;

    const semanticDom = preprocessDocxHtml(previewContainer);

    const turndown = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      bulletListMarker: "-",
    });

    // Keep strikethrough as ~~text~~
    turndown.addRule("strikethrough", {
      filter: ["del", "s"],
      replacement: (content: string) => `~~${content}~~`,
    });

    // Skip wrapper/section/article elements - just pass through their content
    turndown.addRule("docx-wrapper", {
      filter: (node: HTMLElement) => {
        const tag = node.tagName.toLowerCase();
        return tag === "section" || tag === "article" ||
          (tag === "div" && node.classList.contains("docx-preview-wrapper"));
      },
      replacement: (content: string) => content,
    });

    const markdown = turndown.turndown(semanticDom.innerHTML);
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName.replace(/\.docx$/i, "") + ".md";
    link.click();
    URL.revokeObjectURL(url);
  }

  function clear() {
    file = null;
    fileName = "";
    fileSize = 0;
    errorMessage = "";
    isProcessing = false;
    isRendered = false;
    if (previewContainer) previewContainer.innerHTML = "";
    if (styleContainer) styleContainer.innerHTML = "";
  }
</script>

<style>
  .docx-viewer-container :global(.docx-preview-wrapper) {
    background: white;
    padding: 0;
  }
  .docx-viewer-container :global(.docx-preview-wrapper > section.docx-preview) {
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.06);
    margin-bottom: 16px;
    padding: 48px 60px;
  }
</style>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      View .docx files in the browser. Export to HTML or Markdown.
    </p>
  </header>

  {#if errorMessage}
    <div class="mb-4 p-3 border border-red-500 bg-red-500/10 text-red-500 text-sm">
      {errorMessage}
    </div>
  {/if}

  {#if !file}
    <div
      ondrop={handleDrop}
      ondragover={handleDragOver}
      ondragleave={handleDragLeave}
      class="flex-1 min-h-[300px] border-2 border-dashed {dragOver ? 'border-(--color-accent)' : 'border-(--color-border)'} flex flex-col items-center justify-center p-4 hover:border-(--color-accent) transition-colors cursor-pointer"
    >
      <input
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onchange={handleFileChange}
        class="hidden"
        id="docx-input"
      />
      <label for="docx-input" class="cursor-pointer text-center">
        <div class="text-4xl mb-2">📄</div>
        <p class="text-sm text-(--color-text)">Drop a .docx file or click to select</p>
        <p class="text-xs text-(--color-text-muted) mt-1">Microsoft Word documents (.docx)</p>
      </label>
    </div>
  {:else}
    <!-- Toolbar -->
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <div class="flex-1 min-w-0">
        <span class="text-sm text-(--color-text) font-medium truncate block">{fileName}</span>
        <span class="text-xs text-(--color-text-muted)">{formatFileSize(fileSize)}</span>
      </div>
      <div class="flex gap-2">
        {#if isRendered}
          <button
            onclick={exportHtml}
            class="px-3 py-1.5 text-xs font-medium border border-(--color-border) text-(--color-text) hover:bg-(--color-bg-alt) transition-colors"
          >
            Export HTML
          </button>
          <button
            onclick={exportMarkdown}
            class="px-3 py-1.5 text-xs font-medium border border-(--color-border) text-(--color-text) hover:bg-(--color-bg-alt) transition-colors"
          >
            Export Markdown
          </button>
        {/if}
        <button
          onclick={clear}
          class="px-3 py-1.5 text-xs font-medium text-(--color-text-muted) hover:text-(--color-text) transition-colors"
        >
          Clear
        </button>
      </div>
    </div>

    <!-- Document preview -->
    <div class="flex-1 overflow-auto border border-(--color-border) bg-neutral-200 dark:bg-neutral-800 docx-viewer-container">
      {#if isProcessing}
        <div class="flex items-center justify-center h-full">
          <p class="text-sm text-(--color-text-muted)">Rendering document...</p>
        </div>
      {/if}
      <style bind:this={styleContainer}></style>
      <div bind:this={previewContainer} class="p-4"></div>
    </div>
  {/if}
</div>
