import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const site = "https://1.tools";
const output = new URL("../dist/", import.meta.url).pathname;

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(path) : [path];
  }));
  return nested.flat();
}

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)]
    .map((match) => [match[1], match[2]]));
}

const files = await collectFiles(output);
const htmlFiles = files.filter((file) => file.endsWith(".html"));
const indexableURLs = new Set();

for (const file of htmlFiles) {
  const name = relative(output, file);
  const html = await readFile(file, "utf8");
  const meta = [...html.matchAll(/<meta\b[^>]*>/g)].map((match) => attributes(match[0]));
  const robots = meta.find((item) => item.name === "robots")?.content;
  assert.ok(robots, `${name}: missing robots metadata`);
  if (["404.html", "sw-test.html"].includes(name)) {
    assert.ok(robots.includes("noindex"), `${name}: utility/error pages must not be indexed`);
    continue;
  }
  assert.ok(!robots.includes("noindex"), `${name}: unexpected noindex`);
  assert.ok(meta.find((item) => item.name === "description")?.content, `${name}: missing description`);
  assert.ok(/<title>[^<]+<\/title>/.test(html), `${name}: missing title`);
  const links = [...html.matchAll(/<link\b[^>]*>/g)].map((match) => attributes(match[0]));
  const canonical = links.filter((item) => item.rel === "canonical");
  const route = name === "index.html" ? "/" : `/${name.replace(/index\.html$/, "")}`;
  assert.equal(canonical.length, 1, `${name}: expected exactly one canonical`);
  assert.equal(canonical[0].href, `${site}${route}`, `${name}: canonical mismatch`);
  assert.equal(meta.find((item) => item.property === "og:url")?.content, canonical[0].href, `${name}: Open Graph URL mismatch`);
  assert.equal(meta.find((item) => item.name === "twitter:url")?.content, canonical[0].href, `${name}: Twitter URL mismatch`);
  indexableURLs.add(canonical[0].href);
  assert.ok(!/html\.loading\s*\{[^}]*visibility:\s*hidden/.test(html), `${name}: content depends on JS to become visible`);

  for (const match of html.matchAll(/<a\b[^>]*>/g)) {
    const href = attributes(match[0]).href;
    if (!href?.startsWith("/") || href.startsWith("//")) continue;
    const pathname = new URL(href, site).pathname;
    if (/\.[^/]+$/.test(pathname)) continue;
    assert.ok(pathname.endsWith("/"), `${name}: redirecting internal link ${href}`);
    assert.ok(files.includes(join(output, pathname, "index.html")), `${name}: broken internal link ${href}`);
  }
}

const sitemap = await readFile(join(output, "sitemap-0.xml"), "utf8");
const sitemapURLs = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]));
assert.deepEqual(sitemapURLs, indexableURLs, "sitemap and indexable HTML pages must agree");
const sitemapIndex = await readFile(join(output, "sitemap-index.xml"), "utf8");
assert.ok(sitemapIndex.includes(`<loc>${site}/sitemap-0.xml</loc>`), "sitemap index must link to the page sitemap");
const robots = await readFile(join(output, "robots.txt"), "utf8");
assert.ok(robots.includes(`Sitemap: ${site}/sitemap-index.xml`), "robots.txt must advertise the sitemap index");
console.log(`SEO checks passed: ${indexableURLs.size} pages; canonical URLs, metadata, internal links, 404 and sitemap verified.`);
