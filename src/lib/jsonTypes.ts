export type TypeTarget = "typescript" | "go" | "rust" | "jsonSchema";

type Shape =
  | { kind: "null" }
  | { kind: "boolean" }
  | { kind: "integer" }
  | { kind: "number" }
  | { kind: "string" }
  | { kind: "any" }
  | { kind: "array"; item: Shape }
  | { kind: "object"; fields: Map<string, FieldShape> }
  | { kind: "union"; options: Shape[] };

interface FieldShape {
  shape: Shape;
  optional: boolean;
}

export interface TypeGenOptions {
  rootName: string;
  optionalNullable: boolean;
}

const inferShape = (value: unknown): Shape => {
  if (value === null) return { kind: "null" };
  if (Array.isArray(value)) {
    const item = value.length
      ? value.map(inferShape).reduce(mergeShapes)
      : ({ kind: "any" } as Shape);
    return { kind: "array", item };
  }
  switch (typeof value) {
    case "boolean":
      return { kind: "boolean" };
    case "number":
      return { kind: Number.isInteger(value) ? "integer" : "number" };
    case "string":
      return { kind: "string" };
    case "object": {
      const fields = new Map<string, FieldShape>();
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        fields.set(key, { shape: inferShape(child), optional: false });
      }
      return { kind: "object", fields };
    }
    default:
      return { kind: "any" };
  }
};

const flattenUnion = (shape: Shape): Shape[] => (shape.kind === "union" ? shape.options : [shape]);

function mergeShapes(a: Shape, b: Shape): Shape {
  if (a.kind === "any") return b;
  if (b.kind === "any") return a;
  if (a.kind === b.kind) {
    if (a.kind === "array" && b.kind === "array") {
      return { kind: "array", item: mergeShapes(a.item, b.item) };
    }
    if (a.kind === "object" && b.kind === "object") {
      const fields = new Map<string, FieldShape>();
      for (const [key, field] of a.fields) {
        const other = b.fields.get(key);
        fields.set(key, other
          ? { shape: mergeShapes(field.shape, other.shape), optional: field.optional || other.optional }
          : { shape: field.shape, optional: true });
      }
      for (const [key, field] of b.fields) {
        if (!a.fields.has(key)) fields.set(key, { shape: field.shape, optional: true });
      }
      return { kind: "object", fields };
    }
    if (a.kind === "union" && b.kind === "union") {
      return b.options.reduce<Shape>((acc, option) => mergeShapes(acc, option), a);
    }
    return a;
  }
  if ((a.kind === "integer" && b.kind === "number") || (a.kind === "number" && b.kind === "integer")) {
    return { kind: "number" };
  }

  const options = [...flattenUnion(a)];
  for (const option of flattenUnion(b)) {
    const index = options.findIndex(
      (existing) =>
        existing.kind === option.kind ||
        (existing.kind === "integer" && option.kind === "number") ||
        (existing.kind === "number" && option.kind === "integer"),
    );
    if (index === -1) options.push(option);
    else options[index] = mergeShapes(options[index], option);
  }
  return options.length === 1 ? options[0] : { kind: "union", options };
}

const splitNullable = (shape: Shape): { inner: Shape; nullable: boolean } => {
  if (shape.kind === "null") return { inner: { kind: "any" }, nullable: true };
  if (shape.kind !== "union") return { inner: shape, nullable: false };
  const nonNull = shape.options.filter((option) => option.kind !== "null");
  const nullable = nonNull.length !== shape.options.length;
  if (nonNull.length === 1) return { inner: nonNull[0], nullable };
  return { inner: { kind: "union", options: nonNull }, nullable };
};

const words = (name: string): string[] =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);

export const toPascalCase = (name: string): string => {
  const result = words(name)
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join("");
  if (!result) return "Field";
  return /^[0-9]/.test(result) ? `N${result}` : result;
};

const toSnakeCase = (name: string): string => {
  const result = words(name).map((word) => word.toLowerCase()).join("_");
  if (!result) return "field";
  return /^[0-9]/.test(result) ? `n_${result}` : result;
};

const singularize = (name: string): string => {
  if (/ies$/i.test(name)) return name.slice(0, -3) + "y";
  if (/(ss|x|ch|sh|z)es$/i.test(name)) return name.slice(0, -2);
  if (/(ss|us)$/i.test(name)) return name;
  if (/s$/i.test(name) && name.length > 1) return name.slice(0, -1);
  return `${name}Item`;
};

interface NamedObject {
  name: string;
  shape: Extract<Shape, { kind: "object" }>;
}

