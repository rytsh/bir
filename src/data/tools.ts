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
        description: "Convert between JSON, YAML, and TOML formats",
        icon: "📄",
        path: "/converter/data",
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
        name: "HTML Encoder",
        description: "Encode and decode HTML entities",
        icon: "🔤",
        path: "/codecs/html",
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
