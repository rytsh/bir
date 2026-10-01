// Run after pnpm build: node --test src/data/additional-licenses.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const astroRequire = createRequire(require.resolve("astro/package.json"));
const { createServer } = await import(astroRequire.resolve("vite"));

const requested = `0BSD AFL-3.0 AGPL-3.0 AGPL-3.0-only AGPL-3.0-or-later
Apache-1.1 Apache-2.0 Artistic-2.0 BSD-1-Clause BSD-2-Clause BSD-2-Clause-Patent
BSD-2-Clause-Views BSD-3-Clause BSD-3-Clause-Clear BSD-3-Clause-LBNL
BSD-3-Clause-Open-MPI BSD-4-Clause BSD-4-Clause-UC BSL-1.0 BlueOak-1.0.0
CC-BY-3.0 CC-BY-4.0 CC-BY-SA-3.0 CC-BY-SA-4.0 CC0-1.0 CECILL-2.1
EPL-1.0 EPL-2.0 EUPL-1.1 EUPL-1.2 GPL-2.0 GPL-2.0-only GPL-2.0-or-later
GPL-3.0 GPL-3.0-only GPL-3.0-or-later HPND ICU ISC JSON LGPL-2.1
LGPL-2.1-or-later LGPL-3.0 LGPL-3.0-or-later MIT MIT-0 MPL-2.0
MPL-2.0-no-copyleft-exception MulanPSL-2.0 NCSA NIST-PD NIST-PD-fallback
OSL-3.0 OpenSSL PostgreSQL Python-2.0 UPL-1.0 Unlicense Zlib`.split(/\s+/);

test("all requested licenses are selectable in the built page", async () => {
  const html = await readFile(new URL("../../dist/generators/license/index.html", import.meta.url), "utf8");
  const select = html.match(/<select\b[^>]*id="license-select"[^>]*>([\s\S]*?)<\/select>/)?.[1];
  assert.ok(select, "License picker must be rendered");
  const options = [...select.matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(options.length, 66);
  assert.equal(new Set(options).size, options.length);
  for (const spdx of requested) {
    const id = spdx === "BSL-1.0" ? "boost-1.0" : spdx.toLowerCase();
    assert.ok(options.includes(id), `${spdx} must be selectable`);
  }
});

test("new templates preserve full SPDX text and the selected variant", async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] } });
  try {
    const { additionalLicenses } = await server.ssrLoadModule("/src/data/additional-licenses.ts");
    assert.equal(additionalLicenses.length, 45);
    for (const license of additionalLicenses) {
      assert.ok(requested.includes(license.spdx));
      const original = require(`spdx-license-list/licenses/${license.spdx}.json`).licenseText;
      const expected = original.replace(
        /<YEAR>|<year>|\[year\]|<COPYRIGHT HOLDER>|<copyright holders>|<copyright holder>|\[fullname\]|<name of author>/g,
        (placeholder) => /year/i.test(placeholder) ? "2026" : "Example Author",
      );
      const output = license.template("2026", "Example Author");
      if (license.spdx === "LGPL-3.0-or-later") {
        const gpl = require("spdx-license-list/licenses/GPL-3.0-only.json").licenseText;
        assert.ok(output.startsWith(`SPDX-License-Identifier: ${license.spdx}\n`));
        assert.ok(output.includes(original));
        assert.ok(output.endsWith(`${gpl}\n`));
        assert.ok(output.includes("version 3 or any later version"));
        assert.ok(output.includes("Copyright (C) 2026 Example Author"));
        assert.ok(license.template("2027", "Other Author", "Example Library").includes("Example Library\nCopyright (C) 2027 Other Author"));
        assert.equal(license.needsProject, true);
      } else {
        assert.equal(output, `SPDX-License-Identifier: ${license.spdx}\n\n${expected}\n`);
      }
      assert.equal(license.hasSummary, false);
    }
    const mit = additionalLicenses.find((license) => license.spdx === "MIT-0");
    assert.ok(mit.template("2026", "Example Author").includes("Copyright 2026 Example Author"));
    const gpl = additionalLicenses.find((license) => license.spdx === "GPL-2.0-only");
    assert.ok(gpl.template("2026", "Example Author").includes("1989, 1991 Free Software Foundation"));
  } finally {
    await server.close();
  }
});

