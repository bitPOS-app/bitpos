# bitPOS

Source of the Lightning point-of-sale service at [bitpos.app](https://bitpos.app).

Licensed [AGPL-3.0-or-later](LICENSE).

## Model

bitPOS is a hosted settlement layer. Merchants connect a Lightning wallet over
[NIP-47](https://github.com/nostr-protocol/nips/blob/master/47.md) (Nostr Wallet
Connect). Invoice creation, LNURL-withdraw (Bolt Cards), and the posBOX terminal
are clients of that connection.

bitPOS does not hold merchant keys and does not custody merchant funds.

| Direction | Platform fee |
|-----------|----------------|
| Incoming (hold-wrap) | 1% (`ceil`, minimum 1 sat) |
| Outgoing | 0 |

Lightning routing fees are charged by the network, not by bitPOS.

An optional third-party bootstrap wallet may be offered at signup. That wallet's
custody terms are the provider's. It is not the product model.

This tree is published so the running service can be compared to source. It is
not a self-hosting distribution.

## Verification

The process reports the commit it was built from:

```
GET https://bitpos.app/api/version
```

```json
{
  "commit": "<40-hex SHA-1>",
  "shortCommit": "<7-hex>",
  "tag": "<tag or untagged>",
  "builtAt": "<ISO-8601>",
  "repoUrl": "https://github.com/bitPOS-app/bitpos"
}
```

`commit` is a commit on this repository. After a production deploy it equals
`HEAD` of `main`. Until then the public tree may be ahead of the running
binary; that lag is expected.

Implementation: `incomingFeeSats` in `artifacts/api-server/src/lib/holdWrap.ts`.
Outbound platform fee is `0` in `artifacts/api-server/src/lib/feeEngine.ts`.

## Surfaces

| Path | Role |
|------|------|
| `artifacts/api-server` | HTTP API: auth, NIP-47, LNURL-w, hold-wrap, card provision |
| `artifacts/web` | Merchant application |
| `artifacts/landing` | Public site |
| `artifacts/card-writer` | Android NFC programmer for NTAG 424 DNA |
| `artifacts/esp32-pos` | posBOX firmware (ESP32 + PN532) |
| `lib` | Shared schema and version stamp |

The terminal stores Wi-Fi credentials and a bearer token. It does not store a
wallet or card AES keys.

Card writer APDU sequence: AuthenticateEV2First → ChangeKey (k0–k4) →
ChangeFileSettings (SDM / LNURL-w) → WriteBinary (NDEF). Keys are issued at
provision time. Binary: [releases](https://github.com/bitPOS-app/bitpos/releases/latest/download/bitPOS-Card-Writer.apk).

## Security

Report vulnerabilities privately: [SECURITY.md](SECURITY.md).

## Scope of this repository

Working history, deploy, and CI live on a private Gitea instance. GitHub
receives a sanitized snapshot. Do not treat this tree as a clone-and-run kit.
