/**
 * ggwave WASM Wrapper
 *
 * Provides a clean TypeScript interface for the ggwave library
 */

export interface GGWaveInstance {
  ggwave: GGWaveModule;
  instance: number;
}

export interface GGWaveModule {
  getDefaultParameters: () => GGWaveParameters;
  init: (params: GGWaveParameters) => number;
  free: (instance: number) => void;
  encode: (instance: number, data: string, protocol: unknown, volume: number) => Int8Array;
  decode: (instance: number, data: Int8Array) => Uint8Array;
  disableLog: () => void;
  enableLog: () => void;
  SampleFormat: {
    GGWAVE_SAMPLE_FORMAT_UNDEFINED: unknown;
    GGWAVE_SAMPLE_FORMAT_U8: unknown;
    GGWAVE_SAMPLE_FORMAT_I8: unknown;
    GGWAVE_SAMPLE_FORMAT_U16: unknown;
    GGWAVE_SAMPLE_FORMAT_I16: unknown;
    GGWAVE_SAMPLE_FORMAT_F32: unknown;
  };
  ProtocolId: {
    GGWAVE_PROTOCOL_AUDIBLE_NORMAL: unknown;
    GGWAVE_PROTOCOL_AUDIBLE_FAST: unknown;
    GGWAVE_PROTOCOL_AUDIBLE_FASTEST: unknown;
    GGWAVE_PROTOCOL_ULTRASOUND_NORMAL: unknown;
    GGWAVE_PROTOCOL_ULTRASOUND_FAST: unknown;
    GGWAVE_PROTOCOL_ULTRASOUND_FASTEST: unknown;
    GGWAVE_PROTOCOL_DT_NORMAL: unknown;
    GGWAVE_PROTOCOL_DT_FAST: unknown;
    GGWAVE_PROTOCOL_DT_FASTEST: unknown;
  };
  GGWAVE_OPERATING_MODE_RX: number;
  GGWAVE_OPERATING_MODE_TX: number;
  GGWAVE_OPERATING_MODE_RX_AND_TX: number;
}

export interface GGWaveParameters {
  payloadLength: number;
  sampleRateInp: number;
  sampleRateOut: number;
  sampleRate: number;
  samplesPerFrame: number;
  soundMarkerThreshold: number;
  sampleFormatInp: unknown;
  sampleFormatOut: unknown;
  operatingMode: number;
}

export type ProtocolType =
  | "audible-normal"
  | "audible-fast"
  | "audible-fastest"
  | "ultrasound-normal"
  | "ultrasound-fast"
  | "ultrasound-fastest"
  | "dt-normal"
  | "dt-fast"
  | "dt-fastest";

export interface Protocol {
  id: ProtocolType;
  name: string;
  description: string;
  isUltrasonic: boolean;
}

export const PROTOCOLS: Protocol[] = [
  {
    id: "audible-normal",
    name: "Normal",
    description: "Audible, reliable (~8 bytes/sec)",
    isUltrasonic: false,
  },
  {
    id: "audible-fast",
    name: "Fast",
    description: "Audible, faster (~16 bytes/sec)",
    isUltrasonic: false,
  },
  {
    id: "audible-fastest",
    name: "Fastest",
    description: "Audible, fastest (~32 bytes/sec)",
    isUltrasonic: false,
  },
  {
    id: "ultrasound-normal",
    name: "Ultrasonic",
    description: "Inaudible, reliable (~8 bytes/sec)",
    isUltrasonic: true,
  },
  {
    id: "ultrasound-fast",
    name: "Ultrasonic Fast",
    description: "Inaudible, faster (~16 bytes/sec)",
    isUltrasonic: true,
  },
  {
    id: "ultrasound-fastest",
    name: "Ultrasonic Fastest",
    description: "Inaudible, fastest (~32 bytes/sec)",
    isUltrasonic: true,
  },
  {
    id: "dt-normal",
    name: "DT Normal",
    description: "Dual-tone, reliable",
    isUltrasonic: false,
  },
  {
    id: "dt-fast",
    name: "DT Fast",
    description: "Dual-tone, faster",
    isUltrasonic: false,
  },
  {
    id: "dt-fastest",
    name: "DT Fastest",
    description: "Dual-tone, fastest",
    isUltrasonic: false,
  },
];

export const SAMPLE_RATE = 48000;

let ggwaveModule: GGWaveModule | null = null;
let initPromise: Promise<GGWaveModule> | null = null;

/**
 * Initialize the ggwave WASM module
 * Uses dynamic import to avoid blocking page load
 */
