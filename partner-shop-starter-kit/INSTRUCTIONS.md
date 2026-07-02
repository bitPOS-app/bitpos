# Partner Card Shop Starter Kit - Technical Instructions

This kit contains the REAL source code for two features lifted from the bitPOS
Lightning POS app:

1. Card Studio - a CR80 (credit-card size) design editor that runs entirely in
   the browser.
2. Card Shop - the ordering, checkout, and fulfillment flow that turns a saved
   design into a printed NTAG424 card via the Printags print API.

The goal is to let a standalone hardware-provider partner website recreate both
features. The Card Studio drops in almost unchanged. The Card Shop is tightly
coupled to bitPOS-internal systems (user accounts, Lightning wallet, FX pricing,
AES encryption), so parts of it must be re-implemented against your own stack.
This document tells you exactly what is reusable, what must be rebuilt, and how
every piece fits together.

A note on later expansion: the partner plans to sell POS Boxes (hardware
terminals) in addition to cards. This kit covers cards only. The data model and
pricing helpers are written so a second product type can be added later without
reworking the order pipeline.

---

## 1. Folder map

```
partner-shop-starter-kit/
  PROMPT.md                 Copy-paste prompt to bootstrap a new project
  INSTRUCTIONS.md           This file
  card-studio/              The design editor (frontend only, self-contained)
    CardStudioPage.tsx      The editor page (React + react-konva)
    types.ts                Canvas constants, element + document types
    nodes.tsx               react-konva render nodes per element kind
    Inspector.tsx           Right-hand property panel
    LayersPanel.tsx         Left-hand layer list
    StickerPanel.tsx        Community sticker browser + submit
    TemplatesModal.tsx      Starter template picker
    templates.ts            Built-in template definitions
    DraftsModal.tsx         Saved-design browser (localStorage)
    PrintCheckModal.tsx     Pre-print readiness checks (DPI, bleed, safe area)
    PreviewModal.tsx        Front/back preview
    BrandKitModal.tsx       Brand colors / logo / font
    TextDialog.tsx          Add/edit text
    QrDialog.tsx            Add/edit QR element
    HelpModal.tsx           In-editor help
    storage.ts              localStorage persistence (drafts, autosave, brand kit)
    useHistory.ts           Undo/redo stack
    qr.ts                   QR data-URL generator
    fonts.ts                Font family list
  card-shop/
    frontend/
      ShopPage.tsx          Shop UI: pick design, qty, shipping, checkout, history
    backend/
      shop.ts               All /api/shop routes (Express)
      printags.ts           Printags API client (files, orders, rates, status)
      printagsStatus.ts     Maps raw Printags status to a coarse lifecycle
      shopPricing.ts        EUR-cent price + shipping math
      shopRevenue.ts        Royalty credit + revenue forwarding
      shopOrderAutoSettle.ts  Confirms paid orders and submits to Printags
      shopOrderExpiry.ts    Expires unpaid Lightning orders
      shopOrderStatusPoller.ts  Background polling of active orders
      price.ts              FX conversion (EUR/USD <-> sats) via CoinGecko
      encrypt.ts            AES-256-GCM for PII at rest
    db/
      shop.ts               Drizzle schema for card_designs + card_orders
  reference/
    printags-api.md         Printags API reference (endpoints, models, statuses)
```

---

## 2. Card Studio (reusable as-is)

The Studio is a self-contained React frontend. It has no server dependency for
editing. State lives in React, undo/redo is in `useHistory.ts`, and persistence
is browser `localStorage` via `storage.ts` (drafts, an autosave slot, and a
brand kit). Designs embed uploaded images as data URLs, which is why
`storage.ts` treats a failed `localStorage.setItem` as a quota error rather than
crashing.

### Canvas model

- A card is a `StudioDoc` with a `front` and `back` `SideData` (see `types.ts`).
- Each side has `elements: StudioEl[]` plus a background (`solid`, `gradient`,
  or `image`).
