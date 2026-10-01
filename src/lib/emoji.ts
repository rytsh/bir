import emojiData from "../data/emojis.json" with { type: "json" };

export interface EmojiItem {
  emoji: string;
  desc: string;
  keywords: string[];
}

export interface EmojiCategory {
  name: string;
  emojis: EmojiItem[];
}

export function normalizeEmojiSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[_:–-]+/g, " ")
    .trim();
}

export const emojiCategories: EmojiCategory[] = emojiData.categories;
export const emojiUnicodeVersion: string = emojiData.unicodeVersion;
export const emojiCount: number = emojiCategories.reduce((sum, category) => sum + category.emojis.length, 0);

const searchIndex = new Map(
  emojiCategories.flatMap((category) =>
    category.emojis.map((item) => [item.emoji, normalizeEmojiSearch(item.keywords.join(" "))] as const),
  ),
);

export function filterEmojiCategories(query: string, selectedCategory: string | null): EmojiCategory[] {
  const terms = normalizeEmojiSearch(query).split(/\s+/).filter(Boolean);
  const categories = selectedCategory
    ? emojiCategories.filter((category) => category.name === selectedCategory)
    : emojiCategories;

  if (terms.length === 0) return categories;

  return categories
    .map((category) => ({
      ...category,
      emojis: category.emojis.filter((item) => {
        const text = searchIndex.get(item.emoji) ?? "";
        return terms.every((term) => text.includes(term) || normalizeEmojiSearch(item.emoji).includes(term));
      }),
    }))
    .filter((category) => category.emojis.length > 0);
}
