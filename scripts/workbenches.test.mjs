import assert from "node:assert/strict";
import test from "node:test";
import { gzipSync, zipSync } from "fflate";
import { createTar, parseTar, readArchive, safeArchivePath, writeArchive } from "../src/lib/archive.ts";
import { comparePixels, fitComparisonSize } from "../src/lib/image-diff.ts";
import { packSprites, sliceSheet } from "../src/lib/sprite-sheet.ts";
import { parsePatch, splitPatchLines } from "../src/lib/git-patch.ts";
import { cleanTrackingParams, decodeLayers, parseInspectedUrl } from "../src/lib/url-inspector.ts";
import { analyzeHar, harReport, redactHarUrl } from "../src/lib/har-analyzer.ts";
import { formatBytes, loadLocalImage } from "../src/lib/workbench.ts";

const encoder = new TextEncoder();
const entries = [{ name: "docs/readme.txt", data: encoder.encode("Hello, world!\n") }, { name: "empty", data: new Uint8Array() }, { name: "türkçe/merhaba.txt", data: encoder.encode("Merhaba") }];

test("archive paths preserve folders but reject unsafe inputs", () => {
  assert.equal(safeArchivePath("docs\\hello.txt"), "docs/hello.txt");
  assert.equal(safeArchivePath("./docs//hello.txt"), "docs/hello.txt");
  for (const path of ["../a", "a/../b", "/etc/passwd", "C:\\secret", "a\0b", "__proto__", "."]) assert.throws(() => safeArchivePath(path));
});
test("USTAR round-trip preserves names, empty files, Unicode, and bytes", () => {
  assert.deepEqual(parseTar(createTar(entries)), entries);
});
test("USTAR validates checksums, truncated data, and duplicate paths", () => {
  const tar = createTar(entries); tar[1] ^= 1;
  assert.throws(() => parseTar(tar), /checksum/);
  assert.throws(() => parseTar(createTar(entries).subarray(0, 520)), /Truncated/);
  assert.throws(() => createTar([entries[0], entries[0]]), /Duplicate/);
});
test("USTAR supports long prefixed paths", () => {
  const entry = { name: `${"folder/".repeat(16)}test.txt`, data: encoder.encode("long") };
  assert.deepEqual(parseTar(createTar([entry])), [entry]);
  assert.throws(() => createTar([{ ...entry, name: "a".repeat(101) }]), /too long/);
});
for (const format of ["zip", "tar", "tar.gz"]) {
  test(`${format} async archive round-trip`, async () => {
    const bytes = await writeArchive(entries, format, 6);
    assert.deepEqual(await readArchive(bytes, `archive.${format}`), entries);
  });
}
test("plain GZIP extracts one file and unsafe ZIP paths are rejected", async () => {
  assert.deepEqual(await readArchive(gzipSync(encoder.encode("hello")), "hello.txt.gz"), [{ name: "hello.txt", data: encoder.encode("hello") }]);
  await assert.rejects(readArchive(zipSync({ "../bad": encoder.encode("bad") }), "bad.zip"), /Unsafe/);
});
test("invalid archive input gives a controlled error", async () => {
  await assert.rejects(readArchive(new Uint8Array([1, 2, 3]), "bad.tar"), /No regular/);
  await assert.rejects(readArchive(new Uint8Array([0x1f, 0x8b]), "bad.gz"), /Truncated/);
});
test("pixel diff detects changed pixels and respects tolerance", () => {
  const a = new Uint8ClampedArray([20, 20, 20, 255, 0, 0, 0, 255]);
  const b = new Uint8ClampedArray([25, 20, 20, 255, 255, 0, 0, 255]);
  assert.equal(comparePixels(a, a, 0).changed, 0);
  assert.equal(comparePixels(a, b, 0).changed, 2);
  assert.equal(comparePixels(a, b, 10).changed, 1);
  assert.throws(() => comparePixels(a, b.subarray(0, 4), 0));
});
test("pixel diff handles alpha and transparent hidden RGB", () => {
  assert.equal(comparePixels(new Uint8ClampedArray([0, 0, 0, 0]), new Uint8ClampedArray([255, 0, 0, 0]), 0).changed, 0);
  assert.equal(comparePixels(new Uint8ClampedArray([0, 0, 0, 0]), new Uint8ClampedArray([0, 0, 0, 255]), 0).changed, 1);
});
test("comparison preview fits both dimensions without changing the image aspect ratio", () => {
  assert.deepEqual(fitComparisonSize(1000, 10000, 1200, 400, 100), { width: 40, height: 400 });
  assert.deepEqual(fitComparisonSize(10000, 1000, 1200, 400, 100), { width: 1200, height: 120 });
  assert.deepEqual(fitComparisonSize(1000, 10000, 1200, 400, 300), { width: 120, height: 1200 });
  assert.deepEqual(fitComparisonSize(1000, 1000, 350, 400, 50), { width: 175, height: 175 });
  assert.deepEqual(fitComparisonSize(1000, 1000, 0, 400, 100), { width: 0, height: 0 });
});
test("grid packing preserves order and leaves padding", () => {
  const result = packSprites([{ width: 16, height: 12 }, { width: 8, height: 8 }, { width: 6, height: 4 }], "grid", 2, 2, 64, false);
  assert.equal(result.width, 38); assert.equal(result.height, 30);
  assert.deepEqual(result.frames.map(({ x, y }) => [x, y]), [[2, 2], [20, 2], [2, 16]]);
});
test("compact packing wraps, has no overlaps, and rounds to powers of two", () => {
  const result = packSprites([{ width: 12, height: 12 }, { width: 12, height: 12 }], "shelf", 2, 2, 20, true);
  assert.equal(result.width, 16); assert.equal(result.height, 32);
  assert.ok(result.frames[1].y >= result.frames[0].y + result.frames[0].height);
  assert.throws(() => packSprites([{ width: 32, height: 2 }], "shelf", 1, 1, 20, false), /wider/);
  assert.throws(() => packSprites([{ width: 8192, height: 8192 }], "grid", 1, 0, 8192, false), /exceeds/);
  assert.throws(() => packSprites([{ width: 10, height: 10 }], "grid", 0, 0, 10, false), /whole/);
});
test("sheet slicing handles margins, spacing, and partial cells", () => {
  assert.equal(sliceSheet(70, 36, 32, 32, 1, 2).length, 2);
  assert.equal(sliceSheet(65, 32, 32, 32, 0, 0).length, 2);
  assert.throws(() => sliceSheet(32, 32, 0, 0, 0, 0));
  assert.throws(() => sliceSheet(32, 32, 64, 64, 0, 0), /No complete/);
  assert.throws(() => sliceSheet(1000, 1000, 1, 1, 0, 0), /1024/);
});

