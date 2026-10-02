export type CharCategory =
  | "letter"
  | "digit"
  | "space"
  | "punctuation"
  | "symbol"
  | "emoji"
  | "control"
  | "invisible"
  | "combining"
  | "other";

export interface CharInfo {
  /** The grapheme or code point text. */
  char: string;
  codePoint: number;
  /** "U+200B" */
  hex: string;
  name: string;
  category: CharCategory;
  /** UTF-8 bytes for this code point. */
  utf8: number[];
  /** UTF-16 code units for this code point. */
  utf16: number[];
  /** Index (in code points) within the input. */
  index: number;
  suspicious: boolean;
  /** Visible representation used in the rendered view. */
  display: string;
}

export interface Finding {
  label: string;
  count: number;
  severity: "info" | "warning" | "danger";
  description: string;
}

export interface StringStats {
  utf16Length: number;
  codePoints: number;
  graphemes: number;
  utf8Bytes: number;
  utf16Bytes: number;
  utf32Bytes: number;
  words: number;
  lines: number;
  nonAscii: number;
  isAscii: boolean;
  isNfc: boolean;
  isNfd: boolean;
  isNfkc: boolean;
  lineEndings: { lf: number; crlf: number; cr: number };
  scripts: string[];
}

const NAMED_CHARS: Record<number, string> = {
  0x00: "NULL",
  0x07: "BELL",
  0x08: "BACKSPACE",
  0x09: "CHARACTER TABULATION",
  0x0a: "LINE FEED (LF)",
  0x0b: "LINE TABULATION",
  0x0c: "FORM FEED (FF)",
  0x0d: "CARRIAGE RETURN (CR)",
  0x1b: "ESCAPE",
  0x20: "SPACE",
  0x7f: "DELETE",
  0x85: "NEXT LINE (NEL)",
  0xa0: "NO-BREAK SPACE",
  0xad: "SOFT HYPHEN",
  0x034f: "COMBINING GRAPHEME JOINER",
  0x061c: "ARABIC LETTER MARK",
  0x115f: "HANGUL CHOSEONG FILLER",
  0x1160: "HANGUL JUNGSEONG FILLER",
  0x1680: "OGHAM SPACE MARK",
  0x180e: "MONGOLIAN VOWEL SEPARATOR",
  0x2000: "EN QUAD",
  0x2001: "EM QUAD",
  0x2002: "EN SPACE",
  0x2003: "EM SPACE",
  0x2004: "THREE-PER-EM SPACE",
  0x2005: "FOUR-PER-EM SPACE",
  0x2006: "SIX-PER-EM SPACE",
  0x2007: "FIGURE SPACE",
  0x2008: "PUNCTUATION SPACE",
  0x2009: "THIN SPACE",
  0x200a: "HAIR SPACE",
  0x200b: "ZERO WIDTH SPACE",
  0x200c: "ZERO WIDTH NON-JOINER",
  0x200d: "ZERO WIDTH JOINER",
  0x200e: "LEFT-TO-RIGHT MARK",
  0x200f: "RIGHT-TO-LEFT MARK",
  0x2010: "HYPHEN",
  0x2011: "NON-BREAKING HYPHEN",
  0x2012: "FIGURE DASH",
  0x2013: "EN DASH",
  0x2014: "EM DASH",
  0x2018: "LEFT SINGLE QUOTATION MARK",
  0x2019: "RIGHT SINGLE QUOTATION MARK",
  0x201c: "LEFT DOUBLE QUOTATION MARK",
  0x201d: "RIGHT DOUBLE QUOTATION MARK",
  0x2026: "HORIZONTAL ELLIPSIS",
  0x2028: "LINE SEPARATOR",
  0x2029: "PARAGRAPH SEPARATOR",
  0x202a: "LEFT-TO-RIGHT EMBEDDING",
  0x202b: "RIGHT-TO-LEFT EMBEDDING",
  0x202c: "POP DIRECTIONAL FORMATTING",
  0x202d: "LEFT-TO-RIGHT OVERRIDE",
  0x202e: "RIGHT-TO-LEFT OVERRIDE",
  0x202f: "NARROW NO-BREAK SPACE",
  0x205f: "MEDIUM MATHEMATICAL SPACE",
  0x2060: "WORD JOINER",
  0x2061: "FUNCTION APPLICATION",
  0x2062: "INVISIBLE TIMES",
  0x2063: "INVISIBLE SEPARATOR",
  0x2064: "INVISIBLE PLUS",
  0x2066: "LEFT-TO-RIGHT ISOLATE",
  0x2067: "RIGHT-TO-LEFT ISOLATE",
  0x2068: "FIRST STRONG ISOLATE",
  0x2069: "POP DIRECTIONAL ISOLATE",
  0x2212: "MINUS SIGN",
  0x3000: "IDEOGRAPHIC SPACE",
  0x3164: "HANGUL FILLER",
  0xfe0e: "VARIATION SELECTOR-15 (text)",
  0xfe0f: "VARIATION SELECTOR-16 (emoji)",
  0xfeff: "ZERO WIDTH NO-BREAK SPACE (BOM)",
  0xfffc: "OBJECT REPLACEMENT CHARACTER",
  0xfffd: "REPLACEMENT CHARACTER",
};

