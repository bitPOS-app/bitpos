---
name: printags-api
description: Reference for the Printags NFC card printing API used in the bitPOS card shop. Use when working on card ordering, print order submission, file uploads, order status tracking, or the Printags webhook handler. Covers correct endpoint URLs, request/response shapes, model IDs, status values, and file paths for the existing integration code.
---

# Printags API

Printags is a physical NFC card printing and fulfilment service. bitPOS uses it to print and ship Bolt Cards (NTAG424 DNA) ordered through the card shop.

## Auth

All requests use a JWT Bearer token:
```
Authorization: Bearer <PRINTAGS_SECRET_KEY>
```

Env vars required (both must be set or `isConfigured()` returns false):
- `PRINTAGS_SECRET_KEY` - API key
- `PRINTAGS_ACCOUNT_ID` - Account UUID

## Base URL

```
https://api.printags.com
```

All responses are wrapped: `{ "success": true, ... }` on success.

## Endpoints

### Upload a file
```
POST /accounts/{accountId}/files
Content-Type: multipart/form-data
Body field: file
```
Returns the uploaded file so it can be referenced as a `printingVisual` in orders. The response shape is poorly documented (docs say `image/*`) but the live API returns JSON. The integration code tries multiple field names to extract the file UUID — this has been verified to work.

### Get live shipping rates
```
POST /shipping/rates
Content-Type: application/json
```
Returns real carrier options (price + ETA) for a destination. Use this to let the
customer pick a carrier at checkout; pass the chosen option's service id as
`carrierServiceId` when creating the order. There is no flat-rate fallback - if
this call fails, block checkout rather than guessing a price.

Request body:
```json
{
  "to_country": "FR",
  "to_postal_code": "75001",
  "items": [
    { "modelId": "ntag424_pvccard_white", "quantity": 1 }
  ]
}
```
`items[].packagingId` is optional. Response shape varies, so parse defensively
(the integration uses helpers that scan common key names). Each rate exposes,
under varying key names:
- a service/carrier id (used as `carrierServiceId` on the order)
- a human name (carrier + service)
- a price (amount + currency, or a cents field) - normalized to EUR cents
- optional estimated delivery days (min/max)

Rates are returned cheapest-first by the bitPOS `/shop/shipping-rates` route.

**Critical:** The price is server-authoritative. The order route re-fetches rates
and looks up the chosen `carrierServiceId` server-side; it never trusts a price
sent by the client.

### Create an order
```
POST /accounts/{accountId}/orders
Content-Type: application/json
```
`carrierServiceId` must be a real service id from `POST /shipping/rates` (see
above). The legacy hardcoded `lpf_standard` is only a last-resort default in
`createOrder()` when no id is supplied.
Request body:
```json
{
  "isDraft": false,
  "reference": "SHORT-REF",
  "carrierServiceId": "lpf_standard",
  "shipTo": {
    "name": "Jane Smith",
    "phone": "+33612345678",
    "email": "jane@example.com",
    "address": {
      "addressLine1": "10 rue de la Paix",
      "addressLine2": "Apt 3",
      "city": "Paris",
      "postcode": "75001",
      "countryCode": "FR"
    }
  },
  "groups": [
    {
      "quantity": 1,
      "modelId": "ntag424_pvccard_white",
      "nfc": { "type": "empty" },
      "printingVisuals": ["file-uuid-from-upload"],
      "metadata": { "internalId": "your-internal-order-uuid" }
    }
  ]
}
```

Response:
```json
{ "success": true, "orderId": "987e6543-..." }
```

**Critical:** The order ID is at `data.orderId` (root level, not nested).

### Get order by ID
```
GET /accounts/{accountId}/orders/{orderId}
```
Response:
```json
{
  "success": true,
  "order": {
    "id": "987e6543-...",
    "status": "created",
    "product_groups": [
      { "modelId": "ntag424_pvccard_white", ... }
    ],
    "shippings": [
      {
        "trackingNumber": "1Z999AA10123456784",
        "trackerId": "1234567890"
      }
    ]
  }
}
```

**Critical:** Tracking number is at `data.order.shippings[0].trackingNumber` — NOT at `data.order.trackingNumber`.
Status is at `data.order.status`.

### Find orders
```
GET /accounts/{accountId}/orders/find?metadata=...&reference=...
```

