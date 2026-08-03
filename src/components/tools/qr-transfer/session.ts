/**
 * Sender and receiver session objects for the fountain-coded QR transfer.
 *
 * Kept out of the Svelte component so the protocol can be tested headlessly and
 * so the component only deals with rendering and camera plumbing.
 */

import { LtDecoder, LtEncoder } from "./fountain.ts";
import { base45Length } from "./base45.ts";
import {
  buildPayload,
  decodeFrame,
  encodeFrame,
  FRAME_PREFIX,
  HEADER_SIZE,
  parsePayload,
  type ParsedPayload,
  type TransferMeta,
} from "./protocol.ts";
import {
  capacityBytes,
  encodeMatrix,
  pinVersion,
  type ErrorCorrectionLevel,
  type QrMatrix,
} from "./qr-encoder.ts";

/** Depth of the pre-encoded frame queue; absorbs encoder jitter at high fps. */
const PREFETCH_DEPTH = 3;

export interface SenderOptions {
  /** Payload bytes per QR frame, before the 11 byte packet header. */
  blockSize: number;
  errorCorrection: ErrorCorrectionLevel;
}

export interface SenderStats {
  framesEmitted: number;
  /** Payload bytes per second currently going out on the wire. */
  bytesPerSecond: number;
  /** Seconds for one full pass of k frames at the current rate. */
  passSeconds: number;
}

export class TransferSender {
  readonly meta: TransferMeta;
  readonly blockCount: number;
  readonly blockSize: number;
  readonly payloadLength: number;
  readonly rawLength: number;
  readonly gzip: boolean;
  readonly qrVersion: number;
  readonly fileSize: number;

  private readonly encoder: LtEncoder;
  private readonly sessionId: number;
  private readonly ec: ErrorCorrectionLevel;
  private readonly queue: QrMatrix[] = [];
  private seed = 0;
  private emitted = 0;
  private emitTimes: number[] = [];

  private constructor(
    file: File,
    payload: Uint8Array,
    gzip: boolean,
    meta: TransferMeta,
    rawLength: number,
    options: SenderOptions,
  ) {
    this.meta = meta;
    this.fileSize = file.size;
    this.gzip = gzip;
    this.rawLength = rawLength;
    this.payloadLength = payload.length;
    this.blockSize = options.blockSize;
    this.ec = options.errorCorrection;
    this.encoder = new LtEncoder(payload, options.blockSize);
    this.blockCount = this.encoder.k;
    this.sessionId = Math.floor(Math.random() * 0x10000);

    // Every frame carries exactly one block, so all frames encode to the same
    // number of characters and therefore the same symbol version. Pin it once
    // from that length rather than from a sample frame, because the character
    // count is fixed but the character *classes* are not - see `pinVersion`.
    const frameChars = FRAME_PREFIX.length + base45Length(HEADER_SIZE + this.blockSize);
    this.qrVersion = pinVersion(frameChars, this.ec);
  }

  static async create(file: File, options: SenderOptions): Promise<TransferSender> {
    if (options.blockSize % 4 !== 0) throw new Error("blockSize must be a multiple of 4");
    const built = await buildPayload(file);
    return new TransferSender(file, built.payload, built.gzip, built.meta, built.rawLength, options);
  }

  /** Largest block size that still fits a QR symbol at this EC level. */
  static maxBlockSize(version: number, ec: ErrorCorrectionLevel): number {
    // 11 bytes of packet header, then round down to the multiple of 4 the
    // fountain encoder's 32-bit XOR fast path requires.
    return Math.max(4, (capacityBytes(version, ec) - 11) & ~3);
  }

  private encodeAt(seed: number): QrMatrix {
    const block = this.encoder.droplet(seed);
    const text = encodeFrame(this.sessionId, this.payloadLength, seed, this.gzip, block);
    return encodeMatrix(text, this.ec, this.qrVersion);
  }

  /**
   * Encodes upcoming frames ahead of time. Call this right after painting, so
   * the work lands in the gap before the next frame is due rather than on the
   * critical path between "frame is due" and "frame is on screen".
   */
  prefetch(): void {
    while (this.queue.length < PREFETCH_DEPTH) {
      this.queue.push(this.encodeAt(this.seed));
      // 2^32 seeds; wraps back to 0 after ~4 billion frames.
      this.seed = (this.seed + 1) >>> 0;
    }
  }

  /** Next frame to display. Encodes inline if the prefetch queue ran dry. */
  next(): QrMatrix {
    if (this.queue.length === 0) this.prefetch();
    const matrix = this.queue.shift()!;

    this.emitted++;
    const now = performance.now();
    this.emitTimes.push(now);
    if (this.emitTimes.length > 60) this.emitTimes.shift();

    return matrix;
  }

