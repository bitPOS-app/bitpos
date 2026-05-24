// ── Card shop pricing (all amounts in EUR cents) ──────────────────────────────
//
// Printags Classique plan (69 €/mo):
//   • Plain NFC card:  1.75 €/unit
//   • Printing add-on: 4.00 €/unit  → printed card total: 5.75 €/unit
//
// Our margin: +1 € per card on every line.
//
// STRATEGY — invert branded vs plain-white pricing:
//   bitPOS branded is priced at the plain-white Printags cost + our margin
//   (2.75 €) even though it costs us 5.75 € from Printags.  We absorb the
//   ~4 € printing cost as marketing — more branded cards in the wild = more
//   organic exposure.  Plain white is priced at the printed-card rate + margin
//   (6.75 €) to gently discourage unbranded orders and recover our print cost.
//
//   bitPOS branded:  2.75 €  (cheapest — subsidised, maximise brand circulation)
//   Plain white:     6.75 €  (more expensive — discouraged)
//   Custom upload:   9.75 €  (most expensive — user-supplied art + handling)
//
// All values are EUR cents (integer).  The shop always displays prices in sats;
// EUR cents are converted to sats via the live BTC/EUR rate.

export const BITPOS_BRANDED_EUR_CENTS = 275;  // 2.75 €
export const PLAIN_WHITE_EUR_CENTS    = 675;  // 6.75 €
export const CUSTOM_UPLOAD_EUR_CENTS  = 975;  // 9.75 €

// Printags ships up to 21 cards together for a single shipping fee.
// Every additional batch of 21 cards adds one more shipping cost.
// Formula: ceil(quantity / 21) × 4.95 €
export const SHIPPING_BATCH_SIZE = 21;
export const SHIPPING_EUR_CENTS_PER_BATCH = 495; // 4.95 € per batch of up to 21 cards

export function getShippingEurCents(_country: string, quantity: number): number {
  const batches = Math.ceil(quantity / SHIPPING_BATCH_SIZE);
  return batches * SHIPPING_EUR_CENTS_PER_BATCH;
}

export function eurCentsToSats(eurCents: number, btcEurRate: number): number {
  if (!btcEurRate || btcEurRate <= 0) return 0;
  return Math.ceil((eurCents / 100 / btcEurRate) * 100_000_000);
}
