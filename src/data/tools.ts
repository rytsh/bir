export interface Tool {
  id: string;
  name: string;
  description: string;
  icon: string;
  path: string;
  keywords: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  tools: Tool[];
}

const rawCategories: Category[] = [
  {
    id: "text",
    name: "Text",
    icon: "📝",
    tools: [
      {
        id: "text-diff",
        name: "Text Diff",
        description: "Compare two texts and highlight differences",
        icon: "🔍",
        path: "/text/diff",
        keywords: "text diff, text comparison, diff tool, compare text, text difference, file diff, text comparison tool",
      },
      {
        id: "text-escape",
        name: "Text Escape",
        description: "Escape or unescape text for JSON, HTML, URL, Regex, Shell, SQL, CSV",
        icon: "🔡",
        path: "/text/escape",
        keywords: "text escape, unescape text, escape characters, JSON escape, HTML escape, URL escape, regex escape, shell escape, SQL escape, CSV escape",
      },
      {
        id: "font-glyphs",
        name: "Font Glyphs",
        description: "View and copy glyphs from font files",
        icon: "🔤",
        path: "/text/glyphs",
        keywords: "font glyphs, font viewer, glyph viewer, font characters, unicode glyphs, font inspection, character map",
      },
    ],
  },
  {
    id: "converters",
    name: "Converters",
    icon: "🔄",
    tools: [
      {
        id: "data-converter",
        name: "Data Converter",
        description: "Convert between JSON, YAML, TOML, and TOON formats",
        icon: "📄",
        path: "/converter/data",
        keywords: "data converter, JSON converter, YAML converter, TOML converter, format conversion, data format, JSON to YAML, YAML to JSON, TOML converter",
      },
      {
        id: "julian-converter",
        name: "Julian Date",
        description: "Convert between Julian Date and calendar date",
        icon: "📅",
        path: "/converter/julian",
        keywords: "julian date, date converter, julian calendar, calendar conversion, astronomical date, julian day, date format",
      },
    ],
  },
  {
    id: "encoders-decoders",
    name: "Encoders / Decoders",
    icon: "🔐",
    tools: [
      {
        id: "base64",
        name: "Base64",
        description: "Encode and decode Base64 strings",
        icon: "📝",
        path: "/codecs/base64",
        keywords: "base64, base64 encoder, base64 decoder, base64 encode, base64 decode, base64 converter, base64 string",
      },
      {
        id: "html-encoder",
        name: "HTML",
        description: "Encode and decode HTML entities",
        icon: "🔤",
        path: "/codecs/html",
        keywords: "html encoder, html decoder, html entities, html escape, html unescape, html converter, html encoding",
      },
      {
        id: "url-encoder",
        name: "URL",
        description: "Encode and decode URL components",
        icon: "🔗",
        path: "/codecs/url",
        keywords: "url encoder, url decoder, url encoding, url decoding, percent encoding, url converter, url escape",
      },
      {
        id: "hex-viewer",
        name: "Hex Viewer",
        description: "View hex dump of text, files, or Base64 data",
        icon: "🔢",
        path: "/codecs/hex",
        keywords: "hex viewer, hex dump, hexadecimal viewer, hex converter, binary viewer, hex editor, file hex, base64 hex",
      },
      {
        id: "jwt",
        name: "JWT",
        description: "Encode and decode JSON Web Tokens",
        icon: "🎟️",
        path: "/codecs/jwt",
        keywords: "jwt, json web token, jwt decoder, jwt encoder, jwt parser, token decoder, jwt converter, web token",
      },
      {
        id: "luhn",
        name: "Luhn",
        description: "Validate credit card numbers using the Luhn algorithm",
        icon: "💳",
        path: "/codecs/luhn",
        keywords: "luhn algorithm, credit card validator, luhn check, card validation, credit card checker, luhn checksum, payment validation",
      },
    ],
  },
  {
    id: "generators",
    name: "Generators",
    icon: "⚡",
    tools: [
      {
        id: "barcode-generator",
        name: "Barcode",
        description: "Generate barcodes and QR codes with WiFi support, custom colors, and frames",
        icon: "📊",
        path: "/generators/barcode",
        keywords: "barcode generator, qr code generator, barcode creator, qr code maker, wifi qr code, barcode generator, qr code custom, barcode design",
      },
      {
        id: "hash-generator",
        name: "Hash",
        description: "Generate MD5, SHA-1, SHA-256, SHA-512 hashes with HMAC support",
        icon: "#️⃣",
        path: "/generators/hash",
        keywords: "hash generator, md5, sha1, sha256, sha512, hmac, hash calculator, checksum, cryptographic hash, message digest",
      },
      {
        id: "id-generator",
        name: "ID",
        description: "Generate UUIDs (v1, v4, v7) and ULIDs",
        icon: "🔑",
        path: "/generators/id",
        keywords: "uuid generator, ulid generator, unique id, uuid v1, uuid v4, uuid v7, identifier generator, random id, unique identifier",
      },
      {
        id: "key-generator",
        name: "RSA Key",
        description: "Generate RSA public and private key pairs",
        icon: "🗝️",
        path: "/generators/key",
        keywords: "rsa key generator, rsa key pair, public key, private key, rsa encryption, ssl key, certificate generator, cryptographic key",
      },
      {
        id: "password-generator",
        name: "Password",
        description: "Generate secure random passwords with customizable options",
        icon: "🔒",
        path: "/generators/password",
        keywords: "password generator, secure password, random password, password creator, strong password, password generator, password security",
      },
    ],
  },
];

// Sort categories by name and sort tools within each category by name
export const categories: Category[] = rawCategories
  .map((category) => ({
    ...category,
    tools: [...category.tools].sort((a, b) => a.name.localeCompare(b.name)),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

export function getAllTools(): Tool[] {
  return categories.flatMap((category) => category.tools);
}

export function getToolById(id: string): Tool | undefined {
  return getAllTools().find((tool) => tool.id === id);
}

export function getCategoryByToolId(toolId: string): Category | undefined {
  return categories.find((category) => category.tools.some((tool) => tool.id === toolId));
}

export function getToolByPath(path: string): Tool | undefined {
  return getAllTools().find((tool) => tool.path === path);
}
