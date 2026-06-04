export type OutputFormat = "png" | "jpeg" | "webp";
export type BackgroundMode = "transparent" | "white" | "custom";
export type ResizeHandle = "n" | "e" | "s" | "w" | "nw" | "ne" | "sw" | "se";
export type LayerDragMode = "move" | "scale" | "rotate";

export interface ImageLayer {
  id: string;
  name: string;
  src: string;
  fileSize: number;
  naturalWidth: number;
  naturalHeight: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  visible: boolean;
}

export interface LoadedImageFile {
  file: File;
  src: string;
  width: number;
  height: number;
}

export interface EditorSnapshot {
  layers: ImageLayer[];
  selectedLayerId: string | null;
  canvasWidth: number;
  canvasHeight: number;
  lockCanvasAspect: boolean;
  outputFormat: OutputFormat;
  quality: number;
  backgroundMode: BackgroundMode;
  backgroundColor: string;
}

export interface LayerDragSnapshot {
  mode: LayerDragMode;
  layerId: string;
  startClientX: number;
  startClientY: number;
  frameScale: number;
  startX: number;
  startY: number;
  startScale: number;
  startRotation: number;
  startDistance: number;
  startAngle: number;
}

export interface CanvasResizeSnapshot {
  handle: ResizeHandle;
  startClientX: number;
  startClientY: number;
  frameScale: number;
  startCanvasWidth: number;
  startCanvasHeight: number;
  startLayers: ImageLayer[];
}