- Element kinds: `image`, `text`, `sticker`, `qr`, `shape`. All share `BaseEl`
  (id, position, rotation, opacity, locked, hidden).
- Canvas display size is 810 x 510. The print export target is CR80 at 300 DPI:
  1011 x 638 px (85.6mm x 53.98mm). Corner radius and safe-area inset are derived
  from the physical card dimensions. Minimum acceptable raster resolution is
  `MIN_PRINT_DPI = 250`; `imageDpi()` computes effective DPI for a placed image
  and the Inspector warns below 250.

### Printable-content rule (important)

`sideHasPrintableContent()` in `types.ts` decides whether a side counts as having
real artwork. A side is printable if it has any visible element OR a non-default
background (a gradient, an uploaded background image, or a solid color other than
the default `#1a1a2e`). Do NOT gate "is this side ready to print" on elements
only. Preview, upload, and pre-print checks all rely on this function.

### What to wire up when porting the Studio

- The export step renders the konva stage to a PNG data URL per side. The Shop
  uploads those PNGs to Printags to get file ids.
- `StickerPanel.tsx` calls `/api/stickers` (list) and `/api/stickers/publish`
  (community submit). These are optional. If you do not want community stickers,
  remove the panel and the two endpoints. If you keep them, see the royalty
  notes in section 4.
- Fonts in `fonts.ts` are standard web/system fonts. If you add custom fonts,
  load them before the konva stage renders so text measures correctly.

---

## 3. Card Shop order lifecycle

Routes live in `card-shop/backend/shop.ts` and are mounted under `/api/shop`.

1. List designs: `GET /api/shop/designs` returns branded, plain, and approved
   community designs.
2. Upload custom artwork (auth required): `POST /api/shop/upload` sends a PNG to
   Printags and returns a `fileId`. Used when the buyer designs their own card in
   the Studio.
3. Quote: `GET /api/shop/quote` takes design id, quantity, and destination
   country and returns EUR-cent totals plus the live sats equivalent.
4. Shipping rates: `POST /api/shop/shipping-rates` proxies Printags
   `/shipping/rates` for live carrier options for the destination. (Note: the
   bitPOS Printags account only returns carriers for France today; your partner
   account will return its own enabled countries.)
5. Create order: `POST /api/shop/orders`. The server computes the final sats
   amount (base EUR + shipping EUR + any royalties, converted to sats),
   encrypts the PII shipping fields, then either:
   - Balance path: deducts the buyer's internal balance and marks the order
     `confirmed`, or
   - Lightning path: creates a BOLT11 invoice and marks the order
     `awaiting_payment`.
6. Pay: `POST /api/shop/orders/:id/pay` finalizes payment (balance deduction or
   invoice settlement verification).
7. Auto-settle: once an order is `confirmed`, `shopOrderAutoSettle.ts` calls
   `submitOrderToPrintags`, credits any community-design royalties, and forwards
   net revenue to the platform address.
8. Status sync: `GET /api/shop/orders/:id` triggers a background refresh from
   Printags; `shopOrderStatusPoller.ts` polls active orders every ~2 minutes;
   `POST /api/shop/webhook` receives Printags status updates.
9. Expiry: `shopOrderExpiry.ts` cancels Lightning orders that are never paid.
10. History: `GET /api/shop/orders` returns the buyer's decrypted order history;
    `POST /api/shop/orders/:id/cancel` cancels an unpaid order.

Additional implemented routes (optional, but present in `shop.ts` if you want
full parity): a community-design publish route (`POST /shop/designs/publish`),
admin moderation/management routes for approving, updating, and deleting
community designs (guarded by `ADMIN_SECRET`), and artwork retrieval routes that
proxy design and order images from Printags for display. Keep these only if you
run a community-design marketplace and a moderation queue; otherwise drop them
along with the royalty logic.

### Status lifecycle (see printagsStatus.ts)

