import { useState, useEffect, useCallback, useRef } from "react";

export const FIAT_SYMBOLS: Record<string, string> = {
  sats: "⚡", btc: "₿", usd: "$", eur: "€", gbp: "£", jpy: "¥", aud: "A$",
  cad: "C$", chf: "Fr", cny: "¥", hkd: "HK$", sgd: "S$", nzd: "NZ$",
  mxn: "MX$", brl: "R$", inr: "₹", krw: "₩", twd: "NT$", zar: "R",
  try: "₺", rub: "₽", pln: "zł", thb: "฿", idr: "Rp", czk: "Kč",
  huf: "Ft", myr: "RM", php: "₱", aed: "د.إ", sar: "SR", xau: "Au",
  xag: "Ag", xdr: "XDR", eth: "Ξ", link: "LINK", dot: "DOT", bnb: "BNB",
  eos: "EOS", ltc: "Ł", bch: "BCH", nok: "kr", sek: "kr", dkk: "kr",
};

export const FIAT_NAMES: Record<string, string> = {
  sats: "Satoshis", btc: "Bitcoin", usd: "US Dollar", eur: "Euro",
  gbp: "British Pound", jpy: "Japanese Yen", aud: "Australian Dollar",
  cad: "Canadian Dollar", chf: "Swiss Franc", cny: "Chinese Yuan",
  hkd: "Hong Kong Dollar", sgd: "Singapore Dollar", nzd: "New Zealand Dollar",
  mxn: "Mexican Peso", brl: "Brazilian Real", inr: "Indian Rupee",
  krw: "South Korean Won", twd: "Taiwan Dollar", zar: "South African Rand",
  try: "Turkish Lira", rub: "Russian Ruble", pln: "Polish Zloty",
  thb: "Thai Baht", idr: "Indonesian Rupiah", czk: "Czech Koruna",
  huf: "Hungarian Forint", myr: "Malaysian Ringgit", php: "Philippine Peso",
  aed: "UAE Dirham", sar: "Saudi Riyal", xau: "Gold (troy oz)",
  xag: "Silver (troy oz)", nok: "Norwegian Krone", sek: "Swedish Krona",
  dkk: "Danish Krone", xdr: "IMF SDR",
};

const FIAT_CHANGE_EVENT = "bitpos_fiat_change";
const PRICE_CACHE_PREFIX = "bitpos_price_v1:";
/** Fresh enough to show instantly; refresh still happens in background. */
const PRICE_CACHE_MAX_AGE_MS = 15 * 60 * 1000;

export function dispatchFiatChange() {
  window.dispatchEvent(new CustomEvent(FIAT_CHANGE_EVENT));
}

function readCurrency(): string {
  try {
    return (localStorage.getItem("bitpos_fiat") ?? "usd").toLowerCase();
  } catch {
    return "usd";
  }
}

function readRateSource(): string {
  try {
    return localStorage.getItem("bitpos_rate_source") || "coingecko";
  } catch {
    return "coingecko";
  }
}

function readRateModifier(): string {
  try {
    return localStorage.getItem("bitpos_rate_modifier") || "";
  } catch {
    return "";
  }
}

function priceCacheKey(currency: string, source: string, mod: string): string {
  return `${PRICE_CACHE_PREFIX}${source}|${currency}|${mod}`;
}

function readCachedPrice(currency: string): number | null {
  if (currency === "sats") return 100_000_000;
  if (currency === "btc") return 1;
  try {
    const key = priceCacheKey(currency, readRateSource(), readRateModifier());
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { price?: number; at?: number };
    if (typeof parsed.price !== "number" || !Number.isFinite(parsed.price) || parsed.price <= 0) {
      return null;
    }
    // Always return stale-while-revalidate — show immediately even if old.
    return parsed.price;
  } catch {
    return null;
  }
}

function writeCachedPrice(currency: string, source: string, mod: string, price: number): void {
  try {
    const key = priceCacheKey(currency, source, mod);
    localStorage.setItem(key, JSON.stringify({ price, at: Date.now() }));
  } catch {
    /* quota / private mode */
  }
}

