#include "NfcReader.h"
#include <Wire.h>

// NFC URI prefix table (NDEF URI record prefix codes 0x00-0x23)
static const char* URI_PREFIXES[] = {
    "",                           // 0x00
    "http://www.",                // 0x01
    "https://www.",               // 0x02
    "http://",                    // 0x03
    "https://",                   // 0x04
    "tel:",                       // 0x05
    "mailto:",                    // 0x06
    "ftp://anonymous:anonymous@", // 0x07
    "ftp://ftp.",                 // 0x08
    "ftps://",                    // 0x09
    "sftp://",                    // 0x0A
    "smb://",                     // 0x0B
    "nfs://",                     // 0x0C
    "ftp://",                     // 0x0D
    "dav://",                     // 0x0E
    "news:",                      // 0x0F
    "telnet://",                  // 0x10
    "imap:",                      // 0x11
    "rtsp://",                    // 0x12
    "urn:",                       // 0x13
    "pop:",                       // 0x14
    "sip:",                       // 0x15
    "sips:",                      // 0x16
    "tftp:",                      // 0x17
    "btspp://",                   // 0x18
    "btl2cap://",                 // 0x19
    "btgoep://",                  // 0x1A
    "tcpobex://",                 // 0x1B
    "irdaobex://",                // 0x1C
    "file://",                    // 0x1D
    "urn:epc:id:",                // 0x1E
    "urn:epc:tag:",               // 0x1F
    "urn:epc:pat:",               // 0x20
    "urn:epc:raw:",               // 0x21
    "urn:epc:",                   // 0x22
    "urn:nfc:",                   // 0x23
};
static const int URI_PREFIX_COUNT = sizeof(URI_PREFIXES) / sizeof(URI_PREFIXES[0]);

Adafruit_PN532 NfcReader::_nfc(PN532_IRQ, PN532_RST);
bool           NfcReader::_ready  = false;
uint8_t        NfcReader::_uid[7] = {};
uint8_t        NfcReader::_uidLen = 0;

// ── RF field control ──────────────────────────────────────────────────────────
// Toggle PN532 RF field using RFConfiguration (0x32) command.
// sendCommandCheckAck() is public in Adafruit_PN532_NTAG424 (ZapBox uses it directly).
// Response is drained via Wire (readdata() is protected in the base library).
// Used to hard power-cycle a card between ISOReadFile retry attempts.
void NfcReader::rfFieldSet(bool on) {
    uint8_t cmd[] = { 0x32, 0x01, on ? (uint8_t)0x01 : (uint8_t)0x00 };
    _nfc.sendCommandCheckAck(cmd, 3, 500);
    uint32_t deadline = millis() + 200;
    while (digitalRead(PN532_IRQ) != LOW && millis() < deadline) delay(1);
    Wire.requestFrom((uint8_t)0x24, (uint8_t)32);
    while (Wire.available()) Wire.read();
}

// RFConfiguration CfgItem 0x0A — ISO 14443A 106kbps analog settings.
// IMPORTANT: this CfgItem requires the FULL 11-byte block. Sending fewer bytes
// makes the PN532 silently reject the command (the earlier 3-byte version was a
// no-op). The 11 bytes below are the PN532 power-up defaults EXCEPT byte 0.
//
// Byte 0 = RFCfg: bits [6:4] = RxGain.
//   default 0x59 → RxGain=0b101 (38 dB)  — saturates on the strong signal a
//                                           card returns when touching the coil
//   here    0x39 → RxGain=0b011 (23 dB)  — lower gain demodulates close-range
//                                           taps without clipping
// TX power (CWGsP, byte 2) is left at default so far-approach range is unchanged.
void NfcReader::rfReduceRxGain() {
    uint8_t cmd[] = {
        0x32, 0x0A,
        0x39,        // RFCfg — RxGain reduced to 23 dB (was 0x59 = 38 dB)
        0xF4,        // GsNOn
        0x3F,        // CWGsP (TX power, default)
        0x11,        // GsNOff
        0x4D,        // ModGsP
        0x85,        // DemodOwnRFOn
        0x61,        // RxThreshold
        0x6F,        // DemodOwnRFOff
        0x26,        // GsNOnAuto
        0x62,        // ModGsPAuto
        0x87         // CIU settings
    };
    bool acked = _nfc.sendCommandCheckAck(cmd, sizeof(cmd), 500);
    uint32_t deadline = millis() + 200;
    while (digitalRead(PN532_IRQ) != LOW && millis() < deadline) delay(1);
    Wire.requestFrom((uint8_t)0x24, (uint8_t)32);
    while (Wire.available()) Wire.read();
    Serial.printf("NFC: RxGain reduced for tap range (ack=%s)\n",
                  acked ? "ok" : "FAILED");
}

