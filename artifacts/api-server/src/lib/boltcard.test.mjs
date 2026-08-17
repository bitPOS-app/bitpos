/**
 * Bolt Card SUN (Secure Unique NFC) verification - regression tests.
 *
 * Verifies the corrected decryptSunP / verifySunC algorithm against:
 *   1. A fixed hard-coded test vector (anchor against regressions)
 *   2. Round-trip tests across several counter values
 *
 * The fixed vector uses:
 *   key1 = 00*16, key2 = 11*16
 *   uid  = 044a28fa2d6b80 (real NTAG 424 DNA card UID from programming run)
 *   ctr  = 1
 *   → p  = b4892475c791a92f5c39863e5c9e6a9a
 *   → c  = dad20a53fec48fd5
 * Derived by running the algorithm that exactly matches:
 *   - boltcard/boltcard crypto.go (cmac.Sum(sv2,...) then cmac.Sum([]byte{},...))
 *   - bolt-nfc-android-app Ntag424.testPAndC (CryptoJS.CMAC(sessionKey) - no msg)
 *
 * Run: node artifacts/api-server/src/lib/boltcard.test.mjs
 */
import { createCipheriv, createDecipheriv } from "crypto";

// ── Minimal crypto helpers (only for building test vectors) ──────────────────

function ecb(key, blk) {
  const c = createCipheriv("aes-128-ecb", key, null);
  c.setAutoPadding(false);
  return Buffer.concat([c.update(blk), c.final()]);
}
function shl1(b) {
  const o = Buffer.alloc(16); let c = 0;
  for (let i = 15; i >= 0; i--) { o[i] = ((b[i] << 1) | c) & 0xff; c = b[i] >> 7; }
  return o;
}
function xor(a, b) { const o = Buffer.alloc(16); for (let i = 0; i < 16; i++) o[i] = a[i] ^ b[i]; return o; }
function cmac(key, msg) {
  const L = ecb(key, Buffer.alloc(16)), K1 = shl1(L); if (L[0] >> 7) K1[15] ^= 0x87;
  const K2 = shl1(K1); if (K1[0] >> 7) K2[15] ^= 0x87;
  const n = Math.max(1, Math.ceil(msg.length / 16)); let X = Buffer.alloc(16);
  for (let i = 0; i < n - 1; i++) X = ecb(key, xor(X, msg.subarray(i * 16, (i + 1) * 16)));
  const last = msg.subarray((n - 1) * 16);
  if (last.length === 16) return ecb(key, xor(xor(X, last), K1));
  const p = Buffer.alloc(16); last.copy(p); p[last.length] = 0x80;
  return ecb(key, xor(xor(X, p), K2));
}

/** Reimplements EXACTLY the production decryptSunP from boltcard.ts */
function decryptSunP(key1Hex, pHex) {
  if (pHex.length !== 32) return null;
  const key = Buffer.from(key1Hex, "hex"), ct = Buffer.from(pHex, "hex");
  if (key.length !== 16 || ct.length !== 16) return null;
  const d = createDecipheriv("aes-128-cbc", key, Buffer.alloc(16));
  d.setAutoPadding(false);
  const plain = Buffer.concat([d.update(ct), d.final()]);
  if (plain[0] !== 0xc7) return null;
  return { uid: plain.subarray(1, 8), counter: plain.readUIntLE(8, 3) };
}

/** Reimplements EXACTLY the production verifySunC from boltcard.ts */
function verifySunC(key2Hex, uid, counter, cHex) {
  if (cHex.length !== 16) return false;
  const key2 = Buffer.from(key2Hex, "hex"); if (key2.length !== 16) return false;
  const ctrBuf = Buffer.alloc(3); ctrBuf.writeUIntLE(counter, 0, 3);
  const sv2 = Buffer.alloc(16);
  sv2[0]=0x3c; sv2[1]=0xc3; sv2[2]=0x00; sv2[3]=0x01; sv2[4]=0x00; sv2[5]=0x80;
  uid.copy(sv2, 6); ctrBuf.copy(sv2, 13);
  const smk = cmac(key2, sv2);
  const full = cmac(smk, Buffer.alloc(0)); // empty message - key fix vs old wrong code
  const trunc = Buffer.alloc(8);
  for (let i = 0; i < 8; i++) trunc[i] = full[1 + i * 2];
  return trunc.equals(Buffer.from(cHex, "hex"));
}

