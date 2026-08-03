/**
 * Base45 encoding (RFC 9285).
 *
 * Why base45 instead of base64 or raw bytes:
 *  - The base45 alphabet is exactly the QR "alphanumeric" character set, so QR
 *    encoders pack it at 5.5 bits/char instead of the 8 bits/char used by byte
 *    mode. 2 bytes become 3 chars => 8.25 bits per byte, only ~3% worse than
 *    raw byte mode while staying a plain JS string end to end.
 *  - Staying textual means `BarcodeDetector.rawValue` (which only exposes a
 *    UTF-8 string, not raw bytes) can be used, and no UTF-8 mangling occurs.
 *  - base64 in byte mode would cost 8 bits per base64 char => 10.67 bits per
 *    real byte, roughly 30% worse than base45.
 */

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

const DECODE_TABLE = /* @__PURE__ */ (() => {
  const table = new Int16Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) {
    table[ALPHABET.charCodeAt(i)] = i;
  }
  return table;
})();

/** Number of base45 characters produced for `byteLength` bytes. */
export const base45Length = (byteLength: number): number =>
  Math.floor(byteLength / 2) * 3 + (byteLength % 2 === 1 ? 2 : 0);

const CODES = /* @__PURE__ */ (() => {
  const codes = new Uint8Array(45);
  for (let i = 0; i < 45; i++) codes[i] = ALPHABET.charCodeAt(i);
  return codes;
})();

const asciiDecoder = /* @__PURE__ */ new TextDecoder("ascii");

export const encodeBase45 = (bytes: Uint8Array): string => {
  // Emitted as ASCII bytes rather than string concatenation or an array join:
  // this runs once per QR frame, up to 30 times a second.
  const out = new Uint8Array(base45Length(bytes.length));
  let o = 0;
  let i = 0;

  for (; i + 1 < bytes.length; i += 2) {
    let n = (bytes[i] << 8) | bytes[i + 1];
    out[o++] = CODES[n % 45];
    n = (n / 45) | 0;
    out[o++] = CODES[n % 45];
    out[o++] = CODES[(n / 45) | 0];
  }

  if (i < bytes.length) {
    const n = bytes[i];
    out[o++] = CODES[n % 45];
    out[o++] = CODES[(n / 45) | 0];
  }

  return asciiDecoder.decode(out);
};

/** Returns null when the input is not valid base45. */
export const decodeBase45 = (text: string): Uint8Array | null => {
  const rem = text.length % 3;
  if (rem === 1) return null;

  const byteLength = Math.floor(text.length / 3) * 2 + (rem === 2 ? 1 : 0);
  const out = new Uint8Array(byteLength);
  let o = 0;
  let i = 0;

  const value = (index: number): number => {
    const code = text.charCodeAt(index);
    return code < 128 ? DECODE_TABLE[code] : -1;
  };

  for (; i + 2 < text.length; i += 3) {
    const a = value(i);
    const b = value(i + 1);
    const c = value(i + 2);
    if (a < 0 || b < 0 || c < 0) return null;

    const n = a + b * 45 + c * 45 * 45;
    if (n > 0xffff) return null;

    out[o++] = n >> 8;
    out[o++] = n & 0xff;
  }

  if (rem === 2) {
    const a = value(i);
    const b = value(i + 1);
    if (a < 0 || b < 0) return null;

    const n = a + b * 45;
    if (n > 0xff) return null;

    out[o++] = n;
  }

  return out;
};
