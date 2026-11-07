export interface PixelDifference {
  pixels: Uint8ClampedArray;
  changed: number;
  total: number;
  meanError: number;
}

export function fitComparisonSize(width: number, height: number, viewportWidth: number, viewportHeight: number, zoom: number): { width: number; height: number } {
  if (![width, height, viewportWidth, viewportHeight, zoom].every((value) => Number.isFinite(value) && value > 0)) return { width: 0, height: 0 };
  const scale: number = Math.min(viewportWidth / width, viewportHeight / height) * zoom / 100;
  return { width: width * scale, height: height * scale };
}

export function comparePixels(a: Uint8ClampedArray, b: Uint8ClampedArray, threshold: number): PixelDifference {
  if (a.length !== b.length || a.length % 4 !== 0) throw new Error("Pixel buffers must have matching RGBA dimensions.");
  const pixels: Uint8ClampedArray = new Uint8ClampedArray(a.length);
  let changed: number = 0;
  let error: number = 0;
  for (let i: number = 0; i < a.length; i += 4) {
    // Compare visible colors on white, including alpha-only differences.
    let delta: number = Math.abs(a[i + 3] - b[i + 3]);
    let rgbError: number = 0;
    for (let channel: number = 0; channel < 3; channel++) {
      const difference: number = Math.abs((a[i + channel] * a[i + 3] + 255 * (255 - a[i + 3])) / 255 - (b[i + channel] * b[i + 3] + 255 * (255 - b[i + 3])) / 255);
      delta = Math.max(delta, difference); rgbError += difference;
    }
    error += rgbError / 3;
    const different: boolean = delta > threshold;
    if (different) changed++;
    pixels[i] = different ? 240 : 35;
    pixels[i + 1] = different ? 65 : 35;
    pixels[i + 2] = different ? 110 : 35;
    pixels[i + 3] = 255;
  }
  return { pixels, changed, total: a.length / 4, meanError: a.length ? error / (a.length / 4) / 255 * 100 : 0 };
}
