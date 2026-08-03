/**
 * Barcode scanning front end.
 *
 * Backends, in preference order:
 *  1. Native `BarcodeDetector` - hardware accelerated, and can read straight
 *     from a video element without a canvas round trip.
 *  2. zxing-wasm - measured at ~9 ms for a 1280x720 frame.
 *  3. jsQR - pure JS fallback, ~62 ms for the same frame, and unable to read
 *     version 23 symbols at all (see `qr-encoder.ts`). Last resort only.
 *
 * The previous implementation constructed a `BarcodeDetector` and allocated a
 * fresh canvas on every single scan, and ran jsQR with `attemptBoth` inversion
 * (which doubles the work for no benefit when reading a screen). All three are
 * fixed here: the detector and the canvas are created once, and inversion is
 * only attempted on the slow path where a user may be scanning a printed or
 * inverted code.
 */

import jsQR from "jsqr";

export type ScanSource = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ScanBackend = "native" | "zxing" | "jsqr";

const ALL_FORMATS = [
  "qr_code",
  "ean_13",
  "ean_8",
  "code_128",
  "code_39",
  "code_93",
  "codabar",
  "data_matrix",
  "itf",
  "pdf417",
  "aztec",
  "upc_a",
  "upc_e",
] as const;

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource | ImageData | Blob): Promise<Array<{ rawValue: string }>>;
}

type ZXingReader = (
  input: ImageData,
  options: Record<string, unknown>,
) => Promise<Array<{ text: string; isValid?: boolean }>>;

let zxingReader: ZXingReader | null = null;
let zxingLoad: Promise<ZXingReader | null> | null = null;

const loadZxing = async (): Promise<ZXingReader | null> => {
  if (zxingReader) return zxingReader;
  if (!zxingLoad) {
    zxingLoad = (async () => {
      try {
        const mod = await import("zxing-wasm/reader");
        const base = import.meta.env.BASE_URL || "/";
        await mod.prepareZXingModule({
          // Served from our own origin so the tool still works offline; the
          // library would otherwise pull the binary from a CDN.
          overrides: {
            locateFile: (path: string, prefix: string) =>
              path.endsWith(".wasm") ? `${base}wasm/zxing_reader.wasm` : prefix + path,
          },
          fireImmediately: true,
        });
        zxingReader = mod.readBarcodes as unknown as ZXingReader;
        return zxingReader;
      } catch {
        return null;
      }
    })();
  }
  return zxingLoad;
};

export interface ScannerOptions {
  /** Restrict to QR only; much faster and avoids 1D false positives. */
  qrOnly?: boolean;
  /** Spend extra effort per frame. Off for streaming, on for still images. */
  tryHarder?: boolean;
  /** Cap the grabbed frame size; guards against 4K screen captures. */
  maxDimension?: number;
}

export class QrScanner {
  private detector: BarcodeDetectorLike | null = null;
  private detectorChecked = false;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private readonly options: Required<ScannerOptions>;

  /** Backend that produced the most recent successful read, for the UI. */
  lastBackend: ScanBackend | null = null;

  constructor(options: ScannerOptions = {}) {
    this.options = {
      qrOnly: options.qrOnly ?? false,
      tryHarder: options.tryHarder ?? false,
      maxDimension: options.maxDimension ?? 1920,
    };
  }

  /** Warms up the backends so the first frame is not unusually slow. */
  async init(): Promise<void> {
    this.ensureDetector();
    if (!this.detector) await loadZxing();
  }

  private ensureDetector(): void {
    if (this.detectorChecked) return;
    this.detectorChecked = true;

    const Ctor = (globalThis as unknown as { BarcodeDetector?: new (init: unknown) => BarcodeDetectorLike })
      .BarcodeDetector;
    if (!Ctor) return;

    try {
      this.detector = new Ctor({
        formats: this.options.qrOnly ? ["qr_code"] : [...ALL_FORMATS],
      });
    } catch {
      this.detector = null;
    }
  }

