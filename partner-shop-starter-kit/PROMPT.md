# Bootstrap Prompt - Partner Custom Card Shop

Paste the prompt below into a fresh project to recreate the card design
editor and ordering shop. The real source files referenced live alongside this
file (see INSTRUCTIONS.md for the full folder map and technical detail). Drop the
`card-studio/`, `card-shop/`, and `reference/` folders into the new project so
the tool can read and adapt them.

---

## Copy-paste prompt

Build a standalone website for a hardware provider that sells custom NFC cards
(NTAG424 PVC cards). The site has two core features, and I am giving you the REAL
source code for both in the attached folders. Adapt that code; do not rewrite it
from scratch.

Feature 1 - Card Studio (design editor). Use the code in `card-studio/`. It is a
self-contained React + react-konva editor for CR80 (credit-card size) cards,
front and back. It supports text, images, shapes, QR codes, community stickers,
templates, layers, undo/redo, a brand kit, pre-print readiness checks (DPI, safe
area), and localStorage drafts/autosave. It exports each card side as a PNG. Port
it as-is. The editor needs no backend to run.

Feature 2 - Card Shop (ordering, checkout, fulfillment). Use the code in
`card-shop/`. The flow is: pick a design (or design your own in the Studio),
choose quantity and destination, see a live price, pick a shipping carrier,
check out, pay, and track the order. Fulfillment is handled by the Printags
print API (KEEP this integration - client, status mapping, and reference are all
provided in `card-shop/backend/printags.ts`, `printagsStatus.ts`, and
`reference/printags-api.md`).

Requirements and decisions already made:

- Payments: support BOTH Stripe AND Lightning. The provided shop code only has
  Lightning (via Nostr Wallet Connect) plus an internal balance path. Add a
  Stripe path. All payment paths must converge on the same `confirmed` order
  state so fulfillment is identical no matter how the buyer paid. On the Stripe
  path, charge the EUR-cent total directly (no sats conversion needed). On the
  Lightning path, convert EUR cents to sats using the provided `price.ts`
  (CoinGecko rates) and create/monitor a BOLT11 invoice. Check for a Stripe
  integration blueprint before wiring keys by hand.
- Accounts: full user accounts with login, order history, and saved designs. The
  shop routes assume a `requireAuth` middleware that resolves an account id; wire
  that to the auth you set up. Saved designs and orders are per account, and
  accounts carry an internal sats balance.
- Keep Printags fulfillment exactly as provided. Card model id is
  `ntag424_pvccard_white`; default carrier is `lpf_standard`; artwork PNGs are
  uploaded to Printags to get file ids that are then attached to the order.
- Pricing (already encoded in `shopPricing.ts`, in EUR cents): branded card 575,
  plain white 675, custom/community 775; shipping is `ceil(quantity / 21) * 624`.
  Community designs may carry a per-unit sats royalty credited to the design
  author on order confirmation; net revenue is forwarded to a platform Lightning
  address. Keep this model.
- Encrypt ALL buyer PII shipping fields at rest using the provided AES-256-GCM
  helper in `encrypt.ts`: name, email, phone, address, city, postal code, and
  country are all encrypted. The destination country for live shipping-rate
  lookups comes from the request at quote and checkout time, not from a stored
  plaintext column.
- Database: PostgreSQL with Drizzle ORM. Use the schema in `card-shop/db/shop.ts`
  for `card_designs` and `card_orders`, plus an `accounts` table with a sats
  balance and whatever your auth needs.

Pieces I expect you to re-implement (they are bitPOS-internal and not fully in
this kit): the auth/accounts system, the Lightning NWC invoice + settlement
monitor, the new Stripe path, and your own secrets. The FX price service,
encryption helper, Printags client, pricing math, and status mapping are all
provided and reusable with little change.

Read INSTRUCTIONS.md in this kit first - it has the full lifecycle, every
coupling point, the exact env vars, the DB schema, and a suggested build order.

Branding: this is a standalone partner site, not bitPOS. Use neutral product
naming and your own brand. Rename `BITPOS_CARD_REVENUE_ADDRESS` and any bitPOS
labels to your brand. Do not use em dashes anywhere in code or copy; use hyphens.

Future scope (do NOT build now, just keep the data model open for it): the
partner will later sell POS Boxes (hardware terminals) in addition to cards. Add
a product/line-item abstraction rather than a second parallel orders table so the
same payment and fulfillment pipeline can carry a second product type later.

Environment variables you will need (see INSTRUCTIONS.md section 7):
`PRINTAGS_SECRET_KEY`, `PRINTAGS_ACCOUNT_ID`, `PRINTAGS_WEBHOOK_SECRET`
(optional), `SESSION_SECRET`, a card revenue Lightning address, `APP_BASE_URL`,
your NWC URL, your Stripe secret + webhook signing secret, and your auth secrets.

Start by standing up auth + accounts + database, then drop in the Card Studio and
verify PNG export, then build the shop routes and the two payment paths, then
wire Printags fulfillment and order status tracking. Test one full order end to
end before calling it done.
