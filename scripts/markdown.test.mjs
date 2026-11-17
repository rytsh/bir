import assert from "node:assert/strict";
import test from "node:test";
import { renderMarkdown } from "../src/lib/markdown.ts";

test("Markdown preview renders headings and GFM", async () => {
  const html = await renderMarkdown("# Preview\n\n**Bold** and ~~deleted~~\n\n| Feature | Status |\n| --- | --- |\n| GFM | OK |\n\n- [x] Done");
  assert.match(html, /<h1[^>]*>Preview<\/h1>/);
  assert.match(html, /<strong>Bold<\/strong>/);
  assert.match(html, /<del>deleted<\/del>/);
  assert.match(html, /<table>/);
  assert.match(html, /type="checkbox"/);
});

test("Markdown preview renders inline and block math", async () => {
  const html = await renderMarkdown("Inline: $E = mc^2$\n\n$$\nx^2\n$$");
  assert.match(html, /class="math inline"/);
  assert.match(html, /class="math block"/);
  assert.match(html, /class="katex"/);
});

test("Markdown preview preserves code blocks for highlighting and Mermaid", async () => {
  const html = await renderMarkdown("```typescript\nconst x = 1;\n```\n\n```mermaid\ngraph TD\nA --> B\n```");
  assert.match(html, /<code class="language-typescript"/);
  assert.match(html, /const x = 1;/);
  assert.match(html, /<code class="language-mermaid"/);
});

test("Markdown preview can reuse the renderer and render empty input", async () => {
  assert.equal(await renderMarkdown(""), "");
  assert.match(await renderMarkdown("Updated content"), /<p>Updated content<\/p>/);
});
