import type { ImageLayer, LoadedImageFile } from "./types.ts";

export const MAX_OUTPUT_SIZE: number = 10000;
export const MIN_LAYER_SCALE: number = 0.02;
export const MAX_LAYER_SCALE: number = 20;
export const MAX_HISTORY_LENGTH: number = 50;

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

export function getDataUrlSize(dataUrl: string): number {
  const base64Length = dataUrl.split(",")[1]?.length || 0;
  return Math.ceil((base64Length * 3) / 4);
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
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${layerIndex}`,
    name: loaded.file.name || `Image ${layerIndex + 1}`,
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

export function cloneLayers(layers: ImageLayer[]): ImageLayer[] {
  return layers.map((layer) => ({ ...layer }));
}
