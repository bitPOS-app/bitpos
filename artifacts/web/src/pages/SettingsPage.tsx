import { useState, useEffect, useCallback } from "react";
import { ChevronRight, ChevronDown, LogOut, Key, User, Trash2, ShieldCheck, Wallet } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import { useGetYieldHistory, getGetYieldHistoryQueryKey, useGetLightningAddress, getGetLightningAddressQueryKey } from "@workspace/api-client-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { dispatchFiatChange, FIAT_NAMES, FIAT_SYMBOLS, DEFAULT_CURRENCY_CODES } from "@/hooks/use-fiat-currency";
import { LifeHashAvatar } from "@/components/LifeHashAvatar";
import SecuritySettings from "@/components/SecuritySettings";
import WalletSourceSetup from "@/components/WalletSourceSetup";
import { invalidateWalletModeCache } from "@/lib/walletMode";

type Sub = null | "yield" | "pin" | "username" | "delete" | "security" | "wallet";

function readStoredCurrency(): string {
  return (localStorage.getItem("bitpos_fiat") ?? "usd").toLowerCase();
}

export default function SettingsPage() {
  const { entity, account, logout, setAuth, updateAccount, token } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [sub, setSub] = useState<Sub>(null);

  // ── Currency & Rate ─────────────────────────────────────────────────────
  const serverCurrency = ((account as { currency?: string } | null)?.currency ?? "").toLowerCase();
  const serverRateSource = ((account as { rateSource?: string } | null)?.rateSource) || "coingecko";
  const serverRateModifier = ((account as { rateModifier?: string } | null)?.rateModifier) || "";
  const serverSendRateModifier = ((account as { sendRateModifier?: string } | null)?.sendRateModifier) || "";

  const [currency, setCurrency] = useState<string>(() => serverCurrency || readStoredCurrency());
  const [currencies, setCurrencies] = useState<string[]>(() => DEFAULT_CURRENCY_CODES.slice());
  const [rateSource, setRateSource] = useState<string>(serverRateSource);
  const [rateModifier, setRateModifier] = useState<string>(serverRateModifier);
  const [sendRateModifier, setSendRateModifier] = useState<string>(serverSendRateModifier);
  const [dirty, setDirty] = useState(false);

  // Re-fetch the supported currency list whenever the price source changes.
  // The server filters the list per-source (e.g. Binance only offers fiats it
  // actually trades against BTC), so switching source can shrink the options.
  useEffect(() => {
    let cancelled = false;
    const cacheKey = `bitpos_currency_list_v1:${rateSource}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const list = JSON.parse(cached) as string[];
        if (Array.isArray(list) && list.length > 0) setCurrencies(list);
      }
    } catch { /* ignore */ }

    fetch(`/api/price/currencies?source=${encodeURIComponent(rateSource)}`)
      .then((r) => r.json())
      .then((list: string[]) => {
        if (cancelled || !Array.isArray(list) || list.length === 0) return;
        setCurrencies(list);
        try { localStorage.setItem(cacheKey, JSON.stringify(list)); } catch { /* ignore */ }
        // Clamp: if the current selection isn't offered by this source, snap
        // to usd so we never save a currency the source can't price.
        if (!list.includes(currency)) {
          setCurrency("usd");
          setDirty(true);
        }
      })
      .catch(() => { /* keep seed / cache */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rateSource]);

  useEffect(() => {
    if (!token) return;
    const stored = readStoredCurrency();
    if (serverCurrency) {
      if (serverCurrency !== stored) {
        localStorage.setItem("bitpos_fiat", serverCurrency);
        dispatchFiatChange();
      }
      setCurrency(serverCurrency);
    } else if (stored && stored !== "usd") {
      // migrate once
    }
    setRateSource(serverRateSource);
    setRateModifier(serverRateModifier);
  }, [token, serverCurrency, serverRateSource, serverRateModifier]);

  const handleCurrency = (c: string) => {
    setCurrency(c.toLowerCase());
    setDirty(true);
  };

  const handleRateSource = (src: string) => {
    setRateSource(src);
    setDirty(true);
  };

  const handleRateModifier = (mod: string) => {
    setRateModifier(mod);
    setDirty(true);
  };

  // ── Live rate preview ──────────────────────────────────────────────────
  // Shows the effective BTC rate for the current (currency, source, modifier)
  // combo so the modifier's effect is visible before saving. Debounced.
  const [preview, setPreview] = useState<{ raw: number; modified: number } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [sendPreview, setSendPreview] = useState<{ raw: number; modified: number } | null>(null);
  const [sendPreviewLoading, setSendPreviewLoading] = useState(false);
  const [sendPreviewError, setSendPreviewError] = useState(false);

  useEffect(() => {
    if (currency === "sats") {
      setPreview({ raw: 100_000_000, modified: 100_000_000 });
      setPreviewError(false);
      setPreviewLoading(false);
      return;
    }
    if (currency === "btc") {
      setPreview({ raw: 1, modified: 1 });
      setPreviewError(false);
      setPreviewLoading(false);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    const t = setTimeout(() => {
      const rawParams = new URLSearchParams({ vs_currency: currency, source: rateSource });
      // Fetch raw price ONCE, then apply the modifier client-side for exactness.
      // Two separate API calls can return different base prices if BTC moves
      // between them, making the modifier look wrong.
      fetch(`/api/price?${rawParams.toString()}`)
        .then((r) => r.json())
        .then((rawD: { price?: number }) => {
          if (cancelled) return;
          const raw = rawD?.price ?? 0;
          if (raw <= 0) {
            setPreview(null);
            setPreviewError(true);
            return;
          }
          // Apply modifier client-side using the same formula as the server
          let modified = raw;
          if (rateModifier.trim()) {
            const expr = rateModifier.replace(/\s/g, "").toLowerCase();
            const m = expr.match(/^[a-z]{3,5}\*(.+)$/);
            if (m) {
              modified = raw * parseFloat(m[1]);
            } else {
              const m2 = expr.match(/^[a-z]{3,5}([+-])(.+)$/);
              if (m2) {
                modified = m2[1] === "+" ? raw + parseFloat(m2[2]) : raw - parseFloat(m2[2]);
              }
            }
          }
          setPreview({ raw, modified });
          setPreviewError(false);
        })
        .catch(() => {
          if (cancelled) return;
          setPreview(null);
          setPreviewError(true);
        })
        .finally(() => {
          if (!cancelled) setPreviewLoading(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [currency, rateSource, rateModifier]);

  // ── Live sell rate preview (sendRateModifier) ──────────────────────────
  useEffect(() => {
    if (currency === "sats") {
      setSendPreview({ raw: 100_000_000, modified: 100_000_000 });
      setSendPreviewError(false);
      setSendPreviewLoading(false);
      return;
    }
    if (currency === "btc") {
      setSendPreview({ raw: 1, modified: 1 });
      setSendPreviewError(false);
      setSendPreviewLoading(false);
      return;
    }
    let cancelled = false;
    setSendPreviewLoading(true);
    const t = setTimeout(() => {
      const rawParams = new URLSearchParams({ vs_currency: currency, source: rateSource });
      fetch(`/api/price?${rawParams.toString()}`)
        .then((r) => r.json())
        .then((rawD: { price?: number }) => {
          if (cancelled) return;
          const raw = rawD?.price ?? 0;
          if (raw <= 0) {
            setSendPreview(null);
            setSendPreviewError(true);
            return;
          }
          let modified = raw;
          if (sendRateModifier.trim()) {
            const expr = sendRateModifier.replace(/\s/g, "").toLowerCase();
            const m = expr.match(/^[a-z]{3,5}\*(.+)$/);
            if (m) {
              modified = raw * parseFloat(m[1]);
            } else {
              const m2 = expr.match(/^[a-z]{3,5}([+-])(.+)$/);
              if (m2) {
                modified = m2[1] === "+" ? raw + parseFloat(m2[2]) : raw - parseFloat(m2[2]);
              }
            }
          }
          setSendPreview({ raw, modified });
          setSendPreviewError(false);
        })
        .catch(() => {
          if (cancelled) return;
          setSendPreview(null);
          setSendPreviewError(true);
        })
        .finally(() => {
          if (!cancelled) setSendPreviewLoading(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [currency, rateSource, sendRateModifier]);

  const handleSaveSettings = async () => {
    if (!token) return;
    const val = currency.toLowerCase();
    const body: Record<string, string> = { currency: val };
    body.rateSource = rateSource;
    body.rateModifier = rateModifier;
    body.sendRateModifier = sendRateModifier;
    try {
      const r = await fetch("/api/auth/currency", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        setDirty(false);
        localStorage.setItem("bitpos_fiat", val);
        localStorage.setItem("bitpos_rate_source", rateSource);
        localStorage.setItem("bitpos_rate_modifier", rateModifier);
        // Push the saved values into auth state so navigating away and back
        // shows the new currency without a full-page reload. The auth account
        // payload carries currency/rateSource/rateModifier (server returns them),
        // so merge them in and refresh the persisted session copy too.
        if (account) {
          const updated = { ...account, currency: val, rateSource, rateModifier, sendRateModifier } as typeof account;
          updateAccount(updated);
          try {
            const raw = localStorage.getItem("bitpos_session");
            if (raw) {
              const s = JSON.parse(raw);
              s.account = updated;
              localStorage.setItem("bitpos_session", JSON.stringify(s));
            }
          } catch { /* ignore */ }
        }
        dispatchFiatChange();
      }
    } catch { /* offline */ }
  };

  function currencyOptionLabel(c: string): string {
    const sym = FIAT_SYMBOLS[c];
    const name = FIAT_NAMES[c];
    const code = c.toUpperCase();
    const parts: string[] = [code];
    if (sym && sym !== code) parts.push(sym);
    if (name) parts.push(`- ${name}`);
    return parts.join(" ");
  }

  // ── Change PIN ────────────────────────────────────────────────────────────
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [pinLoading, setPinLoading] = useState(false);

  // ── Update username ───────────────────────────────────────────────────────
  const [newHandle, setNewHandle] = useState("");
  const [handleLoading, setHandleLoading] = useState(false);

  // ── Wallet ────────────────────────────────────────────────────────────────
  const [walletMode, setWalletMode] = useState<string>("veil");
  const [walletNpub, setWalletNpub] = useState<string | null>(null);
  const [walletLnAddress, setWalletLnAddress] = useState<string | null>(null);

  const loadWalletInfo = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch("/api/user/wallet-info", { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return;
      const d = await r.json();
      setWalletMode(d.walletMode ?? "veil");
      setWalletNpub(d.npub ?? null);
      setWalletLnAddress(d.lightningAddress ?? null);
    } catch { /* ignore */ }
  }, [token]);

  useEffect(() => { loadWalletInfo(); }, [loadWalletInfo]);

  const handleDownloadKeypair = async () => {
    if (!token) return;
    try {
      const r = await fetch("/api/user/keypair", { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error("Failed to fetch keypair");
      const kp = await r.json();
      const win = window.open("", "_blank", "width=600,height=500");
      if (!win) { toast({ title: "Enable popups to download keypair" }); return; }
      win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>bitPOS Wallet Keypair</title>
<style>
  body { font-family: monospace; max-width: 540px; margin: 40px auto; color: #0B0C0E; }
  h1 { color: #F7931A; font-family: sans-serif; }
  .row { margin: 16px 0; }
  .label { font-family: sans-serif; font-size: 12px; color: #666; margin-bottom: 4px; }
  .value { word-break: break-all; background: #f5f5f5; padding: 8px; border-radius: 4px; font-size: 13px; }
  .warn { font-family: sans-serif; font-size: 12px; color: #c00; margin-top: 24px; }
  @media print { button { display: none; } }
</style>
</head>
<body>
<h1>bitPOS Wallet Keypair</h1>
<p style="font-family:sans-serif;font-size:13px">Account: @${entity?.handle ?? "unknown"} - Generated ${new Date().toLocaleDateString()}</p>
<div class="row"><div class="label">Public Key (npub)</div><div class="value">${kp.npub}</div></div>
<div class="row"><div class="label">Private Key (nsec) - KEEP SECRET</div><div class="value">${kp.nsec}</div></div>
<div class="row"><div class="label">NWC Connection String</div><div class="value">${kp.nwcUrl}</div></div>
<p class="warn">Store this page securely. Anyone with your private key (nsec) controls your wallet.</p>
<button onclick="window.print()" style="margin-top:16px;padding:10px 20px;background:#F7931A;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px">Print / Save as PDF</button>
</body></html>`);
      win.document.close();
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    }
  };

  // ── Delete account ────────────────────────────────────────────────────────
  const [deletePin, setDeletePin] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ── Yield data ────────────────────────────────────────────────────────────
  const { data: yieldHistory } = useGetYieldHistory(account?.id ?? "", {
    query: { enabled: !!account?.id, queryKey: getGetYieldHistoryQueryKey(account?.id ?? "") }
  });
  const { data: lnAddress } = useGetLightningAddress(account?.id ?? "", {
    query: { enabled: !!account?.id, queryKey: getGetLightningAddressQueryKey(account?.id ?? "") }
  });

  const weeklyChartData = (() => {
    const dists = yieldHistory?.distributions ?? [];
    return dists.slice(-52).map((d) => ({ week: d.weekStart.slice(5), sats: d.amountSats }));
  })();
  const totalYield = yieldHistory?.totalEarned ?? 0;
  const lastWeekYield = yieldHistory?.distributions?.[0]?.amountSats ?? 0;
  const aprEstimate = account?.balanceSats && lastWeekYield
    ? ((lastWeekYield / account.balanceSats) * 52 * 100).toFixed(2)
    : null;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleLogout = () => { logout(); navigate("/login"); };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || currentPin.length < 4 || newPin.length !== 6) return;
    setPinLoading(true);
    try {
      const res = await fetch("/api/auth/change-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPin, newPin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to change PIN");
      toast({ title: "PIN updated successfully" });
      setCurrentPin(""); setNewPin(""); setSub(null);
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally { setPinLoading(false); }
  };

  const handleChangeHandle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !newHandle.trim()) return;
    setHandleLoading(true);
    try {
      const res = await fetch("/api/auth/handle", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ handle: newHandle.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update username");
      if (entity) setAuth(token!, { ...entity, handle: data.handle }, account!);
      toast({ title: "Username updated" });
      setNewHandle(""); setSub(null);
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally { setHandleLoading(false); }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || deleteConfirm !== "DELETE" || deletePin.length < 4) return;
    setDeleteLoading(true);
    try {
      const res = await fetch("/api/auth/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pin: deletePin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete account");
      logout();
      navigate("/login");
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
      setDeleteLoading(false);
    }
  };

  if (!entity || !account) return null;

  const pinUpgradeRequired = Boolean((entity as { pinUpgradeRequired?: boolean }).pinUpgradeRequired);

  const BackButton = ({ label }: { label: string }) => (
    <div className="flex items-center gap-3 mb-6">
      <button type="button" onClick={() => setSub(null)} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-muted">
        <ChevronRight className="w-5 h-5 rotate-180" />
      </button>
      <h2 className="text-xl font-bold">{label}</h2>
    </div>
  );

  return (
    <div className="flex flex-col min-h-full px-5 pt-8 pb-4 safe-top">

      {/* ── Main settings list ─────────────────────────────────────────── */}
      {sub === null && (
        <>
          <h1 className="text-2xl font-bold mb-6">Settings</h1>

          {pinUpgradeRequired && (
            <button
              type="button"
              data-testid="banner-pin-upgrade"
              onClick={() => setSub("pin")}
              className="w-full text-left bg-primary/10 border border-primary/30 rounded-2xl p-4 mb-4 flex items-center gap-3"
            >
              <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-primary">Upgrade your PIN to 6 digits</p>
                <p className="text-xs text-muted-foreground">Your account uses an older 4-digit PIN. Upgrade for stronger security.</p>
              </div>
              <ChevronRight className="w-4 h-4 text-primary" />
            </button>
          )}

          {/* Profile card */}
          <div className="bg-card border border-border rounded-2xl p-5 mb-4">
            <div className="flex items-center gap-4">
              <LifeHashAvatar input={entity.handle} size={48} />
              <div>
                <p className="font-semibold">@{entity.handle}</p>
                <p className="text-muted-foreground text-sm">{entity.email}</p>
                {lnAddress && (
                  <p className="text-xs font-mono text-primary mt-0.5">{lnAddress.lightningAddress}</p>
                )}
              </div>
            </div>
          </div>

          {/* Display currency + rate settings */}
          <div className="bg-card border border-border rounded-2xl p-5 mb-4">
            <p className="text-sm font-semibold mb-3">Display currency</p>
            <div className="relative">
              <select
                data-testid="select-currency"
                value={currency}
                onChange={(e) => handleCurrency(e.target.value)}
                className={cn(
                  "w-full appearance-none bg-muted border border-border rounded-xl px-4 py-3 pr-10 text-sm font-medium",
                  "focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer",
                )}
              >
                {currencies.map((c) => (
                  <option key={c} value={c}>{currencyOptionLabel(c)}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            </div>
            {/* Rate source */}
            <div className="mt-3">
              <label className="text-xs text-muted-foreground mb-1 block">Price source</label>
              <select
                value={rateSource}
                onChange={(e) => handleRateSource(e.target.value)}
                className="w-full appearance-none bg-muted border border-border rounded-xl px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
              >
                <option value="coingecko">CoinGecko</option>
                <option value="binance">Binance</option>
              </select>
            </div>
            {/* Buy rate modifier (receiving Bitcoin — green accent) */}
            <div className="mt-3 rounded-xl border border-green-500/20 bg-green-500/5 p-3">
              <label className="text-xs font-semibold text-green-500 mb-1.5 flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                Buy rate modifier
                <span className="font-normal text-muted-foreground/50">(receiving Bitcoin)</span>
              </label>
              <input
                type="text"
                value={rateModifier}
                onChange={(e) => handleRateModifier(e.target.value)}
                placeholder={currency.toUpperCase() + "*1.01"}
                className="w-full bg-muted border border-border rounded-xl px-4 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500/50"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Applied when customers pay you (incoming).
                Examples: {currency.toUpperCase()}*1.01 (1%){" "}
                {currency.toUpperCase()}-0.5{" "}
                {currency.toUpperCase()}*1.02+1
              </p>
              {/* Live rate preview */}
              <div className="mt-2 rounded-lg bg-muted/60 border border-border px-3 py-2">
                {currency === "sats" ? (
                  <p className="text-xs text-muted-foreground">1 BTC = 100,000,000 sats</p>
                ) : currency === "btc" ? (
                  <p className="text-xs text-muted-foreground">Denominated in BTC</p>
                ) : previewLoading && !preview ? (
                  <p className="text-xs text-muted-foreground">Fetching rate…</p>
                ) : previewError ? (
                  <p className="text-xs text-destructive">
                    No rate available for {currency.toUpperCase()} from {rateSource === "binance" ? "Binance" : "CoinGecko"}.
                  </p>
                ) : preview ? (
                  <div className="text-xs">
                    {rateModifier.trim() && preview.modified !== preview.raw ? (
                      <>
                        <p className="text-muted-foreground line-through">
                          1 BTC = {FIAT_SYMBOLS[currency] ?? ""}{preview.raw.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </p>
                        <p className="font-semibold text-primary">
                          1 BTC = {FIAT_SYMBOLS[currency] ?? ""}{preview.modified.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          <span className="ml-1 font-normal text-muted-foreground">after modifier</span>
                        </p>
                      </>
                    ) : (
                      <p className="font-medium">
                        1 BTC = {FIAT_SYMBOLS[currency] ?? ""}{preview.modified.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        <span className="ml-1 font-normal text-muted-foreground">{currency.toUpperCase()}</span>
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
            {/* Sell rate modifier (sending Bitcoin — red accent) */}
            <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/5 p-3">
              <label className="text-xs font-semibold text-red-500 mb-1.5 flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
                Sell rate modifier
                <span className="font-normal text-muted-foreground/50">(sending Bitcoin)</span>
              </label>
              <input
                type="text"
                value={sendRateModifier}
                onChange={(e) => { setSendRateModifier(e.target.value); setDirty(true); }}
                placeholder={currency.toUpperCase() + "*0.99"}
                className="w-full bg-muted border border-border rounded-xl px-4 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-500/50"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Applied when you send sats outward (send mode).
                Leave empty to use the same rate as buying.
              </p>
              {/* Live sell rate preview */}
              <div className="mt-2 rounded-lg bg-muted/60 border border-border px-3 py-2">
                {currency === "sats" ? (
                  <p className="text-xs text-muted-foreground">1 BTC = 100,000,000 sats</p>
                ) : currency === "btc" ? (
                  <p className="text-xs text-muted-foreground">Denominated in BTC</p>
                ) : sendPreviewLoading && !sendPreview ? (
                  <p className="text-xs text-muted-foreground">Fetching rate…</p>
                ) : sendPreviewError ? (
                  <p className="text-xs text-destructive">
                    No rate available for {currency.toUpperCase()} from {rateSource === "binance" ? "Binance" : "CoinGecko"}.
                  </p>
                ) : sendPreview ? (
                  <div className="text-xs">
                    {sendRateModifier.trim() && sendPreview.modified !== sendPreview.raw ? (
                      <>
                        <p className="text-muted-foreground line-through">
                          1 BTC = {FIAT_SYMBOLS[currency] ?? ""}{sendPreview.raw.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </p>
                        <p className="font-semibold text-red-500">
                          1 BTC = {FIAT_SYMBOLS[currency] ?? ""}{sendPreview.modified.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          <span className="ml-1 font-normal text-muted-foreground">after modifier</span>
                        </p>
                      </>
                    ) : (
                      <p className="font-medium">
                        1 BTC = {FIAT_SYMBOLS[currency] ?? ""}{sendPreview.modified.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        <span className="ml-1 font-normal text-muted-foreground">{currency.toUpperCase()}</span>
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
            {/* Save button */}
            <button
              onClick={handleSaveSettings}
              disabled={!dirty}
              className={cn(
                "mt-3 w-full rounded-xl py-2.5 text-sm font-semibold transition-colors",
                dirty
                  ? "bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              {dirty ? "Save changes" : "Saved"}
            </button>
          </div>

          {/* Menu items */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden mb-4">
            {[
              { id: "security", label: "Security",         icon: ShieldCheck, action: () => setSub("security") },
              { id: "wallet",   label: "Wallet",           icon: Wallet,  action: () => setSub("wallet") },
              { id: "pin",      label: "Change PIN",       icon: Key,     action: () => setSub("pin") },
              { id: "username", label: "Change username",  icon: User,    action: () => setSub("username") },
            ].map((item, i, arr) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`btn-settings-${item.id}`}
                  onClick={item.action}
                  className={cn(
                    "flex items-center gap-3 w-full px-5 py-4 hover:bg-muted transition-colors",
                    i < arr.length - 1 && "border-b border-border"
                  )}
                >
                  <Icon className="w-5 h-5 text-muted-foreground shrink-0" />
                  <span className="flex-1 text-left text-sm font-medium">{item.label}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              );
            })}
          </div>

          <button
            type="button"
            data-testid="btn-logout"
            onClick={handleLogout}
            className="flex items-center gap-3 w-full bg-card border border-border rounded-2xl px-5 py-4 text-destructive hover:bg-muted transition-colors mb-3"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            <span className="text-sm font-medium">Log out</span>
          </button>

          <button
            type="button"
            data-testid="btn-settings-delete"
            onClick={() => setSub("delete")}
            className="flex items-center gap-3 w-full bg-destructive/10 border border-destructive/30 rounded-2xl px-5 py-4 text-destructive hover:bg-destructive/20 transition-colors"
          >
            <Trash2 className="w-5 h-5 shrink-0" />
            <span className="text-sm font-medium">Delete account</span>
            <ChevronRight className="w-4 h-4 ml-auto" />
          </button>
        </>
      )}

      {/* ── Yield history ─────────────────────────────────────────────── */}
      {sub === "yield" && (
        <div className="space-y-6">
          <BackButton label="Yield history" />
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-card border border-border rounded-2xl p-4">
              <p className="text-xs text-muted-foreground mb-1">Total earned</p>
              <p className="font-mono-nums font-bold text-lg text-primary">{totalYield.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">sats</p>
            </div>
            {aprEstimate && (
              <div className="bg-card border border-border rounded-2xl p-4">
                <p className="text-xs text-muted-foreground mb-1">Est. APR</p>
                <p className="font-mono-nums font-bold text-lg">{aprEstimate}%</p>
                <p className="text-xs text-muted-foreground">annualized</p>
              </div>
            )}
          </div>
          <div className="bg-card border border-border rounded-2xl p-4">
            <h3 className="font-semibold text-sm mb-4">52-week yield (sats)</h3>
            {weeklyChartData.length < 2 ? (
              <div className="h-40 flex items-center justify-center">
                <p className="text-muted-foreground text-sm">No yield data yet</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={weeklyChartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 15%)" />
                  <XAxis dataKey="week" tick={{ fontSize: 9, fill: "hsl(0 0% 55%)" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 9, fill: "hsl(0 0% 55%)" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: "hsl(0 0% 8%)", border: "1px solid hsl(0 0% 15%)", borderRadius: 12, fontSize: 12 }}
                    labelStyle={{ color: "hsl(0 0% 55%)" }}
                    itemStyle={{ color: "#f7931a" }}
                    formatter={(v: number) => [`${v.toLocaleString()} sats`, "Yield"]}
                  />
                  <Bar dataKey="sats" fill="#f7931a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* ── Security ──────────────────────────────────────────────────── */}
      {sub === "security" && (
        <div className="space-y-6">
          <BackButton label="Security" />
          <SecuritySettings />
        </div>
      )}

      {/* ── Change PIN ────────────────────────────────────────────────── */}
      {sub === "pin" && (
        <div className="space-y-6">
          <BackButton label="Change PIN" />
          <form onSubmit={handleChangePin} className="space-y-4">
            <input
              type="password"
              data-testid="input-current-pin"
              inputMode="numeric"
              placeholder="Current PIN"
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <input
              type="password"
              data-testid="input-new-pin"
              inputMode="numeric"
              placeholder="New PIN (6 digits)"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              type="submit"
              data-testid="btn-change-pin"
              disabled={currentPin.length < 4 || newPin.length !== 6 || pinLoading}
              className="w-full bg-primary text-primary-foreground rounded-xl py-4 font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {pinLoading ? <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : "Update PIN"}
            </button>
          </form>
        </div>
      )}

      {/* ── Change username ───────────────────────────────────────────── */}
      {sub === "username" && (
        <div className="space-y-6">
          <BackButton label="Change username" />
          <div className="bg-card border border-border rounded-2xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Current username</p>
            <p className="font-semibold">@{entity.handle}</p>
          </div>
          <form onSubmit={handleChangeHandle} className="space-y-4">
            <div>
              <input
                type="text"
                data-testid="input-new-handle"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="New username"
                value={newHandle}
                onChange={(e) => setNewHandle(e.target.value.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20))}
                className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="text-xs text-muted-foreground mt-1.5 ml-1">3–20 characters · letters, numbers, underscores</p>
            </div>
            <button
              type="submit"
              data-testid="btn-change-handle"
              disabled={newHandle.trim().length < 3 || handleLoading}
              className="w-full bg-primary text-primary-foreground rounded-xl py-4 font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {handleLoading ? <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : "Save username"}
            </button>
          </form>
          <p className="text-xs text-muted-foreground text-center">Changing your username will also update your Lightning address.</p>
        </div>
      )}

      {/* ── Delete account ─────────────────────────────────────────────── */}
      {sub === "delete" && (
        <div className="space-y-6">
          <BackButton label="Delete account" />
          <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-4 space-y-1">
            <p className="text-sm font-semibold text-destructive">This cannot be undone</p>
            <p className="text-xs text-muted-foreground">Your account, wallet balance, cards, and all data will be permanently deleted. Any remaining balance will be lost.</p>
          </div>
          <form onSubmit={handleDeleteAccount} className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1.5 ml-1">Enter your PIN to confirm</p>
              <input
                type="password"
                data-testid="input-delete-pin"
                inputMode="numeric"
                placeholder="PIN"
                value={deletePin}
                onChange={(e) => setDeletePin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-destructive"
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1.5 ml-1">
                Type <span className="font-mono font-bold text-destructive">DELETE</span> to confirm
              </p>
              <input
                type="text"
                data-testid="input-delete-confirm"
                autoCapitalize="characters"
                placeholder="DELETE"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value.slice(0, 6))}
                className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-destructive"
              />
            </div>
            <button
              type="submit"
              data-testid="btn-delete-account"
              disabled={deletePin.length < 4 || deleteConfirm !== "DELETE" || deleteLoading}
              className="w-full bg-destructive text-destructive-foreground rounded-xl py-4 font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {deleteLoading
                ? <div className="w-5 h-5 border-2 border-destructive-foreground border-t-transparent rounded-full animate-spin" />
                : <><Trash2 className="w-4 h-4" /> Permanently delete my account</>
              }
            </button>
          </form>
        </div>
      )}

      {/* ── Wallet ────────────────────────────────────────────────────── */}
      {sub === "wallet" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <button type="button" onClick={() => setSub(null)} className="text-muted-foreground hover:text-foreground transition-colors">
              <ChevronRight className="w-5 h-5 rotate-180" />
            </button>
            <h2 className="text-xl font-bold">Wallet</h2>
          </div>

          {/* Current wallet summary */}
          <div className="bg-card border border-border rounded-2xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Current wallet</p>
            <p className="text-sm font-medium" data-testid="text-current-wallet">
              {walletMode === "custom" && "Your own wallet (NWC)"}
              {walletMode === "lnaddress" && `Lightning address${walletLnAddress ? ` - ${walletLnAddress}` : ""}`}
              {walletMode === "veil" && "Veil wallet (third-party custodian)"}
              {walletMode === "unset" && "Not configured"}
            </p>
          </div>

          {token && (
            <WalletSourceSetup
              token={token}
              onSaved={() => {
                invalidateWalletModeCache();
                loadWalletInfo();
              }}
            />
          )}

          {/* Veil keypair backup - only when a keypair exists on the account */}
          {walletMode === "veil" && walletNpub && (
            <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
              <p className="text-sm font-semibold">Your nostr keypair</p>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Public key (npub)</p>
                <p className="text-xs font-mono bg-muted px-3 py-2 rounded-lg break-all">{walletNpub}</p>
              </div>
              <button
                type="button"
                onClick={handleDownloadKeypair}
                className="w-full border border-primary text-primary rounded-xl py-3 text-sm font-semibold hover:bg-primary/10 transition-colors"
              >
                Download keypair (PDF)
              </button>
              <p className="text-xs text-muted-foreground">
                Your keypair gives direct access to your Veil wallet. Store it securely.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