  stats(): SenderStats {
    const times = this.emitTimes;
    let fps = 0;
    if (times.length >= 2) {
      const span = times[times.length - 1] - times[0];
      if (span > 0) fps = ((times.length - 1) * 1000) / span;
    }
    return {
      framesEmitted: this.emitted,
      bytesPerSecond: fps * this.blockSize,
      passSeconds: fps > 0 ? this.blockCount / fps : 0,
    };
  }
}

export type AcceptResult = "ignored" | "duplicate" | "progress" | "complete";

export interface ReceiverProgress {
  blocksDecoded: number;
  blockCount: number;
  percent: number;
  /** Frames actually fed to the decoder, including redundant ones. */
  framesAccepted: number;
  /** Frames seen but already known; high values mean the sender is too slow. */
  framesDuplicate: number;
  payloadLength: number;
  blocksPerSecond: number;
  /** Seconds remaining at the current rate, or null when not yet estimable. */
  etaSeconds: number | null;
  gzip: boolean;
}

/**
 * Collects droplets until the payload can be reconstructed.
 *
 * The file name and hash live inside the fountain-coded payload rather than in
 * each frame header, so they only become known once the transfer completes.
 * Frame headers still carry the payload length, which is enough to show a real
 * progress bar and size from the very first frame.
 */
export class TransferReceiver {
  private decoder: LtDecoder | null = null;
  private sessionId = -1;
  private gzipFlag = false;
  private duplicates = 0;
  private startedAt = 0;
  private lastProgressAt = 0;
  private recentRate = 0;

  get active(): boolean {
    return this.decoder !== null;
  }

  get complete(): boolean {
    return this.decoder?.complete ?? false;
  }

  /** True once block `index` is recovered; drives the progress grid. */
  has(index: number): boolean {
    return this.decoder?.has(index) ?? false;
  }

  /**
   * Feeds a scanned string. Returns "ignored" when the text is not a frame of
   * this protocol, so the caller can treat it as an ordinary barcode result.
   */
  accept(text: string): AcceptResult {
    const packet = decodeFrame(text);
    if (!packet) return "ignored";

    // A different session id or payload length means the sender switched files.
    if (
      !this.decoder ||
      this.sessionId !== packet.sessionId ||
      this.decoder.payloadLength !== packet.payloadLength ||
      this.decoder.blockSize !== packet.blockSize
    ) {
      this.decoder = new LtDecoder(packet.payloadLength, packet.blockSize);
      this.sessionId = packet.sessionId;
      this.gzipFlag = packet.gzip;
      this.duplicates = 0;
      this.startedAt = performance.now();
      this.lastProgressAt = this.startedAt;
      this.recentRate = 0;
    }

    const before = this.decoder.received;
    const result = this.decoder.add(packet.seed, packet.data);

    if (result === "duplicate") {
      this.duplicates++;
      return "duplicate";
    }

    const gained = this.decoder.received - before;
    if (gained > 0) {
      const now = performance.now();
      const dt = (now - this.lastProgressAt) / 1000;
      if (dt > 0) {
        const instant = gained / dt;
        // Exponential smoothing; raw per-frame rates are far too noisy for an ETA.
        this.recentRate = this.recentRate === 0 ? instant : this.recentRate * 0.8 + instant * 0.2;
      }
      this.lastProgressAt = now;
    }

    return this.decoder.complete ? "complete" : "progress";
  }

  progress(): ReceiverProgress | null {
    const decoder = this.decoder;
    if (!decoder) return null;

    const remaining = decoder.k - decoder.received;
    return {
      blocksDecoded: decoder.received,
      blockCount: decoder.k,
      percent: (decoder.received / decoder.k) * 100,
      framesAccepted: decoder.accepted,
      framesDuplicate: this.duplicates,
      payloadLength: decoder.payloadLength,
      blocksPerSecond: this.recentRate,
      etaSeconds: this.recentRate > 0 && remaining > 0 ? remaining / this.recentRate : null,
      gzip: this.gzipFlag,
    };
  }

  /** Reassembles, decompresses and hash-checks the payload. */
  async finish(): Promise<ParsedPayload> {
    const payload = this.decoder?.result();
    if (!payload) throw new Error("Transfer is not complete");
    return parsePayload(payload, this.gzipFlag);
  }

  reset(): void {
    this.decoder = null;
    this.sessionId = -1;
    this.duplicates = 0;
    this.recentRate = 0;
  }
}
