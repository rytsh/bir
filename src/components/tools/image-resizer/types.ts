export type OutputFormat = "png" | "jpeg" | "webp";
export type BackgroundMode = "transparent" | "white" | "custom";
export type ResizeHandle = "n" | "e" | "s" | "w" | "nw" | "ne" | "sw" | "se";
export type LayerDragMode = "move" | "scale" | "rotate";
export type LayerKind = "image" | "text" | "path" | "effect";
export type DrawTool = "select" | "pen" | "highlighter";
export type EffectKind = "blur" | "crystal";

export interface DrawingPoint {
  x: number;
  y: number;
}

export interface ImageLayer {
  id: string;
  name: string;
  kind: LayerKind;
  src: string;
  fileSize: number;
  naturalWidth: number;
  naturalHeight: number;
  x: number;
  y: number;
  scale: number;
  scaleY?: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  text?: string;
  color?: string;
  strokeColor?: string;
  fontSize?: number;
  strokeWidth?: number;
  effectKind?: EffectKind;
  effectStrength?: number;
  effectBlur?: number;
  effectColorful?: boolean;
  effectBorder?: number;
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
  canvasAspectRatio: number;
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
  startScaleY: number;
  startRotation: number;
  startDistance: number;
  startAngle: number;
  resizeHandle?: ResizeHandle;
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

export interface DrawingSnapshot {
  tool: DrawTool;
  points: DrawingPoint[];
  color: string;
  strokeWidth: number;
}