export async function initGGWave(): Promise<GGWaveModule> {
  if (ggwaveModule) {
    return ggwaveModule;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    // Dynamic import to defer WASM loading
    // @ts-expect-error - ggwave doesn't have types
    const { default: ggwaveFactory } = await import("ggwave");
    const module: GGWaveModule = await ggwaveFactory();
    ggwaveModule = module;
    module.disableLog();
    return module;
  })();

  return initPromise;
}

/**
 * Create a new ggwave instance for encoding/decoding
 */
export async function createInstance(mode: "rx" | "tx" | "both" = "both"): Promise<GGWaveInstance> {
  const ggwave = await initGGWave();

  const params = ggwave.getDefaultParameters();
  params.sampleFormatInp = ggwave.SampleFormat.GGWAVE_SAMPLE_FORMAT_F32;
  params.sampleFormatOut = ggwave.SampleFormat.GGWAVE_SAMPLE_FORMAT_F32;

  if (mode === "rx") {
    params.operatingMode = ggwave.GGWAVE_OPERATING_MODE_RX;
  } else if (mode === "tx") {
    params.operatingMode = ggwave.GGWAVE_OPERATING_MODE_TX;
  } else {
    params.operatingMode = ggwave.GGWAVE_OPERATING_MODE_RX_AND_TX;
  }

  const instance = ggwave.init(params);

  return { ggwave, instance };
}

/**
 * Free a ggwave instance
 */
export function freeInstance(inst: GGWaveInstance): void {
  inst.ggwave.free(inst.instance);
}

/**
 * Get the protocol enum value from protocol type
 */
function getProtocolEnum(ggwave: GGWaveModule, protocol: ProtocolType): unknown {
  const map: Record<ProtocolType, unknown> = {
    "audible-normal": ggwave.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_NORMAL,
    "audible-fast": ggwave.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_FAST,
    "audible-fastest": ggwave.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_FASTEST,
    "ultrasound-normal": ggwave.ProtocolId.GGWAVE_PROTOCOL_ULTRASOUND_NORMAL,
    "ultrasound-fast": ggwave.ProtocolId.GGWAVE_PROTOCOL_ULTRASOUND_FAST,
    "ultrasound-fastest": ggwave.ProtocolId.GGWAVE_PROTOCOL_ULTRASOUND_FASTEST,
    "dt-normal": ggwave.ProtocolId.GGWAVE_PROTOCOL_DT_NORMAL,
    "dt-fast": ggwave.ProtocolId.GGWAVE_PROTOCOL_DT_FAST,
    "dt-fastest": ggwave.ProtocolId.GGWAVE_PROTOCOL_DT_FASTEST,
  };
  return map[protocol];
}

/**
 * Helper to reinterpret typed array as different type
 * This reinterprets the underlying bytes, not converts values
 */
function convertTypedArray<T extends ArrayBufferView>(
  src: ArrayBufferView,
  type: new (buffer: ArrayBuffer) => T
): T {
  return new type(src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength));
}

/**
 * Encode text to audio waveform
 */
export function encode(
  inst: GGWaveInstance,
  text: string,
  protocol: ProtocolType,
  volume: number = 10
): Float32Array {
  const protocolEnum = getProtocolEnum(inst.ggwave, protocol);
  const waveform = inst.ggwave.encode(inst.instance, text, protocolEnum, volume);

  // The waveform is returned as Int8Array, reinterpret as Float32Array
  return convertTypedArray(waveform, Float32Array);
}

/**
 * Decode audio samples to text
 * Returns empty string if no data decoded yet
 */
export function decode(inst: GGWaveInstance, samples: Float32Array): string {
  // Convert Float32Array to Int8Array (reinterpret bytes, not convert values)
  // This is what ggwave expects for decoding
  const int8Data = convertTypedArray(samples, Int8Array);

  const result = inst.ggwave.decode(inst.instance, int8Data);

  if (result && result.length > 0) {
    // Convert Uint8Array to string using TextDecoder
    return new TextDecoder("utf-8").decode(result);
  }

  return "";
}

/**
 * Decode audio samples to raw bytes
 * Returns null if no data decoded yet
 */
export function decodeRaw(inst: GGWaveInstance, samples: Float32Array): Uint8Array | null {
  // Convert Float32Array to Int8Array (reinterpret bytes, not convert values)
  // This is what ggwave expects for decoding
  const int8Data = convertTypedArray(samples, Int8Array);

  const result = inst.ggwave.decode(inst.instance, int8Data);

  if (result && result.length > 0) {
    // Return a copy of the raw bytes
    return new Uint8Array(result);
  }

  return null;
}

/**
 * Create an AudioBuffer from encoded samples
 */
