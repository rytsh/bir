<script lang="ts">
  import type {
    BackgroundMode,
    CanvasResizeSnapshot,
    EditorSnapshot,
    ImageLayer,
    LayerDragMode,
    LayerDragSnapshot,
    OutputFormat,
    ResizeHandle,
  } from "./types.ts";
  import {
    MAX_HISTORY_LENGTH,
    MAX_LAYER_SCALE,
    MAX_OUTPUT_SIZE,
    MIN_LAYER_SCALE,
    clampInteger,
    clampNumber,
    cloneLayers,
    createImageLayer,
    formatFileSize,
    getDataUrlSize,
    loadImageElement,
    normalizeRotation,
    readImageFile,
  } from "./utils.ts";

  const ROTATION_PRESETS: number[] = [0, 90, 180, 270];
  const FRAME_HANDLES: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
  const LAYER_SCALE_HANDLES: ResizeHandle[] = ["nw", "ne", "se", "sw"];

  const FRAME_HANDLE_CLASSES: Record<ResizeHandle, string> = {
    nw: "-left-2 -top-2 w-4 h-4 cursor-nwse-resize",
    n: "left-1/2 -top-2 w-10 h-4 -translate-x-1/2 cursor-ns-resize",
    ne: "-right-2 -top-2 w-4 h-4 cursor-nesw-resize",
    e: "-right-2 top-1/2 w-4 h-10 -translate-y-1/2 cursor-ew-resize",
    se: "-right-2 -bottom-2 w-4 h-4 cursor-nwse-resize",
    s: "left-1/2 -bottom-2 w-10 h-4 -translate-x-1/2 cursor-ns-resize",
    sw: "-left-2 -bottom-2 w-4 h-4 cursor-nesw-resize",
    w: "-left-2 top-1/2 w-4 h-10 -translate-y-1/2 cursor-ew-resize",
  };

  const LAYER_HANDLE_CLASSES: Record<ResizeHandle, string> = {
    nw: "-left-2 -top-2 cursor-nwse-resize",
    n: "left-1/2 -top-2 -translate-x-1/2 cursor-ns-resize",
    ne: "-right-2 -top-2 cursor-nesw-resize",
    e: "-right-2 top-1/2 -translate-y-1/2 cursor-ew-resize",
    se: "-right-2 -bottom-2 cursor-nwse-resize",
    s: "left-1/2 -bottom-2 -translate-x-1/2 cursor-ns-resize",
    sw: "-left-2 -bottom-2 cursor-nesw-resize",
    w: "-left-2 top-1/2 -translate-y-1/2 cursor-ew-resize",
  };

  let fileInput = $state<HTMLInputElement | null>(null);
  let frameElement = $state<HTMLDivElement | null>(null);
  let layers = $state<ImageLayer[]>([]);
  let selectedLayerId = $state<string | null>(null);
  let canvasWidth = $state<number>(800);
  let canvasHeight = $state<number>(600);
  let lockCanvasAspect = $state<boolean>(true);
  let outputFormat = $state<OutputFormat>("png");
  let quality = $state<number>(92);
  let backgroundMode = $state<BackgroundMode>("transparent");
  let backgroundColor = $state<string>("#ffffff");
  let errorMessage = $state<string>("");
  let processedImage = $state<string>("");
  let isExporting = $state<boolean>(false);
  let layerDragSnapshot = $state<LayerDragSnapshot | null>(null);
  let canvasResizeSnapshot = $state<CanvasResizeSnapshot | null>(null);
  let undoStack = $state<EditorSnapshot[]>([]);
  let redoStack = $state<EditorSnapshot[]>([]);

  let selectedLayer = $derived(layers.find((layer) => layer.id === selectedLayerId) ?? null);
  let hasLayers = $derived(layers.length > 0);
  let canUndo = $derived(undoStack.length > 0);
  let canRedo = $derived(redoStack.length > 0);
  let previewScale = $derived(Math.min(1, 780 / Math.max(canvasWidth, 1), 520 / Math.max(canvasHeight, 1)));
  let processedSize = $derived(processedImage ? formatFileSize(getDataUrlSize(processedImage)) : "");

  function handleFileChange(e: Event): void {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      addFiles(Array.from(target.files));
      target.value = "";
    }
  }

  function handleDrop(e: DragEvent): void {
    e.preventDefault();
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  }

  function handleDragOver(e: DragEvent): void {
    e.preventDefault();
  }

  async function addFiles(files: File[]): Promise<void> {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      errorMessage = "Please choose image files only";
      return;
    }

    errorMessage = "";
    try {
      const loadedImages = await Promise.all(imageFiles.map((file) => readImageFile(file)));
      if (loadedImages.length === 0) return;

      if (layers.length > 0) saveHistorySnapshot();

      if (layers.length === 0) {
        canvasWidth = clampInteger(loadedImages[0].width, 1, MAX_OUTPUT_SIZE);
        canvasHeight = clampInteger(loadedImages[0].height, 1, MAX_OUTPUT_SIZE);
      }

      const newLayers = loadedImages.map((loaded, index) => createImageLayer(loaded, canvasWidth, canvasHeight, layers.length + index));
      layers = [...layers, ...newLayers];
      selectedLayerId = newLayers[newLayers.length - 1].id;
      processedImage = "";
      redoStack = [];
    } catch {
      errorMessage = "Could not load one of these images";
    }
  }

  function getBackgroundFill(): string | null {
    if (outputFormat === "jpeg" && backgroundMode === "transparent") return "#ffffff";
    if (backgroundMode === "transparent") return null;
    return backgroundMode === "white" ? "#ffffff" : backgroundColor;
  }

  function getFrameStyle(): string {
    const backgroundFill = getBackgroundFill();
    const backgroundStyle = backgroundFill ? `background-color: ${backgroundFill};` : "";
    return `width: ${canvasWidth}px; height: ${canvasHeight}px; transform: scale(${previewScale}); ${backgroundStyle}`;
  }

  function getFrameShellStyle(): string {
    return `width: ${Math.ceil(canvasWidth * previewScale)}px; height: ${Math.ceil(canvasHeight * previewScale)}px;`;
  }

  function getLayerStyle(layer: ImageLayer): string {
    return `left: ${layer.x}px; top: ${layer.y}px; width: ${layer.naturalWidth}px; height: ${layer.naturalHeight}px; opacity: ${layer.opacity}; transform: translate(-50%, -50%) rotate(${layer.rotation}deg) scale(${layer.scale});`;
  }

  function captureSnapshot(): EditorSnapshot {
    return {
      layers: cloneLayers(layers),
      selectedLayerId,
      canvasWidth,
      canvasHeight,
      lockCanvasAspect,
      outputFormat,
      quality,
      backgroundMode,
      backgroundColor,
    };
  }

  function getSnapshotKey(snapshot: EditorSnapshot): string {
    return JSON.stringify({
      ...snapshot,
      layers: snapshot.layers.map(({ src: _src, ...layer }) => layer),
    });
  }

  function saveHistorySnapshot(): void {
    if (layers.length === 0) return;

    const snapshot = captureSnapshot();
    const lastSnapshot = undoStack[undoStack.length - 1];
    if (lastSnapshot && getSnapshotKey(lastSnapshot) === getSnapshotKey(snapshot)) return;

    undoStack = [...undoStack.slice(-MAX_HISTORY_LENGTH + 1), snapshot];
    redoStack = [];
  }

  function applySnapshot(snapshot: EditorSnapshot): void {
    layers = cloneLayers(snapshot.layers);
    selectedLayerId = snapshot.selectedLayerId;
    canvasWidth = snapshot.canvasWidth;
    canvasHeight = snapshot.canvasHeight;
    lockCanvasAspect = snapshot.lockCanvasAspect;
    outputFormat = snapshot.outputFormat;
    quality = snapshot.quality;
    backgroundMode = snapshot.backgroundMode;
    backgroundColor = snapshot.backgroundColor;
    processedImage = "";
  }

  function undo(): void {
    const snapshot = undoStack[undoStack.length - 1];
    if (!snapshot) return;

    redoStack = [...redoStack, captureSnapshot()];
    undoStack = undoStack.slice(0, -1);
    applySnapshot(snapshot);
  }

  function redo(): void {
    const snapshot = redoStack[redoStack.length - 1];
    if (!snapshot) return;

    undoStack = [...undoStack, captureSnapshot()];
    redoStack = redoStack.slice(0, -1);
    applySnapshot(snapshot);
  }

  function updateCanvasWidth(value: number): void {
    saveHistorySnapshot();
    const previousWidth = canvasWidth;
    canvasWidth = clampInteger(value, 1, MAX_OUTPUT_SIZE);
    if (lockCanvasAspect && previousWidth > 0) {
      canvasHeight = clampInteger((canvasHeight * canvasWidth) / previousWidth, 1, MAX_OUTPUT_SIZE);
    }
    processedImage = "";
  }

  function updateCanvasHeight(value: number): void {
    saveHistorySnapshot();
    const previousHeight = canvasHeight;
    canvasHeight = clampInteger(value, 1, MAX_OUTPUT_SIZE);
    if (lockCanvasAspect && previousHeight > 0) {
      canvasWidth = clampInteger((canvasWidth * canvasHeight) / previousHeight, 1, MAX_OUTPUT_SIZE);
    }
    processedImage = "";
  }

  function toggleCanvasAspect(): void {
    saveHistorySnapshot();
    lockCanvasAspect = !lockCanvasAspect;
    processedImage = "";
  }

  function updateOutputFormat(value: OutputFormat): void {
    saveHistorySnapshot();
    outputFormat = value;
    processedImage = "";
  }

  function updateQuality(value: number): void {
    saveHistorySnapshot();
    quality = clampInteger(value, 1, 100);
    processedImage = "";
  }

  function updateBackgroundMode(value: BackgroundMode): void {
    saveHistorySnapshot();
    backgroundMode = value;
    processedImage = "";
  }

  function updateBackgroundColor(value: string): void {
    saveHistorySnapshot();
    backgroundColor = value;
    processedImage = "";
  }

  function updateSelectedLayer(updates: Partial<ImageLayer>, recordHistory: boolean = true): void {
    if (!selectedLayerId) return;
    if (recordHistory) saveHistorySnapshot();

    layers = layers.map((layer) => layer.id === selectedLayerId ? { ...layer, ...updates } : layer);
    processedImage = "";
  }

  function updateLayerById(layerId: string, updates: Partial<ImageLayer>, recordHistory: boolean = true): void {
    if (recordHistory) saveHistorySnapshot();

    layers = layers.map((layer) => layer.id === layerId ? { ...layer, ...updates } : layer);
    processedImage = "";
  }

  function resetSelectedLayer(): void {
    if (!selectedLayer) return;
    saveHistorySnapshot();

    const fitScale = Math.min(1, (canvasWidth * 0.82) / selectedLayer.naturalWidth, (canvasHeight * 0.82) / selectedLayer.naturalHeight);
    updateSelectedLayer({ x: canvasWidth / 2, y: canvasHeight / 2, scale: fitScale, rotation: 0, opacity: 1 }, false);
  }

  function duplicateSelectedLayer(): void {
    if (!selectedLayer) return;
    saveHistorySnapshot();

    const duplicate: ImageLayer = {
      ...selectedLayer,
      id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`,
      name: `${selectedLayer.name} copy`,
      x: selectedLayer.x + 32,
      y: selectedLayer.y + 32,
    };
    layers = [...layers, duplicate];
    selectedLayerId = duplicate.id;
    processedImage = "";
  }

  function removeLayer(layerId: string): void {
    saveHistorySnapshot();

    const nextLayers = layers.filter((layer) => layer.id !== layerId);
    layers = nextLayers;
    if (selectedLayerId === layerId) {
      selectedLayerId = nextLayers[nextLayers.length - 1]?.id ?? null;
    }
    processedImage = "";
  }

  function moveLayer(layerId: string, direction: "up" | "down"): void {
    const index = layers.findIndex((layer) => layer.id === layerId);
    if (index === -1) return;

    const targetIndex = direction === "up" ? index + 1 : index - 1;
    if (targetIndex < 0 || targetIndex >= layers.length) return;

    saveHistorySnapshot();
    const nextLayers = [...layers];
    [nextLayers[index], nextLayers[targetIndex]] = [nextLayers[targetIndex], nextLayers[index]];
    layers = nextLayers;
    processedImage = "";
  }

  function getFrameScale(): number {
    if (!frameElement || canvasWidth <= 0) return previewScale;
    const rect = frameElement.getBoundingClientRect();
    return rect.width / canvasWidth || previewScale;
  }

  function getCanvasPoint(e: PointerEvent): { x: number; y: number } | null {
    if (!frameElement) return null;

    const rect = frameElement.getBoundingClientRect();
    const scale = getFrameScale();
    return {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale,
    };
  }

  function getDistanceAndAngle(e: PointerEvent, layer: ImageLayer): { distance: number; angle: number } {
    const point = getCanvasPoint(e) ?? { x: layer.x, y: layer.y };
    const dx = point.x - layer.x;
    const dy = point.y - layer.y;
    return {
      distance: Math.max(1, Math.hypot(dx, dy)),
      angle: Math.atan2(dy, dx) * 180 / Math.PI,
    };
  }

  function startLayerDrag(e: PointerEvent, layerId: string, mode: LayerDragMode): void {
    const layer = layers.find((item) => item.id === layerId);
    if (!layer) return;

    e.preventDefault();
    e.stopPropagation();
    selectedLayerId = layerId;
    saveHistorySnapshot();

    const metrics = getDistanceAndAngle(e, layer);
    layerDragSnapshot = {
      mode,
      layerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      frameScale: getFrameScale(),
      startX: layer.x,
      startY: layer.y,
      startScale: layer.scale,
      startRotation: layer.rotation,
      startDistance: metrics.distance,
      startAngle: metrics.angle,
    };

    window.addEventListener("pointermove", handleLayerDragMove);
    window.addEventListener("pointerup", stopLayerDrag, { once: true });
  }

  function handleLayerDragMove(e: PointerEvent): void {
    if (!layerDragSnapshot) return;

    const layer = layers.find((item) => item.id === layerDragSnapshot!.layerId);
    if (!layer) return;

    if (layerDragSnapshot.mode === "move") {
      const dx = (e.clientX - layerDragSnapshot.startClientX) / layerDragSnapshot.frameScale;
      const dy = (e.clientY - layerDragSnapshot.startClientY) / layerDragSnapshot.frameScale;
      updateLayerById(layer.id, { x: layerDragSnapshot.startX + dx, y: layerDragSnapshot.startY + dy }, false);
      return;
    }

    const metrics = getDistanceAndAngle(e, { ...layer, x: layerDragSnapshot.startX, y: layerDragSnapshot.startY });

    if (layerDragSnapshot.mode === "scale") {
      updateLayerById(layer.id, {
        scale: clampNumber(layerDragSnapshot.startScale * (metrics.distance / layerDragSnapshot.startDistance), MIN_LAYER_SCALE, MAX_LAYER_SCALE),
      }, false);
      return;
    }

    updateLayerById(layer.id, {
      rotation: normalizeRotation(layerDragSnapshot.startRotation + metrics.angle - layerDragSnapshot.startAngle),
    }, false);
  }

  function stopLayerDrag(): void {
    layerDragSnapshot = null;
    window.removeEventListener("pointermove", handleLayerDragMove);
  }

  function startCanvasResize(e: PointerEvent, handle: ResizeHandle): void {
    e.preventDefault();
    e.stopPropagation();
    saveHistorySnapshot();

    canvasResizeSnapshot = {
      handle,
      startClientX: e.clientX,
      startClientY: e.clientY,
      frameScale: getFrameScale(),
      startCanvasWidth: canvasWidth,
      startCanvasHeight: canvasHeight,
      startLayers: cloneLayers(layers),
    };

    window.addEventListener("pointermove", handleCanvasResizeMove);
    window.addEventListener("pointerup", stopCanvasResize, { once: true });
  }

  function handleCanvasResizeMove(e: PointerEvent): void {
    if (!canvasResizeSnapshot) return;

    const dx = (e.clientX - canvasResizeSnapshot.startClientX) / canvasResizeSnapshot.frameScale;
    const dy = (e.clientY - canvasResizeSnapshot.startClientY) / canvasResizeSnapshot.frameScale;
    const handle = canvasResizeSnapshot.handle;
    let nextWidth = canvasResizeSnapshot.startCanvasWidth;
    let nextHeight = canvasResizeSnapshot.startCanvasHeight;
    let layerOffsetX = 0;
    let layerOffsetY = 0;

    if (handle.includes("e")) nextWidth = canvasResizeSnapshot.startCanvasWidth + dx;
    if (handle.includes("s")) nextHeight = canvasResizeSnapshot.startCanvasHeight + dy;
    if (handle.includes("w")) {
      nextWidth = canvasResizeSnapshot.startCanvasWidth - dx;
      layerOffsetX = -dx;
    }
    if (handle.includes("n")) {
      nextHeight = canvasResizeSnapshot.startCanvasHeight - dy;
      layerOffsetY = -dy;
    }

    canvasWidth = clampInteger(nextWidth, 1, MAX_OUTPUT_SIZE);
    canvasHeight = clampInteger(nextHeight, 1, MAX_OUTPUT_SIZE);
    layers = canvasResizeSnapshot.startLayers.map((layer) => ({
      ...layer,
      x: layer.x + layerOffsetX,
      y: layer.y + layerOffsetY,
    }));
    processedImage = "";
  }

  function stopCanvasResize(): void {
    canvasResizeSnapshot = null;
    window.removeEventListener("pointermove", handleCanvasResizeMove);
  }

  async function exportImage(): Promise<void> {
    if (layers.length === 0) return;

    isExporting = true;
    errorMessage = "";

    try {
      const canvas = document.createElement("canvas");
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      const backgroundFill = getBackgroundFill();
      if (backgroundFill) {
        ctx.fillStyle = backgroundFill;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      }

      for (const layer of layers) {
        if (!layer.visible || layer.opacity <= 0) continue;

        const img = await loadImageElement(layer.src);
        ctx.save();
        ctx.globalAlpha = layer.opacity;
        ctx.translate(layer.x, layer.y);
        ctx.rotate((layer.rotation * Math.PI) / 180);
        ctx.scale(layer.scale, layer.scale);
        ctx.drawImage(img, -layer.naturalWidth / 2, -layer.naturalHeight / 2, layer.naturalWidth, layer.naturalHeight);
        ctx.restore();
      }

      const mimeType = `image/${outputFormat}`;
      const q = outputFormat === "png" ? undefined : quality / 100;
      processedImage = canvas.toDataURL(mimeType, q);
    } catch {
      errorMessage = "Could not export this image. Try a smaller canvas or fewer layers.";
    } finally {
      isExporting = false;
    }
  }

  function downloadImage(): void {
    if (!processedImage) return;

    const link = document.createElement("a");
    link.href = processedImage;
    link.download = `image-composition-${canvasWidth}x${canvasHeight}.${outputFormat}`;
    link.click();
  }

  function clearAll(): void {
    layers = [];
    selectedLayerId = null;
    processedImage = "";
    errorMessage = "";
    undoStack = [];
    redoStack = [];
    canvasWidth = 800;
    canvasHeight = 600;
  }
</script>

<div class="h-full min-h-0 flex flex-col gap-4">
  <header>
    <p class="text-sm text-(--color-text-muted)">
      Add images as layers, drag them on the canvas, rotate/scale each one, set the final image size, then export.
    </p>
  </header>

  {#if errorMessage}
    <div class="mb-4 p-3 border border-red-500 bg-red-500/10 text-red-500 text-sm">
      {errorMessage}
    </div>
  {/if}

  <input
    bind:this={fileInput}
    type="file"
    accept="image/*"
    multiple
    onchange={handleFileChange}
    class="hidden"
  />

  <div class="border border-(--color-border) bg-(--color-bg-alt)">
    <div class="flex flex-wrap items-end gap-3 p-3 border-b border-(--color-border)">
      <div class="flex flex-wrap gap-2">
        <button onclick={() => fileInput?.click()} class="px-3 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors">
          Import Images
        </button>
        <button onclick={exportImage} disabled={!hasLayers || isExporting} class="px-3 py-2 border border-(--color-border) text-(--color-text) text-sm font-medium hover:bg-(--color-bg) disabled:opacity-40 transition-colors">
          {isExporting ? "Exporting..." : "Export"}
        </button>
        <button onclick={downloadImage} disabled={!processedImage} class="px-3 py-2 border border-(--color-border) text-(--color-text) text-sm font-medium hover:bg-(--color-bg) disabled:opacity-40 transition-colors">
          Download{processedImage ? ` (${processedSize})` : ""}
        </button>
      </div>

      <div class="h-9 w-px bg-(--color-border) hidden md:block"></div>

      <div class="flex flex-wrap items-end gap-2">
        <div>
          <label class="text-[11px] uppercase tracking-wider text-(--color-text-muted) block mb-1">Width</label>
          <input type="number" min="1" max={MAX_OUTPUT_SIZE} value={canvasWidth} oninput={(e) => updateCanvasWidth(parseInt((e.target as HTMLInputElement).value) || 1)} class="w-24 px-2 py-1.5 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)" />
        </div>
        <button onclick={toggleCanvasAspect} class="h-9 px-2 border transition-colors bg-transparent text-(--color-text) border-(--color-border) hover:border-(--color-accent)" title={lockCanvasAspect ? "Unlock aspect ratio" : "Lock aspect ratio"}>
          {lockCanvasAspect ? "🔗" : "🔓"}
        </button>
        <div>
          <label class="text-[11px] uppercase tracking-wider text-(--color-text-muted) block mb-1">Height</label>
          <input type="number" min="1" max={MAX_OUTPUT_SIZE} value={canvasHeight} oninput={(e) => updateCanvasHeight(parseInt((e.target as HTMLInputElement).value) || 1)} class="w-24 px-2 py-1.5 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)" />
        </div>
      </div>

      <div class="h-9 w-px bg-(--color-border) hidden lg:block"></div>

      <div class="flex flex-wrap items-end gap-2">
        <div>
          <label class="text-[11px] uppercase tracking-wider text-(--color-text-muted) block mb-1">Format</label>
          <select value={outputFormat} onchange={(e) => updateOutputFormat((e.target as HTMLSelectElement).value as OutputFormat)} class="w-24 px-2 py-1.5 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer">
            <option value="png">PNG</option>
            <option value="jpeg">JPEG</option>
            <option value="webp">WebP</option>
          </select>
        </div>
        {#if outputFormat !== "png"}
          <div>
            <label class="text-[11px] uppercase tracking-wider text-(--color-text-muted) block mb-1">Quality {quality}%</label>
            <input type="range" min="1" max="100" value={quality} oninput={(e) => updateQuality(parseInt((e.target as HTMLInputElement).value) || 1)} class="w-28 accent-(--color-accent)" />
          </div>
        {/if}
      </div>

      <div class="h-9 w-px bg-(--color-border) hidden lg:block"></div>

      <div class="flex flex-wrap items-end gap-2">
        <div>
          <label class="text-[11px] uppercase tracking-wider text-(--color-text-muted) block mb-1">Background</label>
          <div class="flex">
            <button onclick={() => updateBackgroundMode("transparent")} class={`px-2 py-1.5 text-xs border transition-colors ${backgroundMode === "transparent" ? "border-(--color-accent) bg-(--color-accent) text-(--color-btn-text)" : "border-(--color-border) text-(--color-text) hover:bg-(--color-bg)"}`}>
              Transparent
            </button>
            <button onclick={() => updateBackgroundMode("white")} class={`px-2 py-1.5 text-xs border-y border-r transition-colors ${backgroundMode === "white" ? "border-(--color-accent) bg-(--color-accent) text-(--color-btn-text)" : "border-(--color-border) text-(--color-text) hover:bg-(--color-bg)"}`}>
              White
            </button>
            <button onclick={() => updateBackgroundMode("custom")} class={`px-2 py-1.5 text-xs border-y border-r transition-colors ${backgroundMode === "custom" ? "border-(--color-accent) bg-(--color-accent) text-(--color-btn-text)" : "border-(--color-border) text-(--color-text) hover:bg-(--color-bg)"}`}>
              Custom
            </button>
          </div>
        </div>
        {#if backgroundMode === "custom"}
          <input type="color" value={backgroundColor} oninput={(e) => updateBackgroundColor((e.target as HTMLInputElement).value)} class="h-9 w-11 border border-(--color-border) bg-(--color-bg) cursor-pointer" />
        {/if}
      </div>

      <div class="flex-1"></div>

      <div class="flex gap-2">
        <button onclick={undo} disabled={!canUndo} class="px-3 py-2 text-xs border border-(--color-border) text-(--color-text) hover:bg-(--color-bg) disabled:opacity-40 transition-colors">
          Undo
        </button>
        <button onclick={redo} disabled={!canRedo} class="px-3 py-2 text-xs border border-(--color-border) text-(--color-text) hover:bg-(--color-bg) disabled:opacity-40 transition-colors">
          Redo
        </button>
        <button onclick={clearAll} disabled={!hasLayers} class="px-3 py-2 text-xs border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-bg) disabled:opacity-40 transition-colors">
          Clear
        </button>
      </div>
    </div>

    {#if outputFormat === "jpeg" && backgroundMode === "transparent"}
      <div class="px-3 py-2 border-b border-(--color-border) text-xs text-(--color-text-muted)">
        JPEG has no alpha channel, so transparent areas export as white.
      </div>
    {/if}
  </div>

  <div class="flex flex-col xl:flex-row gap-4 flex-1 min-h-0 overflow-hidden">
    <div class="flex-1 min-w-0 min-h-0 flex flex-col">
      <div
        ondrop={handleDrop}
        ondragover={handleDragOver}
        class="checkerboard editor-viewport border border-(--color-border) overflow-auto overscroll-contain p-8"
      >
        <div class="min-w-max min-h-max p-16 flex items-center justify-center">
          <div class="relative shrink-0" style={getFrameShellStyle()}>
            <div
              bind:this={frameElement}
              role="presentation"
              class={`absolute left-0 top-0 shrink-0 border-2 border-transparent shadow-xl origin-top-left overflow-visible ${getBackgroundFill() ? "" : "checkerboard"}`}
              style={getFrameStyle()}
              onclick={() => selectedLayerId = null}
            >

            {#each layers as layer (layer.id)}
              {#if layer.visible}
                <div
                  role="presentation"
                  onpointerdown={(e) => startLayerDrag(e, layer.id, "move")}
                  onclick={(e) => e.stopPropagation()}
                  class={`absolute select-none touch-none ${selectedLayerId === layer.id ? "z-20" : "z-10"}`}
                  style={getLayerStyle(layer)}
                  title={layer.name}
                >
                  <img
                    src={layer.src}
                    alt={layer.name}
                    draggable="false"
                    class="block w-full h-full pointer-events-none"
                  />

                  {#if selectedLayerId === layer.id}
                    <div class="absolute inset-0 border-2 border-(--color-accent) pointer-events-none"></div>
                    <span class="absolute left-1 top-1 px-1.5 py-0.5 bg-black/75 text-white text-[11px] font-mono pointer-events-none">
                      {Math.round(layer.naturalWidth * layer.scale)} x {Math.round(layer.naturalHeight * layer.scale)}px
                    </span>
                    <span
                      role="presentation"
                      onpointerdown={(e) => startLayerDrag(e, layer.id, "rotate")}
                      class="absolute left-1/2 -top-12 w-5 h-5 -translate-x-1/2 rounded-full bg-(--color-accent) border-2 border-(--color-bg) cursor-grab"
                      title="Rotate image"
                    ></span>
                    <span class="absolute left-1/2 -top-7 h-7 border-l-2 border-(--color-accent) pointer-events-none"></span>

                    {#each LAYER_SCALE_HANDLES as handle}
                      <span
                        role="presentation"
                        onpointerdown={(e) => startLayerDrag(e, layer.id, "scale")}
                        class={`absolute w-4 h-4 bg-(--color-accent) border-2 border-(--color-bg) ${LAYER_HANDLE_CLASSES[handle]}`}
                        title="Scale image"
                      ></span>
                    {/each}
                  {/if}
                </div>
              {/if}
            {/each}

              <div class="absolute inset-0 z-40 pointer-events-none border-2 border-(--color-accent)"></div>
              <div class="absolute inset-px z-40 pointer-events-none border border-white/50"></div>

              {#each FRAME_HANDLES as handle}
                <span
                  role="presentation"
                  onpointerdown={(e) => startCanvasResize(e, handle)}
                  class={`absolute z-50 bg-(--color-accent) border border-(--color-bg) ${FRAME_HANDLE_CLASSES[handle]}`}
                  title="Resize canvas"
                ></span>
              {/each}
            </div>
          </div>
        </div>
      </div>

      <div class="mt-2 text-xs text-(--color-text-muted) text-center">
        Canvas: {canvasWidth} x {canvasHeight}px, layers: {layers.length}{processedImage ? `, last export: ${processedSize}` : ""}
      </div>
    </div>

    <aside class="xl:w-[360px] min-h-0 flex flex-col gap-4 overflow-auto pr-1">
      <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">
            Layers
          </span>
          <button onclick={() => fileInput?.click()} class="text-xs text-(--color-accent) hover:text-(--color-accent-hover)">Add</button>
        </div>

        {#if layers.length === 0}
          <button onclick={() => fileInput?.click()} class="w-full p-4 border border-dashed border-(--color-border) text-sm text-(--color-text-muted) hover:text-(--color-text) hover:border-(--color-accent) transition-colors">
            Import photos to start layering.
          </button>
        {:else}
          <div class="flex flex-col gap-2 max-h-72 overflow-auto">
            {#each layers.slice().reverse() as layer (layer.id)}
              <button
                type="button"
                onclick={() => selectedLayerId = layer.id}
                class={`flex items-center gap-2 p-2 border text-left transition-colors ${selectedLayerId === layer.id ? "border-(--color-accent) bg-(--color-bg)" : "border-(--color-border) hover:bg-(--color-bg)"}`}
              >
                <img src={layer.src} alt="" class="w-9 h-9 object-cover border border-(--color-border)" />
                <span class="min-w-0 flex-1">
                  <span class="block text-xs text-(--color-text) truncate">{layer.name}</span>
                  <span class="block text-[11px] text-(--color-text-muted)">{layer.naturalWidth} x {layer.naturalHeight}px, {formatFileSize(layer.fileSize)}</span>
                </span>
                <span class="text-[11px] text-(--color-text-muted)">{layer.visible ? "Shown" : "Hidden"}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
        {#if selectedLayer}
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-3 block">
            Layer Properties
          </span>

          <div class="mb-3 flex items-center gap-2">
            <img src={selectedLayer.src} alt="" class="w-12 h-12 object-cover border border-(--color-border)" />
            <div class="min-w-0">
              <span class="block text-sm text-(--color-text) truncate">{selectedLayer.name}</span>
              <span class="block text-xs text-(--color-text-muted)">{selectedLayer.naturalWidth} x {selectedLayer.naturalHeight}px</span>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label class="text-xs text-(--color-text-muted) mb-1 block">X</label>
              <input type="number" value={Math.round(selectedLayer.x)} oninput={(e) => updateSelectedLayer({ x: parseFloat((e.target as HTMLInputElement).value) || 0 })} class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)" />
            </div>
            <div>
              <label class="text-xs text-(--color-text-muted) mb-1 block">Y</label>
              <input type="number" value={Math.round(selectedLayer.y)} oninput={(e) => updateSelectedLayer({ y: parseFloat((e.target as HTMLInputElement).value) || 0 })} class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)" />
            </div>
          </div>

          <div class="mb-3">
            <div class="flex items-center justify-between gap-3 mb-1">
              <label class="text-xs text-(--color-text-muted) block">Scale: {Math.round(selectedLayer.scale * 100)}%</label>
              <input type="number" min="2" max="2000" value={Math.round(selectedLayer.scale * 100)} oninput={(e) => updateSelectedLayer({ scale: clampNumber((parseFloat((e.target as HTMLInputElement).value) || 2) / 100, MIN_LAYER_SCALE, MAX_LAYER_SCALE) })} class="w-20 px-2 py-1 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-xs font-mono focus:outline-none focus:border-(--color-accent)" />
            </div>
            <input type="range" min="2" max="400" step="1" value={selectedLayer.scale * 100} oninput={(e) => updateSelectedLayer({ scale: clampNumber((parseFloat((e.target as HTMLInputElement).value) || 2) / 100, MIN_LAYER_SCALE, MAX_LAYER_SCALE) })} class="w-full accent-(--color-accent)" />
          </div>

          <div class="mb-3">
            <div class="flex items-center justify-between gap-3 mb-1">
              <label class="text-xs text-(--color-text-muted) block">Rotation</label>
              <div class="flex items-center gap-1">
                <input type="number" min="0" max="360" value={Math.round(selectedLayer.rotation)} oninput={(e) => updateSelectedLayer({ rotation: normalizeRotation(parseFloat((e.target as HTMLInputElement).value) || 0) })} class="w-20 px-2 py-1 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-xs font-mono focus:outline-none focus:border-(--color-accent)" />
                <span class="text-xs text-(--color-text-muted)">deg</span>
              </div>
            </div>
            <input type="range" min="0" max="360" step="1" value={selectedLayer.rotation} oninput={(e) => updateSelectedLayer({ rotation: normalizeRotation(parseFloat((e.target as HTMLInputElement).value) || 0) })} class="w-full accent-(--color-accent)" />
          </div>

          <div class="grid grid-cols-4 gap-2 mb-3">
            {#each ROTATION_PRESETS as option}
              <button onclick={() => updateSelectedLayer({ rotation: option })} class={`px-2 py-1 text-xs border transition-colors ${Math.round(selectedLayer.rotation) === option ? "border-(--color-accent) bg-(--color-accent) text-(--color-btn-text)" : "border-(--color-border) text-(--color-text) hover:bg-(--color-bg)"}`}>
                {option}°
              </button>
            {/each}
          </div>

          <div class="mb-3">
            <label class="text-xs text-(--color-text-muted) mb-1 block">Opacity: {Math.round(selectedLayer.opacity * 100)}%</label>
            <input type="range" min="0" max="100" value={selectedLayer.opacity * 100} oninput={(e) => updateSelectedLayer({ opacity: clampNumber((parseFloat((e.target as HTMLInputElement).value) || 0) / 100, 0, 1) })} class="w-full accent-(--color-accent)" />
          </div>

          <div class="grid grid-cols-2 gap-2 mb-2">
            <button onclick={() => updateSelectedLayer({ visible: !selectedLayer.visible })} class="px-2 py-1 text-xs border border-(--color-border) text-(--color-text) hover:bg-(--color-bg) transition-colors">
              {selectedLayer.visible ? "Hide" : "Show"}
            </button>
            <button onclick={resetSelectedLayer} class="px-2 py-1 text-xs border border-(--color-border) text-(--color-text) hover:bg-(--color-bg) transition-colors">
              Fit Center
            </button>
            <button onclick={duplicateSelectedLayer} class="px-2 py-1 text-xs border border-(--color-border) text-(--color-text) hover:bg-(--color-bg) transition-colors">
              Duplicate
            </button>
            <button onclick={() => removeLayer(selectedLayer!.id)} class="px-2 py-1 text-xs border border-red-500/60 text-red-500 hover:bg-red-500/10 transition-colors">
              Delete
            </button>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <button onclick={() => moveLayer(selectedLayer!.id, "up")} class="px-2 py-1 text-xs border border-(--color-border) text-(--color-text) hover:bg-(--color-bg) transition-colors">
              Bring Forward
            </button>
            <button onclick={() => moveLayer(selectedLayer!.id, "down")} class="px-2 py-1 text-xs border border-(--color-border) text-(--color-text) hover:bg-(--color-bg) transition-colors">
              Send Back
            </button>
          </div>
        {:else}
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2 block">
            Layer Properties
          </span>
          <p class="text-sm text-(--color-text-muted)">
            Select a layer on the canvas or from the layer list to edit position, scale, rotation, opacity, and order.
          </p>
        {/if}
      </div>
    </aside>
  </div>
</div>

<style>
  .editor-viewport {
    min-height: 360px;
    max-height: clamp(360px, calc(100vh - 17rem), 720px);
  }

  .checkerboard {
    background-color: var(--color-bg-alt);
    background-image:
      linear-gradient(45deg, rgb(128 128 128 / 16%) 25%, transparent 25%),
      linear-gradient(-45deg, rgb(128 128 128 / 16%) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, rgb(128 128 128 / 16%) 75%),
      linear-gradient(-45deg, transparent 75%, rgb(128 128 128 / 16%) 75%);
    background-position: 0 0, 0 8px, 8px -8px, -8px 0;
    background-size: 16px 16px;
  }
</style>