### Validate an order (dry run)
```
POST /accounts/{accountId}/orders/validate
```
Same body as create — useful for testing without placing a real order.

### Get current account
```
GET /accounts/@me
```
Response includes `balance`, `subscription_plan`, etc.

### Get all statuses
```
GET /statuses
```

## Model IDs

| Card type | modelId |
|---|---|
| Plain white NTAG424 | `ntag424_pvccard_white` |
| Branded/custom printed | `ntag424_pvccard_white` + `printingVisuals` (same model) |

Printing is additive - you do NOT use a different modelId for printed cards. The same `ntag424_pvccard_white` is used; `printingVisuals` triggers the print job.

## Status Values

This is the AUTHORITATIVE list of Printags statuses (fetch live with `GET /statuses`).
There are 20 statuses. IMPORTANT: the numeric ids returned by `/statuses` are NOT in
lifecycle order (e.g. `in_queue` is id 19 but happens early), so never rank by id.
The lifecycle order and the mapping to internal bitPOS coarse statuses live in
`artifacts/api-server/src/lib/printagsStatus.ts` (single source of truth, shared by
the webhook, the page-load enrich, and the background poller).

The exact Printags status is stored on `card_orders.print_status`; the coarse bitPOS
status (used by the 5-step timeline) is stored on `card_orders.status`.

| Printags status (lifecycle order) | bitPOS coarse status |
|---|---|
| `creating` | `confirmed` |
| `draft` | `confirmed` |
| `in_queue` | `confirmed` |
| `created` | `confirmed` |
| `validated` | `confirmed` |
| `processing` | `confirmed` |
| `treated` | `confirmed` |
| `batching` | `confirmed` |
| `sent_for_printing` | `printing` |
| `manufacturing` | `printing` |
| `packaging` | `printing` |
| `packaged` | `printing` |
| `ready_for_shipping` | `printing` |
| `shipped` | `shipped` |
| `delivered` | `delivered` |

Non-linear / exception statuses (mapped to themselves; `canceled` is the US spelling of `cancelled`):

| Printags status | bitPOS coarse status |
|---|---|
| `cancelled` / `canceled` | `cancelled` |
| `on_hold` | `on_hold` |
| `returned` | `returned` |
| `refunded` | `refunded` |
| `failed` | `failed` |

Status updates are forward-only: a later or stale event can never move an order
backwards through the lifecycle. Exception statuses are authoritative and applied
directly, except a hard-terminal order (cancelled/returned/refunded) is never resurrected.

## NFC field

For all bitPOS card orders, use `"nfc": { "type": "empty" }` - cards ship blank and are programmed separately by the Card Writer app.

## Integration File Paths

| Purpose | File |
|---|---|
| Printags API client | `artifacts/api-server/src/lib/printags.ts` |
| Order auto-submission | `artifacts/api-server/src/lib/shopOrderAutoSettle.ts` |
| Shop routes + webhook | `artifacts/api-server/src/routes/shop.ts` |
| Pricing constants | `artifacts/api-server/src/lib/shopPricing.ts` |
| DB schema | `lib/db/src/schema/shop.ts` |
| Branded card artwork | `artifacts/api-server/src/assets/bitpos-branded-front.png` |

## Webhook

Printags POSTs status updates to `/api/shop/webhook`. Printags does not issue webhook signing secrets, so `PRINTAGS_WEBHOOK_SECRET` is intentionally unset (all events are accepted). The handler is at the bottom of `shop.ts`.

Register the webhook URL in the Printags dashboard:
```
https://<production-domain>/api/shop/webhook
```

## Key Gotchas

- Shipping PII (name, email, address) is AES-encrypted at rest in the DB. Always call `decryptOrderShipping()` before passing shipping fields to Printags.
- The `printafsFileId` column in `card_designs` is intentionally misspelled (missing 'g') — it's a historical naming artifact, do not rename it.
- On server startup, the branded card artwork is auto-uploaded to Printags if `printafsFileId` is null for the `bitpos-branded` design. This is idempotent.
- `submitOrderToPrintags` is fire-and-forget (errors logged but not rethrown) so a Printags failure never rolls back a completed Lightning payment.
- Orders that paid via balance use "Path A" (direct deduction). Orders that needed a top-up use "Path B" (Lightning invoice for the shortfall, then auto-settle after payment).
