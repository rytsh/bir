export interface SpriteSize { width: number; height: number; }
export interface SpritePlacement extends SpriteSize { x: number; y: number; }
export interface SpriteLayout { width: number; height: number; frames: SpritePlacement[]; }

export function packSprites(sizes: SpriteSize[], mode: "grid" | "shelf", columns: number, padding: number, maxWidth: number, powerOfTwo: boolean): SpriteLayout {
  if (!sizes.length) return { width: 1, height: 1, frames: [] };
  if (sizes.some((size) => !Number.isInteger(size.width) || !Number.isInteger(size.height) || size.width < 1 || size.height < 1)) throw new Error("Sprite dimensions must be positive integers.");
  if (![columns, padding, maxWidth].every(Number.isInteger) || columns < 1 || padding < 0 || maxWidth < 1) throw new Error("Use whole numbers for columns, padding, and width.");
  const frames: SpritePlacement[] = [];
  let width: number = 0; let height: number = 0;
  if (mode === "grid") {
    const cellWidth: number = Math.max(...sizes.map((size) => size.width));
    const cellHeight: number = Math.max(...sizes.map((size) => size.height));
    const count: number = Math.min(columns, sizes.length);
    sizes.forEach((size, index) => frames.push({ ...size, x: padding + (index % count) * (cellWidth + padding), y: padding + Math.floor(index / count) * (cellHeight + padding) }));
    width = count * (cellWidth + padding) + padding;
    height = Math.ceil(sizes.length / count) * (cellHeight + padding) + padding;
  } else {
    let x: number = padding; let y: number = padding; let rowHeight: number = 0;
    for (const size of sizes) {
      if (size.width + padding * 2 > maxWidth) throw new Error("A sprite is wider than the atlas width. Increase the width.");
      if (x > padding && x + size.width + padding > maxWidth) { x = padding; y += rowHeight + padding; rowHeight = 0; }
      frames.push({ ...size, x, y });
      x += size.width + padding; rowHeight = Math.max(rowHeight, size.height);
      width = Math.max(width, x); height = Math.max(height, y + rowHeight + padding);
    }
  }
  if (powerOfTwo) { width = 2 ** Math.ceil(Math.log2(width)); height = 2 ** Math.ceil(Math.log2(height)); }
  if (width > 8192 || height > 8192 || width * height > 32_000_000) throw new Error("Atlas exceeds 8192 px per side or 32 MP. Reduce columns, padding, or image sizes.");
  return { width, height, frames };
}

export function sliceSheet(width: number, height: number, cellWidth: number, cellHeight: number, margin: number, spacing: number): SpritePlacement[] {
  if (![width, height, cellWidth, cellHeight, margin, spacing].every(Number.isInteger) || cellWidth < 1 || cellHeight < 1 || margin < 0 || spacing < 0) throw new Error("Use positive whole-number cell dimensions and non-negative margin/spacing.");
  const frames: SpritePlacement[] = [];
  for (let y: number = margin; y + cellHeight <= height - margin; y += cellHeight + spacing) {
    for (let x: number = margin; x + cellWidth <= width - margin; x += cellWidth + spacing) {
      if (frames.length >= 1024) throw new Error("More than 1024 frames. Increase the cell dimensions.");
      frames.push({ x, y, width: cellWidth, height: cellHeight });
    }
  }
  if (!frames.length) throw new Error("No complete cells fit. Check cell dimensions and margins.");
  return frames;
}