bool NfcReader::begin() {
    Wire.begin(PN532_SDA, PN532_SCL);
    // Raise I2C timeout to 3s — the original ESP32 (not S3) has a clock-stretching
    // hardware bug; when the PN532 stretches CLK during ISO-DEP exchanges the
    // default 50ms timeout fires too early and causes spurious I2C errors.
    Wire.setTimeOut(3000);

    bool anyFound = false;
    for (uint8_t addr = 1; addr < 127; addr++) {
        Wire.beginTransmission(addr);
        if (Wire.endTransmission() == 0) {
            Serial.printf("NFC: I2C device found at 0x%02X\n", addr);
            anyFound = true;
        }
    }
    if (!anyFound) {
        Serial.println("NFC: no I2C devices found (SDA=22 SCL=27)");
        return false;
    }

    Wire.beginTransmission(0x24);
    if (Wire.endTransmission() != 0) {
        Serial.println("NFC: PN532 not at 0x24 — check DIP switches (must be I2C mode)");
        return false;
    }
    _nfc.begin();
    uint32_t versiondata = _nfc.getFirmwareVersion();
    if (!versiondata) {
        Serial.println("NFC: PN532 found on bus but firmware read failed");
        return false;
    }
    Serial.printf("NFC: PN532 fw v%d.%d\n",
                  (versiondata >> 16) & 0xFF, (versiondata >> 8) & 0xFF);
    _nfc.SAMConfig();
    // Reduce receiver gain to handle the strong load-modulation signal at close
    // (tap) range. CfgItem 0x0A takes the full 11-byte analog-settings block;
    // byte 0 (RFCfg) holds RxGain in bits [6:4]. We keep TX power at default
    // (full approach range) and lower RxGain 38dB→23dB so the demodulator does
    // not saturate when a card is touching the antenna.
    rfReduceRxGain();
    _ready = true;
    return true;
}

bool NfcReader::detectCard(String& outUid) {
    if (!_ready) return false;
    _uidLen = 0;
    memset(_uid, 0, sizeof(_uid));

    uint8_t uidLen = 0;
    if (!_nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, _uid, &uidLen, 300)) {
        return false;
    }

    _uidLen = uidLen;
    outUid  = uidToHex(_uid, _uidLen);
    Serial.printf("NFC: card detected UID=%s (%d bytes)\n", outUid.c_str(), _uidLen);
    return true;
}

String NfcReader::readNdef() {
    if (!_ready || _uidLen == 0) return "";

    // 250ms settle — let the PN532 finish the ISO14443A activation sequence
    // before sending NTAG424 APDUs. Without this the PN532 is still busy and
    // I2C returns errors. (per ZapBox NFCBoltCard.cpp reference implementation)
    delay(250);

    String url;
    if (_uidLen == 4) {
        // 4-byte UID: NTAG 424 DNA (Bolt Card) uses UID privacy mode.
        // Use the NTAG424-aware library to check and read in one shot.
        url = readNdefUrlNtag424();
    } else {
        // 7-byte UID: NTAG213/215 Type 2 tag — page-read NDEF.
        url = readNdefUrl2(_uid, _uidLen);
    }

    // SAMConfig() clears the active target list so the next detectCard()
    // starts fresh. (inRelease was removed from Adafruit PN532 v1.3.4+)
    _nfc.SAMConfig();
    _uidLen = 0;

    if (url.isEmpty()) {
        Serial.println("NFC: no NDEF URL found");
        return "";
    }

    String norm = normalizeUrl(url);
    Serial.printf("NFC: URL=%s\n", norm.c_str());
    return norm;
}

bool NfcReader::poll(String& outUrl, String& outUid) {
    if (!detectCard(outUid)) return false;
    outUrl = readNdef();
    return !outUrl.isEmpty();
}

// ── NTAG 424 DNA (Bolt Card) ──────────────────────────────────────────────────

