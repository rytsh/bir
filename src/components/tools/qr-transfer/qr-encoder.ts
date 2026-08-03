/**
 * QR generation for the transfer stream.
 *
 * The generic barcode tab uses bwip-js, which runs a PostScript interpreter and
 * needs ~93 ms for a 1 KiB QR - a hard ceiling of ~11 fps. This path uses only
 * the core encoder of `qrcode` with two deliberate constraints:
 *
 *  - A fixed mask pattern. Mask selection evaluates all eight masks against the
 *    penalty rules and dominates encode time; skipping it is a ~3x win and is
 *    invisible to decoders, which read the mask from the format bits. Measured:
 *    93 ms (bwip-js) -> 20 ms (auto mask) -> 6.7 ms (fixed mask) at 1 KiB.
 *  - A pinned symbol version. Every frame carries the same number of bytes, so
 *    the version is computed once and reused. This keeps the symbol physically
 *    the same size on screen for the whole transfer, which matters because a
 *    QR that changes size between frames makes camera autofocus hunt.
 */

import qrcodeCore from "qrcode/lib/core/qrcode.js";

export type ErrorCorrectionLevel = "L" | "M" | "Q" | "H";

/**
 * jsQR ships an incorrect alignment pattern table for version 23
 * (`[6,30,54,74,102]` where the spec says `[6,30,54,78,102]`), so it fails to
 * read every version 23 symbol regardless of image quality. zxing and native
 * BarcodeDetector are fine, but a receiver falling back to jsQR would stall
 * completely, so the encoder never emits this version.
 */
const BROKEN_VERSIONS = new Set([23]);

/** Mask 0 is the `(row + col) % 2` checkerboard; it suits near-random payloads. */
const FIXED_MASK = 0;

export interface QrMatrix {
  size: number;
  /** One byte per module, non-zero means dark. */
  data: Uint8Array;
  version: number;
}

interface QrCodeLike {
  modules: { size: number; data: Uint8Array };
  version: number;
}

const create = (text: string, ec: ErrorCorrectionLevel, version?: number): QrCodeLike =>
  qrcodeCore.create(text, {
    errorCorrectionLevel: ec,
    maskPattern: FIXED_MASK,
    ...(version ? { version } : {}),
  }) as QrCodeLike;

/**
 * Worst-case sample of `length` characters for version selection.
 *
 * Every character base45 can emit is in the QR alphanumeric set, but a QR
 * encoder also picks per-segment modes, and numeric mode packs digits at
 * 3.33 bits each against alphanumeric's 5.5. A sample that happens to be
 * digit-heavy therefore fits in a *smaller* version than the random droplet
 * data that will actually be sent. Sizing off a letters-only string pins the
 * version against the densest case the stream can produce.
 */
const worstCaseSample = (length: number): string => "A".repeat(length);

/**
 * Resolves the symbol version to use for every frame of a transfer, given the
 * exact character count each frame will have.
 * Throws when the frame cannot fit in any usable version at this EC level.
 */
export const pinVersion = (charCount: number, ec: ErrorCorrectionLevel): number => {
  const sample = worstCaseSample(charCount);
  const auto = create(sample, ec).version;
  if (!BROKEN_VERSIONS.has(auto)) return auto;

  // Step up until a usable version also fits the frame.
  for (let v = auto + 1; v <= 40; v++) {
    if (BROKEN_VERSIONS.has(v)) continue;
    try {
      create(sample, ec, v);
      return v;
    } catch {
      // keep climbing
    }
  }
  throw new Error("Frame does not fit in any usable QR version");
};

export const encodeMatrix = (
  text: string,
  ec: ErrorCorrectionLevel,
  version: number,
): QrMatrix => {
  const qr = create(text, ec, version);
  return { size: qr.modules.size, data: qr.modules.data, version: qr.version };
};

/** Largest number of payload bytes that fits a version at an EC level. */
export const capacityBytes = (version: number, ec: ErrorCorrectionLevel): number => {
  // base45 turns n bytes into ceil(n/2)*3 (or +2 for an odd tail) characters,
  // so probe by binary search rather than duplicating the capacity tables.
  const fits = (bytes: number): boolean => {
    const chars = Math.floor(bytes / 2) * 3 + (bytes % 2 === 1 ? 2 : 0);
    try {
      create(worstCaseSample(chars), ec, version);
      return true;
    } catch {
      return false;
    }
  };

  let lo = 0;
  let hi = 3000;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (fits(mid)) lo = mid;
    else hi = mid - 1;
  }
  return lo;
};

/**
 * Paints a matrix onto `canvas`, sized to `targetSize` CSS pixels.
 *
 * The matrix is written into a 1-module-per-pixel scratch canvas and then blown
 * up with smoothing disabled. Scaling one small bitmap beats issuing thousands
 * of fillRect calls per frame and, unlike fillRect, cannot produce seams
 * between modules from sub-pixel rounding.
 */
export class MatrixPainter {
  private readonly scratch: HTMLCanvasElement;
  private readonly scratchCtx: CanvasRenderingContext2D;
  private imageData: ImageData | null = null;

  constructor() {
    this.scratch = document.createElement("canvas");
    const ctx = this.scratch.getContext("2d", { willReadFrequently: false });
    if (!ctx) throw new Error("2D canvas is unavailable");
    this.scratchCtx = ctx;
  }

  paint(
    canvas: HTMLCanvasElement,
    matrix: QrMatrix,
    options: { quietZone?: number; targetSize?: number } = {},
  ): void {
    const quiet = options.quietZone ?? 3;
    const full = matrix.size + quiet * 2;

    if (this.scratch.width !== full) {
      this.scratch.width = full;
      this.scratch.height = full;
      this.imageData = this.scratchCtx.createImageData(full, full);
    }

    const image = this.imageData!;
    const pixels = new Uint32Array(image.data.buffer);
    // 0xAABBGGRR on little endian, which every browser target here is.
    pixels.fill(0xffffffff);

    const { size, data } = matrix;
    for (let y = 0; y < size; y++) {
      const row = (y + quiet) * full + quiet;
      const src = y * size;
      for (let x = 0; x < size; x++) {
        if (data[src + x]) pixels[row + x] = 0xff000000;
      }
    }
    this.scratchCtx.putImageData(image, 0, 0);

    // Snap to a whole number of device pixels per module: fractional module
    // widths are the main cause of unreadable QR codes on screen.
    const target = options.targetSize ?? 512;
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 3);
    const scale = Math.max(1, Math.floor((target * dpr) / full));
    const dimension = full * scale;

    if (canvas.width !== dimension || canvas.height !== dimension) {
      canvas.width = dimension;
      canvas.height = dimension;
    }
    canvas.style.width = `${dimension / dpr}px`;
    canvas.style.height = `${dimension / dpr}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.scratch, 0, 0, dimension, dimension);
  }
}
