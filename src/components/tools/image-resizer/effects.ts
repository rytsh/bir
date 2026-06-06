import type { ImageLayer } from "./types.ts";
import { clampInteger, clampNumber } from "./utils.ts";

export interface EffectRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

function cloneCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d");
  ctx?.drawImage(source, 0, 0);
  return canvas;
}

function createBlurCanvas(source: HTMLCanvasElement, radius: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.filter = `blur(${radius}px)`;
  ctx.drawImage(source, 0, 0);
  ctx.filter = "none";
  return canvas;
}

function getFacetNoise(x: number, y: number, salt: number): number {
  const value = Math.sin(x * 12.9898 + y * 78.233 + salt * 37.719) * 43758.5453;
  return value - Math.floor(value);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const value = Math.round(l * 255);
    return [value, value, value];
  }

  const hue2rgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const lightness = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) return [0, 0, lightness];

  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue: number;
  if (max === rn) hue = (gn - bn) / delta + (gn < bn ? 6 : 0);
  else if (max === gn) hue = (bn - rn) / delta + 2;
  else hue = (rn - gn) / delta + 4;

  return [hue / 6, saturation, lightness];
}

// Keeps the underlying pixel's own hue but intensifies it into a stained-glass
// tint instead of inventing brand-new colors. Near-gray pixels stay neutral.
function vividGlassColor(r: number, g: number, b: number): [number, number, number] {
  const [hue, saturation, lightness] = rgbToHsl(r, g, b);
  const nextSaturation = saturation < 0.06 ? saturation : clampNumber(saturation * 1.5 + 0.32, 0, 1);
  const nextLightness = clampNumber(lightness * 0.88 + 0.1, 0.18, 0.82);
  return hslToRgb(hue, nextSaturation, nextLightness);
}