const patch = 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,3 +1,4 @@\n one\n-old\n+new\n+more\n end\n';
test("patch parser reads counts, filenames, and line numbers", () => {
  const [file] = parsePatch(patch);
  assert.equal(file.label, "src/a.ts"); assert.equal(file.additions, 2); assert.equal(file.deletions, 1);
  assert.deepEqual(file.hunks[0].lines.map(({ old, next }) => [old, next]), [[1, 1], [2, null], [null, 2], [null, 3], [3, 4]]);
});
test("split patch rows align replacement blocks", () => {
  const rows = splitPatchLines(parsePatch(patch)[0].hunks[0].lines);
  assert.equal(rows.length, 4); assert.equal(rows[1].left.text, "old"); assert.equal(rows[1].right.text, "new"); assert.equal(rows[2].left, null);
});
test("patch-looking lines inside a hunk stay content", () => {
  const files = parsePatch("--- a/a\n+++ b/a\n@@ -1,1 +1,1 @@\n--- old content\n+++ new content\n");
  assert.equal(files.length, 1);
  assert.equal(files[0].deletions, 1);
  assert.equal(files[0].hunks[0].lines[0].text, "-- old content");
});
test("patch parser handles multiple plain unified files, renames, binary, and quoted paths", () => {
  assert.equal(parsePatch("--- a/a\n+++ b/a\n@@ -1 +1 @@\n-a\n+b\n--- a/b\n+++ b/b\n@@ -1 +1 @@\n-c\n+d\n").length, 2);
  assert.equal(parsePatch('diff --git "a/file name.txt" "b/file name.txt"\n--- "a/file name.txt"\n+++ "b/file name.txt"\n@@ -1 +1 @@\n-a\n+b')[0].label, "file name.txt");
  assert.equal(parsePatch("diff --git a/old b/new\nsimilarity index 100%\nrename from old\nrename to new")[0].newPath, "new");
  assert.equal(parsePatch("diff --git a/img b/img\nBinary files a/img and b/img differ")[0].binary, true);
  assert.throws(() => parsePatch("diff --cc a\n@@@ -1 +1 @@@"), /Combined/);
});
test("URL parsing supports relative paths and preserves duplicate query keys", () => {
  const url = parseInspectedUrl("../path?q=a+b&q=c%2Bd", "https://example.com/docs/");
  assert.equal(url.pathname, "/path"); assert.deepEqual(url.searchParams.getAll("q"), ["a b", "c+d"]);
  assert.throws(() => parseInspectedUrl("/path"), /Invalid URL/);
});
test("nested decoding is bounded, percent-only, and malformed-safe", () => {
  assert.equal(decodeLayers("https%253A%252F%252Fexample.com").at(-1).value, "https://example.com");
  assert.equal(decodeLayers("a+b").length, 0);
  assert.match(decodeLayers("%ZZ")[0].error, /Malformed/);
  assert.equal(decodeLayers("%25252525252541", 2).length, 2);
});
test("tracker removal preserves other query values and fragment", () => {
  const url = cleanTrackingParams(new URL("https://example.com/?q=a&tag=1&tag=2&utm_source=x&fbclid=y#anchor"));
  assert.equal(url.searchParams.has("utm_source"), false); assert.deepEqual(url.searchParams.getAll("tag"), ["1", "2"]); assert.equal(url.hash, "#anchor");
});

