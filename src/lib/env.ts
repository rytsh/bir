export interface EnvEntry {
  key: string;
  value: string;
  comment?: string;
  line: number;
  exported: boolean;
  /** Single-quoted values are taken literally (no ${VAR} expansion). */
  literal?: boolean;
}

export interface EnvParseResult {
  entries: EnvEntry[];
  errors: { line: number; message: string }[];
  duplicates: string[];
}

export type QuoteStyle = "auto" | "double" | "single" | "none";
export type KeyCase = "upper" | "preserve";

export interface FlattenOptions {
  separator: string;
  prefix: string;
  keyCase: KeyCase;
  arrayMode: "index" | "json" | "comma";
}

export interface EnvStringifyOptions {
  quote: QuoteStyle;
  exportPrefix: boolean;
}

export interface UnflattenOptions {
  separator: string;
  stripPrefix: string;
  lowercaseKeys: boolean;
  inferTypes: boolean;
  nest: boolean;
}

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

const unescapeDoubleQuoted = (value: string): string =>
  value.replace(/\\([nrt"\\$])/g, (_, char: string) => {
    switch (char) {
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      default:
        return char;
    }
  });

/**
 * Parses dotenv syntax: comments, `export` prefix, single/double/backtick quotes,
 * multi-line quoted values, inline comments after unquoted values, and escapes in double quotes.
 */
export const parseEnv = (text: string): EnvParseResult => {
  const entries: EnvEntry[] = [];
  const errors: { line: number; message: string }[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let pendingComment: string[] = [];

  for (let index = 0; index < lines.length; index++) {
    const lineNumber = index + 1;
    const raw = lines[index];
    const trimmed = raw.trim();

    if (!trimmed) {
      pendingComment = [];
      continue;
    }
    if (trimmed.startsWith("#")) {
      pendingComment.push(trimmed.replace(/^#\s?/, ""));
      continue;
    }

    const match = trimmed.match(/^(export\s+)?([^=:\s]+)\s*[=:]\s?(.*)$/);
    if (!match) {
      errors.push({ line: lineNumber, message: `Expected KEY=value, got "${trimmed.slice(0, 40)}"` });
      pendingComment = [];
      continue;
    }

    const [, exportKeyword, key] = match;
    let rest = match[3];
    let value: string;
    let literal = false;

    if (!KEY_PATTERN.test(key)) {
      errors.push({ line: lineNumber, message: `Invalid key "${key}"` });
    }

    const quote = rest[0];
    if (quote === '"' || quote === "'" || quote === "`") {
      let body = rest.slice(1);
      let closing = findClosingQuote(body, quote);
      while (closing === -1 && index + 1 < lines.length) {
        index++;
        body += "\n" + lines[index];
        closing = findClosingQuote(body, quote);
      }
      if (closing === -1) {
        errors.push({ line: lineNumber, message: `Unterminated ${quote} quote for "${key}"` });
        value = body;
      } else {
        value = body.slice(0, closing);
        const trailing = body.slice(closing + 1).trim();
        if (trailing && !trailing.startsWith("#")) {
          errors.push({ line: lineNumber, message: `Unexpected text after closing quote for "${key}"` });
        }
      }
      if (quote === '"') value = unescapeDoubleQuoted(value);
      if (quote === "'") literal = true;
    } else {
      const commentIndex = rest.search(/\s#/);
      if (commentIndex !== -1) rest = rest.slice(0, commentIndex);
      value = rest.trim();
    }

    entries.push({
      key,
      value,
      line: lineNumber,
      exported: Boolean(exportKeyword),
      ...(literal ? { literal } : {}),
      ...(pendingComment.length ? { comment: pendingComment.join("\n") } : {}),
    });
    pendingComment = [];
  }

  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.key)) duplicates.add(entry.key);
    seen.add(entry.key);
  }

  return { entries, errors, duplicates: [...duplicates] };
};

const findClosingQuote = (body: string, quote: string): number => {
  for (let index = 0; index < body.length; index++) {
    if (body[index] === "\\" && quote === '"') {
      index++;
      continue;
    }
    if (body[index] === quote) return index;
  }
  return -1;
};

/** Expands ${VAR}, ${VAR:-default} and $VAR references using earlier entries (and optional extra vars). */
export const expandEnv = (entries: EnvEntry[], extra: Record<string, string> = {}): EnvEntry[] => {
  const values: Record<string, string> = { ...extra };
  return entries.map((entry) => {
    if (entry.literal) {
      values[entry.key] = entry.value;
      return entry;
    }
    const expanded = entry.value.replace(
      /\\\$|\$\{([A-Za-z_][A-Za-z0-9_]*)(?::?-([^}]*))?\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
      (whole, braced: string | undefined, fallback: string | undefined, bare: string | undefined) => {
        if (whole === "\\$") return "$";
        const name = braced ?? bare!;
        const current = values[name];
        if ((current === undefined || current === "") && fallback !== undefined) return fallback;
        return current ?? "";
      },
    );
    values[entry.key] = expanded;
    return { ...entry, value: expanded };
  });
};

const needsQuoting = (value: string): boolean =>
  value === "" ? false : /[\s#"'`$\\=]/.test(value) || value !== value.trim();

const quoteValue = (value: string, style: QuoteStyle, literal = false): string => {
  const effective: QuoteStyle =
    style === "auto"
      ? !needsQuoting(value)
        ? "none"
        : literal && !value.includes("'") && !/[\n\r]/.test(value)
          ? "single"
          : "double"
      : style;
  switch (effective) {
    case "double":
      return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r")}"`;
    case "single":
      return value.includes("'") ? quoteValue(value, "double") : `'${value}'`;
    default:
      return value.includes("\n") ? quoteValue(value, "double") : value;
  }
};

export const stringifyEnv = (entries: EnvEntry[], options: EnvStringifyOptions): string => {
  const lines: string[] = [];
  for (const entry of entries) {
    if (entry.comment) {
      if (lines.length) lines.push("");
      lines.push(...entry.comment.split("\n").map((line) => `# ${line}`));
    }
    lines.push(`${options.exportPrefix ? "export " : ""}${entry.key}=${quoteValue(entry.value, options.quote, entry.literal)}`);
  }
  return lines.length ? lines.join("\n") + "\n" : "";
};

const formatKeySegment = (segment: string, keyCase: KeyCase): string => {
  const cleaned = segment
    .replace(/([a-z0-9])([A-Z])/g, keyCase === "upper" ? "$1_$2" : "$1$2")
    .replace(/[^A-Za-z0-9_]+/g, "_");
  return keyCase === "upper" ? cleaned.toUpperCase() : cleaned;
};

const scalarToString = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

/** Flattens nested JSON into env entries: {db: {host: "x"}} → DB__HOST=x */
export const flattenToEnv = (data: unknown, options: FlattenOptions): EnvEntry[] => {
  const entries: EnvEntry[] = [];
  const visit = (value: unknown, path: string[]): void => {
    if (Array.isArray(value)) {
      if (options.arrayMode === "json") {
        entries.push(makeEntry(path, JSON.stringify(value)));
        return;
      }
      if (options.arrayMode === "comma" && value.every((item) => item === null || typeof item !== "object")) {
        entries.push(makeEntry(path, value.map(scalarToString).join(",")));
        return;
      }
      value.forEach((item, index) => visit(item, [...path, String(index)]));
      return;
    }
    if (value !== null && typeof value === "object") {
      const objectEntries = Object.entries(value as Record<string, unknown>);
      if (objectEntries.length === 0 && path.length) entries.push(makeEntry(path, "{}"));
      for (const [key, child] of objectEntries) visit(child, [...path, key]);
      return;
    }
    entries.push(makeEntry(path, scalarToString(value)));
  };
  const makeEntry = (path: string[], value: string): EnvEntry => ({
    key: options.prefix + path.map((segment) => formatKeySegment(segment, options.keyCase)).join(options.separator),
    value,
    line: entries.length + 1,
    exported: false,
  });

  if (data === null || typeof data !== "object") {
    throw new Error("Input must be an object (or array) to convert to .env");
  }
  visit(data, []);
  return entries;
};

const inferValue = (value: string): unknown => {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (/^-?(0|[1-9]\d{0,14})(\.\d+)?$/.test(value)) return Number(value);
  if ((value.startsWith("{") && value.endsWith("}")) || (value.startsWith("[") && value.endsWith("]"))) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
};

/** Converts env entries into a (optionally nested) object. Numeric path segments become arrays. */
export const unflattenEnv = (entries: EnvEntry[], options: UnflattenOptions): Record<string, unknown> => {
  const root: Record<string, unknown> = {};
  for (const entry of entries) {
    let key = entry.key;
    if (options.stripPrefix) {
      if (!key.startsWith(options.stripPrefix)) continue;
      key = key.slice(options.stripPrefix.length);
    }
    const value = options.inferTypes ? inferValue(entry.value) : entry.value;
    const segments = (options.nest && options.separator ? key.split(options.separator) : [key])
      .filter(Boolean)
      .map((segment) => (options.lowercaseKeys ? segment.toLowerCase() : segment));
    if (segments.length === 0) continue;

    let node: Record<string, unknown> = root;
    for (let index = 0; index < segments.length - 1; index++) {
      const segment = segments[index];
      const existing = node[segment];
      if (existing === null || typeof existing !== "object") node[segment] = {};
      node = node[segment] as Record<string, unknown>;
    }
    node[segments[segments.length - 1]] = value;
  }
  return arrayify(root) as Record<string, unknown>;
};

const arrayify = (value: unknown): unknown => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  for (const key of keys) record[key] = arrayify(record[key]);
  const isArrayLike =
    keys.length > 0 && keys.every((key) => /^\d+$/.test(key)) &&
    keys.map(Number).sort((a, b) => a - b).every((number, index) => number === index);
  return isArrayLike ? keys.sort((a, b) => Number(a) - Number(b)).map((key) => record[key]) : record;
};

const SECRET_PATTERN = /(SECRET|PASSWORD|PASSWD|PWD|TOKEN|API_?KEY|PRIVATE|CREDENTIAL|AUTH|_KEY$|^KEY$|DSN|SALT|CERT)/i;

export const isSecretKey = (key: string): boolean => SECRET_PATTERN.test(key);

/** Builds a .env.example: keeps keys and comments, blanks or placeholders values. */
export const toExample = (entries: EnvEntry[], keepNonSecret: boolean): EnvEntry[] =>
  entries.map((entry) => ({
    ...entry,
    value: keepNonSecret && !isSecretKey(entry.key) ? entry.value : "",
  }));

export const maskValue = (value: string): string => {
  if (value.length <= 4) return "•".repeat(value.length);
  return `${value.slice(0, 2)}${"•".repeat(Math.min(12, value.length - 4))}${value.slice(-2)}`;
};
