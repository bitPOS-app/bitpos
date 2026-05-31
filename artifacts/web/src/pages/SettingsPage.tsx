import { useState, useEffect } from "react";
import { ChevronRight, ChevronDown, LogOut, Key, User, Trash2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import { useGetYieldHistory, getGetYieldHistoryQueryKey, useGetLightningAddress, getGetLightningAddressQueryKey } from "@workspace/api-client-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { dispatchFiatChange, FIAT_NAMES, FIAT_SYMBOLS } from "@/hooks/use-fiat-currency";
import { LifeHashAvatar } from "@/components/LifeHashAvatar";

type Sub = null | "yield" | "pin" | "username" | "delete";

function readStoredCurrency(): string {
  return (localStorage.getItem("bitpos_fiat") ?? "usd").toLowerCase();
}

export default function SettingsPage() {
  const { entity, account, logout, setAuth, token } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [sub, setSub] = useState<Sub>(null);

  // ── Currency ──────────────────────────────────────────────────────────────
  const serverCurrency = ((account as { currency?: string } | null)?.currency ?? "").toLowerCase();
  const [currency, setCurrency] = useState<string>(() => serverCurrency || readStoredCurrency());
  const [currencies, setCurrencies] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/price/currencies")
      .then((r) => r.json())
      .then((list: string[]) => setCurrencies(list))
      .catch(() => setCurrencies(["sats", "btc", "usd", "eur", "gbp", "xau"]));
  }, []);

  // Persist the currency to the server so the posBOX device reads the same value.
  function persistCurrency(val: string): void {
    if (!token) return;
    fetch("/api/auth/currency", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ currency: val }),
    }).catch(() => { /* offline — localStorage holds it; next change re-syncs */ });
  }

  // The server is the source of truth (the posBOX device reads it on boot).
  //  • If the server already has a currency, mirror it into local state +
  //    localStorage so the rest of the app and the UI reflect it.
  //  • One-time migration only: if the server has no/default currency but the
  //    browser holds a non-default legacy value, push that up once. This never
  //    overwrites a real server currency (e.g. THB) with a browser default.
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
      persistCurrency(stored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, serverCurrency]);

  const handleCurrency = (c: string) => {
    const val = c.toLowerCase();
    setCurrency(val);
    localStorage.setItem("bitpos_fiat", val);
    dispatchFiatChange();
    persistCurrency(val);
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
    if (!token || currentPin.length < 4 || newPin.length < 4) return;
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

          {/* Display currency - dropdown */}
          <div className="bg-card border border-border rounded-2xl p-5 mb-4">
            <p className="text-sm font-semibold mb-3">Display currency</p>
            <div className="relative">
              <select
                data-testid="select-currency"
                value={currency}
                onChange={(e) => handleCurrency(e.target.value)}
                disabled={currencies.length === 0}
                className={cn(
                  "w-full appearance-none bg-muted border border-border rounded-xl px-4 py-3 pr-10 text-sm font-medium",
                  "focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer",
                  currencies.length === 0 && "opacity-50"
                )}
              >
                {currencies.length === 0 && (
                  <option value={currency}>{currency.toUpperCase()} - Loading…</option>
                )}
                {currencies.map((c) => (
                  <option key={c} value={c}>{currencyOptionLabel(c)}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            </div>
          </div>

          {/* Menu items */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden mb-4">
            {[
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
              placeholder="New PIN (4–6 digits)"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              type="submit"
              data-testid="btn-change-pin"
              disabled={currentPin.length < 4 || newPin.length < 4 || pinLoading}
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
    </div>
  );
}