export function createAudioBuffer(
  audioContext: AudioContext,
  samples: Float32Array
): AudioBuffer {
  const buffer = audioContext.createBuffer(1, samples.length, SAMPLE_RATE);
  buffer.getChannelData(0).set(samples);
  return buffer;
}

/**
 * Create a WAV file blob from encoded samples
 */
export function createWavFile(samples: Float32Array): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = SAMPLE_RATE * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const fileSize = 44 + dataSize;

  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);

  // WAV header
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, fileSize - 8, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  // Audio data (convert float32 to int16)
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const val = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(offset, val, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

/**
 * Get transfer speed in bytes/sec for a protocol
 */
export function getTransferSpeed(protocol: ProtocolType): number {
  const speeds: Record<ProtocolType, number> = {
    "audible-normal": 8,
    "audible-fast": 16,
    "audible-fastest": 32,
    "ultrasound-normal": 8,
    "ultrasound-fast": 16,
    "ultrasound-fastest": 32,
    "dt-normal": 8,
    "dt-fast": 16,
    "dt-fastest": 32,
  };
  return speeds[protocol];
}

/**
 * Estimate transfer time in seconds
 */
export function estimateTransferTime(protocol: ProtocolType, dataBytes: number): number {
  const speed = getTransferSpeed(protocol);
  // Add overhead for ECC and markers
  const totalBytes = dataBytes * 1.3 + 10;
  return totalBytes / speed;
}

/**
 * Derive an AES-GCM key from a password using PBKDF2
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt data with AES-GCM using a password
 * Returns: salt (16 bytes) + iv (12 bytes) + ciphertext
 */
export async function encryptData(data: Uint8Array, password: string): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );

  // Combine: salt + iv + ciphertext
  const result = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
  result.set(salt, 0);
  result.set(iv, salt.length);
  result.set(new Uint8Array(ciphertext), salt.length + iv.length);

  return result;
}

/**
 * Decrypt data with AES-GCM using a password
 * Expects: salt (16 bytes) + iv (12 bytes) + ciphertext
 */
export async function decryptData(encryptedData: Uint8Array, password: string): Promise<Uint8Array> {
  const salt = encryptedData.slice(0, 16);
  const iv = encryptedData.slice(16, 28);
  const ciphertext = encryptedData.slice(28);

  const key = await deriveKey(password, salt);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );

  return new Uint8Array(decrypted);
}

/**
 * Encode file metadata + data into a transferable format
 * Format: [filename length (2 bytes)] + [filename (UTF-8)] + [file data]
 */
export function encodeFilePacket(filename: string, data: Uint8Array): Uint8Array {
  const encoder = new TextEncoder();
  const filenameBytes = encoder.encode(filename);

  if (filenameBytes.length > 65535) {
    throw new Error("Filename too long");
  }

  const packet = new Uint8Array(2 + filenameBytes.length + data.length);
  // Store filename length as 2 bytes (big endian)
  packet[0] = (filenameBytes.length >> 8) & 0xff;
  packet[1] = filenameBytes.length & 0xff;
  packet.set(filenameBytes, 2);
  packet.set(data, 2 + filenameBytes.length);

  return packet;
}

/**
 * Decode file packet back to filename and data
 */
export function decodeFilePacket(packet: Uint8Array): { filename: string; data: Uint8Array } {
  const filenameLength = (packet[0] << 8) | packet[1];
  const decoder = new TextDecoder();
  const filename = decoder.decode(packet.slice(2, 2 + filenameLength));
  const data = packet.slice(2 + filenameLength);

  return { filename, data };
}

// ==================== CHUNKING SYSTEM ====================

/**
 * Maximum safe payload size for ggwave (bytes of raw data before base64)
 * ggwave has a ~140 byte limit, but we use 90 to leave room for headers
 */
export const MAX_CHUNK_SIZE = 90;

/**
 * Chunk header format: [SEQ:TOTAL:CHECKSUM:]
 * SEQ = chunk sequence number (0-indexed)
 * TOTAL = total number of chunks
 * CHECKSUM = simple checksum of the full data (for verification)
 */
export interface ChunkHeader {
  seq: number;
  total: number;
  checksum: string;
}

/**
 * Calculate a simple checksum for data verification
 * Uses first 4 chars of base64(sha256) for brevity
 */
export async function calculateChecksum(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  // Use first 3 bytes, base64 encoded = 4 chars
  const shortHash = btoa(String.fromCharCode(...hashArray.slice(0, 3)));
  return shortHash;
}

/**
 * Split data into chunks for transmission
 * Returns array of strings ready to be encoded with ggwave
 * Format: [SEQ:TOTAL:CHECKSUM:base64data]
 */
