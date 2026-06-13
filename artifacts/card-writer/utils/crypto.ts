/**
 * AES-128 primitives for NTAG 424 DNA EV2 communication.
 *
 * Uses crypto-js (same library as the working reference bolt-nfc-android-app)
 * with the artjomb CMAC extension loaded from utils/cmac.js.
 *
 * All public functions accept and return Uint8Array to keep ntag424.ts unchanged.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const CryptoJS = require('./cmac'); // CryptoJS + CMAC extension (reference-identical)

// ── internal helpers ──────────────────────────────────────────────────────────

function u8toHex(u: Uint8Array | number[]): string {
  return Array.from(u)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToU8(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++)
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// ── AES primitives ────────────────────────────────────────────────────────────

/** AES-128 ECB single-block encrypt (16 bytes → 16 bytes) */
export function aesEcbBlock(key: Uint8Array, block: Uint8Array): Uint8Array {
  const result = CryptoJS.AES.encrypt(
    CryptoJS.enc.Hex.parse(u8toHex(block)),
    CryptoJS.enc.Hex.parse(u8toHex(key)),
    {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.NoPadding,
    },
  );
  return hexToU8(result.ciphertext.toString(CryptoJS.enc.Hex));
}

/** AES-128 CBC encrypt - data must be a multiple of 16 bytes */
export function aesCbcEncrypt(
  key: Uint8Array,
  iv: Uint8Array,
  data: Uint8Array,
): Uint8Array {
  const result = CryptoJS.AES.encrypt(
    CryptoJS.enc.Hex.parse(u8toHex(data)),
    CryptoJS.enc.Hex.parse(u8toHex(key)),
    {
      mode: CryptoJS.mode.CBC,
      iv: CryptoJS.enc.Hex.parse(u8toHex(iv)),
      padding: CryptoJS.pad.NoPadding,
    },
  );
  return hexToU8(result.ciphertext.toString(CryptoJS.enc.Hex));
}

/** AES-128 CBC decrypt - data must be a multiple of 16 bytes */
export function aesCbcDecrypt(
  key: Uint8Array,
  iv: Uint8Array,
  data: Uint8Array,
): Uint8Array {
  const result = CryptoJS.AES.decrypt(
    { ciphertext: CryptoJS.enc.Hex.parse(u8toHex(data)) },
    CryptoJS.enc.Hex.parse(u8toHex(key)),
    {
      mode: CryptoJS.mode.CBC,
      iv: CryptoJS.enc.Hex.parse(u8toHex(iv)),
      padding: CryptoJS.pad.NoPadding,
    },
  );
  return hexToU8(CryptoJS.enc.Hex.stringify(result));
}

/** AES-CMAC (NIST SP 800-38B) via artjomb CryptoJS extension */
export function aesCmac(key: Uint8Array, message: Uint8Array): Uint8Array {
  const result = CryptoJS.CMAC(
    CryptoJS.enc.Hex.parse(u8toHex(key)),
    CryptoJS.enc.Hex.parse(u8toHex(message)),
  );
  return hexToU8(result.toString());
}

// ── misc helpers (unchanged interface) ───────────────────────────────────────

export function xorBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] ^ b[i];
  return out;
}

/**
 * CRC32/JAMCRC - DESFire / NTAG 424 DNA wire format.
 * Same polynomial as CRC-32/ISO-HDLC (0xEDB88320) but NO final XOR.
 * Result is 4 bytes, little-endian.
 */
export function crc32JamLe(data: Uint8Array): Uint8Array {
  let crc = 0xffffffff;
  for (const b of data) {
    crc ^= b;
    for (let i = 0; i < 8; i++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  crc = crc >>> 0;
  return new Uint8Array([
    crc & 0xff,
    (crc >> 8) & 0xff,
    (crc >> 16) & 0xff,
    (crc >> 24) & 0xff,
  ]);
}

/** 32-char hex string → Uint8Array */
export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error(`Odd hex length: ${hex.length}`);
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++)
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Uint8Array → lowercase hex string */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Concatenate Uint8Arrays */
export function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

/** Append ISO 7816-4 padding (0x80 0x00…) to reach next 16-byte boundary */
export function iso7816Pad(data: Uint8Array): Uint8Array {
  const padLen = 16 - (data.length % 16);
  const out = new Uint8Array(data.length + padLen);
  out.set(data);
  out[data.length] = 0x80;
  return out;
}