test("picker templates preserve complete license bodies and licensing choices", async () => {
  const component = await readFile(new URL("../components/tools/LicenseGeneratorTool.svelte", import.meta.url), "utf8");
  const script = component.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1];
  // Exercise the actual picker metadata and callbacks without a browser or Svelte state.
  const id = fileURLToPath(new URL("../components/tools/__license-test.ts", import.meta.url));
  const server = await createServer({
    configFile: false,
    server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [{
      name: "license-template-test",
      resolveId: (source) => source === id ? id : undefined,
      load: (source) => source === id ? `${script.split("  let selectedId =")[0]}\nexport { licenses };` : undefined,
    }],
  });
  try {
    const { licenses } = await server.ssrLoadModule(id);
    const corrected = ["Apache-2.0", "GPL-3.0", "AGPL-3.0", "LGPL-3.0", "MPL-2.0", "CC0-1.0"];
    for (const spdx of corrected) {
      const license = licenses.find((entry) => entry.spdx === spdx);
      const isGnu = /^(?:A|L)?GPL-3\.0$/.test(spdx);
      const canonical = isGnu ? `${spdx}-only` : spdx;
      const original = require(`spdx-license-list/licenses/${canonical}.json`).licenseText;
      const output = license.template("2026", "Example Author", "Example Project");
      if (spdx === "Apache-2.0") {
        const template = await readFile(new URL("./apache-2.0.txt", import.meta.url), "utf8");
        assert.equal(output, template.replace("Copyright [yyyy] [name of copyright owner]", "Copyright 2026 Example Author"));
        assert.ok(output.trimStart().startsWith("Apache License\n"));
        assert.ok(!output.includes("SPDX-License-Identifier:"));
        const normalize = (text) => text.replace(/\s+/g, " ").trim();
        assert.equal(normalize(template), normalize(original), "GitHub formatting preserves the full SPDX text");
        const { apacheLicenseText } = await server.ssrLoadModule("/src/data/full-license-templates.ts");
        assert.equal(apacheLicenseText("2026", "Example Author", true), `SPDX-License-Identifier: Apache-2.0\n\n${output}`);
        assert.ok(apacheLicenseText("2031", "Other $& Holder").includes("Copyright 2031 Other $& Holder"));
      } else {
        assert.ok(output.includes(original), `${spdx}: entire SPDX body must be unchanged`);
      }
      assert.ok(!output.includes("Full license text:"), `${spdx}: no abbreviated link-only notice`);
      if (isGnu) {
        assert.ok(output.startsWith(`SPDX-License-Identifier: ${canonical}\n`));
        assert.ok(output.includes("2026 Example Author"));
        const customized = license.template("2031", "Other Holder", "Other Project");
        assert.ok(customized.includes("2031 Other Holder"));
        assert.ok(customized.includes(original));
        assert.ok(!customized.includes("2026 Example Author"));
      }
      if (isGnu) {
        assert.ok(license.name.includes("only (legacy ID)"));
        assert.ok(output.includes("Example Project\nCopyright (C) 2026 Example Author"));
        const notice = output.slice(0, output.indexOf(original));
        assert.ok(notice.includes(`This work is licensed under ${canonical} (version 3 only).`));
        assert.ok(notice.includes("instructional examples, not an additional"));
        assert.ok(!notice.includes("or any later version"));
        assert.ok(output.includes("Free Software Foundation"));
      }
      if (spdx === "LGPL-3.0") {
        const gpl = require("spdx-license-list/licenses/GPL-3.0-only.json").licenseText;
        assert.ok(output.endsWith(`${gpl}\n`));
        assert.ok(output.indexOf(gpl) > output.indexOf(original));
      }
    }
    for (const spdx of ["BSD-2-Clause", "BSD-3-Clause"]) {
      const output = licenses.find((entry) => entry.spdx === spdx).template("2026", "Example Author");
      assert.ok(output.includes("Copyright (c) 2026, Example Author"));
      assert.ok(!output.includes("All rights reserved."));
    }
    const wtfpl = licenses.find((entry) => entry.spdx === "WTFPL").template("2026", "Example Author");
    assert.ok(wtfpl.includes("Copyright (C) 2004 Sam Hocevar <sam@hocevar.net>"));
    assert.ok(!wtfpl.includes("Example Author"));
  } finally {
    await server.close();
  }
});
