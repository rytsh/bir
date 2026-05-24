export interface AnsiColor {
  name: string;
  code: number;
  hex: string;
}

export type AnsiStyleKey =
  | "bold"
  | "dim"
  | "italic"
  | "underline"
  | "blink"
  | "reverse"
  | "hidden"
  | "strikethrough";

export interface AnsiStyleState {
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  blink: boolean;
  reverse: boolean;
  hidden: boolean;
  strikethrough: boolean;
}

export interface AnsiStyleOption {
  key: AnsiStyleKey;
  label: string;
  code: string;
  resetCode: string;
}

export type AnsiEscapeFormat = "terminal" | "hex" | "octal" | "caret" | "unicode" | "shell";

export interface AnsiEscapeFormatOption {
  id: AnsiEscapeFormat;
  name: string;
  shortLabel: string;
  referencePrefix: string;
  description: string;
}

export const ansiColors: readonly AnsiColor[] = [
  { name: "Black", code: 0, hex: "#000000" },
  { name: "Red", code: 1, hex: "#cc0000" },
  { name: "Green", code: 2, hex: "#00cc00" },
  { name: "Yellow", code: 3, hex: "#cccc00" },
  { name: "Blue", code: 4, hex: "#0000cc" },
  { name: "Magenta", code: 5, hex: "#cc00cc" },
  { name: "Cyan", code: 6, hex: "#00cccc" },
  { name: "White", code: 7, hex: "#cccccc" },
];

export const ansiBrightColors: readonly AnsiColor[] = [
  { name: "Bright Black", code: 8, hex: "#666666" },
  { name: "Bright Red", code: 9, hex: "#ff0000" },
  { name: "Bright Green", code: 10, hex: "#00ff00" },
  { name: "Bright Yellow", code: 11, hex: "#ffff00" },
  { name: "Bright Blue", code: 12, hex: "#0000ff" },
  { name: "Bright Magenta", code: 13, hex: "#ff00ff" },
  { name: "Bright Cyan", code: 14, hex: "#00ffff" },
  { name: "Bright White", code: 15, hex: "#ffffff" },
];

export const allAnsiColors: readonly AnsiColor[] = [...ansiColors, ...ansiBrightColors];

export const ansiStyleOptions: readonly AnsiStyleOption[] = [
  { key: "bold", label: "Bold", code: "1", resetCode: "22" },
  { key: "dim", label: "Dim", code: "2", resetCode: "22" },
  { key: "italic", label: "Italic", code: "3", resetCode: "23" },
  { key: "underline", label: "Underline", code: "4", resetCode: "24" },
  { key: "blink", label: "Blink", code: "5", resetCode: "25" },
  { key: "reverse", label: "Reverse", code: "7", resetCode: "27" },
  { key: "hidden", label: "Hidden", code: "8", resetCode: "28" },
  { key: "strikethrough", label: "Strikethrough", code: "9", resetCode: "29" },
];

export const ansiEscapeFormats: readonly AnsiEscapeFormatOption[] = [
  {
    id: "terminal",
    name: "Terminal ESC (raw)",
    shortLabel: "Raw ESC",
    referencePrefix: "ESC[",
    description: "Copies real escape bytes for terminals and files that already accept ANSI.",
  },
  {
    id: "hex",
    name: "Hex (\\x1b)",
    shortLabel: "\\x1b",
    referencePrefix: "\\x1b[",
    description: "Use in JavaScript, Python, C, and other string literals.",
  },
  {
    id: "octal",
    name: "Octal (\\033)",
    shortLabel: "\\033",
    referencePrefix: "\\033[",
    description: "Use in shell scripts and older terminal examples.",
  },
  {
    id: "caret",
    name: "Caret (\\e)",
    shortLabel: "\\e",
    referencePrefix: "\\e[",
    description: "Use with bash/zsh tools that understand echo -e style escapes.",
  },
  {
    id: "unicode",
    name: "Unicode (\\u001b)",
    shortLabel: "\\u001b",
    referencePrefix: "\\u001b[",
    description: "Use in JSON, JavaScript strings, and Discord/code-block friendly text.",
  },
  {
    id: "shell",
    name: "Shell ($'\\e')",
    shortLabel: "$'\\e'",
    referencePrefix: "$'\\e[",
    description: "Copies a bash/zsh ANSI-C quoted string ready for printf/echo contexts.",
  },
];

