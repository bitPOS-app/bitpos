import axios from "axios";
import { logger } from "./logger";

interface PriceCache {
  usd: number; eur: number; gbp: number; fetchedAt: number;
}

let cache: PriceCache | null = null;
const CACHE_TTL_MS = 60_000;

// Per-currency cache
const currencyCache = new Map<string, { price: number; fetchedAt: number }>();

// Supported currencies cache (24 h), keyed by source.
const supportedCurrenciesCache = new Map<string, { list: string[]; fetchedAt: number }>();
const CURRENCIES_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Fiat currencies Binance actually trades against BTC (live-verified 2026-07).
 * Anything not in this set has no BTC/FIAT pair on Binance, so selecting it
 * yields a missing/zero price (the "sats only" wallet bug). We intersect this
 * with CoinGecko's supported list so codes stay canonical.
 */
const BINANCE_FIAT_QUOTES = new Set([
  "usd", "ars", "aud", "brl", "eur", "gbp", "idr", "jpy", "mxn",
  "ngn", "pln", "ron", "rub", "try", "uah", "zar",
]);

export type RateSource = "coingecko" | "binance";

export interface BtcPrice {
  usd: number; eur: number; gbp: number;
}

export async function getBtcPrice(): Promise<BtcPrice> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return { usd: cache.usd, eur: cache.eur, gbp: cache.gbp };
  }
  try {
    const response = await axios.get(
      "https://api.coingecko.com/api/v3/simple/price",
      { params: { ids: "bitcoin", vs_currencies: "usd,eur,gbp" }, timeout: 5000 },
    );
    const data = response.data?.bitcoin;
    if (!data) throw new Error("Unexpected CoinGecko response");
    cache = { usd: data.usd, eur: data.eur, gbp: data.gbp, fetchedAt: now };
    return { usd: cache.usd, eur: cache.eur, gbp: cache.gbp };
  } catch (err) {
    logger.error({ err }, "Failed to fetch BTC price from CoinGecko");
    if (cache) return { usd: cache.usd, eur: cache.eur, gbp: cache.gbp };
    return { usd: 0, eur: 0, gbp: 0 };
  }
}

/**
 * Fetch BTC price from Binance public API (free, no key required).
 * Returns price of 1 BTC in USDT.
 */
async function getBtcPriceBinanceUsd(): Promise<number | null> {
  try {
    const response = await axios.get(
      "https://api.binance.com/api/v3/ticker/price",
      { params: { symbol: "BTCUSDT" }, timeout: 5000 },
    );
    const price = parseFloat(response.data?.price);
    if (isNaN(price)) throw new Error("Invalid Binance price");
    return price;
  } catch (err) {
    logger.error({ err }, "Failed to fetch BTC price from Binance");
    return null;
  }
}

/**
 * Fetch the BTC price in any supported vs_currency.
 * source: "coingecko" or "binance". Binance only gives BTC/USDT — other
 * fiat pairs are computed via CoinGecko's USDT/fiat rate as a fallback layer.
 */
export async function getBtcPriceFor(
  currency: string,
  source: RateSource = "coingecko"
): Promise<number> {
  const key = currency.toLowerCase();
  if (key === "sats") return 100_000_000;

  const now = Date.now();
  const cached = currencyCache.get(`${source}:${key}`);
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.price;
  }

  if (source === "binance") {
    const btcUsdt = await getBtcPriceBinanceUsd();
    if (btcUsdt === null) {
      // fall back to coingecko
      return getBtcPriceFor(key, "coingecko");
    }
    if (key === "usd" || key === "usdt") {
      currencyCache.set(`${source}:${key}`, { price: btcUsdt, fetchedAt: now });
      return btcUsdt;
    }
    // For non-USD currencies, get the USDT/fiat rate from CoinGecko
    // then compute: BTC/FIAT = BTC/USDT × USDT/FIAT
    const usdtPrice = await getBtcPriceFor(key === "usd" ? "usd" : key, "coingecko")
      .catch(() => 0);
    const usdPrice = key === "usd" ? btcUsdt : (await getBtcPriceFor("usd", "coingecko").catch(() => 0));
    if (usdPrice > 0) {
      const ratio = usdtPrice / usdPrice;
      const price = btcUsdt * ratio;
      currencyCache.set(`${source}:${key}`, { price, fetchedAt: now });
      return price;
    }
    return btcUsdt;
  }

  // coingecko (default)
  try {
    const response = await axios.get(
      "https://api.coingecko.com/api/v3/simple/price",
      { params: { ids: "bitcoin", vs_currencies: key }, timeout: 5000 },
    );
    const price: number = response.data?.bitcoin?.[key];
    if (typeof price !== "number") throw new Error(`No price for ${key}`);
    currencyCache.set(`${source}:${key}`, { price, fetchedAt: now });
    return price;
  } catch (err) {
    logger.error({ err, currency: key }, "Failed to fetch BTC price for currency");
    const stale = currencyCache.get(`${source}:${key}`);
    if (stale) return stale.price;
    return 0;
  }
}

