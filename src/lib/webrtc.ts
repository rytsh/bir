/**
 * WebRTC utilities for peer-to-peer connections
 */

// Preset STUN servers
export const STUN_SERVER_PRESETS: { name: string; url: string }[] = [
  { name: "Google", url: "stun:stun.l.google.com:19302" },
  { name: "Cloudflare", url: "stun:stun.cloudflare.com:3478" },
  { name: "Twilio", url: "stun:global.stun.twilio.com:3478" },
  { name: "Mozilla", url: "stun:stun.services.mozilla.com:3478" },
];

// Default ICE servers (Google + Cloudflare)
export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

/**
 * Build ICE servers config from selected STUN URLs
 */
export function buildIceServers(stunUrls: string[]): RTCIceServer[] {
  return stunUrls.filter((url) => url.trim()).map((url) => ({ urls: url }));
}

export interface ConnectionData {
  type: "offer" | "answer";
  sdp: string;
  candidates: RTCIceCandidate[];
}

/**
 * Compress and encode connection data for sharing
 */
export function encodeConnectionData(data: ConnectionData): string {
  const json = JSON.stringify(data);
  // Use base64url encoding (URL-safe)
  const encoded = btoa(json)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return encoded;
}

/**
 * Decode connection data from shared string
 */
export function decodeConnectionData(encoded: string): ConnectionData | null {
  try {
    // Restore standard base64 from base64url
    let base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    // Add padding if needed
    while (base64.length % 4) {
      base64 += "=";
    }
    const json = atob(base64);
    return JSON.parse(json) as ConnectionData;
  } catch {
    return null;
  }
}

/**
 * Generate a shareable URL with connection data
 */
export function generateShareURL(data: ConnectionData, baseUrl: string): string {
  const encoded = encodeConnectionData(data);
  const url = new URL(baseUrl);
  url.searchParams.set(data.type, encoded);
  return url.toString();
}

/**
 * Parse connection data from URL parameters
 */
export function parseURLParams(url: string): { type: "offer" | "answer"; data: ConnectionData } | null {
  try {
    const urlObj = new URL(url);
    const offerParam = urlObj.searchParams.get("offer");
    const answerParam = urlObj.searchParams.get("answer");

    if (offerParam) {
      const data = decodeConnectionData(offerParam);
      if (data && data.type === "offer") {
        return { type: "offer", data };
      }
    }

    if (answerParam) {
      const data = decodeConnectionData(answerParam);
      if (data && data.type === "answer") {
        return { type: "answer", data };
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * File chunk metadata for file transfer
 */
export interface FileChunk {
  id: string;
  name: string;
  type: string;
  size: number;
  chunkIndex: number;
  totalChunks: number;
  data: ArrayBuffer;
}

export interface FileMetadata {
  id: string;
  name: string;
  type: string;
  size: number;
  totalChunks: number;
}

// Chunk size for file transfer (16KB)
export const FILE_CHUNK_SIZE = 16384;

/**
 * Split a file into chunks for transfer
 */
export async function* splitFileIntoChunks(
  file: File,
  chunkSize: number = FILE_CHUNK_SIZE
): AsyncGenerator<{ chunkIndex: number; totalChunks: number; data: ArrayBuffer }> {
  const totalChunks = Math.ceil(file.size / chunkSize);

  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const blob = file.slice(start, end);
    const data = await blob.arrayBuffer();

    yield {
      chunkIndex: i,
      totalChunks,
      data,
    };
  }
}

/**
 * Reassemble chunks into a file
 */
export function assembleChunks(chunks: ArrayBuffer[], metadata: FileMetadata): Blob {
  return new Blob(chunks, { type: metadata.type });
}

/**
 * Generate a unique ID for file transfers
 */
export function generateFileId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Format duration in seconds to mm:ss
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}