const har = { log: { entries: [
  { startedDateTime: "2026-01-01T00:00:00Z", time: 250, request: { url: "https://example.com/a?token=secret", headers: [{ name: "Authorization", value: "secret" }] }, response: { status: 200, _transferSize: 80, bodySize: 100, content: { size: 200, mimeType: "application/json", text: '{"secret":true}' } }, timings: { wait: 200, dns: -1 } },
  { startedDateTime: "2026-01-01T00:00:00.100Z", time: 500, request: { url: "https://cdn.example.com/b" }, response: { status: 500, bodySize: -1, content: { size: 300 } } },
] } };
test("HAR computes overlapping timeline span and byte fallback", () => {
  const result = analyzeHar(har); assert.equal(result.span, 600); assert.equal(result.bytes, 380); assert.equal(result.requests[1].offset, 100); assert.equal(result.requests[0].timings.dns, 0);
});
test("HAR validates shape and handles missing timestamps", () => {
  assert.throws(() => analyzeHar({}), /log.entries/); assert.throws(() => analyzeHar({ log: { entries: [{}] } }), /missing a URL/);
  const result = analyzeHar({ log: { entries: [{ request: { url: "https://example.com" } }] } });
  assert.equal(result.requests[0].duration, 0); assert.equal(result.warnings.length, 1);
});
test("HAR analysis accepts more than 20,000 requests without dropping entries", () => {
  const entries = Array.from({ length: 20_001 }, (_, index) => ({
    startedDateTime: "2026-01-01T00:00:00Z",
    time: index,
    request: { url: `https://example.com/request/${index}` },
    response: { status: 200, bodySize: 1 },
  }));
  const result = analyzeHar({ log: { entries } });
  assert.equal(result.requests.length, entries.length);
  assert.equal(result.requests.at(-1).url, "https://example.com/request/20000");
  assert.equal(result.bytes, entries.length);
  assert.equal(result.span, 20_000);
});
test("HAR reports omit sensitive bodies, headers, credentials, query values, and fragments", () => {
  const report = harReport(analyzeHar(har).requests);
  assert.ok(!report.includes("secret")); assert.ok(!report.includes("Authorization"));
  const url = redactHarUrl("https://user:password@example.com/path?token=private&token=again#private");
  assert.ok(!url.includes("password")); assert.ok(!url.includes("private")); assert.equal(new URL(url).searchParams.getAll("token").length, 2);
});
test("byte formatter is bounded and clear", () => { assert.equal(formatBytes(0), "0 B"); assert.equal(formatBytes(1024), "1.00 KB"); assert.equal(formatBytes(-1), "Unknown"); });
test("image loader can omit the resolution cap without changing the default for other tools", async (t) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "Image");
  t.after(() => { if (original) Object.defineProperty(globalThis, "Image", original); else delete globalThis.Image; });
  Object.defineProperty(globalThis, "Image", { configurable: true, value: function () {
    this.naturalWidth = 12000;
    this.naturalHeight = 8000;
    this.decode = async () => {};
  } });
  const file = new File(["fixture"], "large.png", { type: "image/png" });
  await assert.rejects(loadLocalImage(file), /40 megapixels/);
  const image = await loadLocalImage(file, null);
  assert.equal(image.naturalWidth * image.naturalHeight, 96_000_000);
});
