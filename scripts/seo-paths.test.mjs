import assert from "node:assert/strict";
import test from "node:test";
import { normalizePagePath } from "../src/lib/paths.ts";
import { getAllTools, getToolByPath } from "../src/data/tools.ts";

test("page URLs use a trailing slash and retain query strings and fragments", () => {
  for (const [input, expected] of [
    ["", "/"],
    ["/", "/"],
    ["/text/ascii", "/text/ascii/"],
    ["/text/ascii/", "/text/ascii/"],
    ["/text/ascii///", "/text/ascii/"],
    ["/text/ascii?format=hex#table", "/text/ascii/?format=hex#table"],
    ["/text/ascii#table", "/text/ascii/#table"],
  ]) {
    assert.equal(normalizePagePath(input), expected);
    assert.equal(normalizePagePath(expected), expected);
  }
});

test("all tool links use directory URLs and legacy lookups still work", () => {
  for (const tool of getAllTools()) {
    assert.ok(tool.path.endsWith("/"), tool.path);
    assert.equal(getToolByPath(tool.path)?.id, tool.id);
    assert.equal(getToolByPath(tool.path.slice(0, -1))?.id, tool.id);
  }
});
