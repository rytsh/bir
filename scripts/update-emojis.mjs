import { mkdir, writeFile } from "node:fs/promises";

// Pinned sources keep updates reproducible. Data is bundled locally: no runtime requests.
const unicodeVersion = "17.0";
const cldrVersion = "48.0.0";
const unicodeUrl = `https://unicode.org/Public/${unicodeVersion}.0/emoji/emoji-test.txt`;
const cldrBase = `https://raw.githubusercontent.com/unicode-org/cldr-json/${cldrVersion}/cldr-json`;

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.text();
}

const [unicodeText, ...annotationTexts] = await Promise.all([
  fetchText(unicodeUrl),
  ...["en", "tr"].flatMap((locale) =>
    ["annotations", "annotationsDerived"].map((kind) =>
      fetchText(`${cldrBase}/cldr-${kind === "annotations" ? "annotations" : "annotations-derived"}-full/${kind}/${locale}/annotations.json`),
    ),
  ),
]);

const annotations = annotationTexts.map((text) => {
  const data = JSON.parse(text);
  const root = data.annotations ?? data.annotationsDerived;
  return root.annotations;
});
const categories = [];
const seen = new Set();
let category;

for (const line of unicodeText.split("\n")) {
  if (line.startsWith("# group: ")) {
    category = { name: line.slice("# group: ".length), emojis: [] };
    categories.push(category);
    continue;
  }

  const match = line.match(/^([\dA-F ]+)\s*;\s*(fully-qualified|component)\s*#\s*\S+\s+E[\d.]+\s+(.+)$/);
  if (!match) continue;
  if (!category) throw new Error("Emoji found before its group");

  const emoji = String.fromCodePoint(...match[1].trim().split(/\s+/).map((code) => parseInt(code, 16)));
  if (seen.has(emoji)) throw new Error(`Duplicate emoji: ${emoji}`);
  seen.add(emoji);
  const desc = match[3].trim();
  const keywords = new Set([desc]);
  // CLDR keys generally omit emoji presentation selectors (U+FE0F).
  const key = emoji.replace(/\uFE0F/g, "");
  for (const locale of annotations) {
    const entry = locale[emoji] ?? locale[key];
    for (const word of [...(entry?.default ?? []), ...(entry?.tts ?? [])]) {
      keywords.add(word);
    }
  }
  category.emojis.push({ emoji, desc, keywords: [...keywords] });
}

if (seen.size < 3900 || !seen.has("🚬") || !seen.has("🪢")) {
  throw new Error("Emoji source is incomplete; refusing to overwrite the dataset");
}

const output = new URL("../src/data/emojis.json", import.meta.url);
await mkdir(new URL("../src/data/", import.meta.url), { recursive: true });
await writeFile(output, `${JSON.stringify({ unicodeVersion, cldrVersion, categories }, null, 2)}\n`);
console.log(`Generated ${seen.size} emojis in ${categories.length} categories (Unicode ${unicodeVersion}, CLDR ${cldrVersion}).`);
