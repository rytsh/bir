import type { DrawingPoint, EffectKind, ImageLayer, LoadedImageFile } from "./types.ts";

export const MAX_OUTPUT_SIZE: number = 10000;
export const MIN_LAYER_SCALE: number = 0.02;
export const MAX_LAYER_SCALE: number = 20;
export const MAX_HISTORY_LENGTH: number = 200;

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

export function clampInteger(value: number, min: number, max: number): number {
  return Math.round(clampNumber(value, min, max));
}

export function normalizeRotation(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return ((value % 360) + 360) % 360;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function createLayerId(prefix: string, layerIndex: number): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${prefix}-${Date.now()}-${layerIndex}`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function getTextSize(text: string): number {
  return typeof TextEncoder !== "undefined" ? new TextEncoder().encode(text).length : text.length;
}

function wrapText(text: string, maxCharacters: number): string[] {
  const normalized = text.trim() || "Text";
  const lines: string[] = [];

  for (const paragraph of normalized.split(/\n+/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = "";

    for (const word of words) {
      const nextLine = line ? `${line} ${word}` : word;
      if (nextLine.length > maxCharacters && line) {
        lines.push(line);
        line = word;
      } else {
        line = nextLine;
      }
    }

    if (line) lines.push(line);
  }

  return lines.slice(0, 8);
}

function createTextSvg(layer: ImageLayer): { src: string; width: number; height: number; fileSize: number } {
  const text = layer.text || "Add text";
  const fontSize = clampInteger(layer.fontSize ?? 48, 10, 180);
  const lines = wrapText(text, Math.max(8, Math.floor(520 / (fontSize * 0.56))));
  const lineHeight = fontSize * 1.18;
  const longestLine = Math.max(...lines.map((line) => line.length), 4);
  const width = clampInteger(longestLine * fontSize * 0.62 + 40, 120, 900);
  const height = clampInteger(lines.length * lineHeight + 32, 52, 900);
  const color = layer.color || "#ffffff";
  const strokeColor = layer.strokeColor || "#111827";
  const strokeWidth = clampNumber(layer.strokeWidth ?? 3, 0, 14);
  const textElements = lines.map((line, index) => (
    `<text x="20" y="${24 + fontSize + index * lineHeight}" font-family="Inter, Arial, sans-serif" font-size="${fontSize}" font-weight="800" fill="${escapeXml(color)}" stroke="${escapeXml(strokeColor)}" stroke-width="${strokeWidth}" paint-order="stroke fill" stroke-linejoin="round">${escapeXml(line)}</text>`
  )).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${textElements}</svg>`;

  return { src: svgToDataUrl(svg), width, height, fileSize: getTextSize(svg) };
}

function pointsToPath(points: DrawingPoint[], minX: number, minY: number, padding: number): string {
  if (points.length === 0) return "";
  const [firstPoint, ...restPoints] = points;
  const start = `M ${firstPoint.x - minX + padding} ${firstPoint.y - minY + padding}`;
  return [start, ...restPoints.map((point) => `L ${point.x - minX + padding} ${point.y - minY + padding}`)].join(" ");
}

export function getDrawingPath(points: DrawingPoint[]): string {
  if (points.length === 0) return "";
  const [firstPoint, ...restPoints] = points;
  const start = `M ${firstPoint.x} ${firstPoint.y}`;
  return [start, ...restPoints.map((point) => `L ${point.x} ${point.y}`)].join(" ");
}

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}

export function readImageFile(file: File): Promise<LoadedImageFile> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Please choose image files only"));
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event: ProgressEvent<FileReader>) => {
      try {
        const src = event.target?.result as string;
        const img = await loadImageElement(src);
        resolve({ file, src, width: img.width, height: img.height });
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error("Could not read this file"));
    reader.readAsDataURL(file);
  });
}