const C0_NAMES = [
  "NUL", "SOH", "STX", "ETX", "EOT", "ENQ", "ACK", "BEL", "BS", "HT", "LF", "VT", "FF", "CR", "SO", "SI",
  "DLE", "DC1", "DC2", "DC3", "DC4", "NAK", "SYN", "ETB", "CAN", "EM", "SUB", "ESC", "FS", "GS", "RS", "US",
];

/** Latin lookalikes from Cyrillic / Greek commonly used in homoglyph attacks. */
const CONFUSABLES: Record<number, string> = {
  0x0430: "a", 0x0435: "e", 0x043e: "o", 0x0440: "p", 0x0441: "c", 0x0443: "y", 0x0445: "x", 0x0456: "i",
  0x0458: "j", 0x04bb: "h", 0x0501: "d", 0x0410: "A", 0x0412: "B", 0x0415: "E", 0x041a: "K", 0x041c: "M",
  0x041d: "H", 0x041e: "O", 0x0420: "P", 0x0421: "C", 0x0422: "T", 0x0425: "X", 0x0405: "S", 0x0406: "I",
  0x0408: "J", 0x03bf: "o", 0x03b1: "a", 0x03bd: "v", 0x03c1: "p", 0x0391: "A", 0x0392: "B", 0x0395: "E",
  0x0396: "Z", 0x0397: "H", 0x0399: "I", 0x039a: "K", 0x039c: "M", 0x039d: "N", 0x039f: "O", 0x03a1: "P",
  0x03a4: "T", 0x03a5: "Y", 0x03a7: "X", 0xff41: "a", 0xff45: "e", 0xff4f: "o",
};

const SMART_PUNCTUATION: Record<number, string> = {
  0x2018: "'", 0x2019: "'", 0x201a: "'", 0x201b: "'", 0x2032: "'",
  0x201c: '"', 0x201d: '"', 0x201e: '"', 0x201f: '"', 0x2033: '"', 0x00ab: '"', 0x00bb: '"',
  0x2010: "-", 0x2011: "-", 0x2012: "-", 0x2013: "-", 0x2014: "-", 0x2015: "-", 0x2212: "-",
  0x2026: "...", 0x00a0: " ", 0x202f: " ", 0x2007: " ", 0x2009: " ", 0x200a: " ", 0x3000: " ",
  0x2002: " ", 0x2003: " ", 0x2004: " ", 0x2005: " ", 0x2006: " ", 0x2008: " ", 0x205f: " ",
};

const BIDI_CONTROLS = new Set([0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069]);
const DIRECTION_MARKS = new Set([0x200e, 0x200f, 0x061c]);
const ZERO_WIDTH = new Set([0x200b, 0x200c, 0x200d, 0x2060, 0xfeff, 0x180e, 0x2061, 0x2062, 0x2063, 0x2064, 0x034f]);

