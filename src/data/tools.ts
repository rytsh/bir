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

export const categories: Category[] = [
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
        path: "/tools/data-converter",
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
        path: "/tools/base64",
      },
      {
        id: "html-encoder",
        name: "HTML Encoder",
        description: "Encode and decode HTML entities",
        icon: "🔤",
        path: "/tools/html-encoder",
      },
    ],
  },
];

export function getAllTools(): Tool[] {
  return categories.flatMap((category) => category.tools);
}

export function getToolById(id: string): Tool | undefined {
  return getAllTools().find((tool) => tool.id === id);
}

export function getCategoryByToolId(toolId: string): Category | undefined {
  return categories.find((category) => category.tools.some((tool) => tool.id === toolId));
}