export function createImageLayer(
  loaded: LoadedImageFile,
  canvasWidth: number,
  canvasHeight: number,
  layerIndex: number,
): ImageLayer {
  const fitScale = Math.min(1, (canvasWidth * 0.82) / loaded.width, (canvasHeight * 0.82) / loaded.height);

  return {
    id: createLayerId("image", layerIndex),
    name: loaded.file.name || `Image ${layerIndex + 1}`,
    kind: "image",
    src: loaded.src,
    fileSize: loaded.file.size,
    naturalWidth: loaded.width,
    naturalHeight: loaded.height,
    x: canvasWidth / 2,
    y: canvasHeight / 2,
    scale: fitScale,
    rotation: 0,
    opacity: 1,
    visible: true,
  };
}

export function refreshGeneratedLayerAsset(layer: ImageLayer): ImageLayer {
  let asset: { src: string; width: number; height: number; fileSize: number } | null = null;

  if (layer.kind === "text") asset = createTextSvg(layer);

  if (!asset) return layer;

  return {
    ...layer,
    src: asset.src,
    fileSize: asset.fileSize,
    naturalWidth: asset.width,
    naturalHeight: asset.height,
  };
}

export function createTextLayer(canvasWidth: number, canvasHeight: number, layerIndex: number): ImageLayer {
  return refreshGeneratedLayerAsset({
    id: createLayerId("text", layerIndex),
    name: `Text ${layerIndex + 1}`,
    kind: "text",
    src: "",
    fileSize: 0,
    naturalWidth: 240,
    naturalHeight: 96,
    x: canvasWidth / 2,
    y: canvasHeight / 2,
    scale: 1,
    rotation: 0,
    opacity: 1,
    visible: true,
    text: "Add text",
    color: "#ffffff",
    strokeColor: "#111827",
    fontSize: 48,
    strokeWidth: 3,
  });
}

export function createPathLayer(points: DrawingPoint[], color: string, strokeWidth: number, isHighlighter: boolean, layerIndex: number): ImageLayer | null {
  if (points.length < 2) return null;

  const padding = Math.max(16, strokeWidth * 1.2);
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  const width = clampInteger(maxX - minX + padding * 2, 8, MAX_OUTPUT_SIZE);
  const height = clampInteger(maxY - minY + padding * 2, 8, MAX_OUTPUT_SIZE);
  const path = pointsToPath(points, minX, minY, padding);
  const opacity = isHighlighter ? 0.58 : 1;
  const name = isHighlighter ? `Highlighter stroke ${layerIndex + 1}` : `Pen stroke ${layerIndex + 1}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><path d="${path}" fill="none" stroke="${escapeXml(color)}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"/></svg>`;

  return {
    id: createLayerId("path", layerIndex),
    name,
    kind: "path",
    src: svgToDataUrl(svg),
    fileSize: getTextSize(svg),
    naturalWidth: width,
    naturalHeight: height,
    x: minX + (maxX - minX) / 2,
    y: minY + (maxY - minY) / 2,
    scale: 1,
    rotation: 0,
    opacity: 1,
    visible: true,
    color,
    strokeWidth,
  };
}

export function createEffectLayer(effectKind: EffectKind, canvasWidth: number, canvasHeight: number, layerIndex: number): ImageLayer {
  const width = clampInteger(Math.min(360, canvasWidth * 0.44), 120, MAX_OUTPUT_SIZE);
  const height = clampInteger(Math.min(180, canvasHeight * 0.28), 80, MAX_OUTPUT_SIZE);

  return {
    id: createLayerId(effectKind, layerIndex),
    name: effectKind === "blur" ? `Blur patch ${layerIndex + 1}` : `Crystal glass patch ${layerIndex + 1}`,
    kind: "effect",
    src: "",
    fileSize: 0,
    naturalWidth: width,
    naturalHeight: height,
    x: canvasWidth / 2,
    y: canvasHeight / 2,
    scale: 1,
    rotation: 0,
    opacity: 1,
    visible: true,
    effectKind,
    effectStrength: effectKind === "blur" ? 14 : 28,
    effectBlur: effectKind === "crystal" ? 4 : 0,
    effectColorful: false,
    effectBorder: 1,
  };
}

export function cloneLayers(layers: ImageLayer[]): ImageLayer[] {
  return layers.map((layer) => ({ ...layer }));
}