function formatFiatAmount(amount: number, currency: string): string {
  if (currency === "sats") return "";
  if (currency === "btc") return `₿\u2009${amount.toFixed(8)}`;
  const sym = FIAT_SYMBOLS[currency] ?? currency.toUpperCase() + " ";
  const decimals = amount === 0 ? 2 : amount < 0.0001 ? 6 : amount < 0.01 ? 4 : 2;
  return `${sym}${amount.toFixed(decimals)}`;
}

/** Static fallback list so Settings never shows "Loading…" for currencies. */
export const DEFAULT_CURRENCY_CODES: string[] = [
  "sats", "btc", "usd", "eur", "gbp", "jpy", "thb", "aud", "cad", "chf",
  "cny", "hkd", "sgd", "inr", "krw", "brl", "mxn", "zar", "aed", "xau", "xag",
];

export function useFiatCurrency() {
  const [currency, setCurrency] = useState<string>(readCurrency);
  // Hydrate from cache on first paint — no blank fiat flash.
  const [btcPrice, setBtcPrice] = useState<number | null>(() => readCachedPrice(readCurrency()));
  const [priceLoading, setPriceLoading] = useState(false);
  const fetchGen = useRef(0);

  useEffect(() => {
    const handler = () => setCurrency(readCurrency());
    window.addEventListener(FIAT_CHANGE_EVENT, handler);
    return () => window.removeEventListener(FIAT_CHANGE_EVENT, handler);
  }, []);

  useEffect(() => {
    if (currency === "sats") {
      setBtcPrice(100_000_000);
      setPriceLoading(false);
      return;
    }
    if (currency === "btc") {
      setBtcPrice(1);
      setPriceLoading(false);
      return;
    }

    // Instant paint from cache when currency switches.
    const cached = readCachedPrice(currency);
    if (cached != null) {
      setBtcPrice(cached);
      setPriceLoading(false);
    } else {
      setPriceLoading(true);
    }

    const gen = ++fetchGen.current;
    let cancelled = false;
    const src = readRateSource();
    const mod = readRateModifier();
    const params = new URLSearchParams({ vs_currency: currency, source: src });
    if (mod) params.set("modifier", mod);

    fetch(`/api/price?${params.toString()}`)
      .then((r) => r.json())
      .then((d: { price?: number }) => {
        if (cancelled || gen !== fetchGen.current) return;
        if (typeof d.price === "number" && d.price > 0) {
          setBtcPrice(d.price);
          writeCachedPrice(currency, src, mod, d.price);
        }
      })
      .catch(() => {
        /* keep cached value if any */
      })
      .finally(() => {
        if (!cancelled && gen === fetchGen.current) setPriceLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currency]);

  const formatFiat = useCallback(
    (sats: number): string => {
      if (currency === "sats" || btcPrice === null) return "";
      const btc = sats / 100_000_000;
      return formatFiatAmount(btc * btcPrice, currency);
    },
    [currency, btcPrice],
  );

  const fiatToSats = useCallback(
    (fiatAmount: number): number => {
      if (!btcPrice || btcPrice === 0) return 0;
      if (currency === "sats") return Math.round(fiatAmount);
      if (currency === "btc") return Math.round(fiatAmount * 100_000_000);
      return Math.round((fiatAmount / btcPrice) * 100_000_000);
    },
    [currency, btcPrice],
  );

  const isSats = currency === "sats";
  const symbol = FIAT_SYMBOLS[currency] ?? currency.toUpperCase();
  const label = currency.toUpperCase();
  const priceReady = btcPrice != null;

  return {
    currency,
    btcPrice,
    formatFiat,
    fiatToSats,
    isSats,
    symbol,
    label,
    priceLoading,
    priceReady,
    /** True when showing a cached value while a refresh is in flight. */
    priceStale: priceLoading && btcPrice != null,
  };
}

/** Age of live cache entry in ms, or null if none. */
export function getPriceCacheAgeMs(currency: string): number | null {
  if (currency === "sats" || currency === "btc") return 0;
  try {
    const key = priceCacheKey(currency, readRateSource(), readRateModifier());
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at?: number };
    if (typeof parsed.at !== "number") return null;
    return Date.now() - parsed.at;
  } catch {
    return null;
  }
}

export function isPriceCacheFresh(currency: string, maxAge = PRICE_CACHE_MAX_AGE_MS): boolean {
  const age = getPriceCacheAgeMs(currency);
  return age != null && age <= maxAge;
}
