/**
 * NFC Forum Type 4 Tag NDEF file builder for Bolt Card SDM (Secure Dynamic Messaging).
 *
 * The NTAG 424 DNA chip will overwrite the zero-placeholder bytes in the URL
 * at each NFC tap with:
 *   p= → 32 hex ASCII chars (ENCPICCData: AES-encrypted UID + read counter)
 *   c= → 16 hex ASCII chars (SDMMAC: truncated AES-CMAC for integrity)
 *
 * The byte offsets of these placeholders must be communicated to the chip via
 * ChangeFileSettings so it knows exactly where to inject the dynamic values.
 */

/**
 * Build the NDEF file content for a Bolt Card lnurlw URL.
 *
 * File layout (NFC Forum Type 4):
 *   NLEN[2] (big-endian)  - length of the NDEF message
 *   NDEF message:
 *     0xD1  header (MB=1 ME=1 CF=0 SR=1 IL=0 TNF=0x01 Well-Known)
 *     0x01  type length
 *     PL    payload length (1 byte since SR=1 and payload ≤ 255)
 *     0x55  type 'U' (URI record)
 *     0x00  URI identifier (no scheme prefix - URL is written verbatim)
 *     …url bytes…
 */
export function buildNdefFile(lnurlwBase: string): Uint8Array {
  const sep = lnurlwBase.includes('?') ? '&' : '?';
  const url = `${lnurlwBase}${sep}p=${'0'.repeat(32)}&c=${'0'.repeat(16)}`;
  const urlBytes = new TextEncoder().encode(url);
  const payloadLen = 1 + urlBytes.length; // uri_id (1) + url

  const ndefMsg = new Uint8Array(5 + urlBytes.length);
  ndefMsg[0] = 0xD1;
  ndefMsg[1] = 0x01;
  ndefMsg[2] = payloadLen;
  ndefMsg[3] = 0x55; // 'U'
  ndefMsg[4] = 0x00; // URI identifier
  ndefMsg.set(urlBytes, 5);

  const nlen = ndefMsg.length;
  const file = new Uint8Array(2 + nlen);
  file[0] = (nlen >> 8) & 0xff;
  file[1] = nlen & 0xff;
  file.set(ndefMsg, 2);
  return file;
}

/**
 * Build the NDEF file and compute the SDM byte offsets for ChangeFileSettings.
 *
 * encPiccOffset  - byte position of the 32-char p= placeholder in the file
 * macOffset      - byte position of the 16-char c= placeholder in the file
 *
 * Setting SDMMACInputOffset == SDMMACOffset means the chip computes the MAC
 * over an empty message (same as the server's verifySunC: CMAC(sessionKey, [])).
 */
export function computeSdmOffsets(lnurlwBase: string): {
  ndefFile: Uint8Array;
  encPiccOffset: number;
  macOffset: number;
} {
  const ndefFile = buildNdefFile(lnurlwBase);

  // URL starts at byte 7 in the file:
  // byte 0-1: NLEN
  // byte 2:   header (0xD1)
  // byte 3:   type_len (0x01)
  // byte 4:   payload_len
  // byte 5:   type 'U' (0x55)
  // byte 6:   uri_id (0x00)
  // byte 7+:  URL
  const urlStartInFile = 7;

  // Separator before p= (matches buildNdefFile logic)
  const sep = lnurlwBase.includes('?') ? '&' : '?';

  // Prefix before the p= placeholder: lnurlwBase + sep + "p="
  const encPiccOffset = urlStartInFile + lnurlwBase.length + sep.length + 2; // "p=" = 2

  // After the 32-char ENCPICCData + "&c="
  const macOffset = encPiccOffset + 32 + 3; // "&c=" = 3

  return { ndefFile, encPiccOffset, macOffset };
}
