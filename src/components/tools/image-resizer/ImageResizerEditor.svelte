<script lang="ts">
  import type {
    BackgroundMode,
    CanvasResizeSnapshot,
    DrawingSnapshot,
    DrawTool,
    EditorSnapshot,
    EffectKind,
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
    createEffectLayer,
    createImageLayer,
    createPathLayer,
    createTextLayer,
    formatFileSize,
    getDrawingPath,
    loadImageElement,
    normalizeRotation,
    readImageFile,
    refreshGeneratedLayerAsset,
  } from "./utils.ts";
  import { applyEffectLayer } from "./effects.ts";
  import { getLayerResizeUpdates } from "./layer-transform.ts";

  const ROTATION_PRESETS: number[] = [0, 90, 180, 270];
  const FRAME_HANDLES: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
  const LAYER_SCALE_HANDLES: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

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
  let canvasAspectRatio = $state<number>(800 / 600);
  let outputFormat = $state<OutputFormat>("png");
  let quality = $state<number>(92);
  let backgroundMode = $state<BackgroundMode>("transparent");
  let backgroundColor = $state<string>("#ffffff");
  let drawTool = $state<DrawTool>("select");
  let penColor = $state<string>("#ef4444");
  let penWidth = $state<number>(6);
  let highlighterColor = $state<string>("#facc15");
  let highlighterWidth = $state<number>(30);
  let errorMessage = $state<string>("");
  let lastOutputSize = $state<string>("");
  let outputAction = $state<"download" | "copy" | null>(null);
  let layerDragSnapshot = $state<LayerDragSnapshot | null>(null);
  let canvasResizeSnapshot = $state<CanvasResizeSnapshot | null>(null);
  let activeDrawing = $state<DrawingSnapshot | null>(null);
  let layerListDragId = $state<string | null>(null);
  let layerListDropId = $state<string | null>(null);
  let layerListDropPosition = $state<"before" | "after">("before");
  let effectPreviews = $state<Record<string, string>>({});
  let effectPreviewTimer: ReturnType<typeof setTimeout> | null = null;
  let effectPreviewToken = 0;
  let lastPreviewSignature = "";
  let manualZoom = $state<number | null>(null);
  let lastHistoryGroup: string | null = null;
  let lastHistoryTime = 0;
  const HISTORY_GROUP_MS = 600;
  let undoStack = $state<EditorSnapshot[]>([]);
  let redoStack = $state<EditorSnapshot[]>([]);

  let selectedLayer = $derived(layers.find((layer) => layer.id === selectedLayerId) ?? null);
  let hasLayers = $derived(layers.length > 0);
  let canUndo = $derived(undoStack.length > 0);
  let canRedo = $derived(redoStack.length > 0);
  let autoFitScale = $derived(Math.min(1, 780 / Math.max(canvasWidth, 1), 520 / Math.max(canvasHeight, 1)));
  let previewScale = $derived(manualZoom ?? autoFitScale);
  let isDrawingMode = $derived(drawTool !== "select");
  let isExporting = $derived(outputAction !== null);

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
        updateCanvasAspectRatio();
      }

      const newLayers = loadedImages.map((loaded, index) => createImageLayer(loaded, canvasWidth, canvasHeight, layers.length + index));
      layers = [...layers, ...newLayers];
      selectedLayerId = newLayers[newLayers.length - 1].id;
      lastOutputSize = "";
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

  function getLayerDisplayWidth(layer: ImageLayer): number {
    return Math.round(layer.naturalWidth * layer.scale);
  }

  function getLayerScaleY(layer: ImageLayer): number {
    return layer.scaleY ?? layer.scale;
  }

  function getLayerDisplayHeight(layer: ImageLayer): number {
    return Math.round(layer.naturalHeight * getLayerScaleY(layer));
  }

  function getLayerStyle(layer: ImageLayer): string {
    return `left: ${layer.x}px; top: ${layer.y}px; width: ${getLayerDisplayWidth(layer)}px; height: ${getLayerDisplayHeight(layer)}px; opacity: ${layer.opacity}; transform: translate(-50%, -50%) rotate(${layer.rotation}deg);`;
  }

  function getEffectLayerStyle(layer: ImageLayer): string {
    const strength = clampInteger(layer.effectStrength ?? 12, 1, 80);
    const blur = clampNumber(layer.effectBlur ?? 2, 0, 16);

    if (layer.effectKind === "crystal") {
      const facetSize = clampInteger(strength, 10, 80);
      return `background-color: rgb(255 255 255 / 6%); backdrop-filter: blur(${blur}px) saturate(1.42) contrast(1.14); -webkit-backdrop-filter: blur(${blur}px) saturate(1.42) contrast(1.14); background-image: conic-gradient(from 35deg at 28% 34%, rgb(255 255 255 / 28%) 0 18deg, transparent 18deg 112deg, rgb(147 197 253 / 18%) 112deg 143deg, transparent 143deg 360deg), conic-gradient(from 218deg at 72% 66%, transparent 0 62deg, rgb(255 255 255 / 18%) 62deg 96deg, transparent 96deg 236deg, rgb(96 165 250 / 14%) 236deg 272deg, transparent 272deg 360deg), linear-gradient(135deg, rgb(255 255 255 / 46%) 0 1px, transparent 1px 100%), linear-gradient(45deg, transparent 0 48%, rgb(255 255 255 / 24%) 49% 50%, transparent 51% 100%); background-size: ${facetSize * 1.35}px ${facetSize * 1.35}px, ${facetSize * 1.7}px ${facetSize * 1.7}px, ${facetSize}px ${facetSize}px, ${facetSize * 1.4}px ${facetSize * 1.4}px; background-position: 0 0, ${facetSize / 2}px ${facetSize / 3}px, 0 0, ${facetSize / 2}px ${facetSize / 2}px; border: 1px solid rgb(255 255 255 / 78%); box-shadow: inset 0 0 0 1px rgb(96 165 250 / 24%), inset 0 0 22px rgb(255 255 255 / 20%), 0 0 0 1px rgb(15 23 42 / 10%);`;
    }

    return `background-color: rgb(255 255 255 / 2%); backdrop-filter: blur(${strength}px) saturate(1.08); -webkit-backdrop-filter: blur(${strength}px) saturate(1.08); border: 1px solid rgb(255 255 255 / 72%); box-shadow: inset 0 0 0 1px rgb(96 165 250 / 22%);`;
  }

  function getEffectPreviewStyle(layer: ImageLayer): string {
    const url = effectPreviews[layer.id];
    if (!url) return "";

    const displayWidth = getLayerDisplayWidth(layer);
    const displayHeight = getLayerDisplayHeight(layer);
    const offsetX = -(layer.x - displayWidth / 2);
    const offsetY = -(layer.y - displayHeight / 2);
    return `background-image: url("${url}"); background-repeat: no-repeat; background-size: ${canvasWidth}px ${canvasHeight}px; background-position: ${offsetX}px ${offsetY}px; box-shadow: inset 0 0 0 1px rgb(255 255 255 / 55%);`;
  }

  function getLayerTypeLabel(layer: ImageLayer): string {
    if (layer.kind === "effect") return layer.effectKind === "crystal" ? (layer.effectColorful ? "Stained Glass" : "Crystal Glass") : "Blur";
    if (layer.kind === "path") return "Drawing";
    if (layer.kind === "text") return "Text";
    return "Image";
  }

  function getLayerMeta(layer: ImageLayer): string {
    const size = `${getLayerDisplayWidth(layer)} x ${getLayerDisplayHeight(layer)}px`;
    return layer.fileSize > 0 ? `${size}, ${formatFileSize(layer.fileSize)}` : size;
  }

  function getCanvasAspectRatio(): number {
    if (Number.isFinite(canvasAspectRatio) && canvasAspectRatio > 0) return canvasAspectRatio;
    return canvasHeight > 0 ? canvasWidth / canvasHeight : 1;
  }

  function updateCanvasAspectRatio(): void {
    if (canvasWidth > 0 && canvasHeight > 0) {
      canvasAspectRatio = canvasWidth / canvasHeight;
    }
  }

  function captureSnapshot(): EditorSnapshot {
    return {
      layers: cloneLayers(layers),
      selectedLayerId,
      canvasWidth,
      canvasHeight,
      lockCanvasAspect,
      canvasAspectRatio,
      outputFormat,
      quality,
      backgroundMode,
      backgroundColor,
    };
  }

  function getSnapshotKey(snapshot: EditorSnapshot): string {
    return JSON.stringify({
      ...snapshot,
      layers: snapshot.layers.map(({ src, ...layer }) => ({
        ...layer,
        srcFingerprint: src ? `${src.length}:${src.slice(0, 32)}:${src.slice(-32)}` : "",
      })),
    });
  }

  function saveHistorySnapshot(group: string | null = null): void {
    if (layers.length === 0) return;

    const now = Date.now();

    // Coalesce rapid same-group edits (e.g. dragging a slider) into a single
    // history entry: the pre-edit state was already captured on the first call.
    if (group !== null && group === lastHistoryGroup && now - lastHistoryTime < HISTORY_GROUP_MS) {
      lastHistoryTime = now;
      return;
    }

    lastHistoryGroup = group;
    lastHistoryTime = now;

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
    canvasAspectRatio = snapshot.canvasAspectRatio || (snapshot.canvasHeight > 0 ? snapshot.canvasWidth / snapshot.canvasHeight : 1);
    outputFormat = snapshot.outputFormat;
    quality = snapshot.quality;
    backgroundMode = snapshot.backgroundMode;
    backgroundColor = snapshot.backgroundColor;
    lastOutputSize = "";
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
    saveHistorySnapshot("canvas-size");
    const nextWidth = clampInteger(value, 1, MAX_OUTPUT_SIZE);

    if (lockCanvasAspect) {
      const ratio = getCanvasAspectRatio();
      const nextHeight = clampInteger(nextWidth / ratio, 1, MAX_OUTPUT_SIZE);
      canvasWidth = clampInteger(nextHeight * ratio, 1, MAX_OUTPUT_SIZE);
      canvasHeight = nextHeight;
    } else {
      canvasWidth = nextWidth;
      updateCanvasAspectRatio();
    }

    lastOutputSize = "";
  }

  function updateCanvasHeight(value: number): void {
    saveHistorySnapshot("canvas-size");
    const nextHeight = clampInteger(value, 1, MAX_OUTPUT_SIZE);

    if (lockCanvasAspect) {
      const ratio = getCanvasAspectRatio();
      const nextWidth = clampInteger(nextHeight * ratio, 1, MAX_OUTPUT_SIZE);
      canvasHeight = clampInteger(nextWidth / ratio, 1, MAX_OUTPUT_SIZE);
      canvasWidth = nextWidth;
    } else {
      canvasHeight = nextHeight;
      updateCanvasAspectRatio();
    }

    lastOutputSize = "";
  }

  function toggleCanvasAspect(): void {
    saveHistorySnapshot();
    if (!lockCanvasAspect) updateCanvasAspectRatio();
    lockCanvasAspect = !lockCanvasAspect;
    lastOutputSize = "";
  }

  function updateOutputFormat(value: OutputFormat): void {
    saveHistorySnapshot();
    outputFormat = value;
    lastOutputSize = "";
  }

  function updateQuality(value: number): void {
    saveHistorySnapshot("quality");
    quality = clampInteger(value, 1, 100);
    lastOutputSize = "";
  }

  function updateBackgroundMode(value: BackgroundMode): void {
    saveHistorySnapshot();
    backgroundMode = value;
    lastOutputSize = "";
  }

  function updateBackgroundColor(value: string): void {
    saveHistorySnapshot("bg-color");
    backgroundColor = value;
    lastOutputSize = "";
  }

  function setDrawTool(value: DrawTool): void {
    drawTool = value;
    selectedLayerId = null;
  }

  function updateDrawColor(value: string): void {
    if (drawTool === "pen") {
      penColor = value;
      return;
    }

    highlighterColor = value;
  }

  function updateDrawWidth(value: number): void {
    const nextValue = clampInteger(value, 2, 64);
    if (drawTool === "pen") {
      penWidth = nextValue;
      return;
    }

    highlighterWidth = nextValue;
  }

  function addGeneratedLayer(layer: ImageLayer): void {
    if (layers.length > 0) saveHistorySnapshot();
    layers = [...layers, layer];
    selectedLayerId = layer.id;
    drawTool = "select";
    lastOutputSize = "";
    redoStack = [];
  }

  function addTextAnnotation(): void {
    addGeneratedLayer(createTextLayer(canvasWidth, canvasHeight, layers.length));
  }

  function addEffectPatch(effectKind: EffectKind): void {
    addGeneratedLayer(createEffectLayer(effectKind, canvasWidth, canvasHeight, layers.length));
  }

  function updateSelectedLayer(updates: Partial<ImageLayer>, recordHistory: boolean = true, group: string | null = null): void {
    if (!selectedLayerId) return;
    if (recordHistory) saveHistorySnapshot(group);

    layers = layers.map((layer) => layer.id === selectedLayerId ? { ...layer, ...updates } : layer);
    lastOutputSize = "";
  }

  function updateSelectedGeneratedLayer(updates: Partial<ImageLayer>, group: string | null = null): void {
    if (!selectedLayer) return;
    saveHistorySnapshot(group);

    const nextLayer = refreshGeneratedLayerAsset({ ...selectedLayer, ...updates });
    layers = layers.map((layer) => layer.id === selectedLayer.id ? nextLayer : layer);
    lastOutputSize = "";
  }

  function updateLayerById(layerId: string, updates: Partial<ImageLayer>, recordHistory: boolean = true, group: string | null = null): void {
    if (recordHistory) saveHistorySnapshot(group);

    layers = layers.map((layer) => layer.id === layerId ? { ...layer, ...updates } : layer);
    lastOutputSize = "";
  }

  function resetSelectedLayer(): void {
    if (!selectedLayer) return;
    saveHistorySnapshot();

    const fitScale = Math.min(1, (canvasWidth * 0.82) / selectedLayer.naturalWidth, (canvasHeight * 0.82) / selectedLayer.naturalHeight);
    updateSelectedLayer({ x: canvasWidth / 2, y: canvasHeight / 2, scale: fitScale, scaleY: fitScale, rotation: 0, opacity: 1 }, false);
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
    lastOutputSize = "";
  }

  function removeLayer(layerId: string): void {
    saveHistorySnapshot();

    const nextLayers = layers.filter((layer) => layer.id !== layerId);
    layers = nextLayers;
    if (selectedLayerId === layerId) {
      selectedLayerId = nextLayers[nextLayers.length - 1]?.id ?? null;
    }
    lastOutputSize = "";
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
    lastOutputSize = "";
  }

  function clearLayerListDrag(): void {
    layerListDragId = null;
    layerListDropId = null;
    layerListDropPosition = "before";
  }

  function startLayerListDrag(e: DragEvent, layerId: string): void {
    selectedLayerId = layerId;
    layerListDragId = layerId;
    layerListDropId = null;

    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", layerId);
    }
  }

  function handleLayerListDragOver(e: DragEvent, targetLayerId: string): void {
    if (!layerListDragId || layerListDragId === targetLayerId) return;

    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";

    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    layerListDropId = targetLayerId;
    layerListDropPosition = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
  }

  function reorderLayerList(sourceLayerId: string, targetLayerId: string, dropPosition: "before" | "after"): void {
    if (sourceLayerId === targetLayerId) return;

    const sourceIndex = layers.findIndex((layer) => layer.id === sourceLayerId);
    if (sourceIndex === -1 || layers.every((layer) => layer.id !== targetLayerId)) return;

    saveHistorySnapshot();
    const nextLayers = [...layers];
    const [sourceLayer] = nextLayers.splice(sourceIndex, 1);
    const targetIndex = nextLayers.findIndex((layer) => layer.id === targetLayerId);
    if (!sourceLayer || targetIndex === -1) return;

    const insertIndex = dropPosition === "before" ? targetIndex + 1 : targetIndex;
    nextLayers.splice(insertIndex, 0, sourceLayer);
    layers = nextLayers;
    selectedLayerId = sourceLayerId;
    lastOutputSize = "";
  }

  function handleLayerListDrop(e: DragEvent, targetLayerId: string): void {
    e.preventDefault();
    e.stopPropagation();

    const sourceLayerId = layerListDragId || e.dataTransfer?.getData("text/plain") || "";
    reorderLayerList(sourceLayerId, targetLayerId, layerListDropPosition);
    clearLayerListDrag();
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

  function startDrawing(e: PointerEvent): void {
    if (drawTool === "select") return;

    const point = getCanvasPoint(e);
    if (!point) return;

    e.preventDefault();
    e.stopPropagation();
    selectedLayerId = null;
    activeDrawing = {
      tool: drawTool,
      points: [point],
      color: drawTool === "pen" ? penColor : highlighterColor,
      strokeWidth: drawTool === "pen" ? penWidth : highlighterWidth,
    };

    window.addEventListener("pointermove", handleDrawingMove);
    window.addEventListener("pointerup", stopDrawing, { once: true });
  }

  function handleDrawingMove(e: PointerEvent): void {
    if (!activeDrawing) return;

    const point = getCanvasPoint(e);
    if (!point) return;

    activeDrawing = {
      ...activeDrawing,
      points: [...activeDrawing.points, point],
    };
  }

  function stopDrawing(): void {
    if (activeDrawing) {
      const layer = createPathLayer(
        activeDrawing.points,
        activeDrawing.color,
        activeDrawing.strokeWidth,
        activeDrawing.tool === "highlighter",
        layers.length,
      );

      if (layer) {
        if (layers.length > 0) saveHistorySnapshot();
        layers = [...layers, layer];
        selectedLayerId = layer.id;
        lastOutputSize = "";
        redoStack = [];
      }
    }

    activeDrawing = null;
    window.removeEventListener("pointermove", handleDrawingMove);
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

  function startLayerDrag(e: PointerEvent, layerId: string, mode: LayerDragMode, resizeHandle?: ResizeHandle): void {
    if (drawTool !== "select") return;

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
      startScaleY: getLayerScaleY(layer),
      startRotation: layer.rotation,
      startDistance: metrics.distance,
      startAngle: metrics.angle,
      resizeHandle,
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
      updateLayerById(layer.id, getLayerResizeUpdates(e, layer, layerDragSnapshot), false);
      return;
    }

    let nextRotation = layerDragSnapshot.startRotation + metrics.angle - layerDragSnapshot.startAngle;
    if (e.shiftKey) nextRotation = Math.round(nextRotation / 15) * 15;

    updateLayerById(layer.id, {
      rotation: normalizeRotation(nextRotation),
    }, false);
  }

  function stopLayerDrag(): void {
    layerDragSnapshot = null;
    window.removeEventListener("pointermove", handleLayerDragMove);
  }

  function setZoom(value: number): void {
    manualZoom = clampNumber(value, 0.05, 8);
  }

  function zoomBy(factor: number): void {
    setZoom((manualZoom ?? autoFitScale) * factor);
  }

  function fitZoom(): void {
    manualZoom = null;
  }

  function startCanvasResize(e: PointerEvent, handle: ResizeHandle): void {
    e.preventDefault();
    e.stopPropagation();
    saveHistorySnapshot();

    if (manualZoom === null) manualZoom = autoFitScale;

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

    if (handle.includes("e")) nextWidth = canvasResizeSnapshot.startCanvasWidth + dx;
    if (handle.includes("s")) nextHeight = canvasResizeSnapshot.startCanvasHeight + dy;
    if (handle.includes("w")) nextWidth = canvasResizeSnapshot.startCanvasWidth - dx;
    if (handle.includes("n")) nextHeight = canvasResizeSnapshot.startCanvasHeight - dy;

    nextWidth = clampInteger(nextWidth, 1, MAX_OUTPUT_SIZE);
    nextHeight = clampInteger(nextHeight, 1, MAX_OUTPUT_SIZE);

    if (lockCanvasAspect) {
      const ratio = getCanvasAspectRatio();
      const changedWidth = nextWidth / canvasResizeSnapshot.startCanvasWidth;
      const changedHeight = nextHeight / canvasResizeSnapshot.startCanvasHeight;
      const useWidth = (handle.includes("e") || handle.includes("w")) && (!handle.includes("n") && !handle.includes("s") || Math.abs(changedWidth - 1) >= Math.abs(changedHeight - 1));

      if (useWidth) {
        nextHeight = clampInteger(nextWidth / ratio, 1, MAX_OUTPUT_SIZE);
        nextWidth = clampInteger(nextHeight * ratio, 1, MAX_OUTPUT_SIZE);
      } else {
        nextWidth = clampInteger(nextHeight * ratio, 1, MAX_OUTPUT_SIZE);
        nextHeight = clampInteger(nextWidth / ratio, 1, MAX_OUTPUT_SIZE);
      }
    }

    const layerOffsetX = handle.includes("w") ? nextWidth - canvasResizeSnapshot.startCanvasWidth : 0;
    const layerOffsetY = handle.includes("n") ? nextHeight - canvasResizeSnapshot.startCanvasHeight : 0;

    canvasWidth = nextWidth;
    canvasHeight = nextHeight;
    if (!lockCanvasAspect) updateCanvasAspectRatio();
    layers = canvasResizeSnapshot.startLayers.map((layer) => ({
      ...layer,
      x: layer.x + layerOffsetX,
      y: layer.y + layerOffsetY,
    }));
    lastOutputSize = "";
  }

  function stopCanvasResize(): void {
    canvasResizeSnapshot = null;
    window.removeEventListener("pointermove", handleCanvasResizeMove);
  }

  async function buildCompositeCanvas(effectPreviewOut?: Record<string, string>): Promise<HTMLCanvasElement> {
    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not create export canvas");

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const backgroundFill = getBackgroundFill();
    if (backgroundFill) {
      ctx.fillStyle = backgroundFill;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    for (const layer of layers) {
      if (!layer.visible || layer.opacity <= 0) continue;

      if (layer.kind === "effect") {
        applyEffectLayer(ctx, canvas, layer, getLayerDisplayWidth(layer), getLayerDisplayHeight(layer));
        if (effectPreviewOut) {
          try {
            effectPreviewOut[layer.id] = canvas.toDataURL("image/png");
          } catch {
            // ignore preview capture failures
          }
        }
        continue;
      }

      const img = await loadImageElement(layer.src);
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      ctx.translate(layer.x, layer.y);
      ctx.rotate((layer.rotation * Math.PI) / 180);
      ctx.scale(layer.scale, getLayerScaleY(layer));
      ctx.drawImage(img, -layer.naturalWidth / 2, -layer.naturalHeight / 2, layer.naturalWidth, layer.naturalHeight);
      ctx.restore();
    }

    return canvas;
  }

  function renderImageCanvas(): Promise<HTMLCanvasElement> {
    return buildCompositeCanvas();
  }

  async function computeEffectPreviews(): Promise<void> {
    const token = ++effectPreviewToken;

    if (!layers.some((layer) => layer.kind === "effect" && layer.visible)) {
      effectPreviews = {};
      return;
    }

    const out: Record<string, string> = {};
    try {
      await buildCompositeCanvas(out);
    } catch {
      return;
    }

    if (token !== effectPreviewToken) return;
    effectPreviews = out;
  }

  function scheduleEffectPreview(): void {
    if (effectPreviewTimer !== null) clearTimeout(effectPreviewTimer);
    effectPreviewTimer = setTimeout(() => {
      effectPreviewTimer = null;
      computeEffectPreviews();
    }, 140);
  }

  function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, exportQuality?: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(new Error("Could not create image output"));
      }, mimeType, exportQuality);
    });
  }

  async function downloadImage(): Promise<void> {
    if (layers.length === 0 || isExporting) return;

    outputAction = "download";
    errorMessage = "";

    try {
      const canvas = await renderImageCanvas();
      const mimeType = `image/${outputFormat}`;
      const exportQuality = outputFormat === "png" ? undefined : quality / 100;
      const blob = await canvasToBlob(canvas, mimeType, exportQuality);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");

      lastOutputSize = formatFileSize(blob.size);
      link.href = objectUrl;
      link.download = `image-composition-${canvasWidth}x${canvasHeight}.${outputFormat}`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    } catch {
      errorMessage = "Could not download this image. Try a smaller canvas or fewer layers.";
    } finally {
      outputAction = null;
    }
  }

  async function copyImageToClipboard(): Promise<void> {
    if (layers.length === 0 || isExporting) return;

    outputAction = "copy";
    errorMessage = "";

    try {
      if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
        throw new Error("Clipboard image copy is not supported in this browser");
      }

      const canvas = await renderImageCanvas();
      const blob = await canvasToBlob(canvas, "image/png");
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      lastOutputSize = formatFileSize(blob.size);
    } catch {
      errorMessage = "Could not copy this image to the clipboard. Try downloading it instead.";
    } finally {
      outputAction = null;
    }
  }

  function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tagName = target.tagName.toLowerCase();
    return target.isContentEditable || tagName === "input" || tagName === "textarea" || tagName === "select";
  }

  function deselectLayer(): void {
    selectedLayerId = null;
  }

  function handleKeyDown(e: KeyboardEvent): void {
    if (isEditableTarget(e.target)) return;

    const modifier = e.metaKey || e.ctrlKey;
    if (modifier && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (modifier && (e.key === "y" || e.key === "Y")) {
      e.preventDefault();
      redo();
      return;
    }

    if (e.key === "Escape") {
      if (isDrawingMode) drawTool = "select";
      deselectLayer();
      return;
    }

    if (!selectedLayer) return;

    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      removeLayer(selectedLayer.id);
      return;
    }

    if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
      updateLayerById(selectedLayer.id, { x: selectedLayer.x + dx, y: selectedLayer.y + dy }, true, "nudge");
    }
  }

  $effect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  $effect(() => {
    const signature = layers
      .map((layer) =>
        [
          layer.id,
          layer.kind,
          Math.round(layer.x),
          Math.round(layer.y),
          layer.scale.toFixed(3),
          (layer.scaleY ?? layer.scale).toFixed(3),
          Math.round(layer.rotation),
          layer.visible ? 1 : 0,
          layer.opacity.toFixed(2),
          layer.effectStrength ?? 0,
          layer.effectBlur ?? 0,
          layer.effectColorful ? 1 : 0,
          layer.effectBorder ?? 1,
          layer.src.length,
        ].join(":"),
      )
      .join("|") + `#${canvasWidth}x${canvasHeight}#${backgroundMode}#${backgroundColor}`;

    if (signature === lastPreviewSignature) return;
    lastPreviewSignature = signature;
    scheduleEffectPreview();
  });

  function clearAll(): void {
    layers = [];
    selectedLayerId = null;
    lastOutputSize = "";
    errorMessage = "";
    undoStack = [];
    redoStack = [];
    canvasWidth = 800;
    canvasHeight = 600;
    canvasAspectRatio = 800 / 600;
    drawTool = "select";
    activeDrawing = null;
    effectPreviews = {};
    lastPreviewSignature = "";
    manualZoom = null;
    window.removeEventListener("pointermove", handleDrawingMove);
  }
