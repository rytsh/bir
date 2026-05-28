<script lang="ts">
  import CodeMirror from "svelte-codemirror-editor";
  import { xml } from "@codemirror/lang-xml";
  import { EditorView } from "@codemirror/view";
  import {
    createDarkModeObserver,
    getInitialDarkMode,
    createTheme,
    editorHeightExtension,
  } from "../../lib/codemirror.ts";

  type ExportTab = "preview" | "react-native" | "png" | "jpg" | "data-uri";
  type BgPattern = "checkered" | "white" | "black" | "custom";

  const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-feather-icon lucide-feather">
  <path d="M12.67 19a2 2 0 0 0 1.416-.588l6.154-6.172a6 6 0 0 0-8.49-8.49L5.586 9.914A2 2 0 0 0 5 11.328V18a1 1 0 0 0 1 1z"/>
  <path d="M16 8 2 22"/>
  <path d="M17.5 15H9"/>
</svg>`;

  // ── State ──────────────────────────────────────────────────────────
  let svgCode = $state(SAMPLE_SVG);
  let originalSize = $state(new TextEncoder().encode(SAMPLE_SVG).length);
  let exportTab = $state<ExportTab>("preview");
  let zoom = $state(100);
  let rotation = $state(0);
  let flipX = $state(false);
  let flipY = $state(false);
  let bgPattern = $state<BgPattern>("checkered");
  let customBg = $state("#ffffff");
  let pngScale = $state<"1" | "2" | "4" | "custom">("2");
  let pngWidth = $state(400);
  let pngHeight = $state(400);
  let pngTransparent = $state(true);
  let pngBgColor = $state("#ffffff");
  let jpgQuality = $state(0.92);
  let jpgBgColor = $state("#ffffff");
  let dataUriFormat = $state<"encoded" | "base64">("encoded");
  let copied = $state<string | null>(null);
  let error = $state("");
  let dimensionWidth = $state("");
  let dimensionHeight = $state("");
  let lockAspect = $state(true);
  let isDark = $state(getInitialDarkMode());
  let dragging = $state(false);
  let optimizing = $state(false);
  let prettifying = $state(false);
  let fileInput = $state<HTMLInputElement | undefined>(undefined);

  // ── SVGO lazy load ────────────────────────────────────────────────
  type SvgoModule = typeof import("svgo/browser");
  let svgoMod: SvgoModule | null = null;

  async function loadSvgo(): Promise<SvgoModule> {
    if (svgoMod) return svgoMod;
    svgoMod = await import("svgo/browser");
    return svgoMod;
  }

  // ── Dark mode observer ────────────────────────────────────────────
  $effect(() => {
    isDark = getInitialDarkMode();
    const cleanup = createDarkModeObserver((d) => {
      if (d !== isDark) isDark = d;
    });
    return cleanup;
  });

  // ── Derived values ────────────────────────────────────────────────
  const currentSize = $derived(new TextEncoder().encode(svgCode).length);
  const sizeChangePct = $derived(
    originalSize === 0 || originalSize === currentSize
      ? null
      : Math.round(((currentSize - originalSize) / originalSize) * 100)
  );

  function getSvgInfo(): { width: number; height: number; viewBox?: string } | null {
    if (!svgCode.trim()) return null;
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgCode, "image/svg+xml");
      const errNode = doc.querySelector("parsererror");
      if (errNode) return null;
      const svgEl = doc.querySelector("svg");
      if (!svgEl) return null;
      const wAttr = svgEl.getAttribute("width") || "";
      const hAttr = svgEl.getAttribute("height") || "";
      const vb = svgEl.getAttribute("viewBox") || undefined;
      const w = parseFloat(wAttr);
      const h = parseFloat(hAttr);
      let width = isFinite(w) && w > 0 ? w : 0;
      let height = isFinite(h) && h > 0 ? h : 0;
      if ((!width || !height) && vb) {
        const parts = vb.trim().split(/[\s,]+/);
        if (parts.length === 4) {
          const vbW = parseFloat(parts[2]);
          const vbH = parseFloat(parts[3]);
          if (!width && isFinite(vbW)) width = vbW;
          if (!height && isFinite(vbH)) height = vbH;
        }
      }
      return { width, height, viewBox: vb };
    } catch {
      return null;
    }
  }

  const svgInfo = $derived.by(() => getSvgInfo());
  const isValid = $derived(svgCode.trim() === "" || svgInfo !== null);

  const previewTransform = $derived(
    `rotate(${rotation}deg) scaleX(${flipX ? -1 : 1}) scaleY(${flipY ? -1 : 1})`
  );

  // Sync dimensions inputs with current SVG when user clears them
  $effect(() => {
    if (svgInfo && dimensionWidth === "" && dimensionHeight === "") {
      dimensionWidth = String(Math.round(svgInfo.width));
      dimensionHeight = String(Math.round(svgInfo.height));
    }
  });

  // ── Actions ───────────────────────────────────────────────────────
  async function prettify() {
    if (!svgCode.trim()) return;
    error = "";
    prettifying = true;
    try {
      const mod = await loadSvgo();
      const result = mod.optimize(svgCode, {
        js2svg: { pretty: true, indent: 2 },
        plugins: [
          {
            name: "preset-default",
            params: {
              overrides: {
                removeViewBox: false,
                removeDimensions: false,
                cleanupIds: false,
                removeUnknownsAndDefaults: false,
                convertShapeToPath: false,
                mergePaths: false,
                collapseGroups: false,
                convertPathData: false,
                convertColors: false,
              },
            },
          },
        ],
      });
      if ("data" in result) {
        svgCode = result.data;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Prettify failed";
    } finally {
      prettifying = false;
    }
  }

  async function optimize() {
    if (!svgCode.trim()) return;
    error = "";
    optimizing = true;
    try {
      const mod = await loadSvgo();
      const result = mod.optimize(svgCode, {
        multipass: true,
        plugins: ["preset-default"],
      });
      if ("data" in result) {
        svgCode = result.data;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Optimization failed";
    } finally {
      optimizing = false;
    }
  }

  function rotate90() {
    rotation = (rotation + 90) % 360;
  }

  function resetTransforms() {
    rotation = 0;
    flipX = false;
    flipY = false;
  }

  function applyDimensions() {
    const w = parseFloat(dimensionWidth);
    const h = parseFloat(dimensionHeight);
    if (!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) {
      error = "Invalid dimensions";
      return;
    }
    error = "";
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgCode, "image/svg+xml");
      const errNode = doc.querySelector("parsererror");
      if (errNode) {
        error = "Cannot parse SVG";
        return;
      }
      const svgEl = doc.querySelector("svg");
      if (!svgEl) {
        error = "No <svg> element found";
        return;
      }
      svgEl.setAttribute("width", String(w));
      svgEl.setAttribute("height", String(h));
      // Preserve or add viewBox if missing
      if (!svgEl.getAttribute("viewBox") && svgInfo) {
        svgEl.setAttribute("viewBox", `0 0 ${svgInfo.width} ${svgInfo.height}`);
      }
      const serialized = new XMLSerializer().serializeToString(svgEl);
      svgCode = serialized;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to update dimensions";
    }
  }

  function onDimensionWidthChange(e: Event) {
    const target = e.target as HTMLInputElement;
    dimensionWidth = target.value;
    if (lockAspect && svgInfo && svgInfo.width > 0 && svgInfo.height > 0) {
      const w = parseFloat(target.value);
      if (isFinite(w) && w > 0) {
        const ratio = svgInfo.height / svgInfo.width;
        dimensionHeight = String(Math.round(w * ratio));
      }
    }
  }

  function onDimensionHeightChange(e: Event) {
    const target = e.target as HTMLInputElement;
    dimensionHeight = target.value;
    if (lockAspect && svgInfo && svgInfo.width > 0 && svgInfo.height > 0) {
      const h = parseFloat(target.value);
      if (isFinite(h) && h > 0) {
        const ratio = svgInfo.width / svgInfo.height;
        dimensionWidth = String(Math.round(h * ratio));
      }
    }
  }

  function clearAll() {
    svgCode = "";
    originalSize = 0;
    error = "";
    resetTransforms();
    dimensionWidth = "";
    dimensionHeight = "";
  }

  function loadSample() {
    svgCode = SAMPLE_SVG;
    originalSize = new TextEncoder().encode(SAMPLE_SVG).length;
    error = "";
    dimensionWidth = "";
    dimensionHeight = "";
  }

  // ── File handling ─────────────────────────────────────────────────
  function handleFileChange(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      readFile(target.files[0]);
    }
  }

  function readFile(file: File) {
    if (!file.type.includes("svg") && !file.name.toLowerCase().endsWith(".svg")) {
      error = "Please upload an SVG file";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      svgCode = text;
      originalSize = new TextEncoder().encode(text).length;
      error = "";
      dimensionWidth = "";
      dimensionHeight = "";
    };
    reader.onerror = () => {
      error = "Failed to read file";
    };
    reader.readAsText(file);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      readFile(e.dataTransfer.files[0]);
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragging = true;
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    dragging = false;
  }

  // ── Exports ───────────────────────────────────────────────────────
  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function copy(text: string, label: string) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      copied = label;
      setTimeout(() => {
        copied = null;
      }, 1500);
    });
  }

  function downloadSvg() {
    if (!svgCode) return;
    const blob = new Blob([svgCode], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "image.svg";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function renderToCanvas(width: number, height: number, bg?: string): Promise<HTMLCanvasElement> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width));
      canvas.height = Math.max(1, Math.round(height));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Cannot get canvas context"));
        return;
      }
      if (bg) {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      const img = new Image();
      const blob = new Blob([svgCode], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to render SVG"));
      };
      img.src = url;
    });
  }

  const pngBaseWidth = $derived(svgInfo ? svgInfo.width : 400);
  const pngBaseHeight = $derived(svgInfo ? svgInfo.height : 400);
  const pngOutputWidth = $derived(
    pngScale === "custom"
      ? pngWidth
      : Math.round(pngBaseWidth * parseInt(pngScale))
  );
  const pngOutputHeight = $derived(
    pngScale === "custom"
      ? pngHeight
      : Math.round(pngBaseHeight * parseInt(pngScale))
  );

  async function downloadPng() {
    error = "";
    try {
      const canvas = await renderToCanvas(
        pngOutputWidth,
        pngOutputHeight,
        pngTransparent ? undefined : pngBgColor
      );
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `image-${pngOutputWidth}x${pngOutputHeight}.png`;
        link.click();
        URL.revokeObjectURL(url);
      }, "image/png");
    } catch (e) {
      error = e instanceof Error ? e.message : "PNG export failed";
    }
  }

  async function downloadJpg() {
    error = "";
    try {
      const canvas = await renderToCanvas(pngOutputWidth, pngOutputHeight, jpgBgColor);
      canvas.toBlob(
        (blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `image-${pngOutputWidth}x${pngOutputHeight}.jpg`;
          link.click();
          URL.revokeObjectURL(url);
        },
        "image/jpeg",
        jpgQuality
      );
    } catch (e) {
      error = e instanceof Error ? e.message : "JPG export failed";
    }
  }

  // ── Data URI ──────────────────────────────────────────────────────
  function svgToBase64(svg: string): string {
    // Use unescape/encodeURIComponent dance for UTF-8 safe base64
    try {
      return btoa(unescape(encodeURIComponent(svg)));
    } catch {
      return btoa(svg);
    }
  }

  const dataUriEncoded = $derived(
    svgCode ? "data:image/svg+xml," + encodeURIComponent(svgCode) : ""
  );
  const dataUriBase64 = $derived(
    svgCode ? "data:image/svg+xml;base64," + svgToBase64(svgCode) : ""
  );
  const currentDataUri = $derived(
    dataUriFormat === "encoded" ? dataUriEncoded : dataUriBase64
  );

  // ── React JSX ─────────────────────────────────────────────────────
  function attrToCamel(name: string): string {
    if (name === "class") return "className";
    if (name === "for") return "htmlFor";
    if (name === "xmlns") return "xmlns"; // valid in JSX
    // Convert prefixed attrs like xlink:href -> xlinkHref
    if (name.includes(":")) {
      const [prefix, rest] = name.split(":");
      if (!rest) return name;
      return prefix + rest.charAt(0).toUpperCase() + rest.slice(1);
    }
    // SVG attributes that should remain unchanged (already lowercase or special)
    const keep = new Set([
      "viewBox",
      "preserveAspectRatio",
      "x",
      "y",
      "width",
      "height",
      "cx",
      "cy",
      "r",
      "rx",
      "ry",
      "d",
      "x1",
      "y1",
      "x2",
      "y2",
      "fill",
      "stroke",
      "opacity",
      "transform",
      "id",
      "points",
      "offset",
      "in",
      "in2",
      "result",
      "type",
      "values",
      "from",
      "to",
      "begin",
      "end",
      "dur",
      "href",
    ]);
    if (keep.has(name)) return name;
    if (!name.includes("-")) return name;
    return name.replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());
  }

  function parseStyleString(style: string): Record<string, string> {
    const result: Record<string, string> = {};
    for (const decl of style.split(";")) {
      const trimmed = decl.trim();
      if (!trimmed) continue;
      const idx = trimmed.indexOf(":");
      if (idx === -1) continue;
      const prop = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      if (!prop) continue;
      const camel = prop.replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());
      result[camel] = value;
    }
    return result;
  }

  function svgToJsx(node: Element, indent: number, nativeTagMap?: Record<string, string>): string {
    const pad = "  ".repeat(indent);
    const tagName = nativeTagMap
      ? nativeTagMap[node.tagName] ?? capitalize(node.tagName)
      : node.tagName;

    const parts: string[] = [`${pad}<${tagName}`];
    const skipAttrs = nativeTagMap ? new Set(["xmlns", "xmlns:xlink"]) : new Set<string>();

    for (const attr of Array.from(node.attributes)) {
      if (skipAttrs.has(attr.name)) continue;
      const name = attrToCamel(attr.name);
      if (attr.name === "style") {
        const styleObj = parseStyleString(attr.value);
        const styleStr = Object.entries(styleObj)
          .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
          .join(", ");
        parts.push(` style={{ ${styleStr} }}`);
      } else {
        parts.push(` ${name}="${attr.value.replace(/"/g, "&quot;")}"`);
      }
    }

    const childrenElements: Element[] = Array.from(node.children);
    const textContent = childrenElements.length === 0 ? node.textContent?.trim() ?? "" : "";

    if (childrenElements.length === 0 && !textContent) {
      parts.push(" />");
      return parts.join("");
    }

    parts.push(">");
    if (childrenElements.length > 0) {
      parts.push("\n");
      for (const child of childrenElements) {
        parts.push(svgToJsx(child, indent + 1, nativeTagMap));
        parts.push("\n");
      }
      parts.push(pad);
    } else if (textContent) {
      // Wrap in JSX expression to safely escape any { } < > characters
      if (/[{}<>]/.test(textContent)) {
        parts.push("{" + JSON.stringify(textContent) + "}");
      } else {
        parts.push(textContent);
      }
    }
    parts.push(`</${tagName}>`);
    return parts.join("");
  }

  function capitalize(s: string): string {
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function tryParseSvg(): Element | null {
    if (!svgCode.trim()) return null;
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgCode, "image/svg+xml");
      if (doc.querySelector("parsererror")) return null;
      return doc.querySelector("svg");
    } catch {
      return null;
    }
  }

  // React Native: map SVG tags to react-native-svg components
  const nativeTagMap: Record<string, string> = {
    svg: "Svg",
    g: "G",
    path: "Path",
    circle: "Circle",
    rect: "Rect",
    line: "Line",
    polyline: "Polyline",
    polygon: "Polygon",
    ellipse: "Ellipse",
    text: "Text",
    tspan: "TSpan",
    textpath: "TextPath",
    defs: "Defs",
    use: "Use",
    symbol: "Symbol",
    image: "Image",
    clippath: "ClipPath",
    lineargradient: "LinearGradient",
    radialgradient: "RadialGradient",
    stop: "Stop",
    mask: "Mask",
    pattern: "Pattern",
    foreignobject: "ForeignObject",
    marker: "Marker",
    style: "Style",
  };

  const reactNativeJsxCode = $derived.by(() => {
    const svgEl = tryParseSvg();
    if (!svgEl) return "";
    const body = svgToJsx(svgEl, 2, nativeTagMap);

    // Determine which components are used
    const used = new Set<string>();
    function collect(el: Element) {
      const mapped = nativeTagMap[el.tagName] ?? capitalize(el.tagName);
      used.add(mapped);
      for (const child of Array.from(el.children)) collect(child);
    }
    collect(svgEl);
    const importsArr = Array.from(used).sort();
    const svgIdx = importsArr.indexOf("Svg");
    if (svgIdx > 0) {
      importsArr.splice(svgIdx, 1);
      importsArr.unshift("Svg");
    }
    // Svg is default import, the rest are named imports from react-native-svg
    const named = importsArr.filter((n) => n !== "Svg");
    const importLine = named.length
      ? `import Svg, { ${named.join(", ")} } from "react-native-svg";`
      : `import Svg from "react-native-svg";`;

    return `import * as React from "react";
${importLine}

const SvgComponent = (props) => (
${body.replace(/^  <Svg/, "  <Svg {...props}")}
);

export default SvgComponent;`;
  });

  // ── Editor extensions ─────────────────────────────────────────────
  const extensions = $derived([
    ...createTheme(isDark),
    editorHeightExtension,
    EditorView.lineWrapping,
    xml(),
  ]);

  // Background pattern CSS for preview
  const checkeredBg = `
    background-image:
      linear-gradient(45deg, #ccc 25%, transparent 25%),
      linear-gradient(-45deg, #ccc 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #ccc 75%),
      linear-gradient(-45deg, transparent 75%, #ccc 75%);
    background-size: 20px 20px;
    background-position: 0 0, 0 10px, 10px -10px, -10px 0;
    background-color: #fff;
  `;

  const previewBgStyle = $derived.by(() => {
    switch (bgPattern) {
      case "checkered":
        return checkeredBg;
      case "white":
        return "background: #ffffff;";
      case "black":
        return "background: #000000;";
      case "custom":
        return `background: ${customBg};`;
    }
  });

