<script lang="ts">
  // ── Types ──────────────────────────────────────────────────────────
  interface IconEntry {
    name: string;
    displayName: string;
    nameLower: string;
    library: "lucide" | "simple-icons";
    svg: string;
    svgDataUrl: string;
    keywords: string[];
  }

  type Shape = "square" | "rounded" | "circle" | "squircle" | "hexagon" | "shield";
  type ExportFormat = "png" | "ico";
  type ExportSize = 16 | 32 | 48 | 64 | 128 | 192 | 256 | 512;

  // ── State ──────────────────────────────────────────────────────────
  let activeLibrary = $state<"lucide" | "simple-icons">("lucide");
  let searchQuery = $state("");
  let debouncedQuery = $state("");
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let iconColor = $state("#ffffff");
  let bgColor = $state("#3b82f6");
  let bgTransparent = $state(false);
  let iconSize = $state(65);
  let shape = $state<Shape>("rounded");
  let cornerRadius = $state(20);
  let selectedIcon = $state<IconEntry | null>(null);
  let exportSize = $state<ExportSize>(512);
  let copied = $state<string | null>(null);
  let previewCanvas: HTMLCanvasElement | undefined = $state();
  let visibleCount = $state(150);

  // Icon data loaded from packages
  let lucideIcons = $state<IconEntry[]>([]);
  let simpleIcons = $state<IconEntry[]>([]);
  let iconsLoaded = $state(false);
  let loadingLibrary = $state<string | null>(null);
  let lucideLoaded = $state(false);
  let simpleIconsLoaded = $state(false);

  // ── Debounced search ──────────────────────────────────────────────
  function handleSearchInput(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    searchQuery = value;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debouncedQuery = value;
      visibleCount = 150;
    }, 120);
  }

  // ── SVG to data URL helper ────────────────────────────────────────
  function svgToDataUrl(svg: string): string {
    return "data:image/svg+xml," + encodeURIComponent(svg);
  }

  // ── Shapes config ─────────────────────────────────────────────────
  const shapes: { id: Shape; label: string; icon: string }[] = [
    { id: "square", label: "Square", icon: "■" },
    { id: "rounded", label: "Rounded", icon: "▢" },
    { id: "circle", label: "Circle", icon: "●" },
    { id: "squircle", label: "Squircle", icon: "◼" },
    { id: "hexagon", label: "Hexagon", icon: "⬡" },
    { id: "shield", label: "Shield", icon: "🛡" },
  ];

  const exportSizes: ExportSize[] = [16, 32, 48, 64, 128, 192, 256, 512];

  // ── Icon Loading ──────────────────────────────────────────────────

  async function loadLucideIcons() {
    if (lucideLoaded) return;
    loadingLibrary = "lucide";
    try {
      const [tagsModule, iconNodesModule] = await Promise.all([
        import("lucide-static/tags.json"),
        import("lucide-static/icon-nodes.json"),
      ]);
      const tags: Record<string, string[]> = tagsModule.default;
      const iconNodes = iconNodesModule.default as Record<string, [string, Record<string, string>][]>;

      const entries: IconEntry[] = [];
      for (const [name, nodes] of Object.entries(iconNodes)) {
        const innerSvg = nodes
          .map(([tag, attrs]) => {
            const attrStr = Object.entries(attrs)
              .map(([k, v]) => `${k}="${v}"`)
              .join(" ");
            return `<${tag} ${attrStr}/>`;
          })
          .join("");

        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${innerSvg}</svg>`;

        const displayName = name
          .split("-")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");

        entries.push({
          name,
          displayName,
          nameLower: name,
          library: "lucide",
          svg,
          svgDataUrl: svgToDataUrl(svg),
          keywords: tags[name] || [],
        });
      }

      lucideIcons = entries;
      lucideLoaded = true;

      // Auto-select first icon if none selected
      if (!selectedIcon && entries.length > 0) {
        const heart = entries.find((i) => i.name === "heart");
        selectedIcon = heart || entries[0];
      }
    } catch (e) {
      console.error("Failed to load Lucide icons:", e);
    }
    loadingLibrary = null;
  }

  async function loadSimpleIcons() {
    if (simpleIconsLoaded) return;
    loadingLibrary = "simple-icons";
    try {
      const module = await import("simple-icons");
      const entries: IconEntry[] = [];

      for (const [key, icon] of Object.entries(module)) {
        if (key === "default" || typeof icon !== "object" || !icon) continue;
        const si = icon as { title: string; slug: string; path: string; hex: string };
        if (!si.path || !si.title) continue;

        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path d="${si.path}" fill="currentColor"/></svg>`;

        entries.push({
          name: si.slug,
          displayName: si.title,
          nameLower: si.slug,
          library: "simple-icons",
          svg,
          svgDataUrl: svgToDataUrl(svg),
          keywords: [si.title.toLowerCase()],
        });
      }

      simpleIcons = entries;
      simpleIconsLoaded = true;
    } catch (e) {
      console.error("Failed to load Simple Icons:", e);
    }
    loadingLibrary = null;
  }

  // Load initial library
  $effect(() => {
    loadLucideIcons();
  });

  // Load library when tab switches
  $effect(() => {
    if (activeLibrary === "simple-icons" && !simpleIconsLoaded) {
      loadSimpleIcons();
    }
  });

  // ── Derived ───────────────────────────────────────────────────────

  let currentIcons = $derived(
    activeLibrary === "lucide" ? lucideIcons : simpleIcons
  );

  let filteredIcons = $derived.by(() => {
    const query = debouncedQuery.toLowerCase().trim();
    if (!query) return currentIcons;
    return currentIcons.filter(
      (icon) =>
        icon.nameLower.includes(query) ||
        icon.keywords.some((k) => k.includes(query))
    );
  });

  let showCornerRadius = $derived(shape === "rounded");

  // ── Canvas Drawing ────────────────────────────────────────────────

  function applyShapeMask(
    ctx: CanvasRenderingContext2D,
    size: number,
    currentShape: Shape,
    radius: number
  ) {
    const s = size;
    ctx.beginPath();

    switch (currentShape) {
      case "square":
        ctx.rect(0, 0, s, s);
        break;

      case "rounded": {
        const r = (radius / 100) * (s / 2);
        ctx.moveTo(r, 0);
        ctx.lineTo(s - r, 0);
        ctx.quadraticCurveTo(s, 0, s, r);
        ctx.lineTo(s, s - r);
        ctx.quadraticCurveTo(s, s, s - r, s);
        ctx.lineTo(r, s);
        ctx.quadraticCurveTo(0, s, 0, s - r);
        ctx.lineTo(0, r);
        ctx.quadraticCurveTo(0, 0, r, 0);
        break;
      }

      case "circle":
        ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
        break;

      case "squircle": {
        // iOS-style superellipse
        const n = 5;
        const half = s / 2;
        const steps = 200;
        for (let i = 0; i <= steps; i++) {
          const t = (i / steps) * Math.PI * 2;
          const cosT = Math.cos(t);
          const sinT = Math.sin(t);
          const x = half + half * Math.sign(cosT) * Math.pow(Math.abs(cosT), 2 / n);
          const y = half + half * Math.sign(sinT) * Math.pow(Math.abs(sinT), 2 / n);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        break;
      }

      case "hexagon": {
        const cx = s / 2;
        const cy = s / 2;
        const r2 = s / 2;
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 6;
          const x = cx + r2 * Math.cos(angle);
          const y = cy + r2 * Math.sin(angle);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        break;
      }

      case "shield": {
        const w = s;
        const h = s;
        ctx.moveTo(w * 0.5, 0);
        ctx.bezierCurveTo(w * 0.75, 0, w, h * 0.05, w, h * 0.15);
        ctx.lineTo(w, h * 0.45);
        ctx.bezierCurveTo(w, h * 0.75, w * 0.75, h * 0.95, w * 0.5, h);
        ctx.bezierCurveTo(w * 0.25, h * 0.95, 0, h * 0.75, 0, h * 0.45);
        ctx.lineTo(0, h * 0.15);
        ctx.bezierCurveTo(0, h * 0.05, w * 0.25, 0, w * 0.5, 0);
        break;
      }
    }

    ctx.closePath();
  }

  function renderToCanvas(
    canvas: HTMLCanvasElement,
    size: number,
    icon: IconEntry | null,
    options: {
      bgColor: string;
      iconColor: string;
      bgTransparent: boolean;
      shape: Shape;
      cornerRadius: number;
      iconSize: number;
    }
  ) {
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, size, size);

    // Draw background shape
    ctx.save();
    applyShapeMask(ctx, size, options.shape, options.cornerRadius);
    if (!options.bgTransparent) {
      ctx.fillStyle = options.bgColor;
      ctx.fill();
    }
    ctx.clip();

    // Draw icon
    if (icon) {
      const iconPixelSize = (options.iconSize / 100) * size;
      const offset = (size - iconPixelSize) / 2;

      // Parse SVG and draw on canvas using Image
      const svgWithColor = icon.svg
        .replace(/currentColor/g, options.iconColor)
        .replace(/stroke="[^"]*"/g, `stroke="${options.iconColor}"`)
        .replace(/fill="none"/g, 'fill="none"')
        .replace(/fill="currentColor"/g, `fill="${options.iconColor}"`);

      const img = new Image();
      const blob = new Blob([svgWithColor], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);

      img.onload = () => {
        ctx.drawImage(img, offset, offset, iconPixelSize, iconPixelSize);
        URL.revokeObjectURL(url);
      };
      img.src = url;
    }

    ctx.restore();
  }

  // Reactive canvas rendering
  $effect(() => {
    if (!previewCanvas || !selectedIcon) return;
    // Track all dependencies
    const _ = [iconColor, bgColor, bgTransparent, iconSize, shape, cornerRadius, selectedIcon];
    renderToCanvas(previewCanvas, 512, selectedIcon, {
      bgColor,
      iconColor,
      bgTransparent,
      shape,
      cornerRadius,
      iconSize,
    });
  });

  // Update favicon in browser
  $effect(() => {
    if (!selectedIcon) return;
    const _ = [iconColor, bgColor, bgTransparent, iconSize, shape, cornerRadius];

    const canvas = document.createElement("canvas");
    renderFaviconAsync(canvas);
  });

  async function renderFaviconAsync(canvas: HTMLCanvasElement) {
    if (!selectedIcon) return;
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, 32, 32);

    ctx.save();
    applyShapeMask(ctx, 32, shape, cornerRadius);
    if (!bgTransparent) {
      ctx.fillStyle = bgColor;
      ctx.fill();
    }
    ctx.clip();

    const svgWithColor = selectedIcon.svg
      .replace(/currentColor/g, iconColor)
      .replace(/stroke="[^"]*"/g, `stroke="${iconColor}"`)
      .replace(/fill="none"/g, 'fill="none"')
      .replace(/fill="currentColor"/g, `fill="${iconColor}"`);

    const img = new Image();
    const blob = new Blob([svgWithColor], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);

    await new Promise<void>((resolve) => {
      img.onload = () => {
        const iconPixelSize = (iconSize / 100) * 32;
        const offset = (32 - iconPixelSize) / 2;
        ctx.drawImage(img, offset, offset, iconPixelSize, iconPixelSize);
        URL.revokeObjectURL(url);
        resolve();
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve();
      };
      img.src = url;
    });

    ctx.restore();

    // Update favicon link
    const dataUrl = canvas.toDataURL("image/png");
    let link = document.querySelector('link[rel="icon"][data-favicon-gen]') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      link.setAttribute("data-favicon-gen", "true");
      document.head.appendChild(link);
    }
    link.href = dataUrl;
  }

  // ── Export Functions ──────────────────────────────────────────────

  async function renderForExport(size: number): Promise<HTMLCanvasElement> {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;

    ctx.clearRect(0, 0, size, size);

    ctx.save();
    applyShapeMask(ctx, size, shape, cornerRadius);
    if (!bgTransparent) {
      ctx.fillStyle = bgColor;
      ctx.fill();
    }
    ctx.clip();

    if (selectedIcon) {
      const svgWithColor = selectedIcon.svg
        .replace(/currentColor/g, iconColor)
        .replace(/stroke="[^"]*"/g, `stroke="${iconColor}"`)
        .replace(/fill="none"/g, 'fill="none"')
        .replace(/fill="currentColor"/g, `fill="${iconColor}"`);

      const img = new Image();
      const blob = new Blob([svgWithColor], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);

      await new Promise<void>((resolve) => {
        img.onload = () => {
          const iconPixelSize = (iconSize / 100) * size;
          const offset = (size - iconPixelSize) / 2;
          ctx.drawImage(img, offset, offset, iconPixelSize, iconPixelSize);
          URL.revokeObjectURL(url);
          resolve();
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        img.src = url;
      });
    }

    ctx.restore();
    return canvas;
  }

  async function downloadPng() {
    if (!selectedIcon) return;
    const canvas = await renderForExport(exportSize);
    const dataUrl = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `favicon-${exportSize}x${exportSize}.png`;
    link.click();
  }

  async function downloadIco() {
    if (!selectedIcon) return;
    // Generate ICO with 16, 32, 48 sizes
    const sizes = [16, 32, 48];
    const pngDataArrays: Uint8Array[] = [];

    for (const s of sizes) {
      const canvas = await renderForExport(s);
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), "image/png")
      );
      const arrayBuf = await blob.arrayBuffer();
      pngDataArrays.push(new Uint8Array(arrayBuf));
    }

    // Build ICO file (PNG-encoded variant)
    const numImages = sizes.length;
    const headerSize = 6;
    const dirEntrySize = 16;
    const dirSize = dirEntrySize * numImages;
    let dataOffset = headerSize + dirSize;

    const totalSize =
      headerSize +
      dirSize +
      pngDataArrays.reduce((sum, d) => sum + d.length, 0);
    const ico = new ArrayBuffer(totalSize);
    const view = new DataView(ico);

    // ICO Header
    view.setUint16(0, 0, true); // reserved
    view.setUint16(2, 1, true); // type: 1 = ICO
    view.setUint16(4, numImages, true); // count

    // Directory entries
    for (let i = 0; i < numImages; i++) {
      const offset2 = headerSize + i * dirEntrySize;
      const s = sizes[i];
      view.setUint8(offset2, s === 256 ? 0 : s); // width
      view.setUint8(offset2 + 1, s === 256 ? 0 : s); // height
      view.setUint8(offset2 + 2, 0); // color palette
      view.setUint8(offset2 + 3, 0); // reserved
      view.setUint16(offset2 + 4, 1, true); // color planes
      view.setUint16(offset2 + 6, 32, true); // bits per pixel
      view.setUint32(offset2 + 8, pngDataArrays[i].length, true); // size
      view.setUint32(offset2 + 12, dataOffset, true); // offset
      dataOffset += pngDataArrays[i].length;
    }

    // Image data
    let currentOffset = headerSize + dirSize;
    for (const data of pngDataArrays) {
      new Uint8Array(ico).set(data, currentOffset);
      currentOffset += data.length;
    }

    const blob = new Blob([ico], { type: "image/x-icon" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "favicon.ico";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function downloadAll() {
    if (!selectedIcon) return;
    // Dynamic import JSZip-like minimal zip builder, or use manual approach
    // For simplicity, use a simple zip implementation
    const files: { name: string; data: Blob }[] = [];

    // Generate PNGs at multiple sizes
    for (const s of [16, 32, 48, 64, 128, 192, 256, 512] as ExportSize[]) {
      const canvas = await renderForExport(s);
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), "image/png")
      );
      files.push({ name: `favicon-${s}x${s}.png`, data: blob });
    }

    // Generate ICO
    const icoSizes = [16, 32, 48];
    const pngDataArrays: Uint8Array[] = [];
    for (const s of icoSizes) {
      const canvas = await renderForExport(s);
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), "image/png")
      );
      pngDataArrays.push(new Uint8Array(await blob.arrayBuffer()));
    }

    const numImages = icoSizes.length;
    const headerSize = 6;
    const dirEntrySize = 16;
    let dataOffset = headerSize + dirEntrySize * numImages;
    const totalSize = dataOffset + pngDataArrays.reduce((sum, d) => sum + d.length, 0);
    const ico = new ArrayBuffer(totalSize);
    const view = new DataView(ico);
    view.setUint16(0, 0, true);
    view.setUint16(2, 1, true);
    view.setUint16(4, numImages, true);
    for (let i = 0; i < numImages; i++) {
      const off = headerSize + i * dirEntrySize;
      const s = icoSizes[i];
      view.setUint8(off, s === 256 ? 0 : s);
      view.setUint8(off + 1, s === 256 ? 0 : s);
      view.setUint8(off + 2, 0);
      view.setUint8(off + 3, 0);
      view.setUint16(off + 4, 1, true);
      view.setUint16(off + 6, 32, true);
      view.setUint32(off + 8, pngDataArrays[i].length, true);
      view.setUint32(off + 12, dataOffset, true);
      dataOffset += pngDataArrays[i].length;
    }
    let currentOffset = headerSize + dirEntrySize * numImages;
    for (const data of pngDataArrays) {
      new Uint8Array(ico).set(data, currentOffset);
      currentOffset += data.length;
    }
    files.push({ name: "favicon.ico", data: new Blob([ico], { type: "image/x-icon" }) });

    // Generate HTML snippet
    const html = `<!-- Favicon Setup -->
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="apple-touch-icon" href="/favicon-192x192.png">
<link rel="manifest" href="/manifest.webmanifest">

<!-- manifest.webmanifest -->
<!--
{
  "icons": [
    { "src": "/favicon-192x192.png", "type": "image/png", "sizes": "192x192" },
    { "src": "/favicon-512x512.png", "type": "image/png", "sizes": "512x512" }
  ]
}
-->`;
    files.push({ name: "usage.html", data: new Blob([html], { type: "text/html" }) });

    // Build ZIP file manually (minimal implementation)
    const zipBlob = await buildZip(files);
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "favicon-package.zip";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function buildZip(files: { name: string; data: Blob }[]): Promise<Blob> {
    const parts: Uint8Array[] = [];
    const centralDir: Uint8Array[] = [];
    let offset = 0;

    for (const file of files) {
      const nameBytes = new TextEncoder().encode(file.name);
      const fileData = new Uint8Array(await file.data.arrayBuffer());

      // Local file header
      const header = new ArrayBuffer(30 + nameBytes.length);
      const hv = new DataView(header);
      hv.setUint32(0, 0x04034b50, true); // signature
      hv.setUint16(4, 20, true); // version needed
      hv.setUint16(6, 0, true); // flags
      hv.setUint16(8, 0, true); // compression: stored
      hv.setUint16(10, 0, true); // mod time
      hv.setUint16(12, 0, true); // mod date
      hv.setUint32(14, crc32(fileData), true); // crc32
      hv.setUint32(18, fileData.length, true); // compressed size
      hv.setUint32(22, fileData.length, true); // uncompressed size
      hv.setUint16(26, nameBytes.length, true); // name length
      hv.setUint16(28, 0, true); // extra field length
      new Uint8Array(header).set(nameBytes, 30);

      // Central directory entry
      const cdEntry = new ArrayBuffer(46 + nameBytes.length);
      const cv = new DataView(cdEntry);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, 0, true);
      cv.setUint16(14, 0, true);
      cv.setUint32(16, crc32(fileData), true);
      cv.setUint32(20, fileData.length, true);
      cv.setUint32(24, fileData.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      new Uint8Array(cdEntry).set(nameBytes, 46);

      parts.push(new Uint8Array(header));
      parts.push(fileData);
      centralDir.push(new Uint8Array(cdEntry));

      offset += header.byteLength + fileData.length;
    }

    const cdOffset = offset;
    let cdSize = 0;
    for (const cd of centralDir) {
      parts.push(cd);
      cdSize += cd.length;
    }

    // End of central directory
    const eocd = new ArrayBuffer(22);
    const ev = new DataView(eocd);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, cdOffset, true);
    ev.setUint16(20, 0, true);
    parts.push(new Uint8Array(eocd));

    return new Blob(parts as BlobPart[], { type: "application/zip" });
  }

  function crc32(data: Uint8Array): number {
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function copyHtmlSnippet() {
    const html = `<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="apple-touch-icon" href="/favicon-192x192.png">`;
    navigator.clipboard.writeText(html);
    copied = "html";
    setTimeout(() => {
      copied = null;
    }, 2000);
  }

  // Cleanup favicon on unmount
  $effect(() => {
    return () => {
      const link = document.querySelector('link[rel="icon"][data-favicon-gen]');
      if (link) link.remove();
    };
  });
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Create favicons from icons with customizable colors, shapes, and sizes. Download as PNG or ICO.
    </p>
  </header>

  <div class="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
    <!-- Left Panel: Controls -->
    <div class="lg:w-80 flex flex-col gap-4 shrink-0">
      <!-- Canvas Preview -->
      <div class="flex flex-col items-center gap-2">
        <div
          class="w-40 h-40 border border-(--color-border) relative overflow-hidden"
          style="background: repeating-conic-gradient(#80808020 0% 25%, transparent 0% 50%) 50% / 16px 16px"
        >
          <canvas
            bind:this={previewCanvas}
            width="512"
            height="512"
            class="w-full h-full"
          ></canvas>
        </div>
        {#if selectedIcon}
          <span class="text-xs text-(--color-text-muted) font-mono">
            {selectedIcon.displayName}
            <span class="opacity-60">({selectedIcon.library})</span>
          </span>
        {:else}
          <span class="text-xs text-(--color-text-muted)">Select an icon</span>
        {/if}
      </div>

      <!-- Colors -->
      <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3 block">
          Colors
        </span>
        <div class="flex flex-col gap-3">
          <div>
            <label class="text-xs text-(--color-text-muted) mb-1 block">Icon Color</label>
            <div class="flex items-center gap-2">
              <div
                class="w-8 h-8 border border-(--color-border) relative cursor-pointer shrink-0"
                style="background-color: {iconColor}"
              >
                <input
                  type="color"
                  bind:value={iconColor}
                  class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>
              <input
                type="text"
                bind:value={iconColor}
                class="w-full px-2 py-1 border border-(--color-border) bg-(--color-bg) text-(--color-text) font-mono text-xs focus:outline-none focus:border-(--color-accent)"
              />
            </div>
          </div>

          <div>
            <label class="text-xs text-(--color-text-muted) mb-1 block">Background Color</label>
            <div class="flex items-center gap-2">
              <div
                class="w-8 h-8 border border-(--color-border) relative cursor-pointer shrink-0"
                style="background-color: {bgTransparent ? 'transparent' : bgColor}; {bgTransparent ? 'background-image: repeating-conic-gradient(#80808040 0% 25%, transparent 0% 50%); background-size: 8px 8px;' : ''}"
              >
                {#if !bgTransparent}
                  <input
                    type="color"
                    bind:value={bgColor}
                    class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                {/if}
              </div>
              <input
                type="text"
                bind:value={bgColor}
                disabled={bgTransparent}
                class="w-full px-2 py-1 border border-(--color-border) bg-(--color-bg) text-(--color-text) font-mono text-xs focus:outline-none focus:border-(--color-accent) disabled:opacity-50"
              />
            </div>
            <label class="flex items-center gap-2 mt-2 cursor-pointer">
              <input
                type="checkbox"
                bind:checked={bgTransparent}
                class="accent-(--color-accent)"
              />
              <span class="text-xs text-(--color-text-muted)">Transparent</span>
            </label>
          </div>
        </div>
      </div>

      <!-- Shape -->
      <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3 block">
          Shape
        </span>
        <div class="grid grid-cols-3 gap-2">
          {#each shapes as s}
            <button
              onclick={() => shape = s.id}
              class="flex flex-col items-center gap-1 px-2 py-2 text-sm transition-colors {shape === s.id
                ? 'bg-(--color-accent) text-(--color-btn-text)'
                : 'border border-(--color-border) text-(--color-text) hover:bg-(--color-bg)'}"
              title={s.label}
            >
              <span class="text-base">{s.icon}</span>
              <span class="text-[10px]">{s.label}</span>
            </button>
          {/each}
        </div>

        {#if showCornerRadius}
          <div class="mt-3">
            <label class="text-xs text-(--color-text-muted) mb-1 block">
              Corner Radius: {cornerRadius}%
            </label>
            <input
              type="range"
              min="0"
              max="50"
              bind:value={cornerRadius}
              class="w-full accent-(--color-accent)"
            />
          </div>
        {/if}
      </div>

      <!-- Icon Size -->
      <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3 block">
          Icon Size
        </span>
        <label class="text-xs text-(--color-text-muted) mb-1 block">
          Size: {iconSize}%
        </label>
        <input
          type="range"
          min="10"
          max="100"
          bind:value={iconSize}
          class="w-full accent-(--color-accent)"
        />
      </div>

      <!-- Export -->
      <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3 block">
          Export
        </span>

        <div class="mb-3">
          <label class="text-xs text-(--color-text-muted) mb-1 block">PNG Size</label>
          <select
            bind:value={exportSize}
            class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer"
          >
            {#each exportSizes as s}
              <option value={s}>{s}x{s}</option>
            {/each}
          </select>
        </div>

        <div class="flex flex-col gap-2">
          <button
            onclick={downloadPng}
            disabled={!selectedIcon}
            class="w-full px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50"
          >
            Download PNG ({exportSize}x{exportSize})
          </button>
          <button
            onclick={downloadIco}
            disabled={!selectedIcon}
            class="w-full px-4 py-2 border border-(--color-border) text-(--color-text) text-sm font-medium hover:bg-(--color-bg) transition-colors disabled:opacity-50"
          >
            Download ICO (16, 32, 48)
          </button>
          <button
            onclick={downloadAll}
            disabled={!selectedIcon}
            class="w-full px-4 py-2 border border-(--color-border) text-(--color-text) text-sm font-medium hover:bg-(--color-bg) transition-colors disabled:opacity-50"
          >
            Download All (ZIP)
          </button>
        </div>

        <div class="flex gap-2 mt-3">
          <button
            onclick={copyHtmlSnippet}
            class="flex-1 px-3 py-1.5 border border-(--color-border) text-(--color-text) text-xs hover:bg-(--color-bg) transition-colors"
          >
            {copied === "html" ? "Copied!" : "Copy HTML"}
          </button>
        </div>
      </div>

      <!-- Attribution -->
      <div class="text-xs text-(--color-text-muted) text-center py-2 border-t border-(--color-border)">
        Inspired by
        <a
          href="https://github.com/devgg/fonticon"
          target="_blank"
          rel="noopener noreferrer"
          class="text-(--color-accent) hover:underline"
        >fonticon</a>
      </div>
    </div>

    <!-- Right Panel: Icon Browser -->
    <div class="flex-1 flex flex-col min-h-0 border border-(--color-border) bg-(--color-bg-alt)">
      <!-- Search -->
      <div class="p-3 border-b border-(--color-border)">
        <input
          type="text"
          value={searchQuery}
          oninput={handleSearchInput}
          placeholder="Search icons..."
          class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)"
        />
      </div>

      <!-- Library Tabs -->
      <div class="flex border-b border-(--color-border)">
        <button
          onclick={() => { activeLibrary = "lucide"; visibleCount = 150; }}
          class="flex-1 px-4 py-2 text-sm font-medium transition-colors {activeLibrary === 'lucide'
            ? 'text-(--color-accent) border-b-2 border-(--color-accent) -mb-px'
            : 'text-(--color-text-muted) hover:text-(--color-text)'}"
        >
          Lucide
          {#if lucideLoaded}
            <span class="text-xs opacity-60">({lucideIcons.length})</span>
          {/if}
        </button>
        <button
          onclick={() => { activeLibrary = "simple-icons"; visibleCount = 150; }}
          class="flex-1 px-4 py-2 text-sm font-medium transition-colors {activeLibrary === 'simple-icons'
            ? 'text-(--color-accent) border-b-2 border-(--color-accent) -mb-px'
            : 'text-(--color-text-muted) hover:text-(--color-text)'}"
        >
          Simple Icons
          {#if simpleIconsLoaded}
            <span class="text-xs opacity-60">({simpleIcons.length})</span>
          {/if}
        </button>
      </div>

      <!-- Icon Count -->
      <div class="px-3 py-1.5 text-xs text-(--color-text-muted) border-b border-(--color-border)">
        {#if loadingLibrary}
          Loading {loadingLibrary} icons...
        {:else if searchQuery}
          {filteredIcons.length} result{filteredIcons.length !== 1 ? "s" : ""}
        {:else}
          {currentIcons.length} icons
        {/if}
      </div>

      <!-- Icon Grid -->
      <div class="flex-1 overflow-y-auto p-2">
        {#if loadingLibrary}
          <div class="flex items-center justify-center h-32 text-(--color-text-muted)">
            <svg class="animate-spin h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Loading...
          </div>
        {:else}
          <div class="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-5 xl:grid-cols-6 gap-1">
            {#each filteredIcons.slice(0, visibleCount) as icon (icon.name + icon.library)}
              <button
                onclick={() => selectedIcon = icon}
                class="flex flex-col items-center gap-1 p-2 transition-colors group {selectedIcon?.name === icon.name && selectedIcon?.library === icon.library
                  ? 'bg-(--color-accent) text-(--color-btn-text)'
                  : 'hover:bg-(--color-bg) text-(--color-text)'}"
                title={icon.displayName}
              >
                <img
                  src={icon.svgDataUrl}
                  alt={icon.displayName}
                  width="20"
                  height="20"
                  loading="lazy"
                  class="w-5 h-5 {selectedIcon?.name === icon.name && selectedIcon?.library === icon.library ? 'invert' : ''}"
                  style="{selectedIcon?.name === icon.name && selectedIcon?.library === icon.library ? '' : 'filter: var(--icon-filter, none);'}"
                />
                <span class="text-[9px] leading-tight text-center truncate w-full">
                  {icon.displayName}
                </span>
              </button>
            {/each}
          </div>
          {#if filteredIcons.length > visibleCount}
            <div class="text-center py-3">
              <button
                onclick={() => visibleCount += 150}
                class="px-4 py-1.5 text-xs border border-(--color-border) text-(--color-text) hover:bg-(--color-bg) transition-colors"
              >
                Show More ({filteredIcons.length - visibleCount} remaining)
              </button>
            </div>
          {/if}
          {#if filteredIcons.length === 0 && !loadingLibrary}
            <div class="flex items-center justify-center h-32 text-(--color-text-muted) text-sm">
              No icons found matching "{debouncedQuery}"
            </div>
          {/if}
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  :global(:root.dark) {
    --icon-filter: invert(1);
  }
</style>
