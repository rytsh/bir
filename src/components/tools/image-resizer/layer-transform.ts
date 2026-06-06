import type { ImageLayer, LayerDragSnapshot, ResizeHandle } from "./types.ts";
import { MAX_LAYER_SCALE, MIN_LAYER_SCALE, clampNumber } from "./utils.ts";

function getHandleSigns(handle: ResizeHandle): { x: number; y: number } {
  return {
    x: handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0,
    y: handle.includes("s") ? 1 : handle.includes("n") ? -1 : 0,
  };
}

function getLayerLocalDragDelta(e: PointerEvent, snapshot: LayerDragSnapshot): { x: number; y: number } {
  const dx = (e.clientX - snapshot.startClientX) / snapshot.frameScale;
  const dy = (e.clientY - snapshot.startClientY) / snapshot.frameScale;
  const rotation = (snapshot.startRotation * Math.PI) / 180;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  return {
    x: dx * cos + dy * sin,
    y: -dx * sin + dy * cos,
  };
}

function getCanvasOffsetFromLayerLocal(offsetX: number, offsetY: number, rotationDegrees: number): { x: number; y: number } {
  const rotation = (rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  return {
    x: offsetX * cos - offsetY * sin,
    y: offsetX * sin + offsetY * cos,
  };
}

export function getLayerResizeUpdates(e: PointerEvent, layer: ImageLayer, snapshot: LayerDragSnapshot): Partial<ImageLayer> {
  const handle = snapshot.resizeHandle;
  if (!handle) return {};

  const signs = getHandleSigns(handle);
  const localDelta = getLayerLocalDragDelta(e, snapshot);
  const startWidth = layer.naturalWidth * snapshot.startScale;
  const startHeight = layer.naturalHeight * snapshot.startScaleY;
  const minWidth = layer.naturalWidth * MIN_LAYER_SCALE;
  const maxWidth = layer.naturalWidth * MAX_LAYER_SCALE;
  const minHeight = layer.naturalHeight * MIN_LAYER_SCALE;
  const maxHeight = layer.naturalHeight * MAX_LAYER_SCALE;
  let nextWidth = signs.x === 0 ? startWidth : clampNumber(startWidth + signs.x * localDelta.x, minWidth, maxWidth);
  let nextHeight = signs.y === 0 ? startHeight : clampNumber(startHeight + signs.y * localDelta.y, minHeight, maxHeight);

  if (e.shiftKey) {
    const widthFactor = nextWidth / startWidth;
    const heightFactor = nextHeight / startHeight;
    const factorSource = signs.x !== 0 && signs.y !== 0
      ? Math.abs(widthFactor - 1) > Math.abs(heightFactor - 1) ? widthFactor : heightFactor
      : signs.x !== 0 ? widthFactor : heightFactor;
    const minFactor = Math.max(MIN_LAYER_SCALE / snapshot.startScale, MIN_LAYER_SCALE / snapshot.startScaleY);
    const maxFactor = Math.min(MAX_LAYER_SCALE / snapshot.startScale, MAX_LAYER_SCALE / snapshot.startScaleY);
    const factor = clampNumber(factorSource, minFactor, maxFactor);
    nextWidth = startWidth * factor;
    nextHeight = startHeight * factor;
  }

  const offset = getCanvasOffsetFromLayerLocal(
    signs.x === 0 ? 0 : signs.x * (nextWidth - startWidth) / 2,
    signs.y === 0 ? 0 : signs.y * (nextHeight - startHeight) / 2,
    snapshot.startRotation,
  );

  return {
    x: snapshot.startX + offset.x,
    y: snapshot.startY + offset.y,
    scale: clampNumber(nextWidth / layer.naturalWidth, MIN_LAYER_SCALE, MAX_LAYER_SCALE),
    scaleY: clampNumber(nextHeight / layer.naturalHeight, MIN_LAYER_SCALE, MAX_LAYER_SCALE),
  };
}