/**
 * Evaluate a rate modifier expression like "THB*1.01" or "THB-0.5+THB*0.02".
 * Supported: CURRENCY*NUMBER, CURRENCY+NUMBER, CURRENCY-NUMBER, combinations.
 * The CURRENCY prefix is symbolic — we substitute the actual price value.
 */
export function applyRateModifier(price: number, modifier: string | null | undefined): number {
  if (!modifier || !modifier.trim()) return price;

  // Remove spaces, convert to lowercase
  const expr = modifier.replace(/\s/g, "").toLowerCase();

  // Replace currency code with the actual price value
  // The expression starts with a currency code (3-5 letters) followed by operators
  const match = expr.match(/^([a-z]{3,5})(.+)$/);
  if (!match) return price;

  const [, _currency, ops] = match;

  // Simple evaluator: split on + and -, evaluate each term
  // e.g. "thb*1.01+2" → [thb*1.01, +2]
  // e.g. "thb-0.5" → [thb, -0.5]
  let result = price; // start with the base currency value
  let currentNum = "";
  let currentOp = "";

  // Parse: first term is always "CURRENCY" or "CURRENCY*MULTIPLIER"
  const firstTerm = ops.match(/^\*?(\d+\.?\d*)/);
  if (firstTerm) {
    const mult = parseFloat(firstTerm[1]);
    if (!isNaN(mult) && ops.startsWith("*")) {
      result = price * mult;
    }
  }

  // Parse remaining +/- operators
  const rest = ops.replace(/^\*?\d+\.?\d*/, "");
  const opTerms = rest.match(/([+-])\*?(\d+\.?\d*)/g);
  if (opTerms) {
    for (const term of opTerms) {
      const m = term.match(/([+-])\*?(\d+\.?\d*)/);
      if (m) {
        const op = m[1];
        const num = parseFloat(m[2]);
        if (!isNaN(num)) {
          if (op === "+" || op === "-") {
            result += (op === "+" ? 1 : -1) * (term.includes("*") ? price * num / price * num : num);
          }
        }
      }
    }
  }

  // If the expression is just simple: CURRENCY*MULTIPLIER
  const simpleMult = ops.match(/^\*(\d+\.?\d*)$/);
  if (simpleMult) {
    result = price * parseFloat(simpleMult[1]);
  }

  // If the expression is: CURRENCY+NUMBER or CURRENCY-NUMBER
  const simpleAdd = ops.match(/^([+-])(\d+\.?\d*)$/);
  if (simpleAdd) {
    const op = simpleAdd[1];
    const num = parseFloat(simpleAdd[2]);
    result = op === "+" ? price + num : price - num;
  }

  return Math.round(result * 100) / 100;
}

export async function getSupportedCurrencies(source: RateSource = "coingecko"): Promise<string[]> {
  const now = Date.now();
  const cached = supportedCurrenciesCache.get(source);
  if (cached && now - cached.fetchedAt < CURRENCIES_TTL_MS) {
    return cached.list;
  }
  try {
    const response = await axios.get(
      "https://api.coingecko.com/api/v3/simple/supported_vs_currencies",
      { timeout: 8000 },
    );
    const raw: string[] = response.data;
    if (!Array.isArray(raw)) throw new Error("Unexpected response");
    let filtered = raw.filter((c) => c !== "btc" && c !== "sats");
    if (source === "binance") {
      // Only offer fiats Binance has a real BTC pair for — otherwise the
      // selection has no data and the wallet silently shows sats only.
      filtered = filtered.filter((c) => BINANCE_FIAT_QUOTES.has(c));
    }
    filtered.sort();
    const list = ["sats", "btc", ...filtered];
    supportedCurrenciesCache.set(source, { list, fetchedAt: now });
    return list;
  } catch (err) {
    logger.error({ err }, "Failed to fetch supported currencies from CoinGecko");
    if (cached) return cached.list;
    const fallback = ["usd", "eur", "gbp", "xau", "jpy", "aud", "cad", "chf"];
    const base = source === "binance" ? fallback.filter((c) => BINANCE_FIAT_QUOTES.has(c)) : fallback;
    return ["sats", "btc", ...base];
  }
}

export function satsToFiat(sats: number, price: BtcPrice): { usd: number; eur: number; gbp: number } {
  const btc = sats / 100_000_000;
  return {
    usd: Math.round(btc * price.usd * 100) / 100,
    eur: Math.round(btc * price.eur * 100) / 100,
    gbp: Math.round(btc * price.gbp * 100) / 100,
  };
}

export function fiatToSats(amount: number, currency: "usd" | "eur" | "gbp", price: BtcPrice): number {
  const priceInCurrency = price[currency];
  if (!priceInCurrency) return 0;
  return Math.round((amount / priceInCurrency) * 100_000_000);
}
