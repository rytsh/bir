export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "Unknown";
  if (bytes < 1024) return `${bytes} B`;
  const units: string[] = ["KB", "MB", "GB"];
  let value: number = bytes / 1024;
  let unit: number = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${value.toFixed(value < 10 ? 2 : 1)} ${units[unit]}`;
}

export function downloadBlob(data: Blob | Uint8Array | string, name: string, type: string = "application/octet-stream"): void {
  const blob: Blob = data instanceof Blob ? data : new Blob([typeof data === "string" ? data : new Uint8Array(data)], { type });
  const url: string = URL.createObjectURL(blob);
  const link: HTMLAnchorElement = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string" && error) return error;
  return "Something went wrong. Please try again.";
}

export function isEditing(event: KeyboardEvent): boolean {
  return event.target instanceof HTMLElement && (!!event.target.closest("input, textarea, select, [contenteditable='true']") || event.altKey || event.ctrlKey || event.metaKey);
}

export async function loadLocalImage(file: File, maxPixels: number | null = 40_000_000): Promise<HTMLImageElement> {
  const url: string = URL.createObjectURL(file);
  try {
    const image: HTMLImageElement = new Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error(`${file.name}: the browser could not read the image dimensions.`);
    }
    if (maxPixels !== null && image.naturalWidth * image.naturalHeight > maxPixels) {
      throw new Error(`${file.name}: images must be smaller than ${maxPixels / 1_000_000} megapixels.`);
    }
    return image;
  } finally { URL.revokeObjectURL(url); }
}

export function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Unable to export this canvas. Try smaller dimensions.")), "image/png"));
}