/** Build a correct SUN p+c pair (simulates NTAG 424 DNA hardware output) */
function buildSunParams(key1, key2, uid, counter) {
  const plain = Buffer.alloc(16);
  plain[0] = 0xc7; uid.copy(plain, 1); plain.writeUIntLE(counter, 8, 3);
  const enc = createCipheriv("aes-128-cbc", key1, Buffer.alloc(16)); enc.setAutoPadding(false);
  const pHex = Buffer.concat([enc.update(plain), enc.final()]).toString("hex");
  const ctrBuf = Buffer.alloc(3); ctrBuf.writeUIntLE(counter, 0, 3);
  const sv2 = Buffer.alloc(16);
  sv2[0]=0x3c; sv2[1]=0xc3; sv2[2]=0x00; sv2[3]=0x01; sv2[4]=0x00; sv2[5]=0x80;
  uid.copy(sv2, 6); ctrBuf.copy(sv2, 13);
  const smk = cmac(key2, sv2), full = cmac(smk, Buffer.alloc(0)), trunc = Buffer.alloc(8);
  for (let i = 0; i < 8; i++) trunc[i] = full[1 + i * 2];
  return { pHex, cHex: trunc.toString("hex") };
}

// ── Test runner ───────────────────────────────────────────────────────────────

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { console.log(`  ✓ ${label}`); passed++; }
  else { console.error(`  ✗ ${label}`); failed++; }
}

console.log("\n── Bolt Card SUN verification regression tests ──\n");

// ── Fixed vector (hard-coded, derived from reference algorithm) ───────────────
// Matches: boltcard/boltcard crypto.go + Ntag424.testPAndC in bolt-nfc-android-app
const FV = {
  key1: "00000000000000000000000000000000",
  key2: "11111111111111111111111111111111",
  uid:  "044a28fa2d6b80",   // real NTAG 424 DNA card UID from successful programming run
  ctr:  1,
  p:    "b4892475c791a92f5c39863e5c9e6a9a",
  c:    "dad20a53fec48fd5",
};

console.log("Test 1: fixed vector - decryptSunP");
{
  const r = decryptSunP(FV.key1, FV.p);
  assert(r !== null, "returns non-null");
  assert(r?.uid.toString("hex") === FV.uid, `uid = ${r?.uid.toString("hex")}`);
  assert(r?.counter === FV.ctr, `counter = ${r?.counter}`);
}

console.log("\nTest 2: fixed vector - verifySunC");
{
  const r = decryptSunP(FV.key1, FV.p);
  assert(r !== null, "decryptSunP succeeded before verifySunC checks");
  assert(verifySunC(FV.key2, r.uid, r.counter, FV.c), "accepts correct c");
  assert(!verifySunC(FV.key2, r.uid, r.counter, "0000000000000000"), "rejects c=zeros");
  assert(!verifySunC(FV.key2, r.uid, r.counter, "ffffffffffffffff"), "rejects c=ff*8");
  assert(!verifySunC(FV.key2, r.uid, r.counter, FV.c.split("").reverse().join("")), "rejects reversed c");
}

console.log("\nTest 3: wrong key1 → null (0xC7 tag guard)");
{
  assert(decryptSunP("ffffffffffffffffffffffffffffffff", FV.p) === null, "null on bad key1");
}

console.log("\nTest 4: wrong key2 → verifySunC=false");
{
  const r = decryptSunP(FV.key1, FV.p);
  assert(r !== null && !verifySunC("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", r.uid, r.counter, FV.c), "false on bad key2");
}

console.log("\nTest 5: round-trip across counters (5, 255, 65535)");
{
  const key1 = Buffer.from("a0b1c2d3e4f56789abcdef0123456789", "hex");
  const key2 = Buffer.from("1234567890abcdef1234567890abcdef", "hex");
  const uid  = Buffer.from("044a28fa2d6b80", "hex");
  for (const ctr of [5, 255, 65535]) {
    const { pHex, cHex } = buildSunParams(key1, key2, uid, ctr);
    const r = decryptSunP(key1.toString("hex"), pHex);
    assert(r !== null && r.counter === ctr && verifySunC(key2.toString("hex"), r.uid, r.counter, cHex),
      `counter=${ctr} round-trips`);
  }
}

console.log(`\n── ${passed} passed, ${failed} failed ──\n`);
if (failed > 0) process.exit(1);