const collectObjects = (shape: Shape, name: string, out: NamedObject[], used: Set<string>): Map<Shape, string> => {
  const names = new Map<Shape, string>();
  const visit = (current: Shape, hint: string): void => {
    if (current.kind === "object") {
      let typeName = toPascalCase(hint);
      let suffix = 2;
      while (used.has(typeName)) typeName = `${toPascalCase(hint)}${suffix++}`;
      used.add(typeName);
      names.set(current, typeName);
      out.push({ name: typeName, shape: current });
      for (const [key, field] of current.fields) visit(field.shape, key);
    } else if (current.kind === "array") {
      visit(current.item, singularize(hint));
    } else if (current.kind === "union") {
      current.options.forEach((option) => visit(option, hint));
    }
  };
  visit(shape, name);
  return names;
};

const TS_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const generateTypeScript = (root: Shape, options: TypeGenOptions): string => {
  const objects: NamedObject[] = [];
  const names = collectObjects(root, options.rootName, objects, new Set());

  const typeOf = (shape: Shape): string => {
    switch (shape.kind) {
      case "null":
        return "null";
      case "boolean":
        return "boolean";
      case "integer":
      case "number":
        return "number";
      case "string":
        return "string";
      case "any":
        return "unknown";
      case "array": {
        const inner = typeOf(shape.item);
        return shape.item.kind === "union" ? `(${inner})[]` : `${inner}[]`;
      }
      case "object":
        return names.get(shape) ?? "Record<string, unknown>";
      case "union":
        return shape.options.map(typeOf).join(" | ");
    }
  };

  const blocks = objects.map(({ name, shape }) => {
    const lines = [...shape.fields].map(([key, field]) => {
      const { nullable } = splitNullable(field.shape);
      const optional = field.optional || (options.optionalNullable && nullable);
      const property = TS_IDENTIFIER.test(key) ? key : JSON.stringify(key);
      return `  ${property}${optional ? "?" : ""}: ${typeOf(field.shape)};`;
    });
    return `export interface ${name} {\n${lines.join("\n")}\n}`;
  });

  if (root.kind !== "object") {
    blocks.unshift(`export type ${toPascalCase(options.rootName)} = ${typeOf(root)};`);
  }
  return blocks.join("\n\n") + "\n";
};

const GO_INITIALISMS = new Set([
  "ACL", "API", "ASCII", "CPU", "CSS", "DNS", "EOF", "GUID", "HTML", "HTTP", "HTTPS", "ID", "IP", "JSON",
  "QPS", "RAM", "RPC", "SLA", "SMTP", "SQL", "SSH", "TCP", "TLS", "TTL", "UDP", "UI", "UID", "URI", "URL",
  "UTF8", "UUID", "VM", "XML",
]);

const toGoName = (name: string): string => {
  const result = words(name)
    .map((word) => {
      const upper = word.toUpperCase();
      return GO_INITIALISMS.has(upper) ? upper : word[0].toUpperCase() + word.slice(1).toLowerCase();
    })
    .join("");
  if (!result) return "Field";
  return /^[0-9]/.test(result) ? `N${result}` : result;
};

const generateGo = (root: Shape, options: TypeGenOptions): string => {
  const objects: NamedObject[] = [];
  const names = collectObjects(root, options.rootName, objects, new Set());

  const typeOf = (shape: Shape, pointer = false): string => {
    const { inner, nullable } = splitNullable(shape);
    const base = (() => {
      switch (inner.kind) {
        case "boolean":
          return "bool";
        case "integer":
          return "int64";
        case "number":
          return "float64";
        case "string":
          return "string";
        case "array":
          return `[]${typeOf(inner.item)}`;
        case "object":
          return names.get(inner) ?? "map[string]any";
        default:
          return "any";
      }
    })();
    const needsPointer = (pointer || nullable) && base !== "any" && !base.startsWith("[]");
    return needsPointer ? `*${base}` : base;
  };

  const blocks = objects.map(({ name, shape }) => {
    const entries = [...shape.fields].map(([key, field]) => {
      const optional = field.optional || (options.optionalNullable && splitNullable(field.shape).nullable);
      return {
        name: toGoName(key),
        type: typeOf(field.shape, optional),
        tag: `\`json:"${key}${optional ? ",omitempty" : ""}"\``,
      };
    });
    const nameWidth = Math.max(0, ...entries.map((entry) => entry.name.length));
    const typeWidth = Math.max(0, ...entries.map((entry) => entry.type.length));
    const lines = entries.map(
      (entry) => `\t${entry.name.padEnd(nameWidth)} ${entry.type.padEnd(typeWidth)} ${entry.tag}`,
    );
    return `type ${name} struct {\n${lines.join("\n")}\n}`;
  });

  if (root.kind !== "object") {
    blocks.unshift(`type ${toPascalCase(options.rootName)} ${typeOf(root)}`);
  }
  return blocks.join("\n\n") + "\n";
};