String NfcReader::readNdefUrlNtag424() {
    // Go straight to ISOReadFile — do NOT call ntag424_isNTAG424() first.
    // ntag424_isNTAG424() runs a 3-step GetVersion/NextFrame/NextFrame sequence
    // that leaves the card's DESFire state machine in an intermediate context.
    // When ISOReadFile then calls GetFileSettings, the card rejects it and every
    // subsequent APDU fails. Skipping isNTAG424() lets ISOReadFile start from a
    // clean post-RATS state: GetFileSettings → ISO SELECT AID → ISO SELECT EF →
    // READ BINARY. If the card is not NTAG424, ISOReadFile returns 0 immediately.

    // Retry up to 5 times. On each failure: RF off → RF on (hard card power-cycle)
    // → readPassiveTargetID (fresh ANTICOL+SELECT; RATS follows on next InDataExchange).
    // A plain ISOReadFile retry against a broken ISO-DEP session always fails; the RF
    // cycle forces the card to reinitialise from zero so each retry is a clean attempt.
    uint8_t buf[512];
    uint8_t bytesRead = 0;
    for (int attempt = 1; attempt <= 5 && bytesRead == 0; attempt++) {
        bytesRead = _nfc.ntag424_ISOReadFile(buf, sizeof(buf) - 1);
        if (bytesRead == 0 && attempt < 5) {
            Serial.printf("NFC: NTAG424 attempt %d failed — RF cycle\n", attempt);
            rfFieldSet(false);   // card drains capacitors → full state reset
            delay(50);
            rfFieldSet(true);
            delay(100);
            uint8_t reUid[7]; uint8_t reLen = 0;
            bool reFound = _nfc.readPassiveTargetID(
                PN532_MIFARE_ISO14443A, reUid, &reLen, 1000);
            if (!reFound) {
                Serial.println("NFC: card left field after RF cycle");
                break;
            }
            delay(300);
        }
    }

    if (bytesRead == 0) {
        Serial.println("NFC: NTAG424 read returned 0 bytes after 5 attempts");
        return "";
    }

    buf[bytesRead] = '\0';
    String result = String((char*)buf);
    Serial.printf("NFC: NTAG424 raw=%s\n", result.substring(0, 60).c_str());
    return result;
}

// ── NTAG213/215 Type 2 tag ────────────────────────────────────────────────────

String NfcReader::readNdefUrl2(uint8_t* uid, uint8_t uidLen) {
    uint8_t buf[240];
    int collected = 0;

    for (uint8_t page = 4; page < 60 && collected < (int)sizeof(buf); page++) {
        uint8_t pd[4];
        if (!_nfc.mifareultralight_ReadPage(page, pd)) break;
        for (int b = 0; b < 4 && collected < (int)sizeof(buf); b++) {
            buf[collected++] = pd[b];
        }
    }

    for (int i = 0; i < collected; ) {
        uint8_t tlvType = buf[i++];
        if (tlvType == 0x00) continue;
        if (tlvType == 0xFE) break;
        if (i >= collected) break;
        uint8_t tlvLen = buf[i++];
        if (tlvType == 0x03) {
            if (i + 3 > collected) break;
            uint8_t flags   = buf[i++];
            uint8_t typeLen = buf[i++];
            uint32_t payLen = (flags & 0x10) ? buf[i++] :
                              ((uint32_t)buf[i] << 24 | (uint32_t)buf[i+1] << 16 |
                               (uint32_t)buf[i+2] << 8 | buf[i+3]);
            if (!(flags & 0x10)) i += 4;
            if (flags & 0x08) i++;
            uint8_t tnf = flags & 0x07;
            char typeStr[16] = {0};
            for (int t = 0; t < typeLen && t < 15; t++) typeStr[t] = buf[i++];

            if (tnf == 0x01 && typeStr[0] == 'U') {
                if (i >= collected || payLen < 1) break;
                uint8_t prefixCode = buf[i++];
                const char* prefix = (prefixCode < URI_PREFIX_COUNT) ? URI_PREFIXES[prefixCode] : "";
                String urlStr = String(prefix);
                for (uint32_t p = 1; p < payLen && i < collected; p++) {
                    urlStr += (char)buf[i++];
                }
                return urlStr;
            } else if (tnf == 0x01 && typeStr[0] == 'T') {
                if (i >= collected || payLen < 1) break;
                uint8_t status = buf[i++];
                uint8_t langLen = status & 0x3F;
                i += langLen;
                String text = "";
                for (uint32_t p = 1 + langLen; p < payLen && i < collected; p++) {
                    text += (char)buf[i++];
                }
                if (text.startsWith("http") || text.startsWith("lnurl")) return text;
            } else {
                i += payLen;
            }
            break;
        } else {
            i += tlvLen;
        }
    }
    return "";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

String NfcReader::normalizeUrl(const String& raw) {
    if (raw.startsWith("lnurlw://")) return "https://" + raw.substring(9);
    if (raw.startsWith("lnurl://"))  return "https://" + raw.substring(8);
    return raw;
}

String NfcReader::uidToHex(uint8_t* uid, uint8_t len) {
    String s;
    for (uint8_t i = 0; i < len; i++) {
        if (uid[i] < 0x10) s += '0';
        s += String(uid[i], HEX);
    }
    return s;
}