</script>

<div class="h-full min-h-0 flex flex-col gap-4">
  <header>
    <p class="text-sm text-(--color-text-muted)">
      Add images as layers, annotate with text or pen/highlighter strokes, mask private areas with blur or crystal glass patches, then download or copy.
    </p>
    <p class="mt-1 text-xs text-(--color-text-muted)">
      Shortcuts: drag to move, corner/edge handles to resize (hold Shift to keep ratio), arrow keys to nudge, Esc to deselect, Delete to remove, Ctrl/Cmd+Z to undo.
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
        <button onclick={downloadImage} disabled={!hasLayers || isExporting} class="px-3 py-2 border border-(--color-border) text-(--color-text) text-sm font-medium hover:bg-(--color-bg) disabled:opacity-40 transition-colors">
          {outputAction === "download" ? "Downloading..." : `Download${lastOutputSize ? ` (${lastOutputSize})` : ""}`}
        </button>
        <button onclick={copyImageToClipboard} disabled={!hasLayers || isExporting} class="px-3 py-2 border border-(--color-border) text-(--color-text) text-sm font-medium hover:bg-(--color-bg) disabled:opacity-40 transition-colors">
          {outputAction === "copy" ? "Copying..." : "Copy Clipboard"}
        </button>
      </div>

      <div class="h-9 w-px bg-(--color-border) hidden lg:block"></div>

      <div class="flex flex-wrap items-end gap-2">
        <div>
          <label class="text-[11px] uppercase tracking-wider text-(--color-text-muted) block mb-1">Markup</label>
          <div class="flex flex-wrap gap-1">
            <button onclick={() => setDrawTool("select")} class={`px-2 py-1.5 text-xs border transition-colors ${drawTool === "select" ? "border-(--color-accent) bg-(--color-accent) text-(--color-btn-text)" : "border-(--color-border) text-(--color-text) hover:bg-(--color-bg)"}`}>
              Select
            </button>
            <button onclick={() => setDrawTool("pen")} class={`px-2 py-1.5 text-xs border transition-colors ${drawTool === "pen" ? "border-(--color-accent) bg-(--color-accent) text-(--color-btn-text)" : "border-(--color-border) text-(--color-text) hover:bg-(--color-bg)"}`}>
              Pen
            </button>
            <button onclick={() => setDrawTool("highlighter")} class={`px-2 py-1.5 text-xs border transition-colors ${drawTool === "highlighter" ? "border-(--color-accent) bg-(--color-accent) text-(--color-btn-text)" : "border-(--color-border) text-(--color-text) hover:bg-(--color-bg)"}`}>
              Highlighter
            </button>
            <button onclick={addTextAnnotation} class="px-2 py-1.5 text-xs border border-(--color-border) text-(--color-text) hover:bg-(--color-bg) transition-colors">
              Text
            </button>
            <button onclick={() => addEffectPatch("blur")} class="px-2 py-1.5 text-xs border border-(--color-border) text-(--color-text) hover:bg-(--color-bg) transition-colors">
              Blur Box
            </button>
            <button onclick={() => addEffectPatch("crystal")} class="px-2 py-1.5 text-xs border border-(--color-border) text-(--color-text) hover:bg-(--color-bg) transition-colors">
              Crystal Glass
            </button>
          </div>
        </div>

        {#if isDrawingMode}
          <div class="flex items-end gap-2 pl-1">
            <input type="color" value={drawTool === "pen" ? penColor : highlighterColor} oninput={(e) => updateDrawColor((e.target as HTMLInputElement).value)} class="h-9 w-11 border border-(--color-border) bg-(--color-bg) cursor-pointer" />
            <div>
              <label class="text-[11px] uppercase tracking-wider text-(--color-text-muted) block mb-1">Size</label>
              <input type="range" min="2" max="64" value={drawTool === "pen" ? penWidth : highlighterWidth} oninput={(e) => updateDrawWidth(parseFloat((e.target as HTMLInputElement).value) || 2)} class="w-20 accent-(--color-accent)" />
            </div>
          </div>
        {/if}
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
              onpointerdown={startDrawing}
              class={`absolute left-0 top-0 shrink-0 border-2 border-transparent shadow-xl origin-top-left overflow-visible ${getBackgroundFill() ? "" : "checkerboard"} ${isDrawingMode ? "cursor-crosshair" : ""}`}
              style={getFrameStyle()}
              onclick={() => {
                if (!isDrawingMode) selectedLayerId = null;
              }}
            >

            {#each layers as layer (layer.id)}
              {#if layer.visible}
                <div
                  role="presentation"
                  onpointerdown={(e) => startLayerDrag(e, layer.id, "move")}
                  onclick={(e) => e.stopPropagation()}
                  class={`absolute select-none touch-none ${selectedLayerId === layer.id ? "z-20" : "z-10"} ${isDrawingMode ? "pointer-events-none" : ""}`}
                  style={getLayerStyle(layer)}
                  title={layer.name}
                >
                  {#if layer.kind === "effect"}
                    {#if effectPreviews[layer.id]}
                      <div class="h-full w-full overflow-hidden pointer-events-none" style={getEffectPreviewStyle(layer)}></div>
                    {:else}
                      <div class="flex h-full w-full items-center justify-center overflow-hidden text-[11px] font-mono uppercase tracking-wider text-white/90 shadow-inner pointer-events-none" style={getEffectLayerStyle(layer)}>
                        {layer.effectKind === "crystal" ? "Crystal Glass" : "Blur"}
                      </div>
                    {/if}
                  {:else}
                    <img
                      src={layer.src}
                      alt={layer.name}
                      draggable="false"
                      class="block w-full h-full pointer-events-none"
                    />
                  {/if}

                  {#if selectedLayerId === layer.id}
                    <div class="absolute inset-0 border-2 border-(--color-accent) pointer-events-none"></div>
                    <span class="absolute left-1 top-1 px-1.5 py-0.5 bg-black/75 text-white text-[11px] font-mono pointer-events-none">
                      {getLayerDisplayWidth(layer)} x {getLayerDisplayHeight(layer)}px
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
                        onpointerdown={(e) => startLayerDrag(e, layer.id, "scale", handle)}
                        class={`absolute w-4 h-4 bg-(--color-accent) border-2 border-(--color-bg) ${LAYER_HANDLE_CLASSES[handle]}`}
                        title="Resize layer. Hold Shift to keep proportions."
                      ></span>
                    {/each}
                  {/if}
                </div>
              {/if}
            {/each}

              {#if activeDrawing}
                <svg class="absolute inset-0 z-30 pointer-events-none overflow-visible" viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}>
                  <path
                    d={getDrawingPath(activeDrawing.points)}
                    fill="none"
                    stroke={activeDrawing.color}
                    stroke-width={activeDrawing.strokeWidth}
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    opacity={activeDrawing.tool === "highlighter" ? 0.58 : 1}
                  />
                </svg>
              {/if}

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

      <div class="mt-2 flex flex-wrap items-center justify-center gap-3 text-xs text-(--color-text-muted)">
        <span>Canvas: {canvasWidth} x {canvasHeight}px, layers: {layers.length}{lastOutputSize ? `, last output: ${lastOutputSize}` : ""}</span>
        <span class="flex items-center gap-1">
          <button onclick={() => zoomBy(0.8)} class="px-2 py-0.5 border border-(--color-border) text-(--color-text) hover:bg-(--color-bg) transition-colors" title="Zoom out">−</button>
          <span class="w-12 text-center font-mono">{Math.round(previewScale * 100)}%</span>
          <button onclick={() => zoomBy(1.25)} class="px-2 py-0.5 border border-(--color-border) text-(--color-text) hover:bg-(--color-bg) transition-colors" title="Zoom in">+</button>
          <button onclick={fitZoom} class={`px-2 py-0.5 border transition-colors ${manualZoom === null ? "border-(--color-accent) bg-(--color-accent) text-(--color-btn-text)" : "border-(--color-border) text-(--color-text) hover:bg-(--color-bg)"}`} title="Fit to screen">Fit</button>
        </span>
      </div>
    </div>

    <aside class="xl:w-[360px] min-h-0 flex flex-col gap-4 overflow-auto pr-1">
      <div class="p-4 border border-(--color-border) bg-(--color-bg-alt)">
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">
            Layers
          </span>
          <div class="flex items-center gap-3">
            {#if selectedLayerId}
              <button onclick={deselectLayer} class="text-xs text-(--color-text-muted) hover:text-(--color-text)">Deselect</button>
            {/if}
            <button onclick={() => fileInput?.click()} class="text-xs text-(--color-accent) hover:text-(--color-accent-hover)">Add</button>
          </div>
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
                  draggable="true"
                  onclick={() => selectedLayerId = layer.id}
                  ondragstart={(e) => startLayerListDrag(e, layer.id)}
                  ondragover={(e) => handleLayerListDragOver(e, layer.id)}
                  ondrop={(e) => handleLayerListDrop(e, layer.id)}
                  ondragend={clearLayerListDrag}
                  class={`relative flex items-center gap-2 p-2 border text-left transition-colors ${selectedLayerId === layer.id ? "border-(--color-accent) bg-(--color-bg)" : "border-(--color-border) hover:bg-(--color-bg)"} ${layerListDragId === layer.id ? "opacity-50" : ""}`}
                >
                {#if layerListDropId === layer.id && layerListDragId !== layer.id}
                  <span class={`absolute left-0 right-0 h-0.5 bg-(--color-accent) ${layerListDropPosition === "before" ? "-top-1" : "-bottom-1"}`}></span>
                {/if}
                <span class="text-[10px] leading-none text-(--color-text-muted) cursor-grab" title="Drag to reorder">
                  ::::
                </span>
                {#if layer.kind === "effect"}
                  <span class="flex w-9 h-9 items-center justify-center border border-(--color-border) bg-blue-500/20 text-[9px] text-(--color-text-muted)">
                    FX
                  </span>
                {:else}
                  <img src={layer.src} alt="" draggable="false" class="w-9 h-9 object-cover border border-(--color-border)" />
                {/if}
                <span class="min-w-0 flex-1">
                  <span class="block text-xs text-(--color-text) truncate">{layer.name}</span>
                  <span class="block text-[11px] text-(--color-text-muted)">{getLayerTypeLabel(layer)} · {getLayerMeta(layer)}</span>
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
            {#if selectedLayer.kind === "effect"}
              <span class="flex w-12 h-12 items-center justify-center border border-(--color-border) bg-blue-500/20 text-[10px] text-(--color-text-muted)">
                FX
              </span>
            {:else}
              <img src={selectedLayer.src} alt="" class="w-12 h-12 object-cover border border-(--color-border)" />
            {/if}
            <div class="min-w-0">
              <span class="block text-sm text-(--color-text) truncate">{selectedLayer.name}</span>
              <span class="block text-xs text-(--color-text-muted)">{getLayerTypeLabel(selectedLayer)} · {getLayerMeta(selectedLayer)}</span>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label class="text-xs text-(--color-text-muted) mb-1 block">X</label>
              <input type="number" value={Math.round(selectedLayer.x)} oninput={(e) => updateSelectedLayer({ x: parseFloat((e.target as HTMLInputElement).value) || 0 }, true, "layer-x")} class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)" />
            </div>
            <div>
              <label class="text-xs text-(--color-text-muted) mb-1 block">Y</label>
              <input type="number" value={Math.round(selectedLayer.y)} oninput={(e) => updateSelectedLayer({ y: parseFloat((e.target as HTMLInputElement).value) || 0 }, true, "layer-y")} class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)" />
            </div>
          </div>

          <div class="mb-3">
            <div class="flex items-center justify-between gap-3 mb-1">
              <label class="text-xs text-(--color-text-muted) block">Uniform Scale: {Math.round(selectedLayer.scale * 100)}%</label>
              <input type="number" min="2" max="2000" value={Math.round(selectedLayer.scale * 100)} oninput={(e) => {
                const nextScale = clampNumber((parseFloat((e.target as HTMLInputElement).value) || 2) / 100, MIN_LAYER_SCALE, MAX_LAYER_SCALE);
                updateSelectedLayer({ scale: nextScale, scaleY: nextScale }, true, "scale");
              }} class="w-20 px-2 py-1 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-xs font-mono focus:outline-none focus:border-(--color-accent)" />
            </div>
            <input type="range" min="2" max="400" step="1" value={selectedLayer.scale * 100} oninput={(e) => {
              const nextScale = clampNumber((parseFloat((e.target as HTMLInputElement).value) || 2) / 100, MIN_LAYER_SCALE, MAX_LAYER_SCALE);
              updateSelectedLayer({ scale: nextScale, scaleY: nextScale }, true, "scale");
            }} class="w-full accent-(--color-accent)" />
          </div>

          <div class="mb-3">
            <div class="flex items-center justify-between gap-3 mb-1">
              <label class="text-xs text-(--color-text-muted) block">Rotation</label>
              <div class="flex items-center gap-1">
                <input type="number" min="0" max="360" value={Math.round(selectedLayer.rotation)} oninput={(e) => updateSelectedLayer({ rotation: normalizeRotation(parseFloat((e.target as HTMLInputElement).value) || 0) }, true, "rotation")} class="w-20 px-2 py-1 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-xs font-mono focus:outline-none focus:border-(--color-accent)" />
                <span class="text-xs text-(--color-text-muted)">deg</span>
              </div>
            </div>
            <input type="range" min="0" max="360" step="1" value={selectedLayer.rotation} oninput={(e) => updateSelectedLayer({ rotation: normalizeRotation(parseFloat((e.target as HTMLInputElement).value) || 0) }, true, "rotation")} class="w-full accent-(--color-accent)" />
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
            <input type="range" min="0" max="100" value={selectedLayer.opacity * 100} oninput={(e) => updateSelectedLayer({ opacity: clampNumber((parseFloat((e.target as HTMLInputElement).value) || 0) / 100, 0, 1) }, true, "opacity")} class="w-full accent-(--color-accent)" />
          </div>

          {#if selectedLayer.kind === "text"}
            <div class="mb-3 p-3 border border-(--color-border) bg-(--color-bg)">
              <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2 block">
                Annotation
              </span>
              <label class="text-xs text-(--color-text-muted) mb-1 block">Text</label>
              <textarea value={selectedLayer.text || ""} oninput={(e) => updateSelectedGeneratedLayer({ text: (e.target as HTMLTextAreaElement).value }, "text")} class="w-full min-h-20 px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm resize-y focus:outline-none focus:border-(--color-accent)"></textarea>

              <div class="mt-3">
                <label class="text-xs text-(--color-text-muted) mb-1 block">Font Size: {selectedLayer.fontSize ?? 24}px</label>
                <input type="range" min="10" max="120" value={selectedLayer.fontSize ?? 24} oninput={(e) => updateSelectedGeneratedLayer({ fontSize: clampInteger(parseFloat((e.target as HTMLInputElement).value) || 10, 10, 120) }, "font-size")} class="w-full accent-(--color-accent)" />
              </div>

              <div class="grid grid-cols-3 gap-2 mt-3">
                <label class="text-xs text-(--color-text-muted)">
                  Text
                  <input type="color" value={selectedLayer.color || "#ffffff"} oninput={(e) => updateSelectedGeneratedLayer({ color: (e.target as HTMLInputElement).value }, "text-color")} class="mt-1 h-9 w-full border border-(--color-border) bg-(--color-bg) cursor-pointer" />
                </label>
                <label class="text-xs text-(--color-text-muted)">
                  Stroke
                  <input type="color" value={selectedLayer.strokeColor || "#111827"} oninput={(e) => updateSelectedGeneratedLayer({ strokeColor: (e.target as HTMLInputElement).value }, "text-stroke")} class="mt-1 h-9 w-full border border-(--color-border) bg-(--color-bg) cursor-pointer" />
                </label>
              </div>
            </div>
          {/if}

          {#if selectedLayer.kind === "effect"}
            <div class="mb-3 p-3 border border-(--color-border) bg-(--color-bg)">
              <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2 block">
                {selectedLayer.effectKind === "crystal" ? (selectedLayer.effectColorful ? "Stained Glass Patch" : "Crystal Glass Patch") : "Blur Patch"}
              </span>
              <label class="text-xs text-(--color-text-muted) mb-1 block">
                {selectedLayer.effectKind === "crystal" ? "Facet Size" : "Blur Radius"}: {selectedLayer.effectStrength ?? 12}px
              </label>
              <input type="range" min="2" max="80" value={selectedLayer.effectStrength ?? 12} oninput={(e) => updateSelectedLayer({ effectStrength: clampInteger(parseFloat((e.target as HTMLInputElement).value) || 2, 2, 80) }, true, "effect-strength")} class="w-full accent-(--color-accent)" />
              {#if selectedLayer.effectKind === "crystal"}
                <label class="text-xs text-(--color-text-muted) mt-3 mb-1 block">
                  Glass Blur: {selectedLayer.effectBlur ?? 2}px
                </label>
                <input type="range" min="0" max="16" step="0.5" value={selectedLayer.effectBlur ?? 2} oninput={(e) => updateSelectedLayer({ effectBlur: clampNumber(parseFloat((e.target as HTMLInputElement).value) || 0, 0, 16) }, true, "effect-blur")} class="w-full accent-(--color-accent)" />
                <label class="text-xs text-(--color-text-muted) mt-3 mb-1 block">
                  {selectedLayer.effectColorful ? "Lead (border)" : "Border"}: {(selectedLayer.effectBorder ?? 1) === 0 ? "none" : `${selectedLayer.effectBorder ?? 1}px`}
                </label>
                <input type="range" min="0" max="6" step="1" value={selectedLayer.effectBorder ?? 1} oninput={(e) => updateSelectedLayer({ effectBorder: clampInteger(parseFloat((e.target as HTMLInputElement).value) || 0, 0, 6) }, true, "effect-border")} class="w-full accent-(--color-accent)" />
                <label class="mt-3 flex items-center gap-2 text-xs text-(--color-text)">
                  <input type="checkbox" checked={selectedLayer.effectColorful ?? false} onchange={(e) => updateSelectedLayer({ effectColorful: (e.target as HTMLInputElement).checked })} class="accent-(--color-accent)" />
                  Stained glass (colorful vitray)
                </label>
              {/if}
              <p class="mt-2 text-xs text-(--color-text-muted)">
                This patch masks everything below it during export, so it can hide faces, keys, emails, or UI secrets without changing the source image layer.
              </p>
            </div>
          {/if}

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