export async function createChunks(data: Uint8Array): Promise<string[]> {
  const checksum = await calculateChecksum(data);
  const base64Data = btoa(String.fromCharCode(...data));

  // Calculate how much base64 data fits per chunk
  // Header format: "000:000:XXXX:" = 13 chars
  const headerSize = 13;
  const maxBase64PerChunk = MAX_CHUNK_SIZE - headerSize;

  const chunks: string[] = [];
  const totalChunks = Math.ceil(base64Data.length / maxBase64PerChunk);

  for (let i = 0; i < totalChunks; i++) {
    const start = i * maxBase64PerChunk;
    const end = Math.min(start + maxBase64PerChunk, base64Data.length);
    const chunkData = base64Data.slice(start, end);

    // Format: SEQ:TOTAL:CHECKSUM:DATA
    const header = `${String(i).padStart(3, "0")}:${String(totalChunks).padStart(3, "0")}:${checksum}:`;
    chunks.push(header + chunkData);
  }

  return chunks;
}

/**
 * Parse a chunk header from received data
 * Returns null if not a valid chunk format
 */
export function parseChunkHeader(data: string): { header: ChunkHeader; payload: string } | null {
  // Format: SEQ:TOTAL:CHECKSUM:DATA
  const match = data.match(/^(\d{3}):(\d{3}):([A-Za-z0-9+/=]{4}):(.*)$/);
  if (!match) {
    return null;
  }

  return {
    header: {
      seq: parseInt(match[1], 10),
      total: parseInt(match[2], 10),
      checksum: match[3],
    },
    payload: match[4],
  };
}

/**
 * Chunk collector for receiving multi-chunk transmissions
 */
export class ChunkCollector {
  private chunks: Map<number, string> = new Map();
  private totalChunks: number = 0;
  private expectedChecksum: string = "";

  /**
   * Add a received chunk
   * Returns: { complete: boolean, progress: number, data?: Uint8Array, error?: string }
   */
  async addChunk(rawData: string): Promise<{
    complete: boolean;
    progress: number;
    data?: Uint8Array;
    error?: string;
  }> {
    const parsed = parseChunkHeader(rawData);

    if (!parsed) {
      // Not a chunked format, treat as single transmission
      try {
        const data = Uint8Array.from(atob(rawData), (c) => c.charCodeAt(0));
        return { complete: true, progress: 1, data };
      } catch {
        return { complete: true, progress: 1, error: "Invalid data format" };
      }
    }

    const { header, payload } = parsed;

    // Initialize or verify consistency
    if (this.totalChunks === 0) {
      this.totalChunks = header.total;
      this.expectedChecksum = header.checksum;
    } else if (
      this.totalChunks !== header.total ||
      this.expectedChecksum !== header.checksum
    ) {
      return {
        complete: false,
        progress: this.chunks.size / this.totalChunks,
        error: "Chunk mismatch - received chunk from different transmission",
      };
    }

    // Store chunk (ignore duplicates)
    if (!this.chunks.has(header.seq)) {
      this.chunks.set(header.seq, payload);
    }

    const progress = this.chunks.size / this.totalChunks;

    // Check if complete
    if (this.chunks.size === this.totalChunks) {
      // Reassemble in order
      let fullBase64 = "";
      for (let i = 0; i < this.totalChunks; i++) {
        const chunk = this.chunks.get(i);
        if (!chunk) {
          return { complete: false, progress, error: `Missing chunk ${i}` };
        }
        fullBase64 += chunk;
      }

      // Decode base64
      let data: Uint8Array;
      try {
        data = Uint8Array.from(atob(fullBase64), (c) => c.charCodeAt(0));
      } catch {
        return { complete: false, progress, error: "Failed to decode assembled data" };
      }

      // Verify checksum
      const actualChecksum = await calculateChecksum(data);
      if (actualChecksum !== this.expectedChecksum) {
        return {
          complete: false,
          progress,
          error: `Checksum mismatch: expected ${this.expectedChecksum}, got ${actualChecksum}`,
        };
      }

      return { complete: true, progress: 1, data };
    }

    return { complete: false, progress };
  }

  /**
   * Get list of missing chunk indices
   */
  getMissingChunks(): number[] {
    const missing: number[] = [];
    for (let i = 0; i < this.totalChunks; i++) {
      if (!this.chunks.has(i)) {
        missing.push(i);
      }
    }
    return missing;
  }

  /**
   * Reset the collector
   */
  reset(): void {
    this.chunks.clear();
    this.totalChunks = 0;
    this.expectedChecksum = "";
  }

  /**
   * Get current state
   */
  getState(): { received: number; total: number; checksum: string } {
    return {
      received: this.chunks.size,
      total: this.totalChunks,
      checksum: this.expectedChecksum,
    };
  }
}