</script>

<div class="h-full flex flex-col">
  <header class="mb-3">
    <p class="text-sm text-(--color-text-muted)">
      View, edit, transform, optimize, and convert SVG images. Export to PNG, JPG, Data URI, React JSX, and React Native.
    </p>
  </header>

  <!-- Toolbar -->
  <div class="mb-3 py-1.5 px-2 bg-(--color-bg-alt) border border-(--color-border)">
    <div class="flex flex-wrap items-center gap-1.5">
      <!-- Upload -->
      <input
        bind:this={fileInput}
        type="file"
        accept=".svg,image/svg+xml"
        onchange={handleFileChange}
        class="hidden"
      />
      <button
        onclick={() => fileInput?.click()}
        class="px-2.5 py-1 text-xs font-medium bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) transition-colors"
        title="Upload SVG file"
      >
        Upload
      </button>

      <button
        onclick={loadSample}
        class="px-2.5 py-1 text-xs font-medium border border-(--color-border) text-(--color-text) hover:bg-(--color-bg) transition-colors"
        title="Load sample SVG"
      >
        Sample
      </button>

      <div class="w-px h-5 bg-(--color-border)"></div>

      <!-- Transforms -->
      <button
        onclick={rotate90}
        disabled={!isValid || !svgCode.trim()}
        class="px-2.5 py-1 text-xs font-medium border border-(--color-border) text-(--color-text) hover:bg-(--color-bg) transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        title="Rotate 90°"
      >
        ↻ Rotate
      </button>
      <button
        onclick={() => (flipX = !flipX)}
        disabled={!isValid || !svgCode.trim()}
        class="px-2.5 py-1 text-xs font-medium border text-(--color-text) hover:bg-(--color-bg) transition-colors disabled:opacity-40 disabled:cursor-not-allowed {flipX
          ? 'border-(--color-accent) bg-(--color-bg)'
          : 'border-(--color-border)'}"
        title="Flip horizontally (X)"
      >
        ⇆ Flip X
      </button>
      <button
        onclick={() => (flipY = !flipY)}
        disabled={!isValid || !svgCode.trim()}
        class="px-2.5 py-1 text-xs font-medium border text-(--color-text) hover:bg-(--color-bg) transition-colors disabled:opacity-40 disabled:cursor-not-allowed {flipY
          ? 'border-(--color-accent) bg-(--color-bg)'
          : 'border-(--color-border)'}"
        title="Flip vertically (Y)"
      >
        ⇅ Flip Y
      </button>
      {#if rotation !== 0 || flipX || flipY}
        <button
          onclick={resetTransforms}
          class="px-2.5 py-1 text-xs font-medium border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-bg) transition-colors"
          title="Reset preview transforms"
        >
          Reset view
        </button>
      {/if}

      <div class="w-px h-5 bg-(--color-border)"></div>

      <!-- Dimensions -->
      <div class="flex items-center gap-1">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Size</span>
        <input
          type="number"
          value={dimensionWidth}
          oninput={onDimensionWidthChange}
          placeholder={svgInfo ? String(Math.round(svgInfo.width)) : "W"}
          class="w-16 px-1.5 py-0.5 text-xs bg-(--color-bg) border border-(--color-border) text-(--color-text) focus:border-(--color-text-light) outline-none"
          min="1"
        />
        <span class="text-xs text-(--color-text-light)">×</span>
        <input
          type="number"
          value={dimensionHeight}
          oninput={onDimensionHeightChange}
          placeholder={svgInfo ? String(Math.round(svgInfo.height)) : "H"}
          class="w-16 px-1.5 py-0.5 text-xs bg-(--color-bg) border border-(--color-border) text-(--color-text) focus:border-(--color-text-light) outline-none"
          min="1"
        />
        <label class="flex items-center gap-1 ml-1 cursor-pointer" title="Lock aspect ratio">
          <input type="checkbox" bind:checked={lockAspect} class="w-3 h-3 accent-(--color-text) cursor-pointer" />
          <span class="text-xs text-(--color-text-muted)">Lock</span>
        </label>
        <button
          onclick={applyDimensions}
          disabled={!isValid || !svgCode.trim()}
          class="px-2 py-0.5 text-xs font-medium border border-(--color-border) text-(--color-text) hover:bg-(--color-bg) transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Apply dimensions to SVG"
        >
          Apply
        </button>
      </div>

      <div class="w-px h-5 bg-(--color-border)"></div>

      <!-- Prettify / Optimize -->
      <button
        onclick={prettify}
        disabled={prettifying || !svgCode.trim()}
        class="px-2.5 py-1 text-xs font-medium border border-(--color-border) text-(--color-text) hover:bg-(--color-bg) transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        title="Format SVG with indentation"
      >
        {prettifying ? "..." : "Prettify"}
      </button>
      <button
        onclick={optimize}
        disabled={optimizing || !svgCode.trim()}
        class="px-2.5 py-1 text-xs font-medium border border-(--color-border) text-(--color-text) hover:bg-(--color-bg) transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        title="Optimize SVG with SVGO"
      >
        {optimizing ? "..." : "Optimize"}
      </button>

      <div class="flex-1"></div>

      <button
        onclick={clearAll}
        class="px-2.5 py-1 text-xs font-medium text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-bg) transition-colors"
      >
        Clear
      </button>
    </div>
  </div>

  <!-- Error -->
  {#if error}
    <div class="mb-3 p-2 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-xs">
      {error}
    </div>
  {/if}

  <!-- Main split -->
  <div class="flex flex-col lg:flex-row gap-3 flex-1 min-h-[500px]">
    <!-- Editor pane -->
    <div class="flex-1 flex flex-col min-w-0">
      <div class="flex items-center justify-between mb-1.5">
        <div class="flex items-center gap-2">
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">SVG Code</span>
          {#if svgCode.trim()}
            <span
              class="text-xs px-1.5 py-0.5 rounded-sm font-medium {isValid
                ? 'bg-green-500/20 text-green-600 dark:text-green-400'
                : 'bg-red-500/20 text-red-600 dark:text-red-400'}"
            >
              {isValid ? "Valid" : "Invalid"}
            </span>
          {/if}
          <span class="text-xs text-(--color-text-muted)">
            {formatSize(currentSize)}
            {#if sizeChangePct !== null}
              <span class={sizeChangePct < 0 ? "text-green-600 dark:text-green-400" : "text-(--color-error-text)"}>
                {sizeChangePct > 0 ? "+" : ""}{sizeChangePct}%
              </span>
            {/if}
          </span>
        </div>
        <div class="flex gap-3">
          <button
            onclick={() => copy(svgCode, "code")}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            {copied === "code" ? "Copied!" : "Copy"}
          </button>
          <button
            onclick={downloadSvg}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            Download
          </button>
        </div>
      </div>
      <div
        class="flex-1 border border-(--color-border) overflow-hidden relative {dragging ? 'border-(--color-accent)' : ''}"
        ondrop={handleDrop}
        ondragover={handleDragOver}
        ondragleave={handleDragLeave}
        role="region"
        aria-label="SVG code editor with drop zone"
      >
        <CodeMirror
          bind:value={svgCode}
          placeholder="Paste SVG code, drop an SVG file, or click Upload..."
          {extensions}
        />
        {#if dragging}
          <div class="absolute inset-0 bg-(--color-accent)/10 border-2 border-dashed border-(--color-accent) flex items-center justify-center pointer-events-none z-10">
            <span class="text-sm font-medium text-(--color-accent)">Drop SVG file</span>
          </div>
        {/if}
      </div>
    </div>

    <!-- Preview / Export pane -->
    <div class="flex-1 flex flex-col min-w-0">
      <!-- Tabs -->
      <div class="flex gap-1 mb-1.5 border-b border-(--color-border) overflow-x-auto">
        {#each [
          { id: "preview", label: "Preview" },
          { id: "react-native", label: "React Native" },
          { id: "png", label: "PNG" },
          { id: "jpg", label: "JPG" },
          { id: "data-uri", label: "Data URI" },
        ] as tab (tab.id)}
          <button
            onclick={() => (exportTab = tab.id as ExportTab)}
            class="px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px whitespace-nowrap {exportTab === tab.id
              ? 'border-(--color-accent) text-(--color-text)'
              : 'border-transparent text-(--color-text-muted) hover:text-(--color-text)'}"
          >
            {tab.label}
          </button>
        {/each}
      </div>

      <!-- Tab content -->
      {#if exportTab === "preview"}
        <div class="flex flex-col flex-1 min-h-0">
          <!-- Preview controls -->
          <div class="flex flex-wrap items-center gap-2 mb-2 px-1">
            <div class="flex items-center gap-1.5">
              <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">BG</span>
              {#each [
                { id: "checkered", label: "▦" },
                { id: "white", label: "○" },
                { id: "black", label: "●" },
                { id: "custom", label: "🎨" },
              ] as bg (bg.id)}
                <button
                  onclick={() => (bgPattern = bg.id as BgPattern)}
                  class="px-2 py-0.5 text-xs border transition-colors {bgPattern === bg.id
                    ? 'border-(--color-accent) bg-(--color-bg-alt)'
                    : 'border-(--color-border)'}"
                  title={bg.id}
                >
                  {bg.label}
                </button>
              {/each}
              {#if bgPattern === "custom"}
                <input
                  type="color"
                  bind:value={customBg}
                  class="w-7 h-6 border border-(--color-border) cursor-pointer"
                />
              {/if}
            </div>
            <div class="flex-1"></div>
            <div class="flex items-center gap-2">
              <span class="text-xs text-(--color-text-muted) tabular-nums w-10 text-right">{zoom}%</span>
              <input
                type="range"
                min="10"
                max="400"
                step="10"
                bind:value={zoom}
                class="w-32 accent-(--color-text)"
              />
              <button
                onclick={() => (zoom = 100)}
                class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
                title="Reset zoom"
              >
                1:1
              </button>
            </div>
          </div>

          <!-- Preview area -->
          <div
            class="flex-1 border border-(--color-border) overflow-auto flex items-center justify-center p-4 min-h-[300px]"
            style={previewBgStyle}
          >
            {#if svgCode.trim() && isValid}
              <div
                style="transform: scale({zoom / 100}); transform-origin: center; transition: transform 0.15s ease;"
                class="flex items-center justify-center"
              >
                <div
                  style="transform: {previewTransform}; transition: transform 0.2s ease; display: inline-block;"
                >
                  {@html svgCode}
                </div>
              </div>
            {:else if !svgCode.trim()}
              <div class="text-center text-(--color-text-muted) text-sm">
                <div class="text-4xl mb-2">🖼️</div>
                <p>Paste SVG code or upload an SVG file</p>
              </div>
            {:else}
              <div class="text-center text-(--color-error-text) text-sm">
                <div class="text-4xl mb-2">⚠️</div>
                <p>Invalid SVG markup</p>
              </div>
            {/if}
          </div>

          {#if svgInfo}
            <div class="mt-1.5 text-xs text-(--color-text-muted) text-center">
              {Math.round(svgInfo.width)} × {Math.round(svgInfo.height)}
              {#if svgInfo.viewBox}<span class="ml-2">viewBox: {svgInfo.viewBox}</span>{/if}
            </div>
          {/if}
        </div>
      {:else if exportTab === "react-native"}
        <div class="flex flex-col flex-1 min-h-0">
          <div class="flex items-center justify-between mb-1.5 px-1">
            <span class="text-xs text-(--color-text-muted)">React Native (requires <code class="bg-(--color-bg-alt) px-1">react-native-svg</code>)</span>
            <button
              onclick={() => copy(reactNativeJsxCode, "rn")}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              {copied === "rn" ? "Copied!" : "Copy"}
            </button>
          </div>
          <textarea
            readonly
            value={reactNativeJsxCode}
            placeholder="Valid SVG required"
            class="flex-1 p-3 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) font-mono text-xs resize-none focus:outline-none min-h-[300px]"
          ></textarea>
        </div>
      {:else if exportTab === "png"}
        <div class="flex flex-col flex-1 min-h-0">
          <div class="mb-2 px-1 space-y-2">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Scale</span>
              {#each ["1", "2", "4", "custom"] as scale (scale)}
                <button
                  onclick={() => (pngScale = scale as typeof pngScale)}
                  class="px-2.5 py-1 text-xs font-medium border transition-colors {pngScale === scale
                    ? 'border-(--color-accent) bg-(--color-bg-alt)'
                    : 'border-(--color-border)'}"
                >
                  {scale === "custom" ? "Custom" : `${scale}x`}
                </button>
              {/each}
            </div>
            {#if pngScale === "custom"}
              <div class="flex items-center gap-2">
                <input
                  type="number"
                  bind:value={pngWidth}
                  min="1"
                  class="w-20 px-2 py-1 text-xs bg-(--color-bg) border border-(--color-border) text-(--color-text) focus:border-(--color-text-light) outline-none"
                />
                <span class="text-xs text-(--color-text-light)">×</span>
                <input
                  type="number"
                  bind:value={pngHeight}
                  min="1"
                  class="w-20 px-2 py-1 text-xs bg-(--color-bg) border border-(--color-border) text-(--color-text) focus:border-(--color-text-light) outline-none"
                />
              </div>
            {/if}
            <div class="flex items-center gap-3">
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  bind:checked={pngTransparent}
                  class="w-4 h-4 accent-(--color-text) cursor-pointer"
                />
                <span class="text-xs text-(--color-text-muted)">Transparent background</span>
              </label>
              {#if !pngTransparent}
                <input
                  type="color"
                  bind:value={pngBgColor}
                  class="w-8 h-6 border border-(--color-border) cursor-pointer"
                />
              {/if}
            </div>
            <div class="text-xs text-(--color-text-muted)">
              Output: <span class="font-mono">{pngOutputWidth} × {pngOutputHeight}</span> px
            </div>
            <button
              onclick={downloadPng}
              disabled={!isValid || !svgCode.trim()}
              class="px-4 py-1.5 text-sm font-medium bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Download PNG
            </button>
          </div>
          <!-- Preview -->
          <div
            class="flex-1 border border-(--color-border) overflow-auto flex items-center justify-center p-4 min-h-[200px]"
            style={pngTransparent ? checkeredBg : `background: ${pngBgColor};`}
          >
            {#if svgCode.trim() && isValid}
              <div class="max-w-full max-h-full">{@html svgCode}</div>
            {/if}
          </div>
        </div>
      {:else if exportTab === "jpg"}
        <div class="flex flex-col flex-1 min-h-0">
          <div class="mb-2 px-1 space-y-2">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Scale</span>
              {#each ["1", "2", "4", "custom"] as scale (scale)}
                <button
                  onclick={() => (pngScale = scale as typeof pngScale)}
                  class="px-2.5 py-1 text-xs font-medium border transition-colors {pngScale === scale
                    ? 'border-(--color-accent) bg-(--color-bg-alt)'
                    : 'border-(--color-border)'}"
                >
                  {scale === "custom" ? "Custom" : `${scale}x`}
                </button>
              {/each}
            </div>
            {#if pngScale === "custom"}
              <div class="flex items-center gap-2">
                <input
                  type="number"
                  bind:value={pngWidth}
                  min="1"
                  class="w-20 px-2 py-1 text-xs bg-(--color-bg) border border-(--color-border) text-(--color-text) focus:border-(--color-text-light) outline-none"
                />
                <span class="text-xs text-(--color-text-light)">×</span>
                <input
                  type="number"
                  bind:value={pngHeight}
                  min="1"
                  class="w-20 px-2 py-1 text-xs bg-(--color-bg) border border-(--color-border) text-(--color-text) focus:border-(--color-text-light) outline-none"
                />
              </div>
            {/if}
            <div class="flex items-center gap-2">
              <span class="text-xs text-(--color-text-muted) w-16">Background</span>
              <input
                type="color"
                bind:value={jpgBgColor}
                class="w-8 h-6 border border-(--color-border) cursor-pointer"
              />
              <span class="text-xs text-(--color-text-light)">JPG has no transparency</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs text-(--color-text-muted) w-16">Quality</span>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.01"
                bind:value={jpgQuality}
                class="flex-1 max-w-xs accent-(--color-text)"
              />
              <span class="text-xs text-(--color-text-muted) tabular-nums w-10">{Math.round(jpgQuality * 100)}%</span>
            </div>
            <div class="text-xs text-(--color-text-muted)">
              Output: <span class="font-mono">{pngOutputWidth} × {pngOutputHeight}</span> px
            </div>
            <button
              onclick={downloadJpg}
              disabled={!isValid || !svgCode.trim()}
              class="px-4 py-1.5 text-sm font-medium bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Download JPG
            </button>
          </div>
          <div
            class="flex-1 border border-(--color-border) overflow-auto flex items-center justify-center p-4 min-h-[200px]"
            style="background: {jpgBgColor};"
          >
            {#if svgCode.trim() && isValid}
              <div class="max-w-full max-h-full">{@html svgCode}</div>
            {/if}
          </div>
        </div>
      {:else if exportTab === "data-uri"}
        <div class="flex flex-col flex-1 min-h-0">
          <div class="mb-2 px-1 flex items-center gap-2">
            <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Format</span>
            <button
              onclick={() => (dataUriFormat = "encoded")}
              class="px-2.5 py-1 text-xs font-medium border transition-colors {dataUriFormat === 'encoded'
                ? 'border-(--color-accent) bg-(--color-bg-alt)'
                : 'border-(--color-border)'}"
            >
              URL Encoded
            </button>
            <button
              onclick={() => (dataUriFormat = "base64")}
              class="px-2.5 py-1 text-xs font-medium border transition-colors {dataUriFormat === 'base64'
                ? 'border-(--color-accent) bg-(--color-bg-alt)'
                : 'border-(--color-border)'}"
            >
              Base64
            </button>
            <div class="flex-1"></div>
            <span class="text-xs text-(--color-text-muted)">
              {formatSize(currentDataUri.length)}
            </span>
            <button
              onclick={() => copy(currentDataUri, "uri")}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              {copied === "uri" ? "Copied!" : "Copy"}
            </button>
          </div>
          <textarea
            readonly
            value={currentDataUri}
            placeholder="Enter SVG to generate data URI"
            class="flex-1 p-3 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) font-mono text-xs resize-none focus:outline-none min-h-[200px] break-all"
          ></textarea>
          {#if currentDataUri}
            <div class="mt-2 text-xs text-(--color-text-muted) px-1">
              <div class="mb-1">CSS:</div>
              <code
                class="block p-2 bg-(--color-bg-alt) border border-(--color-border) break-all"
                >background-image: url("{currentDataUri.length > 100
                  ? currentDataUri.slice(0, 100) + "..."
                  : currentDataUri}");</code
              >
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>
