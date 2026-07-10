// ── Card shop pricing (all amounts in EUR cents) ──────────────────────────────
//
// Printags Classique plan (69 EUR/mo):
//   Card:     1.75 EUR/unit
//   Printing: 4.00 EUR/unit  --> printed card total: 5.75 EUR/unit
//   Shipping: 6.24 EUR/batch (up to 21 cards per batch)
//
// Our margin: +2 EUR per printed card (custom and community designs).
//
// STRATEGY:
//   bitPOS branded is sold at cost (5.75 EUR = Printags card + print fee).
//   No margin - we accept break-even to maximise branded cards in the wild.
//   Plain white is priced above the printed-card rate to discourage unbranded orders.
//
//   bitPOS branded:  5.75 EUR  (at cost -- 0 margin, maximise brand circulation)
//   Plain white:     6.75 EUR  (above cost -- not encouraged)
//   Custom upload:   7.75 EUR  (Printags cost 5.75 + 2.00 EUR margin)
//   Community design: same base as custom upload + creator royalty in sats on top
//
// All values are EUR cents (integer). The shop always displays prices in sats;
// EUR cents are converted to sats via the live BTC/EUR rate.

export const BITPOS_BRANDED_EUR_CENTS = 575;  // 5.75 EUR (at cost, 0 margin)
export const PLAIN_WHITE_EUR_CENTS    = 675;  // 6.75 EUR
export const CUSTOM_UPLOAD_EUR_CENTS  = 775;  // 7.75 EUR (5.75 Printags + 2.00 margin)

// Printags ships up to 21 cards together for a single shipping fee.
// Every additional batch of 21 cards adds one more shipping cost.
// Formula: ceil(quantity / 21) x 6.24 EUR
export const SHIPPING_BATCH_SIZE = 21;
export const SHIPPING_EUR_CENTS_PER_BATCH = 624; // 6.24 EUR per batch of up to 21 cards

export function getShippingEurCents(_country: string, quantity: number): number {
  const batches = Math.ceil(quantity / SHIPPING_BATCH_SIZE);
  return batches * SHIPPING_EUR_CENTS_PER_BATCH;
}

export function eurCentsToSats(eurCents: number, btcEurRate: number): number {
  if (!btcEurRate || btcEurRate <= 0) return 0;
  return Math.ceil((eurCents / 100 / btcEurRate) * 100_000_000);
}
