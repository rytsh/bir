import * as x509 from "@peculiar/x509";
import forge from "node-forge";

export function privateKeyDer(pem: string, password: string): ArrayBuffer {
  try {
    const block = forge.pem.decode(pem)[0];
    if (!block) throw new Error();
    let info: forge.asn1.Asn1;
    if (block.type === "ENCRYPTED PRIVATE KEY") {
      if (!password) throw new Error("Enter the private key passphrase.");
      const decrypted = forge.pki.decryptPrivateKeyInfo(forge.asn1.fromDer(block.body), forge.util.encodeUtf8(password));
      if (!decrypted) throw new Error("Incorrect private key passphrase.");
      info = decrypted;
    } else if (block.type === "RSA PRIVATE KEY") {
      const key = forge.pki.decryptRsaPrivateKey(pem, forge.util.encodeUtf8(password));
      if (!key) throw new Error("Incorrect private key passphrase.");
      info = forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(key));
    } else if (block.type === "PRIVATE KEY") {
      info = forge.asn1.fromDer(block.body);
    } else {
      throw new Error("Use PKCS#8 PEM (PRIVATE KEY / ENCRYPTED PRIVATE KEY) or RSA PRIVATE KEY. Convert EC PRIVATE KEY with: openssl pkcs8 -topk8 -in ca.key -out ca-pkcs8.key");
    }
    return Uint8Array.from(forge.asn1.toDer(info).getBytes(), (c) => c.charCodeAt(0)).buffer;
  } catch (err) {
    if (err instanceof Error && /passphrase|Use PKCS/.test(err.message)) throw err;
    throw new Error("Cannot read private key: check the passphrase and PEM format. Supported encryption: PKCS#8 PBES2 AES and legacy RSA PEM.");
  }
}

export function encryptKeyDer(der: ArrayBuffer, password: string): ArrayBuffer {
  const bytes = forge.util.createBuffer(new Uint8Array(der)).getBytes();
  const encrypted = forge.pki.encryptPrivateKeyInfo(forge.asn1.fromDer(bytes), forge.util.encodeUtf8(password), {
    algorithm: "aes256", count: 100000, saltSize: 16, prfAlgorithm: "sha256",
  });
  return Uint8Array.from(forge.asn1.toDer(encrypted).getBytes(), (c) => c.charCodeAt(0)).buffer;
}

export function pkcs12MacKey(password: string, salt: Uint8Array, iterations: number): Uint8Array {
  const result = forge.pkcs12.generateKey(password, forge.util.createBuffer(new Uint8Array(salt).buffer), 3, iterations, 32, forge.md.sha256.create());
  return Uint8Array.from(result.getBytes(), (c) => c.charCodeAt(0));
}

export function signingAlgorithm(key: CryptoKey): Algorithm | EcdsaParams {
  return key.algorithm.name === "ECDSA"
    ? { name: "ECDSA", hash: (key.algorithm as EcKeyAlgorithm).namedCurve === "P-384" ? "SHA-384" : "SHA-256" }
    : { name: key.algorithm.name };
}

export function validateCa(cert: x509.X509Certificate): void {
  if (!cert.getExtension(x509.BasicConstraintsExtension)?.ca) throw new Error("The signing certificate must have Basic Constraints CA:TRUE.");
  const usage = cert.getExtension(x509.KeyUsagesExtension);
  if (usage && !(usage.usages & x509.KeyUsageFlags.keyCertSign)) throw new Error("The CA does not allow certificate signing (keyCertSign).");
  if (cert.notBefore.getTime() > Date.now() || cert.notAfter.getTime() <= Date.now()) throw new Error("The CA certificate is expired or not yet valid.");
}

export async function validateKeyPair(cert: x509.X509Certificate, key: CryptoKey): Promise<CryptoKey> {
  const publicKey = await cert.publicKey.export();
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const algorithm = signingAlgorithm(key);
    const signature = await crypto.subtle.sign(algorithm, key, challenge);
    if (!await crypto.subtle.verify(algorithm, publicKey, signature, challenge)) throw new Error();
  } catch {
    throw new Error("The private key does not match the signing CA certificate.");
  }
  return publicKey;
}

export async function validateChain(issuer: x509.X509Certificate, pem: string): Promise<x509.X509Certificate[]> {
  if (!pem.trim()) return [];
  const blocks = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
  if (!blocks?.length) throw new Error("The parent chain must contain PEM certificates.");
  const remaining = blocks.map((block) => new x509.X509Certificate(block));
  const chain: x509.X509Certificate[] = [];
  let child = issuer;
  while (remaining.length) {
    let index = -1;
    for (let i = 0; i < remaining.length; i++) {
      if (child.issuer === remaining[i].subject && await child.verify({ publicKey: remaining[i].publicKey })) { index = i; break; }
    }
    if (index < 0) throw new Error("Parent chain is disconnected or has an invalid signature. Include only the signing CA's parents.");
    const parent = remaining.splice(index, 1)[0];
    validateCa(parent);
    const limit = parent.getExtension(x509.BasicConstraintsExtension)?.pathLength;
    if (limit !== undefined && chain.length + 1 > limit) throw new Error("Parent CA path length does not permit this intermediate chain.");
    chain.push(parent);
    child = parent;
  }
  return chain;
}

export function validityEnd(days: number, issuer?: x509.X509Certificate): Date {
  if (!Number.isInteger(days) || days < 1 || days > 36500) throw new Error("Validity must be a whole number between 1 and 36500 days.");
  const date = new Date(Date.now() + days * 86400000);
  if (issuer && date > issuer.notAfter) return new Date(issuer.notAfter);
  return date;
}

export async function serverFullchain(certificates: x509.X509Certificate[]): Promise<string> {
  const chain = [...certificates];
  const last = chain.at(-1);
  // Self-issued rollover intermediates have equal names but a different signing key.
  if (chain.length > 1 && last && last.subject === last.issuer && await last.verify({ publicKey: last.publicKey })) chain.pop();
  return chain.map((cert) => cert.toString("pem")).join("\n");
}

export function isIp(value: string): boolean {
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(value)) return value.split(".").every((part) => Number(part) <= 255 && String(Number(part)) === part);
  if (!value.includes(":")) return false;
  try { return new URL(`http://[${value}]/`).hostname.startsWith("["); } catch { return false; }
}

export function validateSan(type: "dns" | "ip", value: string): void {
  if (type === "ip" ? !isIp(value) : value.length > 253 || !value.replace(/^\*\./, "").split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) {
    throw new Error(`Invalid ${type.toUpperCase()} SAN: ${value}`);
  }
}
