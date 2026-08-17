# Security

bitPOS settles Lightning payments. Report defects that affect funds, keys, or
authentication privately.

## Reporting

Do not file a public issue.

https://github.com/bitPOS-app/bitpos/security/advisories/new

Include impact, reproduction, and the commit from `GET /api/version` if the
defect is in production.

Acknowledgement target: 48 hours.

## In scope

- Invoice substitution, payment interception, fee tampering, hold-wrap bypass
- Session/PIN bypass, token forgery, privilege escalation
- Bolt Card SDM / AES-128 key exposure, counter replay, keys in logs
- Secrets in the published tree, logs, or error responses

## Out of scope

- Failures in a third-party NIP-47 wallet or Nostr relay
- Lightning routing failures
- Dependency defects with no demonstrated impact here (still useful to report)

## Trust boundary

Merchant funds remain in the wallet the merchant connected. bitPOS stores the
NWC URL encrypted at rest (AES-256-GCM) in order to create invoices and pay
on the merchant's behalf. The posBOX does not hold keys. Incoming wraps take
1%; the platform fee on send is 0.

The running binary is identified by `GET /api/version`.
