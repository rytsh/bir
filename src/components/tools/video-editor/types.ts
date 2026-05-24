export type ExportFormat = "mp4" | "webm" | "gif" | "png" | "webp" | "jpg";
export type OverlayKind = "text" | "svg" | "image";
export type BackgroundMode = "solid" | "gradient" | "image";
export type MockupPreset = "none" | "chrome" | "safari" | "macos" | "iphone";
export type ZoomEasing = "linear" | "smooth" | "ease-in" | "ease-out";
export type DragMode = "timeline" | "move-clip" | "trim-start" | "trim-end" | "move-audio" | "audio-trim-start" | "audio-trim-end" | "move-overlay" | "overlay-trim-start" | "overlay-trim-end" | "move-zoom" | "zoom-trim-start" | "zoom-trim-end" | null;

export interface VideoAsset {
  id: string;
  file: File;
  url: string;
  name: string;
  duration: number;
  width: number;
  height: number;
}

export interface Clip {
  id: string;
  assetId: string;
  label: string;
  start: number;
  sourceStart: number;
  sourceEnd: number;
  volume: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  opacity?: number;
  cropLeft?: number;
  cropRight?: number;
  cropTop?: number;
  cropBottom?: number;
  keyframes?: ClipKeyframe[];
  effectBrightness: number;
  effectContrast: number;
  effectSaturation: number;
  effectBlur: number;
  effectGrayscale: boolean;
}

export interface ClipKeyframe {
  id: string;
  time: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
}

export interface ClipView extends Clip {
  index: number;
  duration: number;
  sequenceStart: number;
  sequenceEnd: number;
}

export interface OverlayItem {
  id: string;
  kind: OverlayKind;
  label: string;
  text: string;
  svg: string;
  imageSrc: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  start: number;
  end: number;
  color: string;
  background: string;
  backgroundOpacity: number;
  backgroundTransparent: boolean;
  fontSize: number;
  fontWeight: "400" | "600" | "800";
  opacity: number;
  keyframes: OverlayKeyframe[];
  motionEnabled: boolean;
  motionStartX: number;
  motionStartY: number;
  motionEndX: number;
  motionEndY: number;
}

export interface OverlayKeyframe {
  id: string;
  time: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
}

export interface ZoomFragment {
  id: string;
  label: string;
  start: number;
  end: number;
  scale: number;
  x: number;
  y: number;
  easing: ZoomEasing;
}

export interface AudioAsset {
  id: string;
  file: File;
  url: string;
  name: string;
  duration: number;
  waveform: number[];
  source: "imported" | "detached";
}

export interface AudioClip {
  id: string;
  assetId: string;
  label: string;
  start: number;
  sourceStart: number;
  sourceEnd: number;
  volume: number;
}

export interface AudioClipView extends AudioClip {
  duration: number;
  sequenceStart: number;
  sequenceEnd: number;
}

export interface OverlayRenderSegment {
  overlay: OverlayItem;
  start: number;
  end: number;
  time: number;
}

export interface DragClipSnapshot {
  clip: Clip;
  sequenceStart: number;
  sequenceEnd: number;
  timelineDuration: number;
  pointerClientX: number;
  pointerOffset: number;
}

export interface AudioDragSnapshot {
  clip: AudioClip;
  sequenceStart: number;
  sequenceEnd: number;
  timelineDuration: number;
  pointerClientX: number;
  pointerOffset: number;
}

export interface OverlayDragSnapshot {
  overlay: OverlayItem;
  sequenceStart: number;
  sequenceEnd: number;
  timelineDuration: number;
  pointerClientX: number;
  pointerOffset: number;
}

export interface ZoomDragSnapshot {
  zoom: ZoomFragment;
  sequenceStart: number;
  sequenceEnd: number;
  timelineDuration: number;
  pointerClientX: number;
  pointerOffset: number;
}
