import axios from "axios";
import { logger } from "./logger";

interface PriceCache {
  usd: number;
  eur: number;
  gbp: number;
  fetchedAt: number;
}

let cache: PriceCache | null = null;
const CACHE_TTL_MS = 60_000;

// Per-currency cache for arbitrary CoinGecko vs-currencies
const currencyCache = new Map<string, { price: number; fetchedAt: number }>();

// Supported currencies cache (24 h)
let supportedCurrenciesCache: { list: string[]; fetchedAt: number } | null = null;
const CURRENCIES_TTL_MS = 24 * 60 * 60 * 1000;

export interface BtcPrice {
  usd: number;
  eur: number;
  gbp: number;
}

export async function getBtcPrice(): Promise<BtcPrice> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return { usd: cache.usd, eur: cache.eur, gbp: cache.gbp };
  }

  try {
    const response = await axios.get(
      "https://api.coingecko.com/api/v3/simple/price",
      {
        params: {
          ids: "bitcoin",
          vs_currencies: "usd,eur,gbp",
        },
        timeout: 5000,
      },
    );

    const data = response.data?.bitcoin;
    if (!data) throw new Error("Unexpected CoinGecko response");

    cache = {
      usd: data.usd,
      eur: data.eur,
      gbp: data.gbp,
      fetchedAt: now,
    };

    return { usd: cache.usd, eur: cache.eur, gbp: cache.gbp };
  } catch (err) {
    logger.error({ err }, "Failed to fetch BTC price from CoinGecko");
    if (cache) {
      return { usd: cache.usd, eur: cache.eur, gbp: cache.gbp };
    }
    return { usd: 0, eur: 0, gbp: 0 };
  }
}

/**
 * Fetch the BTC price in any CoinGecko-supported vs_currency (e.g. "xau", "jpy", "btc").
 * Returns the price of 1 BTC expressed in that currency unit.
 * Results are cached for 60 s per currency.
 */
export async function getBtcPriceFor(currency: string): Promise<number> {
  const key = currency.toLowerCase();

  // SATS is a special internal unit - 1 BTC = 100_000_000 sats
  if (key === "sats") return 100_000_000;

  const now = Date.now();
  const cached = currencyCache.get(key);
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.price;
  }

  try {
    const response = await axios.get(
      "https://api.coingecko.com/api/v3/simple/price",
      {
        params: { ids: "bitcoin", vs_currencies: key },
        timeout: 5000,
      },
    );

    const price: number = response.data?.bitcoin?.[key];
    if (typeof price !== "number") throw new Error(`No price for ${key}`);

    currencyCache.set(key, { price, fetchedAt: now });
    return price;
  } catch (err) {
    logger.error({ err, currency: key }, "Failed to fetch BTC price for currency");
    const stale = currencyCache.get(key);
    if (stale) return stale.price;
    return 0;
  }
}

/**
 * Return the list of all vs_currencies supported by CoinGecko.
 * Cached for 24 h. Always prepends "sats" and "btc" at the front.
 */
export async function getSupportedCurrencies(): Promise<string[]> {
  const now = Date.now();
  if (supportedCurrenciesCache && now - supportedCurrenciesCache.fetchedAt < CURRENCIES_TTL_MS) {
    return supportedCurrenciesCache.list;
  }

  try {
    const response = await axios.get(
      "https://api.coingecko.com/api/v3/simple/supported_vs_currencies",
      { timeout: 8000 },
    );

    const raw: string[] = response.data;
    if (!Array.isArray(raw)) throw new Error("Unexpected response");

    // Remove btc/sats from raw (we'll prepend them in sorted order)
    const filtered = raw.filter((c) => c !== "btc" && c !== "sats").sort();
    const list = ["sats", "btc", ...filtered];

    supportedCurrenciesCache = { list, fetchedAt: now };
    return list;
  } catch (err) {
    logger.error({ err }, "Failed to fetch supported currencies from CoinGecko");
    if (supportedCurrenciesCache) return supportedCurrenciesCache.list;
    return ["sats", "btc", "usd", "eur", "gbp", "xau", "jpy", "aud", "cad", "chf"];
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