Raw Printags statuses are mapped to a coarse lifecycle. The raw numeric status
ids are NOT in lifecycle order, so rank by the explicit ordered list in
`printagsStatus.ts`, and make status updates forward-only (a guard prevents an
out-of-order webhook from moving an order backwards).

- Confirmed: creating, draft, in_queue, created, validated, processing, treated,
  batching
- Printing: sent_for_printing, manufacturing, packaging, packaged,
  ready_for_shipping
- Shipped: shipped
- Delivered: delivered

---

## 4. Pricing and royalties

All money math is in EUR cents, converted to sats at checkout time.

From `shopPricing.ts`:

- Branded card: 575 cents (5.75 EUR), sold at cost.
- Plain white card: 675 cents (6.75 EUR).
- Custom upload / community design: 775 cents (7.75 EUR), includes ~2.00 EUR
  margin.
- Shipping: `ceil(quantity / 21) * 624` cents. That is 6.24 EUR per batch of up
  to 21 cards.

From `shopRevenue.ts`:

- Community designs can carry `royaltySatsPerUnit`. On order confirmation the
  royalty (royalty per unit x quantity) is credited to the design author's
  internal balance.
- The remaining `amountSats - royaltySats` is forwarded to the platform revenue
  Lightning address (`BITPOS_CARD_REVENUE_ADDRESS`).

EUR-cent to sats conversion is in `price.ts`, which fetches live BTC/EUR/USD
rates from CoinGecko (`api.coingecko.com/api/v3/simple/price`). Cache the rate
and handle fetch failure explicitly; do not silently fall back to a stale or
zero rate at checkout.

---

## 5. Coupling points you must re-implement

The Studio is portable. The Shop assumes several bitPOS-internal services. For a
standalone partner site, replace each of these with your own implementation.

### (a) User accounts and auth

The routes use a `requireAuth` middleware that resolves an `accountId` from a
JWT/session. Order rows are keyed by `account_id`. Re-implement with your own
auth (the user decided on FULL user accounts: login, order history, saved
designs). Every shop route that creates or reads an order needs the
authenticated account id. Saved designs and order history are per account.

### (b) Lightning payment (NWC)

bitPOS creates and monitors invoices through Nostr Wallet Connect (NWC). It uses
a main wallet NWC URL plus optional per-user sub-wallets, and detects settlement
by subscribing to payment hashes. For the partner site, provide your own NWC URL
(for example an Alby Hub connection) and an invoice-monitor that flips an order
from `awaiting_payment` to `confirmed` on settlement. `makeInvoice` and
`lookupInvoice` are the two operations you need.

### (c) Stripe payment (NEW, add this)

The user wants BOTH Stripe AND Lightning. The original bitPOS shop is Lightning
(and internal balance) only, so there is no Stripe code here. Add a third
payment path in `POST /api/shop/orders`:

- Create a Stripe PaymentIntent (or Checkout Session) for the EUR-cent total
  (Stripe is natively EUR-cent based, so no sats conversion is needed on the
  Stripe path).
- On the Stripe webhook `payment_intent.succeeded` (or
  `checkout.session.completed`), move the order to `confirmed`, which triggers
  the same auto-settle -> Printags submission used by the Lightning path.
- Keep the Lightning path exactly as-is. Both paths must converge on the same
  `confirmed` state so fulfillment is identical regardless of how the buyer
  paid. Check for a Stripe integration blueprint before wiring
  keys by hand.

### (d) AES encryption for PII

`encrypt.ts` uses AES-256-GCM with a key derived from `SESSION_SECRET`. ALL
shipping PII fields are encrypted at rest, including the country: name, email,
phone, address line 1 and 2, city, postal code, and country
(`encryptShippingFields` in `shop.ts`), and they are decrypted on read. The
destination country used for live shipping-rate lookups does NOT come from the
stored order; it is supplied in the request at quote and checkout time
(`GET /shop/quote?country=...` and the body of `POST /shop/shipping-rates`).
Re-implement with your own secret. Do not store buyer PII in plaintext.