export function getRotatedBounds(centerX: number, centerY: number, width: number, height: number, rotationDegrees: number): EffectRegion {
  const rotation = (rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const corners = [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ].map((corner) => ({
    x: centerX + corner.x * cos - corner.y * sin,
    y: centerY + corner.x * sin + corner.y * cos,
  }));
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);

  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

export function createCrystalGlassCanvas(
  source: HTMLCanvasElement,
  facetSize: number,
  blurRadius: number,
  colorful: boolean,
  borderWidth: number,
  region?: EffectRegion,
): HTMLCanvasElement {
  const cell = clampInteger(facetSize, 8, 200);
  const safeBlurRadius = clampNumber(blurRadius, 0, 16);
  const border = clampInteger(borderWidth, 0, 6);
  const width = source.width;
  const height = source.height;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.drawImage(source, 0, 0);

  const sourceCtx = source.getContext("2d");
  if (!sourceCtx) return canvas;

  let colorCtx: CanvasRenderingContext2D = sourceCtx;
  if (safeBlurRadius > 0) {
    const blurred = document.createElement("canvas");
    blurred.width = width;
    blurred.height = height;
    const blurredCtx = blurred.getContext("2d");
    if (blurredCtx) {
      blurredCtx.filter = `blur(${safeBlurRadius}px)`;
      blurredCtx.drawImage(source, 0, 0);
      blurredCtx.filter = "none";
      colorCtx = blurredCtx;
    }
  }

  const rx0 = region ? clampInteger(region.x, 0, width) : 0;
  const ry0 = region ? clampInteger(region.y, 0, height) : 0;
  const rx1 = region ? clampInteger(region.x + region.width, 0, width) : width;
  const ry1 = region ? clampInteger(region.y + region.height, 0, height) : height;
  const rw = rx1 - rx0;
  const rh = ry1 - ry0;
  if (rw <= 0 || rh <= 0) return canvas;

  const sx0 = clampInteger(rx0 - cell, 0, width);
  const sy0 = clampInteger(ry0 - cell, 0, height);
  const sx1 = clampInteger(rx1 + cell, 0, width);
  const sy1 = clampInteger(ry1 + cell, 0, height);
  const sw = Math.max(1, sx1 - sx0);
  const sh = Math.max(1, sy1 - sy0);
  // Alpha comes from the untouched composite so opaque content stays fully
  // opaque; only genuinely empty (alpha 0) areas remain transparent.
  const alphaData = sourceCtx.getImageData(sx0, sy0, sw, sh).data;
  const colorData = colorCtx === sourceCtx ? alphaData : colorCtx.getImageData(sx0, sy0, sw, sh).data;
  const dataIndex = (px: number, py: number): number => {
    const cx = clampInteger(px, sx0, sx1 - 1) - sx0;
    const cy = clampInteger(py, sy0, sy1 - 1) - sy0;
    return (cy * sw + cx) * 4;
  };
  const sampleColor = (px: number, py: number): [number, number, number] => {
    const idx = dataIndex(px, py);
    return [colorData[idx], colorData[idx + 1], colorData[idx + 2]];
  };
  const sampleAlpha = (px: number, py: number): number => alphaData[dataIndex(px, py) + 3];

  const giMin = Math.floor((rx0 - cell) / cell);
  const giMax = Math.floor((rx1 + cell) / cell);
  const gjMin = Math.floor((ry0 - cell) / cell);
  const gjMax = Math.floor((ry1 + cell) / cell);
  const cols = giMax - giMin + 1;
  const rows = gjMax - gjMin + 1;
  const seedX = new Float32Array(cols * rows);
  const seedY = new Float32Array(cols * rows);
  const seedR = new Uint8ClampedArray(cols * rows);
  const seedG = new Uint8ClampedArray(cols * rows);
  const seedB = new Uint8ClampedArray(cols * rows);
  const seedA = new Uint8ClampedArray(cols * rows);

  for (let gj = gjMin; gj <= gjMax; gj++) {
    for (let gi = giMin; gi <= giMax; gi++) {
      const k = (gi - giMin) + (gj - gjMin) * cols;
      const cellCenterX = gi * cell + cell / 2;
      const cellCenterY = gj * cell + cell / 2;
      // Jitter only shapes the Voronoi cell; the colour is sampled at the cell
      // centre so the glass shows the content that is actually behind it instead
      // of a displaced ("moved") copy of the layer underneath.
      const jitterX = (getFacetNoise(gi, gj, 17) - 0.5) * cell * 1.1;
      const jitterY = (getFacetNoise(gi, gj, 29) - 0.5) * cell * 1.1;
      seedX[k] = cellCenterX + jitterX;
      seedY[k] = cellCenterY + jitterY;
      const sampleX = Math.round(cellCenterX);
      const sampleY = Math.round(cellCenterY);
      const [sr, sg, sb] = sampleColor(sampleX, sampleY);
      const sa = sampleAlpha(sampleX, sampleY);
      const color = colorful ? vividGlassColor(sr, sg, sb) : [sr, sg, sb];
      seedR[k] = color[0];
      seedG[k] = color[1];
      seedB[k] = color[2];
      seedA[k] = sa;
    }
  }

  const labels = new Int32Array(rw * rh);
  const output = ctx.createImageData(rw, rh);
  const outData = output.data;

  for (let j = 0; j < rh; j++) {
    const py = ry0 + j;
    const gridRow = Math.floor(py / cell);
    for (let i = 0; i < rw; i++) {
      const px = rx0 + i;
      const gridCol = Math.floor(px / cell);
      let best = Infinity;
      let bestK = -1;
      for (let dj = -1; dj <= 1; dj++) {
        const gj = gridRow + dj;
        if (gj < gjMin || gj > gjMax) continue;
        for (let di = -1; di <= 1; di++) {
          const gi = gridCol + di;
          if (gi < giMin || gi > giMax) continue;
          const k = (gi - giMin) + (gj - gjMin) * cols;
          const dx = px - seedX[k];
          const dy = py - seedY[k];
          const distance = dx * dx + dy * dy;
          if (distance < best) {
            best = distance;
            bestK = k;
          }
        }
      }

      const li = j * rw + i;
      labels[li] = bestK;
      const oi = li * 4;
      const pixelAlpha = sampleAlpha(px, py);
      if (bestK >= 0 && seedA[bestK] >= 8) {
        outData[oi] = seedR[bestK];
        outData[oi + 1] = seedG[bestK];
        outData[oi + 2] = seedB[bestK];
      } else {
        const [fr, fg, fb] = sampleColor(px, py);
        outData[oi] = fr;
        outData[oi + 1] = fg;
        outData[oi + 2] = fb;
      }
      // Opaque content -> fully opaque glass; only empty (alpha 0) areas stay
      // transparent instead of turning into solid black/dark glass.
      outData[oi + 3] = pixelAlpha;
    }
  }

  if (border > 0) {
    let edge = new Uint8Array(rw * rh);
    for (let j = 0; j < rh; j++) {
      for (let i = 0; i < rw; i++) {
        const li = j * rw + i;
        const label = labels[li];
        if ((i + 1 < rw && labels[li + 1] !== label) || (j + 1 < rh && labels[li + rw] !== label)) {
          edge[li] = 1;
        }
      }
    }
    for (let pass = 1; pass < border; pass++) {
      const next = new Uint8Array(rw * rh);
      for (let j = 0; j < rh; j++) {
        for (let i = 0; i < rw; i++) {
          const li = j * rw + i;
          if (edge[li] || (i > 0 && edge[li - 1]) || (i + 1 < rw && edge[li + 1]) || (j > 0 && edge[li - rw]) || (j + 1 < rh && edge[li + rw])) {
            next[li] = 1;
          }
        }
      }
      edge = next;
    }
    const leadColor = colorful ? [12, 14, 26] : [255, 255, 255];
    const leadAlpha = colorful ? 0.92 : 0.5;
    for (let li = 0; li < rw * rh; li++) {
      if (!edge[li]) continue;
      const oi = li * 4;
      // Don't paint lead lines onto fully transparent areas.
      if (outData[oi + 3] === 0) continue;
      outData[oi] = Math.round(outData[oi] * (1 - leadAlpha) + leadColor[0] * leadAlpha);
      outData[oi + 1] = Math.round(outData[oi + 1] * (1 - leadAlpha) + leadColor[1] * leadAlpha);
      outData[oi + 2] = Math.round(outData[oi + 2] * (1 - leadAlpha) + leadColor[2] * leadAlpha);
    }
  }

  ctx.putImageData(output, rx0, ry0);
  return canvas;
}

export function applyEffectLayer(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  layer: ImageLayer,
  displayWidth: number,
  displayHeight: number,
): void {
  const sourceCanvas = cloneCanvas(canvas);
  const strength = clampInteger(layer.effectStrength ?? 12, 1, 80);
  const region = getRotatedBounds(layer.x, layer.y, displayWidth, displayHeight, layer.rotation);
  const effectCanvas = layer.effectKind === "crystal"
    ? createCrystalGlassCanvas(sourceCanvas, strength, layer.effectBlur ?? 2, layer.effectColorful ?? false, layer.effectBorder ?? 1, region)
    : createBlurCanvas(sourceCanvas, strength);

  ctx.save();
  ctx.globalAlpha = layer.opacity;
  ctx.translate(layer.x, layer.y);
  ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.beginPath();
  ctx.rect(-displayWidth / 2, -displayHeight / 2, displayWidth, displayHeight);
  ctx.clip();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(effectCanvas, 0, 0);
  ctx.restore();
}
