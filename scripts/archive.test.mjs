import assert from "node:assert/strict";
import test from "node:test";
import SevenZip from "7z-wasm";
import { zipSync } from "fflate";
import { createTar, parseTar, readArchive, ENTRY_LIMIT, safeArchivePath } from "../src/lib/archive.ts";
import { extractWithArchiveEngine, parseArchiveListing, ArchivePasswordError } from "../src/lib/archive-engine.ts";

const encoder = new TextEncoder();
const file = { name: "hello.txt", data: encoder.encode("hello") };

function record(type, name, payload) {
  const bytes = createTar([{ name, data: payload }]).slice(0, 512 + Math.ceil(payload.length / 512) * 512);
  bytes[156] = type.charCodeAt(0);
  bytes.fill(32, 148, 156);
  const checksum = bytes.subarray(0, 512).reduce((sum, byte) => sum + byte, 0);
  bytes.set(encoder.encode(`${checksum.toString(8).padStart(6, "0")}\0 `), 148);
  return bytes;
}

function concat(...chunks) {
  const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let at = 0;
  for (const chunk of chunks) { result.set(chunk, at); at += chunk.length; }
  return result;
}

function pax(key, value) {
  const body = `${key}=${value}\n`;
  let length = encoder.encode(body).length + 2;
  while (length !== encoder.encode(`${length} ${body}`).length) length = encoder.encode(`${length} ${body}`).length;
  return encoder.encode(`${length} ${body}`);
}

test("PAX Unicode long paths apply only to the next file", () => {
  const name = `${"uzun/".repeat(30)}türkçe.txt`;
  const tar = concat(record("x", "PaxHeader", concat(pax("path", name), pax("mtime", "123.45"))), record("0", file.name, file.data), createTar([{ ...file, name: "second.txt" }]));
  assert.deepEqual(parseTar(tar), [{ ...file, name }, { ...file, name: "second.txt" }]);
});

test("PAX global metadata, local overrides, and deletions", () => {
  const tar = concat(record("g", "Global", pax("path", "global.txt")), record("x", "Local", pax("path", "")), record("0", "local.txt", file.data), record("0", "ignored.txt", file.data), record("g", "Global", pax("path", "")), createTar([file]));
  assert.deepEqual(parseTar(tar).map((entry) => entry.name), ["local.txt", "global.txt", "hello.txt"]);
});

test("PAX size overrides the legacy header size", () => {
  const regular = record("0", file.name, file.data);
  regular.set(encoder.encode("00000000000\0"), 124);
  regular.fill(32, 148, 156);
  const sum = regular.subarray(0, 512).reduce((total, byte) => total + byte, 0);
  regular.set(encoder.encode(`${sum.toString(8).padStart(6, "0")}\0 `), 148);
  assert.deepEqual(parseTar(concat(record("x", "Pax", pax("size", "5")), regular)), [file]);
});

test("GNU long names are preserved and unsafe extended paths are rejected", () => {
  const name = `${"a".repeat(150)}.txt`;
  assert.deepEqual(parseTar(concat(record("L", "././@LongLink", encoder.encode(`${name}\0`)), record("0", file.name, file.data))), [{ ...file, name }]);
  for (const bad of ["../escape", "/etc/passwd", "C:\\secret"]) {
    assert.throws(() => parseTar(concat(record("x", "Pax", pax("path", bad)), record("0", file.name, file.data))), /Unsafe/);
    assert.throws(() => parseTar(concat(record("L", "Long", encoder.encode(`${bad}\0`)), record("0", file.name, file.data))), /Unsafe/);
  }
});

test("TAR rejects links, sparse metadata, and malformed PAX", () => {
  for (const type of ["1", "2"]) assert.throws(() => parseTar(record(type, file.name, new Uint8Array())), /links/);
  assert.throws(() => parseTar(record("x", "Pax", pax("GNU.sparse.size", "20"))), /Sparse/);
  assert.throws(() => parseTar(record("x", "Pax", encoder.encode("999 path=bad\n"))), /Invalid PAX/);
  assert.throws(() => parseTar(concat(record("x", "Pax", pax("size", "5oops")), record("0", file.name, file.data))), /Invalid PAX entry size/);
});

