import assert from "node:assert/strict";
import { test } from "node:test";
import { emojiCategories, emojiCount, filterEmojiCategories } from "../src/lib/emoji.ts";

function results(query, category = null) {
  return filterEmojiCategories(query, category).flatMap((group) => group.emojis.map((item) => item.emoji));
}

test("complete Unicode 17 catalog has no duplicate sequences", () => {
  const emojis = results("");
  assert.equal(emojiCount, 3953);
  assert.equal(new Set(emojis).size, emojiCount);
  for (const emoji of ["🚬", "🪢", "🫩", "🫪", "👍🏽", "👩‍💻", "🇹🇷", "🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}"]) {
    assert.ok(emojis.includes(emoji), `Missing ${emoji}`);
  }
});

test("search finds cigarette and knot by English and Turkish names", () => {
  for (const query of ["cigarette", "smoking", "sigara", "SİGARA", "  sigara  "]) {
    assert.ok(results(query).includes("🚬"), query);
  }
  for (const query of ["knot", "düğüm", "dugum", "DÜĞÜM", "🪢"]) {
    assert.ok(results(query).includes("🪢"), query);
  }
});

test("search handles multiple keywords, shortcodes and emoji presentation selectors", () => {
  assert.ok(results("thumbs_up").includes("👍"));
  assert.ok(results(":cigarette:").includes("🚬"));
  assert.ok(results("☀").includes("☀️"));
  assert.ok(results("☀️").includes("☀️"));
  assert.deepEqual(results("not-an-emoji-xyz"), []);
});

test("category selection applies with and without a search query", () => {
  assert.equal(filterEmojiCategories("", "Objects").length, 1);
  assert.ok(results("sigara", "Objects").includes("🚬"));
  assert.deepEqual(results("sigara", "Flags"), []);
  assert.equal(filterEmojiCategories("   ", null).length, emojiCategories.length);
});
