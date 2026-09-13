// Run: node --experimental-strip-types --test src/components/tools/cert-crypto.test.mjs
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripTypeScriptTypes } from "node:module";
import { execFileSync } from "node:child_process";
import test from "node:test";
import * as x509 from "@peculiar/x509";
import * as helpers from "./cert-crypto.ts";

// Exercise the actual component generation/export functions, not a duplicate generator.
const source = readFileSync(new URL("./CertGeneratorTool.svelte", import.meta.url), "utf8");
const script = stripTypeScriptTypes(source.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1].replace(/^\s*import .*;$/gm, ""));
function tool() {
  return new Function("x509", ...Object.keys(helpers), "$state", "$derived", `${script}
    return { generateAll, importCa, buildPkcs12, fullchainPem,
      set(values) { for (const name of Object.keys(values)) eval(name + ' = values[name]'); },
      get results() { return { rootCert, interCert, serverCert, error, importError, importedCa, resultParents, resultSans }; }
    };`)(x509, ...Object.values(helpers), (value) => value, (value) => value);
}

test("generated and imported mixed-algorithm chains, encrypted PEM and PFX interoperate with OpenSSL", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cert-generator-"));
  try {
    const original = tool();
    original.set({ keyAlgorithm: "RSA-2048", keyPassphrase: "test-password", rootValidityDays: 30, interValidityDays: 20, validityDays: 10, rootO: "Example, Inc." });
    await original.generateAll();
    assert.equal(original.results.error, "");
    const { rootCert: root, interCert: inter } = original.results;
    assert.ok(root.privateKeyPem.includes("ENCRYPTED PRIVATE KEY"));
    execFileSync("openssl", ["pkey", "-passin", "pass:test-password", "-noout"], { input: inter.privateKeyPem });
    assert.throws(() => helpers.privateKeyDer(inter.privateKeyPem, "wrong"), /passphrase/);
    const imported = tool();
    imported.set({ rootCaMode: "import", importCertPem: inter.pem, importKeyPem: inter.privateKeyPem, importPassphrase: "test-password", importChainPem: root.pem, keyAlgorithm: "ECDSA-P384", serverCN: "127.0.0.1", validityDays: 90 });
    await imported.importCa();
    assert.equal(imported.results.importError, "");
    await imported.generateAll();
    assert.equal(imported.results.error, "");
    const leaf = imported.results.serverCert;
    assert.equal(leaf.cert.notAfter.getTime(), inter.cert.notAfter.getTime());
    assert.equal(leaf.keyPair.privateKey.algorithm.name, "ECDSA");
    assert.ok(await leaf.cert.verify({ publicKey: inter.cert.publicKey }));
    assert.ok(imported.results.resultSans.some((san) => san.type === "ip" && san.value === "127.0.0.1"));
    assert.equal(imported.results.resultParents.length, 1);
    assert.equal((imported.fullchainPem().match(/BEGIN CERTIFICATE/g) || []).length, 2);
    for (const [name, pem] of [["root", root.pem], ["inter", inter.pem], ["server", leaf.pem]]) writeFileSync(join(dir, `${name}.pem`), pem);
    execFileSync("openssl", ["verify", "-CAfile", join(dir, "root.pem"), "-untrusted", join(dir, "inter.pem"), "-purpose", "sslserver", "-verify_ip", "127.0.0.1", join(dir, "server.pem")]);
    for (const password of ["", "pfx-password", "şifre-123"]) {
      const pfx = await imported.buildPkcs12(leaf.keyPair.privateKey, leaf.cert, null, inter.cert, password);
      const output = execFileSync("openssl", ["pkcs12", "-passin", `pass:${password}`, "-nodes"], { input: Buffer.from(pfx) }).toString();
      assert.match(output, /BEGIN PRIVATE KEY/);
      assert.equal((output.match(/BEGIN CERTIFICATE/g) || []).length, 3);
    }
    imported.set({ skipIntermediate: false });
    await imported.generateAll();
    assert.match(imported.results.error, /path length/);
    const mismatch = tool();
    mismatch.set({ importCertPem: root.pem, importKeyPem: inter.privateKeyPem, importPassphrase: "test-password" });
    await mismatch.importCa();
    assert.match(mismatch.results.importError, /does not match/);
    const legacy = execFileSync("openssl", ["pkey", "-traditional", "-aes256", "-passin", "pass:test-password", "-passout", "pass:legacy"], { input: root.privateKeyPem }).toString();
    const key = await crypto.subtle.importKey("pkcs8", helpers.privateKeyDer(legacy, "legacy"), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, true, ["sign"]);
    await helpers.validateKeyPair(root.cert, key);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("rejects invalid SANs, lifetimes, non-CA and disconnected chains", async () => {
  for (const value of [0, -1, 1.5, NaN, 36501]) assert.throws(() => helpers.validityEnd(value), /Validity/);
  for (const value of ["999.1.1.1", "1::2::3", "01.2.3.4"]) assert.throws(() => helpers.validateSan("ip", value), /Invalid/);
  for (const value of ["https://example.com", "foo.*.com", "bad_name"]) assert.throws(() => helpers.validateSan("dns", value), /Invalid/);
  for (const value of ["::1", "2001:db8::1", "127.0.0.1"]) helpers.validateSan("ip", value);
  helpers.validateSan("dns", "*.example.com");
  const a = tool();
  a.set({ skipIntermediate: true });
  await a.generateAll();
  assert.equal(a.results.error, "");
  assert.throws(() => helpers.validateCa(a.results.serverCert.cert), /CA:TRUE/);
  const b = tool();
  await b.generateAll();
  await assert.rejects(helpers.validateChain(a.results.rootCert.cert, b.results.rootCert.pem), /disconnected/);
  a.set({ rootCaMode: "import" });
  await a.generateAll();
  assert.match(a.results.error, /Import and validate/);
});

test("fullchain preserves self-issued rollover certificates and always keeps the leaf", async () => {
  const a = tool();
  await a.generateAll();
  const root = a.results.rootCert;
  const rolloverKeys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const rollover = await x509.X509CertificateGenerator.create({
    serialNumber: "1234", subject: root.cert.subject, issuer: root.cert.subject,
    notBefore: root.cert.notBefore, notAfter: root.cert.notAfter,
    publicKey: rolloverKeys.publicKey, signingKey: root.keyPair.privateKey,
    signingAlgorithm: helpers.signingAlgorithm(root.keyPair.privateKey),
    extensions: [new x509.BasicConstraintsExtension(true, 0, true)],
  });
  const leaf = a.results.serverCert.cert;
  const withRoot = await helpers.serverFullchain([leaf, rollover, root.cert]);
  assert.equal((withRoot.match(/BEGIN CERTIFICATE/g) || []).length, 2);
  assert.ok(withRoot.includes(rollover.toString("pem")));
  assert.equal(await helpers.serverFullchain([leaf, rollover]), withRoot);
  assert.equal(await helpers.serverFullchain([root.cert]), root.pem);
});
