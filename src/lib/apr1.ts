import CryptoJS from "crypto-js";

const APR1_PREFIX = "$apr1$";
const SALT_CHARACTERS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789./";
const BASE64_CHARACTERS =
  "./0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

const concatenate = (...arrays: Uint8Array[]): Uint8Array => {
  const result = new Uint8Array(
    arrays.reduce((length, array) => length + array.length, 0),
  );
  let offset = 0;

  for (const array of arrays) {
    result.set(array, offset);
    offset += array.length;
  }

  return result;
};

const md5 = (value: Uint8Array): Uint8Array => {
  const words: number[] = [];

  for (let index = 0; index < value.length; index += 1) {
    words[index >>> 2] =
      (words[index >>> 2] ?? 0) |
      (value[index] << (24 - (index % 4) * 8));
  }

  const digest = CryptoJS.MD5(CryptoJS.lib.WordArray.create(words, value.length));
  const bytes = new Uint8Array(digest.sigBytes);

  for (let index = 0; index < digest.sigBytes; index += 1) {
    bytes[index] =
      (digest.words[index >>> 2] >>> (24 - (index % 4) * 8)) & 0xff;
  }

  return bytes;
};

const encode64 = (value: number, length: number): string => {
  let encoded = "";

  for (let index = 0; index < length; index += 1) {
    encoded += BASE64_CHARACTERS[value & 0x3f];
    value >>>= 6;
  }

  return encoded;
};

const generateSalt = (): string => {
  const randomBytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(
    randomBytes,
    (value) => SALT_CHARACTERS[value % SALT_CHARACTERS.length],
  ).join("");
};

export const generateApr1Hash = (
  password: string,
  providedSalt = generateSalt(),
): string => {
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);
  const salt = providedSalt.replace(/^\$apr1\$/, "").split("$")[0].slice(0, 8);
  const saltBytes = encoder.encode(salt);
  const prefixBytes = encoder.encode(APR1_PREFIX);
  let digest = md5(concatenate(passwordBytes, saltBytes, passwordBytes));
  const initialParts = [passwordBytes, prefixBytes, saltBytes];

  for (let remaining = passwordBytes.length; remaining > 0; remaining -= 16) {
    initialParts.push(digest.slice(0, Math.min(16, remaining)));
  }

  for (let length = passwordBytes.length; length > 0; length >>>= 1) {
    initialParts.push(
      length & 1 ? new Uint8Array([0]) : passwordBytes.slice(0, 1),
    );
  }

  digest = md5(concatenate(...initialParts));

  for (let index = 0; index < 1000; index += 1) {
    const parts: Uint8Array[] = [index & 1 ? passwordBytes : digest];

    if (index % 3 !== 0) parts.push(saltBytes);
    if (index % 7 !== 0) parts.push(passwordBytes);
    parts.push(index & 1 ? digest : passwordBytes);
    digest = md5(concatenate(...parts));
  }

  const encoded =
    encode64((digest[0] << 16) | (digest[6] << 8) | digest[12], 4) +
    encode64((digest[1] << 16) | (digest[7] << 8) | digest[13], 4) +
    encode64((digest[2] << 16) | (digest[8] << 8) | digest[14], 4) +
    encode64((digest[3] << 16) | (digest[9] << 8) | digest[15], 4) +
    encode64((digest[4] << 16) | (digest[10] << 8) | digest[5], 4) +
    encode64(digest[11], 2);

  return `${APR1_PREFIX}${salt}$${encoded}`;
};

export const verifyApr1Hash = (password: string, hash: string): boolean => {
  if (!hash.startsWith(APR1_PREFIX)) return false;
  return generateApr1Hash(password, hash) === hash;
};