export function createDefaultAnsiStyleState(): AnsiStyleState {
  return {
    bold: false,
    dim: false,
    italic: false,
    underline: false,
    blink: false,
    reverse: false,
    hidden: false,
    strikethrough: false,
  };
}

export function normalizeHexColor(hex: string): string {
  const cleaned = hex.replace("#", "").trim();
  const value = cleaned.length === 3
    ? cleaned.split("").map((char) => char + char).join("")
    : cleaned.padEnd(6, "0").slice(0, 6);

  return `#${value.toLowerCase()}`;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = normalizeHexColor(hex).slice(1);
  const n = Number.parseInt(value, 16);

  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  };
}

export function getAnsiColorHex(code: number): string {
  return allAnsiColors.find((color) => color.code === code)?.hex || "#cccccc";
}

export function getAnsiFgColorHex(code: number): string {
  if (code >= 30 && code <= 37) {
    return allAnsiColors[code - 30]?.hex || "#cccccc";
  }
  if (code >= 90 && code <= 97) {
    return allAnsiColors[code - 90 + 8]?.hex || "#cccccc";
  }
  return "#cccccc";
}

export function getAnsiBgColorHex(code: number): string {
  if (code >= 40 && code <= 47) {
    return allAnsiColors[code - 40]?.hex || "#000000";
  }
  if (code >= 100 && code <= 107) {
    return allAnsiColors[code - 100 + 8]?.hex || "#000000";
  }
  return "#000000";
}

export function getAnsiStyleCodes(style: AnsiStyleState): string[] {
  return ansiStyleOptions
    .filter((option) => style[option.key])
    .map((option) => option.code);
}

export function getAnsiEscapeFormat(format: AnsiEscapeFormat): AnsiEscapeFormatOption {
  return ansiEscapeFormats.find((option) => option.id === format) ?? ansiEscapeFormats[0];
}

export function formatAnsiEscapes(raw: string, format: AnsiEscapeFormat): string {
  if (format === "terminal") return raw;

  if (format === "shell") {
    return `$'${raw
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/\x1b/g, "\\e")
      .replace(/\n/g, "\\n")}'`;
  }

  const replacement = getAnsiEscapeFormat(format).referencePrefix.slice(0, -1);
  return raw.replace(/\x1b/g, replacement);
}

export function getAnsiForegroundCode(hex: string): string {
  const paletteColor = allAnsiColors.find((color) => normalizeHexColor(color.hex) === normalizeHexColor(hex));
  if (paletteColor) {
    return paletteColor.code < 8 ? `${30 + paletteColor.code}` : `${90 + paletteColor.code - 8}`;
  }

  const rgb = hexToRgb(hex);
  return `38;2;${rgb.r};${rgb.g};${rgb.b}`;
}

export function getAnsiBackgroundCode(hex: string): string {
  const paletteColor = allAnsiColors.find((color) => normalizeHexColor(color.hex) === normalizeHexColor(hex));
  if (paletteColor) {
    return paletteColor.code < 8 ? `${40 + paletteColor.code}` : `${100 + paletteColor.code - 8}`;
  }

  const rgb = hexToRgb(hex);
  return `48;2;${rgb.r};${rgb.g};${rgb.b}`;
}

export function getAnsiStyleCss(style: AnsiStyleState, fg: string, bg: string): string {
  const styles: string[] = [];

  if (style.reverse) {
    styles.push(`color: ${bg};`);
    styles.push(`background-color: ${fg};`);
  } else {
    styles.push(`color: ${fg};`);
    styles.push(`background-color: ${bg};`);
  }

  if (style.bold) styles.push("font-weight: bold;");
  if (style.dim) styles.push("opacity: 0.5;");
  if (style.italic) styles.push("font-style: italic;");
  if (style.hidden) styles.push("color: transparent;");
  if (style.blink) styles.push("animation: blink 1s step-end infinite;");

  const decorations: string[] = [];
  if (style.underline) decorations.push("underline");
  if (style.strikethrough) decorations.push("line-through");
  if (decorations.length > 0) {
    styles.push(`text-decoration: ${decorations.join(" ")};`);
  }

  return styles.join(" ");
}
