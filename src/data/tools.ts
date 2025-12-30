export interface Tool {
  id: string;
  name: string;
  description: string;
  icon: string;
  path: string;
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
      },
      {
        id: "julian-converter",
        name: "Julian Date",
        description: "Convert between Julian Date and calendar date",
        icon: "📅",
        path: "/converter/julian",
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
      },
      {
        id: "html-encoder",
        name: "HTML",
        description: "Encode and decode HTML entities",
        icon: "🔤",
        path: "/codecs/html",
      },
      {
        id: "hex-viewer",
        name: "Hex Viewer",
        description: "View hex dump of text, files, or Base64 data",
        icon: "🔢",
        path: "/codecs/hex",
      },
      {
        id: "jwt",
        name: "JWT",
        description: "Encode and decode JSON Web Tokens",
        icon: "🎟️",
        path: "/codecs/jwt",
      },
    ],
  },
  {
    id: "generators",
    name: "Generators",
    icon: "⚡",
    tools: [
      {
        id: "hash-generator",
        name: "Hash",
        description: "Generate MD5, SHA-1, SHA-256, SHA-512 hashes with HMAC support",
        icon: "#️⃣",
        path: "/generators/hash",
      },
      {
        id: "id-generator",
        name: "ID",
        description: "Generate UUIDs (v1, v4, v7) and ULIDs",
        icon: "🔑",
        path: "/generators/id",
      },
      {
        id: "password-generator",
        name: "Password",
        description: "Generate secure random passwords with customizable options",
        icon: "🔒",
        path: "/generators/password",
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