test("Memory protection can be disabled without disabling path validation", () => {
  const many = Array.from({ length: ENTRY_LIMIT + 1 }, (_, index) => ({ name: `${index}.txt`, data: new Uint8Array() }));
  assert.throws(() => createTar(many), /limited/);
  const tar = createTar(many, { enforceLimits: false });
  assert.throws(() => parseTar(tar), /Too many/);
  assert.equal(parseTar(tar, { enforceLimits: false }).length, many.length);
  assert.throws(() => createTar([{ ...file, name: "../escape" }], { enforceLimits: false }), /Unsafe/);
});

test("archive inputs above 128 MiB are accepted when expanded contents fit", async () => {
  const padded = new Uint8Array(129 * 1024 * 1024);
  padded.set(createTar([file]));
  assert.deepEqual(await readArchive(padded, "padded.tar"), [file]);
});

test("extended extraction preserves binary bytes and literal wildcard filenames", async () => {
  const binary = Uint8Array.from({ length: 256 }, (_, index) => index);
  const bytes = zipSync({ "-literal[1]*.bin": binary, "other.bin": encoder.encode("not selected") });
  const result = await extractWithArchiveEngine(bytes);
  assert.deepEqual(result.find((entry) => entry.name === "-literal[1]*.bin").data, binary);
  assert.equal(result.length, 2);
});

async function encryptedArchive(format, method, headerEncryption = false) {
  const engine = await SevenZip({ print: () => {}, printErr: () => {} });
  engine.FS.mkdir("/docs");
  engine.FS.writeFile("/docs/türkçe.txt", file.data);
  engine.FS.writeFile("/empty.txt", new Uint8Array());
  const path = `/test.${format}`;
  const args = ["a", `-t${format}`, "-psecret", ...(method ? [`-mem=${method}`] : []), ...(headerEncryption ? ["-mhe=on"] : []), path, "/docs", "/empty.txt"];
  assert.equal(engine.callMain(args), 0);
  return engine.FS.readFile(path);
}

for (const [format, method, headers] of [["zip", "ZipCrypto", false], ["zip", "AES256", false], ["7z", null, true]]) {
  test(`opens encrypted ${format} ${method ?? "AES with encrypted headers"} with password retries`, async () => {
    const bytes = await encryptedArchive(format, method, headers);
    await assert.rejects(extractWithArchiveEngine(bytes), ArchivePasswordError);
    await assert.rejects(extractWithArchiveEngine(bytes, { password: "wrong" }), ArchivePasswordError);
    const entries = await extractWithArchiveEngine(bytes, { password: "secret" });
    assert.deepEqual(entries.map((entry) => entry.name).sort(), ["docs/türkçe.txt", "empty.txt"]);
    assert.deepEqual(entries.find((entry) => entry.name === "docs/türkçe.txt").data, file.data);
  });
}

test("extended engine rejects unsafe, duplicate, linked, and oversized entries", () => {
  assert.equal(parseArchiveListing("Path = a\nSize = 1\nVolume Index = \n\n")[0].name, "a");
  for (const path of ["../bad", "/absolute", "C:\\bad"]) assert.throws(() => parseArchiveListing(`Path = ${path}\nSize = 1`), /Unsafe/);
  assert.throws(() => parseArchiveListing("Path = a\nSize = 1\n\nPath = a\nSize = 1"), /Duplicate/);
  assert.throws(() => parseArchiveListing("Path = link\nSize = 0\nSymbolic Link = target"), /links/);
  const large = "Path = large\nSize = 268435457";
  assert.throws(() => parseArchiveListing(large), /Memory protection/);
  assert.equal(parseArchiveListing(large, { enforceLimits: false }).length, 1);
  assert.throws(() => safeArchivePath("../bad"), /Unsafe/);
});
