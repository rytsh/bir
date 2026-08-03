/**
 * Wire format for the fountain-coded QR file transfer.
 *
 * Every QR frame is fully self describing, so a receiver can join a transfer
 * that is already in progress and still decode it.
 *
 * Text frame:  "QF1" + base45(packet)
 *
 * Packet (big endian):
 *   0       flags        low nibble = protocol version, bit 4 = payload gzipped
 *   1..2    sessionId    guards against mixing frames from two transfers
 *   3..6    payloadLen   exact byte length of the (possibly gzipped) payload
 *   7..10   seed         selects the source blocks XORed into this droplet
 *   11..    block data   blockSize bytes; blockSize = packet.length - 11
 *
 * `blockSize` and the block count `k = ceil(payloadLen / blockSize)` are both
 * derived rather than transmitted, which keeps the header at 11 bytes. At a
 * 1 KiB block that is ~1% overhead, against ~35% for the previous
 * JSON-plus-base64 envelope.
 *
 * Payload (before optional gzip):
 *   0..1    metaLen
 *   2..     meta JSON  {n: name, s: size, t: mime, h: sha256 prefix}
 *   ...     file bytes
 *
 * Metadata rides inside the fountain-coded payload rather than in the per-frame
 * header, so it costs nothing per frame.
 */

import { decodeBase45, encodeBase45 } from "./base45.ts";

export const FRAME_PREFIX = "QF1";
export const HEADER_SIZE = 11;
export const PROTOCOL_VERSION = 1;
const FLAG_GZIP = 0x10;

export interface TransferMeta {
  /** File name. */
  n: string;
  /** Original (uncompressed) file size in bytes. */
  s: number;
  /** MIME type, may be empty. */
  t: string;
  /** First 16 hex chars of the SHA-256 of the original file. */
  h: string;
}

export interface Packet {
  sessionId: number;
  payloadLength: number;
  blockSize: number;
  seed: number;
  gzip: boolean;
  data: Uint8Array;
}

export const encodeFrame = (
  sessionId: number,
  payloadLength: number,
  seed: number,
  gzip: boolean,
  block: Uint8Array,
): string => {
  const packet = new Uint8Array(HEADER_SIZE + block.length);
  const view = new DataView(packet.buffer);

  packet[0] = PROTOCOL_VERSION | (gzip ? FLAG_GZIP : 0);
  view.setUint16(1, sessionId);
  view.setUint32(3, payloadLength);
  view.setUint32(7, seed);
  packet.set(block, HEADER_SIZE);

  return FRAME_PREFIX + encodeBase45(packet);
};

/** Returns null when `text` is not a frame of this protocol. */
export const decodeFrame = (text: string): Packet | null => {
  if (!text.startsWith(FRAME_PREFIX)) return null;

  const packet = decodeBase45(text.slice(FRAME_PREFIX.length));
  if (!packet || packet.length <= HEADER_SIZE) return null;

  const flags = packet[0];
  if ((flags & 0x0f) !== PROTOCOL_VERSION) return null;

  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  const payloadLength = view.getUint32(3);
  const blockSize = packet.length - HEADER_SIZE;

  // A malformed or corrupted frame that still passed the QR checksum should not
  // be able to make the decoder allocate an absurd amount of memory.
  if (payloadLength === 0 || payloadLength > 512 * 1024 * 1024) return null;
  if (blockSize % 4 !== 0) return null;

  return {
    sessionId: view.getUint16(1),
    payloadLength,
    blockSize,
    seed: view.getUint32(7),
    gzip: (flags & FLAG_GZIP) !== 0,
    // Copy: the decoder mutates block data in place while peeling.
    data: packet.slice(HEADER_SIZE),
  };
};

export const sha256Prefix = async (data: BufferSource): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest, 0, 8))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const canCompress = (): boolean => typeof CompressionStream !== "undefined";

const gzipCompress = async (data: Uint8Array): Promise<Uint8Array> => {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

const gzipDecompress = async (data: Uint8Array): Promise<Uint8Array> => {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

export interface BuiltPayload {
  payload: Uint8Array;
  gzip: boolean;
  meta: TransferMeta;
  /** Uncompressed payload size, for reporting the compression ratio. */
  rawLength: number;
}

export const buildPayload = async (file: File): Promise<BuiltPayload> => {
  const fileBytes = new Uint8Array(await file.arrayBuffer());
  const meta: TransferMeta = {
    n: file.name,
    s: file.size,
    t: file.type || "",
    h: await sha256Prefix(fileBytes),
  };

  const metaBytes = new TextEncoder().encode(JSON.stringify(meta));
  const raw = new Uint8Array(2 + metaBytes.length + fileBytes.length);
  new DataView(raw.buffer).setUint16(0, metaBytes.length);
  raw.set(metaBytes, 2);
  raw.set(fileBytes, 2 + metaBytes.length);

  if (canCompress()) {
    try {
      const compressed = await gzipCompress(raw);
      // Already-compressed formats (jpg, mp4, zip) grow slightly under gzip, so
      // only take the compressed form when it actually helps.
      if (compressed.length < raw.length) {
        return { payload: compressed, gzip: true, meta, rawLength: raw.length };
      }
    } catch {
      // Fall through to the uncompressed payload.
    }
  }

  return { payload: raw, gzip: false, meta, rawLength: raw.length };
};

export interface ParsedPayload {
  meta: TransferMeta;
  bytes: Uint8Array;
  /** True when the SHA-256 prefix in the metadata matches the received bytes. */
  verified: boolean;
}

export const parsePayload = async (payload: Uint8Array, gzip: boolean): Promise<ParsedPayload> => {
  const raw = gzip ? await gzipDecompress(payload) : payload;
  if (raw.length < 2) throw new Error("Payload is truncated");

  const metaLength = new DataView(raw.buffer, raw.byteOffset, raw.byteLength).getUint16(0);
  if (raw.length < 2 + metaLength) throw new Error("Payload metadata is truncated");

  const meta = JSON.parse(new TextDecoder().decode(raw.subarray(2, 2 + metaLength))) as TransferMeta;
  const bytes = raw.slice(2 + metaLength);

  return { meta, bytes, verified: meta.h ? (await sha256Prefix(bytes)) === meta.h : true };
};
