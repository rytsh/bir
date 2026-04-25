// Shared utilities for PDF tools.

export function downloadBlob(data: BlobPart | BlobPart[], filename: string, mimeType = "application/pdf"): void {
  const parts = Array.isArray(data) ? data : [data];
  const blob = new Blob(parts, { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadPdfBytes(bytes: Uint8Array, filename: string): void {
  // Make a fresh copy so callers can keep using the buffer
  const copy = bytes.slice();
  downloadBlob(copy as unknown as BlobPart, filename, "application/pdf");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function stripPdfExtension(name: string): string {
  return name.replace(/\.pdf$/i, "");
}

// Parse page-range strings like "1-3, 5, 7-9" into 0-indexed page numbers.
// Returns null if parsing fails. Out-of-range numbers are filtered out.
export function parsePageRanges(input: string, totalPages: number): number[] | null {
  const trimmed = input.trim();
  if (!trimmed) return [];

  const pages = new Set<number>();
  const parts = trimmed.split(",");

  for (const partRaw of parts) {
    const part = partRaw.trim();
    if (!part) continue;

    if (part.includes("-")) {
      const segments = part.split("-").map((s) => s.trim());
      if (segments.length !== 2) return null;
      const [aStr, bStr] = segments;
      const a = parseInt(aStr, 10);
      const b = parseInt(bStr, 10);
      if (Number.isNaN(a) || Number.isNaN(b) || a < 1 || b < 1 || a > b) return null;
      for (let i = a; i <= b; i++) {
        if (i <= totalPages) pages.add(i - 1);
      }
    } else {
      const n = parseInt(part, 10);
      if (Number.isNaN(n) || n < 1) return null;
      if (n <= totalPages) pages.add(n - 1);
    }
  }

  return Array.from(pages).sort((a, b) => a - b);
}

// Format a list of 0-indexed pages as a human range string ("1-3, 5, 7-9")
export function formatPageRanges(pages: number[]): string {
  if (pages.length === 0) return "";
  const sorted = [...pages].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i <= sorted.length; i++) {
    const current = sorted[i];
    if (current !== prev + 1) {
      ranges.push(start === prev ? `${start + 1}` : `${start + 1}-${prev + 1}`);
      start = current;
    }
    prev = current;
  }

  return ranges.join(", ");
}

export async function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return await file.arrayBuffer();
}

export async function fileToUint8Array(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

export async function computeSha256Hex(data: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", data.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