  private grab(source: ScanSource, region?: Region): ImageData | null {
    let sw: number;
    let sh: number;
    if (source instanceof HTMLVideoElement) {
      sw = source.videoWidth;
      sh = source.videoHeight;
    } else if (source instanceof HTMLCanvasElement) {
      sw = source.width;
      sh = source.height;
    } else {
      sw = source.naturalWidth || source.width;
      sh = source.naturalHeight || source.height;
    }
    if (!sw || !sh) return null;

    let sx = 0;
    let sy = 0;
    if (region) {
      sx = Math.max(0, Math.floor(region.x));
      sy = Math.max(0, Math.floor(region.y));
      sw = Math.min(Math.floor(region.width), sw - sx);
      sh = Math.min(Math.floor(region.height), sh - sy);
      if (sw <= 0 || sh <= 0) return null;
    }

    const cap = this.options.maxDimension;
    const shrink = Math.max(sw, sh) > cap ? cap / Math.max(sw, sh) : 1;
    const dw = Math.max(1, Math.round(sw * shrink));
    const dh = Math.max(1, Math.round(sh * shrink));

    if (!this.canvas) {
      this.canvas = document.createElement("canvas");
      // The whole point of this canvas is repeated getImageData.
      this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    }
    if (!this.ctx || !this.canvas) return null;

    if (this.canvas.width !== dw || this.canvas.height !== dh) {
      this.canvas.width = dw;
      this.canvas.height = dh;
    }

    this.ctx.drawImage(source, sx, sy, sw, sh, 0, 0, dw, dh);
    return this.ctx.getImageData(0, 0, dw, dh);
  }

  /** Returns the decoded text, or null when nothing was found in the frame. */
  async scan(source: ScanSource, region?: Region): Promise<string | null> {
    this.ensureDetector();

    // Fastest path: hand the video element straight to the platform decoder.
    if (this.detector && !region) {
      try {
        const found = await this.detector.detect(source);
        if (found.length > 0) {
          this.lastBackend = "native";
          return found[0].rawValue;
        }
        // A native detector that ran cleanly and found nothing is trustworthy;
        // re-running a JS decoder on the same frame just burns the frame budget.
        return null;
      } catch {
        // Some browsers throw on certain sources; fall through to the pixel path.
        this.detector = null;
      }
    }

    const image = this.grab(source, region);
    if (!image) return null;

    if (this.detector) {
      try {
        const found = await this.detector.detect(image);
        if (found.length > 0) {
          this.lastBackend = "native";
          return found[0].rawValue;
        }
        return null;
      } catch {
        this.detector = null;
      }
    }

    const zxing = await loadZxing();
    if (zxing) {
      try {
        // Built conditionally: an explicit `formats: undefined` would override
        // the library default rather than fall back to it.
        const readerOptions: Record<string, unknown> = {
          tryHarder: this.options.tryHarder,
          tryRotate: this.options.tryHarder,
          tryInvert: this.options.tryHarder,
          maxNumberOfSymbols: 1,
        };
        if (this.options.qrOnly) readerOptions.formats = ["QRCode"];

        const results = await zxing(image, readerOptions);
        if (results.length > 0 && results[0].text) {
          this.lastBackend = "zxing";
          return results[0].text;
        }
        return null;
      } catch {
        // Fall through to jsQR.
      }
    }

    try {
      const code = jsQR(image.data, image.width, image.height, {
        inversionAttempts: this.options.tryHarder ? "attemptBoth" : "dontInvert",
      });
      if (code?.data) {
        this.lastBackend = "jsqr";
        return code.data;
      }
    } catch {
      // Nothing left to try.
    }

    return null;
  }

  dispose(): void {
    this.canvas = null;
    this.ctx = null;
    this.detector = null;
    this.detectorChecked = false;
  }
}