export const toHex = (codePoint: number): string =>
  `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;

export const utf8Bytes = (codePoint: number): number[] => {
  if (codePoint < 0x80) return [codePoint];
  if (codePoint < 0x800) return [0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f)];
  if (codePoint < 0x10000) {
    return [0xe0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f)];
  }
  return [
    0xf0 | (codePoint >> 18),
    0x80 | ((codePoint >> 12) & 0x3f),
    0x80 | ((codePoint >> 6) & 0x3f),
    0x80 | (codePoint & 0x3f),
  ];
};

const utf16Units = (codePoint: number): number[] => {
  if (codePoint < 0x10000) return [codePoint];
  const offset = codePoint - 0x10000;
  return [0xd800 + (offset >> 10), 0xdc00 + (offset & 0x3ff)];
};

const isVariationSelector = (codePoint: number): boolean =>
  (codePoint >= 0xfe00 && codePoint <= 0xfe0f) || (codePoint >= 0xe0100 && codePoint <= 0xe01ef);

const isTagCharacter = (codePoint: number): boolean => codePoint >= 0xe0000 && codePoint <= 0xe007f;

const isPictographic = (char: string | undefined): boolean =>
  char !== undefined && /\p{Extended_Pictographic}|\p{Emoji_Modifier}|\uFE0F/u.test(char);

/** ZWJ between two emoji is part of an emoji sequence (👨‍👩‍👧), not a hidden character. */
const isEmojiJoiner = (codePoint: number, previous: string | undefined, next: string | undefined): boolean =>
  codePoint === 0x200d && isPictographic(previous) && isPictographic(next);

/** Tag characters following a black flag form subdivision flags (🏴󠁧󠁢󠁥󠁮󠁧󠁿). */
const isFlagTag = (codePoint: number, sequenceStart: string | undefined): boolean =>
  isTagCharacter(codePoint) && sequenceStart === "\u{1F3F4}";

export const categorize = (char: string, codePoint: number): CharCategory => {
  if (codePoint === 0x20) return "space";
  if (ZERO_WIDTH.has(codePoint) || BIDI_CONTROLS.has(codePoint) || DIRECTION_MARKS.has(codePoint)) return "invisible";
  if (isVariationSelector(codePoint) || isTagCharacter(codePoint) || codePoint === 0xad) return "invisible";
  if (/\p{Cc}/u.test(char)) return "control";
  if (/\p{Zs}|\p{Zl}|\p{Zp}/u.test(char)) return "space";
  if (/\p{M}/u.test(char)) return "combining";
  if (/\p{Extended_Pictographic}/u.test(char) && codePoint > 0xff) return "emoji";
  if (/\p{L}/u.test(char)) return "letter";
  if (/\p{N}/u.test(char)) return "digit";
  if (/\p{P}/u.test(char)) return "punctuation";
  if (/\p{S}/u.test(char)) return "symbol";
  if (/\p{Cf}/u.test(char)) return "invisible";
  return "other";
};

export const charName = (codePoint: number, char: string): string => {
  if (NAMED_CHARS[codePoint]) return NAMED_CHARS[codePoint];
  if (codePoint < 0x20) return `CONTROL ${C0_NAMES[codePoint]}`;
  if (codePoint >= 0x80 && codePoint < 0xa0) return "C1 CONTROL";
  if (CONFUSABLES[codePoint]) {
    const script = /\p{Script=Cyrillic}/u.test(char) ? "CYRILLIC" : /\p{Script=Greek}/u.test(char) ? "GREEK" : "FULLWIDTH";
    return `${script} LETTER (looks like Latin "${CONFUSABLES[codePoint]}")`;
  }
  if (isVariationSelector(codePoint)) return "VARIATION SELECTOR";
  if (isTagCharacter(codePoint)) {
    const tag = codePoint - 0xe0000;
    return tag >= 0x20 && tag < 0x7f ? `TAG "${String.fromCharCode(tag)}"` : "TAG CHARACTER";
  }
  if (codePoint >= 0xe000 && codePoint <= 0xf8ff) return "PRIVATE USE";
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) return "LONE SURROGATE";
  if (codePoint >= 0x41 && codePoint <= 0x5a) return `LATIN CAPITAL LETTER ${char}`;
  if (codePoint >= 0x61 && codePoint <= 0x7a) return `LATIN SMALL LETTER ${char.toUpperCase()}`;
  if (codePoint >= 0x30 && codePoint <= 0x39) return `DIGIT ${char}`;
  return "";
};

const displayFor = (char: string, codePoint: number, category: CharCategory): string => {
  if (codePoint === 0x20) return "·";
  if (codePoint === 0x09) return "→";
  if (codePoint === 0x0a) return "↵";
  if (codePoint === 0x0d) return "␍";
  if (codePoint < 0x20) return String.fromCodePoint(0x2400 + codePoint);
  if (codePoint === 0x7f) return "␡";
  if (category === "invisible" || category === "control" || (category === "space" && codePoint !== 0x20)) {
    return `[${toHex(codePoint).slice(2)}]`;
  }
  if (category === "combining") return `◌${char}`;
  return char;
};

const isSuspicious = (codePoint: number, category: CharCategory): boolean => {
  if (codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d) return false;
  if (category === "invisible" || category === "control") return true;
  if (category === "space" && codePoint !== 0x20) return true;
  if (CONFUSABLES[codePoint]) return true;
  if (codePoint === 0xfffd || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return true;
  return false;
};

const isPartOfEmoji = (chars: string[], index: number): boolean => {
  const codePoint = chars[index].codePointAt(0)!;
  if (isEmojiJoiner(codePoint, chars[index - 1], chars[index + 1])) return true;
  if (codePoint === 0xfe0f && isPictographic(chars[index - 1])) return true;
  if (isTagCharacter(codePoint)) {
    let start = index - 1;
    while (start >= 0 && isTagCharacter(chars[start].codePointAt(0)!)) start--;
    return isFlagTag(codePoint, chars[start]);
  }
  return false;
};

export const inspectChars = (text: string, limit = Infinity): CharInfo[] => {
  const result: CharInfo[] = [];
  const chars = [...text];
  for (let index = 0; index < chars.length && index < limit; index++) {
    const char = chars[index];
    const codePoint = char.codePointAt(0)!;
    const category = isPartOfEmoji(chars, index) ? "emoji" : categorize(char, codePoint);
    result.push({
      char,
      codePoint,
      hex: toHex(codePoint),
      name: charName(codePoint, char),
      category,
      utf8: utf8Bytes(codePoint),
      utf16: utf16Units(codePoint),
      index,
      suspicious: category !== "emoji" && isSuspicious(codePoint, category),
      display: category === "emoji" && !/\p{Extended_Pictographic}/u.test(char)
        ? `[${toHex(codePoint).slice(2)}]`
        : displayFor(char, codePoint, category),
    });
  }
  return result;
};

const countGraphemes = (text: string): number => {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    let count = 0;
    for (const _ of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)) count++;
    return count;
  }
  return [...text].length;
};

const countWords = (text: string): number => {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    let count = 0;
    for (const segment of new Intl.Segmenter(undefined, { granularity: "word" }).segment(text)) {
      if (segment.isWordLike) count++;
    }
    return count;
  }
  return text.split(/\s+/).filter(Boolean).length;
};

const SCRIPT_TESTS: [string, RegExp][] = [
  ["Latin", /\p{Script=Latin}/u],
  ["Cyrillic", /\p{Script=Cyrillic}/u],
  ["Greek", /\p{Script=Greek}/u],
  ["Arabic", /\p{Script=Arabic}/u],
  ["Hebrew", /\p{Script=Hebrew}/u],
  ["Han", /\p{Script=Han}/u],
  ["Hiragana", /\p{Script=Hiragana}/u],
  ["Katakana", /\p{Script=Katakana}/u],
  ["Hangul", /\p{Script=Hangul}/u],
  ["Devanagari", /\p{Script=Devanagari}/u],
  ["Thai", /\p{Script=Thai}/u],
];

export const computeStats = (text: string): StringStats => {
  let utf8 = 0;
  let codePoints = 0;
  let nonAscii = 0;
  for (const char of text) {
    const codePoint = char.codePointAt(0)!;
    utf8 += utf8Bytes(codePoint).length;
    codePoints++;
    if (codePoint > 0x7f) nonAscii++;
  }
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/\n/g) ?? []).length - crlf;
  const cr = (text.match(/\r/g) ?? []).length - crlf;
  return {
    utf16Length: text.length,
    codePoints,
    graphemes: countGraphemes(text),
    utf8Bytes: utf8,
    utf16Bytes: text.length * 2,
    utf32Bytes: codePoints * 4,
    words: countWords(text),
    lines: text ? crlf + lf + cr + 1 : 0,
    nonAscii,
    isAscii: nonAscii === 0,
    isNfc: text === text.normalize("NFC"),
    isNfd: text === text.normalize("NFD"),
    isNfkc: text === text.normalize("NFKC"),
    lineEndings: { lf, crlf, cr },
    scripts: SCRIPT_TESTS.filter(([, regex]) => regex.test(text)).map(([name]) => name),
  };
};

export const findIssues = (text: string, chars: CharInfo[], stats: StringStats): Finding[] => {
  const findings: Finding[] = [];
  const count = (predicate: (info: CharInfo) => boolean): number =>
    chars.filter((info) => info.category !== "emoji" && predicate(info)).length;

  const zeroWidth = count((info) => ZERO_WIDTH.has(info.codePoint) && info.codePoint !== 0xfeff);
  const bom = count((info) => info.codePoint === 0xfeff);
  const bidi = count((info) => BIDI_CONTROLS.has(info.codePoint));
  const marks = count((info) => DIRECTION_MARKS.has(info.codePoint));
  const oddSpaces = count((info) => info.category === "space" && info.codePoint !== 0x20);
  const controls = count(
    (info) => info.category === "control" && ![0x09, 0x0a, 0x0d].includes(info.codePoint),
  );
  const confusables = count((info) => CONFUSABLES[info.codePoint] !== undefined);
  const smart = count((info) => SMART_PUNCTUATION[info.codePoint] !== undefined && info.category !== "space");
  const replacement = count((info) => info.codePoint === 0xfffd);
  const tags = count((info) => isTagCharacter(info.codePoint));
  const softHyphen = count((info) => info.codePoint === 0xad);

  if (bidi) {
    findings.push({
      label: "Bidirectional override / isolate",
      count: bidi,
      severity: "danger",
      description: "Can visually reorder text (Trojan Source, CVE-2021-42574). Dangerous in source code and filenames.",
    });
  }
  if (tags) {
    findings.push({
      label: "Unicode tag characters",
      count: tags,
      severity: "danger",
      description: "Invisible characters that can smuggle hidden ASCII text (e.g. prompt injection).",
    });
  }
  if (confusables) {
    findings.push({
      label: "Homoglyphs (Latin lookalikes)",
      count: confusables,
      severity: "danger",
      description: "Cyrillic/Greek/fullwidth letters that look like Latin. Common in phishing domains and spoofed identifiers.",
    });
  }
  if (zeroWidth) {
    findings.push({
      label: "Zero-width characters",
      count: zeroWidth,
      severity: "warning",
      description: "Invisible characters that break string equality, search, and copy-paste of code or passwords.",
    });
  }
  if (bom) {
    findings.push({
      label: "Byte Order Mark (BOM)",
      count: bom,
      severity: "warning",
      description: "U+FEFF often breaks shebangs, JSON/CSV parsers, and shell scripts when it appears at the start of a file.",
    });
  }
  if (controls) {
    findings.push({
      label: "Control characters",
      count: controls,
      severity: "warning",
      description: "Non-printable characters (other than tab / newline), e.g. NUL, ESC, or terminal escape sequences.",
    });
  }
  if (replacement) {
    findings.push({
      label: "Replacement character (�)",
      count: replacement,
      severity: "warning",
      description: "Indicates the text was decoded with the wrong encoding at some point (mojibake).",
    });
  }
  if (oddSpaces) {
    findings.push({
      label: "Non-standard spaces",
      count: oddSpaces,
      severity: "warning",
      description: "No-break, thin, em, ideographic and other spaces that look like a normal space but are not.",
    });
  }
  if (marks) {
    findings.push({
      label: "Direction marks (LRM/RLM)",
      count: marks,
      severity: "info",
      description: "Invisible marks that affect bidirectional text layout.",
    });
  }
  if (softHyphen) {
    findings.push({
      label: "Soft hyphens",
      count: softHyphen,
      severity: "info",
      description: "Invisible unless a line breaks at that point; breaks search and equality.",
    });
  }
  if (smart) {
    findings.push({
      label: "Smart punctuation",
      count: smart,
      severity: "info",
      description: "Curly quotes, en/em dashes, ellipsis — usually from word processors. Breaks code and shell commands.",
    });
  }
  if (stats.lineEndings.crlf && (stats.lineEndings.lf || stats.lineEndings.cr)) {
    findings.push({
      label: "Mixed line endings",
      count: stats.lineEndings.crlf + stats.lineEndings.lf + stats.lineEndings.cr,
      severity: "info",
      description: `${stats.lineEndings.lf} LF, ${stats.lineEndings.crlf} CRLF, ${stats.lineEndings.cr} CR.`,
    });
  }
  if (/[ \t]+$/m.test(text)) {
    findings.push({
      label: "Trailing whitespace",
      count: (text.match(/[ \t]+$/gm) ?? []).length,
      severity: "info",
      description: "Spaces or tabs at the end of lines.",
    });
  }
  if (!stats.isNfc) {
    findings.push({
      label: "Not NFC normalized",
      count: 1,
      severity: "info",
      description: "Visually identical text may compare unequal (e.g. é as e + combining accent).",
    });
  }
  const scriptsWithoutCommon = stats.scripts.filter((script) => script !== "Latin");
  if (stats.scripts.includes("Latin") && scriptsWithoutCommon.some((script) => ["Cyrillic", "Greek"].includes(script))) {
    findings.push({
      label: "Mixed scripts",
      count: stats.scripts.length,
      severity: "warning",
      description: `Text mixes ${stats.scripts.join(", ")} — a common sign of homoglyph spoofing.`,
    });
  }
  return findings;
};

export interface CleanOptions {
  removeInvisible: boolean;
  normalizeSpaces: boolean;
  replaceSmartPunctuation: boolean;
  replaceHomoglyphs: boolean;
  removeControl: boolean;
  trimTrailing: boolean;
  normalizeLineEndings: boolean;
  normalization: "none" | "NFC" | "NFKC";
}

export const cleanText = (text: string, options: CleanOptions): string => {
  let result = "";
  const chars = [...text];
  for (let index = 0; index < chars.length; index++) {
    const char = chars[index];
    const codePoint = char.codePointAt(0)!;
    if (isPartOfEmoji(chars, index)) {
      result += char;
      continue;
    }
    if (options.removeInvisible && (ZERO_WIDTH.has(codePoint) || BIDI_CONTROLS.has(codePoint) ||
      DIRECTION_MARKS.has(codePoint) || isTagCharacter(codePoint) || codePoint === 0xad)) {
      continue;
    }
    if (options.removeInvisible && isVariationSelector(codePoint) && codePoint !== 0xfe0f) continue;
    if (options.removeControl && /\p{Cc}/u.test(char) && ![0x09, 0x0a, 0x0d].includes(codePoint)) continue;
    if (options.normalizeSpaces && /\p{Zs}/u.test(char) && codePoint !== 0x20) {
      result += " ";
      continue;
    }
    if (options.replaceSmartPunctuation && SMART_PUNCTUATION[codePoint] && !/\p{Zs}/u.test(char)) {
      result += SMART_PUNCTUATION[codePoint];
      continue;
    }
    if (options.replaceHomoglyphs && CONFUSABLES[codePoint]) {
      result += CONFUSABLES[codePoint];
      continue;
    }
    result += char;
  }
  if (options.normalizeLineEndings) result = result.replace(/\r\n?/g, "\n");
  if (options.trimTrailing) result = result.replace(/[ \t]+$/gm, "");
  if (options.normalization !== "none") result = result.normalize(options.normalization);
  return result;
};

/** Escapes non-ASCII / invisible characters for use in source code. */
export const escapeString = (text: string, style: "js" | "python" | "html" | "css" | "url"): string => {
  let result = "";
  for (const char of text) {
    const codePoint = char.codePointAt(0)!;
    const printableAscii = codePoint >= 0x20 && codePoint < 0x7f;
    switch (style) {
      case "js":
        if (printableAscii && char !== "\\" && char !== '"') result += char;
        else if (char === "\\") result += "\\\\";
        else if (char === '"') result += '\\"';
        else if (codePoint === 0x0a) result += "\\n";
        else if (codePoint === 0x0d) result += "\\r";
        else if (codePoint === 0x09) result += "\\t";
        else if (codePoint > 0xffff) result += `\\u{${codePoint.toString(16).toUpperCase()}}`;
        else result += `\\u${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
        break;
      case "python":
        if (printableAscii && char !== "\\" && char !== '"') result += char;
        else if (char === "\\") result += "\\\\";
        else if (char === '"') result += '\\"';
        else if (codePoint === 0x0a) result += "\\n";
        else if (codePoint === 0x0d) result += "\\r";
        else if (codePoint === 0x09) result += "\\t";
        else if (codePoint > 0xffff) result += `\\U${codePoint.toString(16).padStart(8, "0")}`;
        else if (codePoint > 0xff) result += `\\u${codePoint.toString(16).padStart(4, "0")}`;
        else result += `\\x${codePoint.toString(16).padStart(2, "0")}`;
        break;
      case "html":
        if (printableAscii && !"<>&\"'".includes(char)) result += char;
        else if (codePoint === 0x0a) result += "\n";
        else result += `&#x${codePoint.toString(16).toUpperCase()};`;
        break;
      case "css":
        if (printableAscii && char !== "\\" && char !== '"') result += char;
        else result += `\\${codePoint.toString(16).toUpperCase()} `;
        break;
      case "url":
        result += printableAscii && /[A-Za-z0-9\-_.~]/.test(char) ? char : encodeURIComponent(char);
        break;
    }
  }
  return result;
};
