# bitPOS

A Lightning point of sale you can verify.
Live at [`bitpos.app`](https://bitpos.app). Licensed [AGPL-3.0-or-later](LICENSE).

[![stars](https://img.shields.io/github/stars/bitPOS-app/bitpos?color=f7931a&style=flat-square)](https://github.com/bitPOS-app/bitpos/stargazers)
[![last commit](https://img.shields.io/github/last-commit/bitPOS-app/bitpos/main?color=f7931a&style=flat-square)](https://github.com/bitPOS-app/bitpos/commits/main)
[![release](https://img.shields.io/github/v/release/bitPOS-app/bitpos?color=f7931a&style=flat-square&include_prereleases)](https://github.com/bitPOS-app/bitpos/releases)
[![license](https://img.shields.io/github/license/bitPOS-app/bitpos?color=f7931a&style=flat-square)](LICENSE)

This is the exact code running on `bitpos.app`. Verify it in one line.

---

## verify

```bash
$ curl -s https://bitpos.app/api/version | jq
{
  "commit": "20a4e827e89c6f1bc9a55d50d6b5ffd40c455a83",
  "shortCommit": "20a4e82",
  "tag": "untagged",
  "builtAt": "2026-05-24T12:25:00Z",
  "repoUrl": "https://github.com/bitPOS-app/bitpos"
}
```

The `commit` field is the SHA the live server was built from. The merchant dashboard and the landing footer surface the same hash, linked to its commit on GitHub. Match them. The chain holds for any bitPOS deployment.

---

## card writer

A standalone Android app that programs and wipes NTAG 424 DNA Bolt Cards against any bitPOS instance.

**[Download bitPOS-Card-Writer.apk](https://github.com/bitPOS-app/bitpos/releases/latest/download/bitPOS-Card-Writer.apk)**

Requirements: Android with NFC, an NTAG 424 DNA blank.

| Screen | Action |
|--------|--------|
| **Write** | Paste a provision URL. Hold card to phone. Card becomes a working Bolt Card. |
| **Wipe**  | Paste the wipe JSON. Hold card to phone. Card resets to factory defaults. |

Walks the full NTAG 424 DNA APDU sequence:

```
AuthenticateEV2First    AES-128 mutual auth
ChangeKey x5            program k0 (app master) + k1..k4 (Bolt Card CMAC keys)
ChangeFileSettings      enable SDM with LNURL-w parameters
WriteBinary             write the NDEF record (LNURL-w URL)
```

All key material is fetched at provision time. Nothing persists on the device. Source: [`artifacts/card-writer/utils/ntag424.ts`](artifacts/card-writer/utils/ntag424.ts).

---

## what's here

```
artifacts/web          merchant dashboard, PWA, tap-to-pay
artifacts/landing      bitpos.app
artifacts/api-server   LNURL-w, NWC settlement, auth, provisioning
artifacts/card-writer  NFC programmer (above)
lib/                   shared schemas, db, version stamp, integrations
```

---

## license

[AGPL-3.0-or-later](LICENSE). Modifications offered to users as a service are published under the same terms. The verification chain holds across forks.
