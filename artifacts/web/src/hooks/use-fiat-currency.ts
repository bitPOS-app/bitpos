import { useState, useEffect, useCallback } from "react";

export const FIAT_SYMBOLS: Record<string, string> = {
  sats: "⚡", btc: "₿", usd: "$", eur: "€", gbp: "£", jpy: "¥", aud: "A$",
  cad: "C$", chf: "Fr", cny: "¥", hkd: "HK$", sgd: "S$", nzd: "NZ$",
  mxn: "MX$", brl: "R$", inr: "₹", krw: "₩", twd: "NT$", zar: "R",
  try: "₺", rub: "₽", pln: "zł", thb: "฿", idr: "Rp", czk: "Kč",
  huf: "Ft", myr: "RM", php: "₱", aed: "د.إ", sar: "SR", xau: "Au",
  xag: "Ag", xdr: "XDR", eth: "Ξ", link: "LINK", dot: "DOT", bnb: "BNB",
  eos: "EOS", ltc: "Ł", bch: "BCH",
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

export function dispatchFiatChange() {
  window.dispatchEvent(new CustomEvent(FIAT_CHANGE_EVENT));
}

function readCurrency(): string {
  return (localStorage.getItem("bitpos_fiat") ?? "usd").toLowerCase();
}

function formatFiatAmount(amount: number, currency: string): string {
  if (currency === "sats") return "";
  if (currency === "btc") return `₿\u2009${amount.toFixed(8)}`;
  const sym = FIAT_SYMBOLS[currency] ?? currency.toUpperCase() + " ";
  // Adaptive precision
  const decimals = amount === 0 ? 2 : amount < 0.0001 ? 6 : amount < 0.01 ? 4 : 2;
  return `${sym}${amount.toFixed(decimals)}`;
}

export function useFiatCurrency() {
  const [currency, setCurrency] = useState<string>(readCurrency);
  const [btcPrice, setBtcPrice] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);

  // React to changes dispatched by the settings page
  useEffect(() => {
    const handler = () => setCurrency(readCurrency());
    window.addEventListener(FIAT_CHANGE_EVENT, handler);
    return () => window.removeEventListener(FIAT_CHANGE_EVENT, handler);
  }, []);

  // Fetch BTC price in selected currency whenever it changes
  useEffect(() => {
    if (currency === "sats") { setBtcPrice(100_000_000); return; }
    if (currency === "btc") { setBtcPrice(1); return; }
    let cancelled = false;
    setPriceLoading(true);
    fetch(`/api/price?vs_currency=${encodeURIComponent(currency)}`)
      .then((r) => r.json())
      .then((d: { price?: number }) => { if (!cancelled) setBtcPrice(d.price ?? null); })
      .catch(() => { if (!cancelled) setBtcPrice(null); })
      .finally(() => { if (!cancelled) setPriceLoading(false); });
    return () => { cancelled = true; };
  }, [currency]);

  /** Convert sats to fiat string, e.g. "$12.34" or "€0.0045" */
  const formatFiat = useCallback(
    (sats: number): string => {
      if (currency === "sats" || btcPrice === null) return "";
      const btc = sats / 100_000_000;
      return formatFiatAmount(btc * btcPrice, currency);
    },
    [currency, btcPrice],
  );

  /** Convert fiat amount to sats */
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

  return { currency, btcPrice, formatFiat, fiatToSats, isSats, symbol, label, priceLoading };
}