### (e) FX price service

`price.ts` (see section 4). Reusable as-is if you keep a CoinGecko-based rate.

### (f) Shared infrastructure

- Database: Drizzle ORM on PostgreSQL. `db/shop.ts` is the shop schema only; you
  will also need an `accounts` table (with `balanceSats`) and a sessions/auth
  table from your own auth system.
- A structured logger.
- Community-design moderation uses `ADMIN_SECRET` and opens GitHub issues via
  `GITHUB_WORKFLOW_TOKEN`. Both are optional; drop them if you do not run a
  moderation queue.

---

## 6. Database schema (db/shop.ts)

- `card_designs`: id, name, printags file id (front), printags file id (back),
  price_eur_cents, is_community, royalty_sats_per_unit, submitted_by_account_id,
  approval state.
- `card_orders`: id, account_id, print_order_id (Printags UUID), status (the
  coarse lifecycle), print_status (raw Printags status), amount_sats, quantity,
  encrypted shipping fields (name, email, phone, address, city, postal code, and
  country - all AES encrypted), pending_invoice_id, timestamps.

The payment and order logic in `shop.ts` also reads and writes two tables that
are NOT defined in `db/shop.ts` and come from the wider bitPOS schema: a pending
invoices table (Lightning invoices awaiting settlement) and a transactions /
ledger table (balance movements). When you rebuild, port equivalents of these
two tables alongside `card_designs` and `card_orders`, or adapt the routes to
your own payment + ledger model.

When you add POS Boxes later, add a product/line-item abstraction rather than a
second parallel orders table, so the payment + fulfillment pipeline stays single.

Drizzle note from experience: `drizzle-kit push` can block on an interactive
truncate prompt for certain changes. For additive columns, apply a direct SQL
`ALTER TABLE ... ADD COLUMN` instead of relying on the interactive push.

---

## 7. Environment variables

Required for the Shop backend:

- `PRINTAGS_SECRET_KEY` - Printags API key.
- `PRINTAGS_ACCOUNT_ID` - Printags account id.
- `PRINTAGS_WEBHOOK_SECRET` - optional, to verify Printags webhooks.
- `SESSION_SECRET` - master key for AES PII encryption (and your sessions).
- `BITPOS_CARD_REVENUE_ADDRESS` - Lightning address that receives net revenue.
  Rename to your own brand.
- `APP_BASE_URL` - public base URL (used for webhook/callback URLs).
- `ADMIN_SECRET` - optional, community-design moderation.
- `GITHUB_WORKFLOW_TOKEN` - optional, opens moderation issues.

You will ALSO add for the partner build:

- Your NWC URL (Lightning).
- Your Stripe secret key + webhook signing secret.
- Your auth secrets (JWT signing key, etc.).

Printags base URL is `https://api.printags.com`. The card model id is
`ntag424_pvccard_white`. Default carrier service is `lpf_standard`. File uploads
go to `POST /accounts/{id}/files` (multipart, `file` field) and return a UUID
that you pass as the artwork id when creating an order.

---

## 8. Suggested build order

1. Stand up auth + accounts (with `balanceSats`) and a PostgreSQL database.
2. Drop in the Card Studio frontend; verify editing, drafts, and PNG export.
3. Add the `card_designs` + `card_orders` schema.
4. Port `printags.ts`, `printagsStatus.ts`, `shopPricing.ts`, `price.ts`,
   `encrypt.ts` (these need little change).
5. Port `shop.ts` routes; wire `requireAuth` to your auth.
6. Wire Lightning (NWC invoice + monitor) for the Lightning path.
7. Add the Stripe path and its webhook; converge both on `confirmed`.
8. Port `shopOrderAutoSettle.ts`, `shopRevenue.ts`, `shopOrderStatusPoller.ts`,
   `shopOrderExpiry.ts`.
9. Test a full order end to end against a Printags test account.

See PROMPT.md for a ready-to-paste project bootstrap prompt.