const RUST_KEYWORDS = new Set([
  "as", "break", "const", "continue", "crate", "else", "enum", "extern", "false", "fn", "for", "if", "impl",
  "in", "let", "loop", "match", "mod", "move", "mut", "pub", "ref", "return", "self", "static", "struct",
  "super", "trait", "true", "type", "unsafe", "use", "where", "while", "async", "await", "dyn",
]);

const generateRust = (root: Shape, options: TypeGenOptions): string => {
  const objects: NamedObject[] = [];
  const names = collectObjects(root, options.rootName, objects, new Set());

  const typeOf = (shape: Shape): string => {
    const { inner, nullable } = splitNullable(shape);
    const base = (() => {
      switch (inner.kind) {
        case "boolean":
          return "bool";
        case "integer":
          return "i64";
        case "number":
          return "f64";
        case "string":
          return "String";
        case "array":
          return `Vec<${typeOf(inner.item)}>`;
        case "object":
          return names.get(inner) ?? "serde_json::Value";
        default:
          return "serde_json::Value";
      }
    })();
    return nullable && base !== "serde_json::Value" ? `Option<${base}>` : base;
  };

  const blocks = objects.map(({ name, shape }) => {
    const lines = [...shape.fields].flatMap(([key, field]) => {
      let fieldName = toSnakeCase(key);
      if (RUST_KEYWORDS.has(fieldName)) fieldName = `r#${fieldName}`;
      let type = typeOf(field.shape);
      const attributes: string[] = [];
      if (fieldName !== key) attributes.push(`rename = "${key}"`);
      if (field.optional) {
        if (!type.startsWith("Option<")) type = `Option<${type}>`;
        attributes.push(`skip_serializing_if = "Option::is_none"`);
        attributes.push("default");
      }
      return [
        ...(attributes.length ? [`    #[serde(${attributes.join(", ")})]`] : []),
        `    pub ${fieldName}: ${type},`,
      ];
    });
    return `#[derive(Debug, Clone, Serialize, Deserialize)]\npub struct ${name} {\n${lines.join("\n")}\n}`;
  });

  if (root.kind !== "object") {
    blocks.unshift(`pub type ${toPascalCase(options.rootName)} = ${typeOf(root)};`);
  }
  return `use serde::{Deserialize, Serialize};\n\n${blocks.join("\n\n")}\n`;
};

const toJsonSchemaNode = (shape: Shape): Record<string, unknown> => {
  switch (shape.kind) {
    case "null":
      return { type: "null" };
    case "boolean":
      return { type: "boolean" };
    case "integer":
      return { type: "integer" };
    case "number":
      return { type: "number" };
    case "string":
      return { type: "string" };
    case "any":
      return {};
    case "array":
      return { type: "array", items: toJsonSchemaNode(shape.item) };
    case "object": {
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, field] of shape.fields) {
        properties[key] = toJsonSchemaNode(field.shape);
        if (!field.optional) required.push(key);
      }
      return {
        type: "object",
        properties,
        ...(required.length ? { required } : {}),
        additionalProperties: false,
      };
    }
    case "union": {
      const simple = shape.options.every((option) =>
        ["null", "boolean", "integer", "number", "string"].includes(option.kind),
      );
      if (simple) return { type: shape.options.map((option) => option.kind) };
      return { anyOf: shape.options.map(toJsonSchemaNode) };
    }
  }
};

export const inferJsonSchema = (value: unknown, title?: string): Record<string, unknown> => ({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  ...(title ? { title } : {}),
  ...toJsonSchemaNode(inferShape(value)),
});

export const generateTypes = (value: unknown, target: TypeTarget, options: TypeGenOptions): string => {
  const shape = inferShape(value);
  switch (target) {
    case "typescript":
      return generateTypeScript(shape, options);
    case "go":
      return generateGo(shape, options);
    case "rust":
      return generateRust(shape, options);
    case "jsonSchema":
      return JSON.stringify(inferJsonSchema(value, toPascalCase(options.rootName)), null, 2) + "\n";
  }
};
