/**
 * NTAG 424 DNA EV2 APDU sequences for Bolt Card provisioning and wiping.
 *
 * Matches the working reference bolt-nfc-android-app (Ntag424.js) exactly:
 *   - NfcManager.transceive()  (NOT isoDepHandler)
 *   - selectApplication() called inside every authenticateEV2First()
 *   - TI extracted by decrypting step-2 response bytes 0-3  (NOT raw bytes 16-19)
 */

import NfcManager from 'react-native-nfc-manager';
import * as Crypto from 'expo-crypto';

import {
  aesEcbBlock, aesCbcEncrypt, aesCbcDecrypt, aesCmac,
  crc32JamLe, hexToBytes, bytesToHex, concat, iso7816Pad, xorBytes,
} from './crypto';

import { computeSdmOffsets } from './ndef';

// ── Debug helpers ──────────────────────────────────────────────────────────────

const DBG_ENABLED = true;

function dbgHex(tag: string, b: Uint8Array | number[]) {
  if (!DBG_ENABLED) return;
  const hex = Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
  console.log(`[NTAG-DBG] ${tag}(${b.length}B): ${hex}`);
}

function dbgVal(tag: string, v: unknown) {
  if (!DBG_ENABLED) return;
  console.log(`[NTAG-DBG] ${tag}: ${String(v)}`);
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CardKeys {
  k0: Uint8Array;
  k1: Uint8Array;
  k2: Uint8Array;
  k3: Uint8Array;
  k4: Uint8Array;
}

export interface AuthState {
  TI: Uint8Array;
  K_ENC: Uint8Array;
  K_MAC: Uint8Array;
  cmdCtr: number;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const CLA = 0x90;
/** Factory default key: 16 zero bytes */
export const FACTORY_KEY = new Uint8Array(16);

// ── Low-level APDU helpers ─────────────────────────────────────────────────────

function toHex(b: number): string {
  return b.toString(16).padStart(2, '0').toUpperCase();
}

/**
 * Send a native NTAG 424 DNA command (CLA=0x90).
 * Uses NfcManager.transceive() - same as the working reference bolt-nfc-android-app.
 * Expects SW = 0x91 0x00 for success.
 */
async function cmd(ins: number, data: number[] = []): Promise<number[]> {
  const apdu = data.length > 0
    ? [CLA, ins, 0x00, 0x00, data.length, ...data, 0x00]
    : [CLA, ins, 0x00, 0x00, 0x00];

  dbgHex(`>> APDU INS=0x${toHex(ins)}`, apdu);

  const resp: number[] = await NfcManager.transceive(apdu);
  dbgHex(`<< RESP INS=0x${toHex(ins)}`, resp);

  if (resp.length < 2) throw new Error('Short APDU response');

  const sw1 = resp[resp.length - 2];
  const sw2 = resp[resp.length - 1];
  if (sw1 !== 0x91 || sw2 !== 0x00) {
    const code = toHex(sw1) + toHex(sw2);
    let hint = '';
    if (code === '911E') hint = ' (INTEGRITY_ERROR - MAC mismatch)';
    if (code === '91AE') hint = ' (AUTH_ERROR - wrong key)';
    if (code === '91CA') hint = ' (COMMAND_ABORTED)';
    if (code === '91F0') hint = ' (FILE_NOT_FOUND)';
    if (code === '911C') hint = ' (LENGTH_ERROR)';
    if (code === '919D') hint = ' (PERMISSION_DENIED)';
    if (code === '912E') hint = ' (PARAMETER_ERROR - bad CRC or key data)';
    throw new Error(`APDU 0x${code}${hint} (INS=0x${toHex(ins)})`);
  }

  return resp.slice(0, resp.length - 2);
}

// ── EV2 crypto helpers ─────────────────────────────────────────────────────────

/**
 * IV for CommMode.Full command encryption:
 *   IV = AES_ECB(K_ENC, [0xA5,0x5A, TI[0..3], CmdCtr_LE(2), 0x00×8])
 */
function ev2IV(K_ENC: Uint8Array, TI: Uint8Array, cmdCtr: number): Uint8Array {
  const b = new Uint8Array(16);
  b[0] = 0xA5; b[1] = 0x5A;
  b[2] = TI[0]; b[3] = TI[1]; b[4] = TI[2]; b[5] = TI[3];
  b[6] = cmdCtr & 0xff;
  b[7] = (cmdCtr >> 8) & 0xff;
  // bytes 8-15 remain 0x00
  dbgHex('  ev2IV-input', b);
  const result = aesEcbBlock(K_ENC, b);
  dbgHex('  ev2IV-result', result);
  return result;
}

/**
 * EV2 truncated CMAC: keep only bytes at odd indices [1,3,5,7,9,11,13,15] → 8 bytes.
 * Matches reference calcMac: filter((_, index) => (index + 1) % 2 === 0)
 */
function truncCmac(K_MAC: Uint8Array, data: Uint8Array): Uint8Array {
  const full = aesCmac(K_MAC, data);
  dbgHex('  truncCmac-full16', full);
  const out = new Uint8Array(8);
  for (let i = 0; i < 8; i++) out[i] = full[1 + i * 2];
  dbgHex('  truncCmac-trunc8', out);
  return out;
}

/** 2-byte little-endian command counter */
function ctrLE(cmdCtr: number): Uint8Array {
  return new Uint8Array([cmdCtr & 0xff, (cmdCtr >> 8) & 0xff]);
}

// ── NTAG 424 DNA commands ──────────────────────────────────────────────────────

/**
 * ISO SELECT the NTAG 424 DNA application.
 * Uses NfcManager.transceive() - same as the reference.
 * Success SW = 90 00 (ISO, not 91 00).
 */
export async function selectApplication(): Promise<void> {
  const apdu = [0x00, 0xA4, 0x04, 0x00, 0x07,
    0xD2, 0x76, 0x00, 0x00, 0x85, 0x01, 0x01,
    0x00];
  dbgHex('>> ISO SELECT', apdu);
  const resp: number[] = await NfcManager.transceive(apdu);
  dbgHex('<< ISO SELECT resp', resp);
  if (resp.length < 2) throw new Error('ISO Select: short response');
  const sw1 = resp[resp.length - 2];
  const sw2 = resp[resp.length - 1];
  if (sw1 !== 0x90 || sw2 !== 0x00) {
    throw new Error(`ISO Select failed: 0x${toHex(sw1)}${toHex(sw2)}`);
  }
  console.log('[NTAG-DBG] ISO SELECT: OK (9000)');
}

/**
 * GetKeyVersion (INS=0x64) - CommMode.Plain.
 */
export async function getKeyVersion(keyNo: number): Promise<number> {
  dbgVal('getKeyVersion keyNo', keyNo);
  const res = await cmd(0x64, [keyNo]);
  dbgVal('getKeyVersion result', res[0]);
  return res[0] ?? 0;
}

/**
 * AuthenticateEV2First - two-step EV2 authentication.
 *
 * Matches reference Ntag424.AuthEv2First exactly:
 *   1. Calls selectApplication() first (re-select before every auth)
 *   2. TI extracted by decrypting step-2 response, taking bytes 0-3
 *   3. Session vectors identical to reference svPost formula
 */
export async function authenticateEV2First(keyNo: number, key: Uint8Array): Promise<AuthState> {
  console.log(`[NTAG-DBG] ====== AuthEV2First keyNo=${keyNo} ======`);
  dbgHex('authKey', key);

  // Reference always re-selects the application before auth
  await selectApplication();

  // Step 1: keyNo + LenCap=3 + PCDcap2=[00,00,00]
  const apdu1 = [CLA, 0x71, 0x00, 0x00, 0x05, keyNo, 0x03, 0x00, 0x00, 0x00, 0x00];
  dbgHex('>> AUTH step1', apdu1);
  const resp1: number[] = await NfcManager.transceive(apdu1);
  dbgHex('<< AUTH step1 resp', resp1);

  if (resp1.length < 2) throw new Error('AuthEV2 step1: short response');
  const sw1_1 = resp1[resp1.length - 2];
  const sw2_1 = resp1[resp1.length - 1];
  dbgVal('AUTH step1 SW', `${toHex(sw1_1)}${toHex(sw2_1)}`);

  if (sw1_1 !== 0x91 || sw2_1 !== 0xAF) {
    throw new Error(`AuthEV2 step1 failed: 0x${toHex(sw1_1)}${toHex(sw2_1)}`);
  }

  const encRndB = new Uint8Array(resp1.slice(0, resp1.length - 2));
  if (encRndB.length !== 16) throw new Error(`AuthEV2: unexpected encRndB length=${encRndB.length}`);
  dbgHex('encRndB', encRndB);

  // Decrypt RndB: AES_CBC(K, IV=0, encRndB)
  const RndB = aesCbcDecrypt(key, new Uint8Array(16), encRndB);
  dbgHex('RndB', RndB);

  // Generate RndA (16 cryptographically random bytes) - matches randomBytes(16) in reference
  const RndAArr = await Crypto.getRandomBytesAsync(16);
  const RndA = new Uint8Array(RndAArr);
  dbgHex('RndA', RndA);

  // RotLeft(RndB): rotate left by 1 byte - matches leftRotate() in reference
  const RndBrot = new Uint8Array(16);
  for (let i = 0; i < 15; i++) RndBrot[i] = RndB[i + 1];
  RndBrot[15] = RndB[0];
  dbgHex('RndBrot', RndBrot);

  // Encrypt [RndA || RotLeft(RndB)] with AES_CBC(K, IV=0)
  const plain = concat(RndA, RndBrot);
  dbgHex('RndA||RndBrot', plain);
  const encRndARndBrot = aesCbcEncrypt(key, new Uint8Array(16), plain);
  dbgHex('enc(RndA||RndBrot)', encRndARndBrot);

  // Step 2
  const apdu2 = [CLA, 0xAF, 0x00, 0x00, 32, ...Array.from(encRndARndBrot), 0x00];
  dbgHex('>> AUTH step2', apdu2);
  const resp2: number[] = await NfcManager.transceive(apdu2);
  dbgHex('<< AUTH step2 resp', resp2);

  if (resp2.length < 2) throw new Error('AuthEV2 step2: short response');
  const sw1_2 = resp2[resp2.length - 2];
  const sw2_2 = resp2[resp2.length - 1];
  dbgVal('AUTH step2 SW', `${toHex(sw1_2)}${toHex(sw2_2)}`);

  if (sw1_2 !== 0x91 || sw2_2 !== 0x00) {
    const code = toHex(sw1_2) + toHex(sw2_2);
    throw new Error(`AuthEV2 step2 failed: 0x${code} - check key is correct`);
  }

  const r2Data = new Uint8Array(resp2.slice(0, resp2.length - 2));
  dbgHex('step2-respData', r2Data);
  dbgVal('step2-respData-len', r2Data.length);

  if (r2Data.length < 16) throw new Error(`AuthEV2: step2 response too short (${r2Data.length})`);

  // ── TI extraction: DECRYPT response, take bytes 0-3 ────────────────────────
  // Matches reference exactly:
  //   const secondAuthResultDataDec = AES.decrypt({ciphertext: ...}, key, {CBC, IV=0})
  //   const tiBytes = hexToBytes(decStr).slice(0, 4)
  //
  // The chip sends: AES_ENC(K, TI || RotLeft(RndA)[0..7] || pad)(16) || TI(4) || PDCap2(6) || PCDCap2(6)
  // Decrypting the first 16 bytes with AES-CBC IV=0 gives: TI at bytes 0-3.
  const decResp = aesCbcDecrypt(key, new Uint8Array(16), r2Data.subarray(0, 16));
  const TI = decResp.subarray(0, 4);
  dbgHex('TI (from decrypt bytes 0-3)', TI);

  // Also log raw bytes 16-19 for comparison
  if (r2Data.length >= 20) {
    dbgHex('TI-raw-bytes16-19 (for comparison)', r2Data.subarray(16, 20));
  }

  // ── Session vector derivation (NXP AN12196) ─────────────────────────────────
  // Matches reference svPost formula exactly:
  //   svPost  = RndA[0..1]                          (hex: RndA.slice(0, 4))
  //           + XOR(RndA[2..7], RndB[0..5])         (hex: xor of RndA.slice(4,16) and RndB.slice(0,12))
  //           + RndB[6..15]                          (hex: RndB.slice(12, 32))
  //           + RndA[8..15]                          (hex: RndA.slice(16, 32))
  const xorMid = new Uint8Array(6);
  for (let i = 0; i < 6; i++) xorMid[i] = RndA[i + 2] ^ RndB[i];
  dbgHex('xorMid=XOR(RndA[2..7],RndB[0..5])', xorMid);

  const sv = (prefix: number[]) => new Uint8Array([
    ...prefix,
    RndA[0], RndA[1],         // 2 bytes
    ...xorMid,                // 6 bytes
    ...RndB.subarray(6, 16),  // 10 bytes: RndB[6..15]
    ...RndA.subarray(8, 16),  // 8 bytes:  RndA[8..15]
  ]); // 6+2+6+10+8 = 32 bytes

  const sv1 = sv([0xA5, 0x5A, 0x00, 0x01, 0x00, 0x80]);
  const sv2 = sv([0x5A, 0xA5, 0x00, 0x01, 0x00, 0x80]);
  dbgHex('SV1 (for K_ENC)', sv1);
  dbgHex('SV2 (for K_MAC)', sv2);

  const K_ENC = aesCmac(key, sv1);
  const K_MAC = aesCmac(key, sv2);
  dbgHex('K_ENC', K_ENC);
  dbgHex('K_MAC', K_MAC);

  console.log('[NTAG-DBG] ====== AuthEV2First SUCCESS ======');
  return { TI: new Uint8Array(TI), K_ENC, K_MAC, cmdCtr: 0 };
}

/**
 * ChangeKey (INS=0xC4) - EV2 CommMode.Full.
 */
export async function changeKey(
  auth: AuthState,
  authKeyNo: number,
  keyNo: number,
  oldKey: Uint8Array,
  newKey: Uint8Array,
  newKeyVersion: number = 0x01,
): Promise<void> {
  console.log(`[NTAG-DBG] ====== ChangeKey keyNo=${keyNo} authKeyNo=${authKeyNo} cmdCtr=${auth.cmdCtr} ======`);
  dbgHex('changeKey-newKey', newKey);
  dbgHex('changeKey-oldKey', oldKey);

  const currentCtr = auth.cmdCtr;
  auth.cmdCtr++;
  const cmdCtrBytes = ctrLE(currentCtr);
  dbgHex('changeKey-cmdCtr', cmdCtrBytes);

  let plaintext: Uint8Array;
  if (keyNo === authKeyNo) {
    // Changing the authenticated key: NewKey || KeyVersion
    plaintext = concat(newKey, new Uint8Array([newKeyVersion]));
    dbgHex('changeKey-plain(NewKey||Ver)', plaintext);
  } else {
    // Changing a different key: XOR(NewKey,OldKey) || KeyVersion || JAMCRC(NewKey)
    const xored = xorBytes(newKey, oldKey);
    const crc = crc32JamLe(newKey);
    plaintext = concat(xored, new Uint8Array([newKeyVersion]), crc);
    dbgHex('changeKey-plain(XOR||Ver||CRC)', plaintext);
    dbgHex('  xor(new,old)', xored);
    dbgHex('  crc32jam-LE', crc);
  }

  const padded = iso7816Pad(plaintext);
  dbgHex('changeKey-padded', padded);

  const iv = ev2IV(auth.K_ENC, auth.TI, currentCtr);
  const encData = aesCbcEncrypt(auth.K_ENC, iv, padded);
  dbgHex('changeKey-encData', encData);

  // MAC input: INS(1) || CmdCtr_LE(2) || TI(4) || KeyNo(1) || EncData
  const macInput = concat(
    new Uint8Array([0xC4]),
    cmdCtrBytes,
    auth.TI,
    new Uint8Array([keyNo]),
    encData,
  );
  dbgHex('changeKey-macInput', macInput);
  const macT = truncCmac(auth.K_MAC, macInput);
  dbgHex('changeKey-macT', macT);

  const apduData = Array.from(concat(new Uint8Array([keyNo]), encData, macT));
  dbgHex('changeKey-apduData', new Uint8Array(apduData));
  await cmd(0xC4, apduData);
  console.log(`[NTAG-DBG] ChangeKey keyNo=${keyNo} SUCCESS`);
}

/**
 * ChangeFileSettings (INS=0x5F) - EV2 CommMode.Full.
 * Matches reference Ntag424.changeFileSettings exactly.
 */
export async function changeFileSettings(
  auth: AuthState,
  fileNo: number,
  settings: Uint8Array,
): Promise<void> {
  console.log(`[NTAG-DBG] ====== ChangeFileSettings fileNo=0x${toHex(fileNo)} cmdCtr=${auth.cmdCtr} ======`);
  dbgHex('CFS-settings', settings);
  dbgHex('CFS-K_ENC', auth.K_ENC);
  dbgHex('CFS-K_MAC', auth.K_MAC);
  dbgHex('CFS-TI', auth.TI);

  const currentCtr = auth.cmdCtr;
  auth.cmdCtr++;
  const cmdCtrBytes = ctrLE(currentCtr);
  dbgHex('CFS-cmdCtr-bytes', cmdCtrBytes);
  dbgVal('CFS-cmdCtr-val', currentCtr);

  // ISO 7816-4 pad settings to 16-byte AES block
  const padded = iso7816Pad(settings);
  dbgHex('CFS-padded', padded);

  // IV = AES_ECB(K_ENC, [A5, 5A, TI, CmdCtr_LE(2), 00×8])
  const iv = ev2IV(auth.K_ENC, auth.TI, currentCtr);
  dbgHex('CFS-iv', iv);

  const encData = aesCbcEncrypt(auth.K_ENC, iv, padded);
  dbgHex('CFS-encData', encData);

  // MAC input: 0x5F || CmdCtr_LE(2) || TI(4) || fileNo(1) || encData(16)
  // Matches reference: '5F' + cmdCtr + Ntag424.ti + fileNo + encKeyData
  const macInput = concat(
    new Uint8Array([0x5F]),
    cmdCtrBytes,
    auth.TI,
    new Uint8Array([fileNo]),
    encData,
  );
  dbgHex('CFS-macInput', macInput);
  dbgVal('CFS-macInput-len', macInput.length);

  const macT = truncCmac(auth.K_MAC, macInput);
  dbgHex('CFS-macT', macT);

  // APDU data: fileNo(1) || encData(16) || macT(8) = 25 bytes
  // Matches reference: fileNo + encKeyData + truncatedMac, lc = 25
  const apduData = Array.from(concat(new Uint8Array([fileNo]), encData, macT));
  dbgHex('CFS-apduData', new Uint8Array(apduData));
  dbgVal('CFS-apduData-len', apduData.length);

  await cmd(0x5F, apduData);
  console.log('[NTAG-DBG] ChangeFileSettings SUCCESS');
}

/**
 * WriteData (INS=0x8D) - CommMode.Plain (no auth required).
 * Writes raw bytes starting at offset 0x000000.
 */
async function writeBinaryFilePlain(fileNo: number, data: Uint8Array): Promise<void> {
  dbgVal('writeBinaryFilePlain fileNo', fileNo);
  dbgHex('writeBinaryFilePlain data', data);
  const offset = new Uint8Array([0x00, 0x00, 0x00]);
  const length = new Uint8Array([data.length & 0xff, (data.length >> 8) & 0xff, 0x00]);
  await cmd(0x8D, Array.from(concat(new Uint8Array([fileNo]), offset, length, data)));
}

// ── SDM file settings payloads ─────────────────────────────────────────────────

function buildSdmSettings(encPiccOffset: number, macOffset: number): Uint8Array {
  // 3-byte little-endian offset
  const o3 = (n: number) => new Uint8Array([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff]);
  console.log(`[NTAG-DBG] buildSdmSettings encPiccOffset=${encPiccOffset} macOffset=${macOffset}`);
  const result = concat(
    new Uint8Array([
      0x40, // FileOption: SDM enabled, CommMode=Plain
      0x00, // AR[0]: Change=K0(0x0), ReadWrite=K0(0x0)
      0xE0, // AR[1]: Write=free(0xE), Read=K0(0x0)
      0xC1, // SDMOptions: ASCII(bit7) + UIDMirror(bit6) + SDMReadCtr(bit4) + bit0
      0xFF, // SDM AR high: RFU=0xF, CtrRet=0xF
      0x12, // SDM AR low: MetaRead=K1(0x1), FileRead=K2(0x2)
    ]),
    o3(encPiccOffset),
    o3(macOffset),
    o3(macOffset),
  );
  dbgHex('sdmSettings', result);
  return result;
}

function buildFactorySettings(): Uint8Array {
  // Reset to factory CommMode=Plain, no SDM, open access
  const result = new Uint8Array([
    0x40, 0xE0, 0xEE, 0x01, 0xFF, 0xFF,
  ]);
  dbgHex('factorySettings', result);
  return result;
}

// ── High-level card operations ─────────────────────────────────────────────────

export async function writeCard(
  keys: CardKeys,
  lnurlwBase: string,
  onStep: (label: string, done?: boolean) => void,
): Promise<void> {
  console.log('[NTAG-DBG] ========== writeCard START ==========');
  dbgVal('lnurlwBase', lnurlwBase);

  onStep('Selecting application…');
  await selectApplication();

  onStep('Checking card state…');
  const k1ver = await getKeyVersion(1);
  dbgVal('k1ver', k1ver);
  if (k1ver !== 0x00) {
    throw new Error(`Card is already programmed (K1 version = 0x${toHex(k1ver)}, expected 0x00). Reset first.`);
  }

  const { ndefFile, encPiccOffset, macOffset } = computeSdmOffsets(lnurlwBase);
  dbgHex('ndefFile', ndefFile);
  dbgVal('encPiccOffset', encPiccOffset);
  dbgVal('macOffset', macOffset);

  onStep('Writing NDEF URL…');
  await writeBinaryFilePlain(0x02, ndefFile);

  // Auth re-selects application internally (matches reference)
  onStep('Authenticating (factory key)…');
  const auth = await authenticateEV2First(0, FACTORY_KEY);
  dbgHex('post-auth TI', auth.TI);
  dbgHex('post-auth K_ENC', auth.K_ENC);
  dbgHex('post-auth K_MAC', auth.K_MAC);
  dbgVal('post-auth cmdCtr', auth.cmdCtr);

  onStep('Configuring SDM…');
  await changeFileSettings(auth, 0x02, buildSdmSettings(encPiccOffset, macOffset));

  onStep('Writing key K1…');
  await changeKey(auth, 0, 1, FACTORY_KEY, keys.k1, 0x01);

  onStep('Writing key K2…');
  await changeKey(auth, 0, 2, FACTORY_KEY, keys.k2, 0x01);

  onStep('Writing key K3…');
  await changeKey(auth, 0, 3, FACTORY_KEY, keys.k3, 0x01);

  onStep('Writing key K4…');
  await changeKey(auth, 0, 4, FACTORY_KEY, keys.k4, 0x01);

  onStep('Writing master key K0…');
  await changeKey(auth, 0, 0, FACTORY_KEY, keys.k0, 0x01);

  console.log('[NTAG-DBG] ========== writeCard COMPLETE ==========');
  onStep('Complete', true);
}

export async function wipeCard(
  keys: CardKeys,
  onStep: (label: string, done?: boolean) => void,
): Promise<void> {
  console.log('[NTAG-DBG] ========== wipeCard START ==========');

  onStep('Selecting application…');
  await selectApplication();

  // Auth re-selects application internally (matches reference)
  onStep('Authenticating…');
  const auth = await authenticateEV2First(0, keys.k0);

  onStep('Disabling SDM…');
  await changeFileSettings(auth, 0x02, buildFactorySettings());

  onStep('Resetting key K1…');
  await changeKey(auth, 0, 1, keys.k1, FACTORY_KEY, 0x00);

  onStep('Resetting key K2…');
  await changeKey(auth, 0, 2, keys.k2, FACTORY_KEY, 0x00);

  onStep('Resetting key K3…');
  await changeKey(auth, 0, 3, keys.k3, FACTORY_KEY, 0x00);

  onStep('Resetting key K4…');
  await changeKey(auth, 0, 4, keys.k4, FACTORY_KEY, 0x00);

  onStep('Resetting master key K0…');
  await changeKey(auth, 0, 0, keys.k0, FACTORY_KEY, 0x00);

  onStep('Clearing NDEF…');
  await writeBinaryFilePlain(0x02, new Uint8Array([0x00, 0x00]));

  console.log('[NTAG-DBG] ========== wipeCard COMPLETE ==========');
  onStep('Complete', true);
}

// ── Key parsing helpers ────────────────────────────────────────────────────────

export function parseProvisionResponse(json: Record<string, string>): CardKeys {
  const get = (k: string) => hexToBytes(json[k] ?? json[k.toUpperCase()] ?? '');
  return {
    k0: get('k0'),
    k1: get('k1'),
    k2: get('k2'),
    k3: get('k3'),
    k4: get('k4'),
  };
}

export function parseWipeJson(text: string): CardKeys {
  const raw = JSON.parse(text.trim());
  const src = raw.wipeKeys ?? raw;
  const get = (k: string) => hexToBytes(src[k] ?? src[k.toUpperCase()] ?? '');
  return {
    k0: get('k0'),
    k1: get('k1'),
    k2: get('k2'),
    k3: get('k3'),
    k4: get('k4'),
  };
}
