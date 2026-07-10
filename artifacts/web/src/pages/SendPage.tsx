import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, AlertCircle, ScanLine, Copy, Check } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePay, useGetBalance, getGetBalanceQueryKey, getListTransactionsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import FullScreenPanel from "@/components/FullScreenPanel";
import NumPad from "@/components/NumPad";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { QrScannerModal } from "@/components/QrScannerModal";
import { useFiatCurrency } from "@/hooks/use-fiat-currency";
import { decode } from "light-bolt11-decoder";

type Step = "destination" | "amount" | "confirm" | "success";
type Unit = "sats" | "fiat";

function stripLightningPrefix(s: string): string {
  return s.replace(/^lightning:/i, "").trim();
}

function fmtExpiry(secs: number): string {
  if (secs < 120) return `${secs}s`;
  if (secs < 7200) return `${Math.round(secs / 60)}m`;
  return `${Math.round(secs / 3600)}h`;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="ml-2 shrink-0"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
    </button>
  );
}

export default function SendPage() {
  const { account } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { formatFiat, fiatToSats, isSats, symbol, label: currencyLabel } = useFiatCurrency();

  const [step, setStep] = useState<Step>("destination");
  const [destination, setDestination] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [unit, setUnit] = useState<Unit>("sats");
  const [memo, setMemo] = useState("");
  const [showMemo, setShowMemo] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  const { data: balance } = useGetBalance(account?.id ?? "", {
    query: { enabled: !!account?.id, queryKey: getGetBalanceQueryKey(account?.id ?? "") }
  });

  // Normalised destination (strip lightning: prefix)
  const dest = stripLightningPrefix(destination);

  const isInNetwork = dest.includes("@bitpos.app");
  const isBolt11 = dest.toLowerCase().startsWith("lnbc") || dest.toLowerCase().startsWith("lntb") || dest.toLowerCase().startsWith("lnbcrt");

  // Decode BOLT11 invoice for display
  const decoded = useMemo(() => {
    if (!isBolt11) return null;
    try {
      const result = decode(dest);
      const get = (name: string) => result.sections.find((s) => s.name === name);
      const amountSection = get("amount") as { value: string } | undefined;
      const descSection = get("description") as { value: string } | undefined;
      const hashSection = get("payment_hash") as { value: string } | undefined;
      const tsSection = get("timestamp") as { value: number } | undefined;

      // Amount is in millisatoshis
      const amountMsat = amountSection?.value ? Number(amountSection.value) : null;
      const amountSats = amountMsat !== null ? Math.round(amountMsat / 1000) : null;

      const expirySeconds = result.expiry ?? 3600;
      const createdAt = tsSection?.value ? tsSection.value * 1000 : Date.now();
      const expiresAt = new Date(createdAt + expirySeconds * 1000);
      const isExpired = expiresAt < new Date();

      return {
        amountSats,
        description: descSection?.value ?? null,
        paymentHash: hashSection?.value ?? null,
        expirySeconds,
        expiresAt,
        isExpired,
      };
    } catch {
      return null;
    }
  }, [dest, isBolt11]);

  const rawAmount = parseFloat(amountStr) || 0;
  const effectiveUnit = isSats ? "sats" : unit;
  const amountSats = isBolt11
    ? (decoded?.amountSats ?? 0)
    : effectiveUnit === "sats" ? Math.round(rawAmount) : fiatToSats(rawAmount);

  // bitPOS charges no fee. Any network/routing fee is charged by the user's
  // own wallet and only known after the payment settles (NWC fees_paid).
  const totalSats = amountSats;
  const hasBalance = (balance?.balanceSats ?? 0) >= totalSats;

  const pay = usePay({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetBalanceQueryKey(account?.id ?? "") });
        qc.invalidateQueries({ queryKey: getListTransactionsQueryKey(account?.id ?? "") });
        setStep("success");
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "Payment failed";
        toast({ title: "Payment failed", description: msg, variant: "destructive" });
      },
    },
  });

  const handleConfirm = () => {
    if (!account?.id) return;
    const payload = isBolt11
      ? { destination: dest }
      : { destination: dest, amountSats, ...(memo ? { memo } : {}) };
    pay.mutate({ id: account.id, data: payload });
  };

  if (!account) return null;

  return (
    <FullScreenPanel title="Send" onBack={() => navigate("/dashboard")}>
      {showScanner && (
        <QrScannerModal
          onResult={(value) => {
            setDestination(stripLightningPrefix(value));
            setShowScanner(false);
            toast({ title: "QR scanned", description: "Invoice decoded." });
          }}
          onClose={() => setShowScanner(false)}
        />
      )}

      {step === "destination" && (
        <div className="space-y-6">
          <div>
            <label className="block text-sm text-muted-foreground mb-2">Lightning address or invoice</label>
            <div className="relative">
              <textarea
                data-testid="input-destination"
                autoFocus
                value={destination}
                onChange={(e) => setDestination(e.target.value.trim())}
                placeholder="satoshi@bitpos.app or lnbc..."
                rows={3}
                className="w-full bg-card border border-border rounded-xl px-4 py-3 pr-12 text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground resize-none"
              />
              <button
                type="button"
                data-testid="btn-scan-qr"
                onClick={() => setShowScanner(true)}
                className="absolute right-3 top-3 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground"
                title="Scan QR code"
              >
                <ScanLine className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Show decoded invoice preview on the destination step */}
          {isBolt11 && decoded && (
            <div className="bg-card border border-border rounded-xl px-4 py-3 space-y-2 text-sm">
              {decoded.isExpired && (
                <div className="flex items-center gap-1.5 text-destructive text-xs">
                  <AlertCircle className="w-3.5 h-3.5" />
                  This invoice has expired
                </div>
              )}
              {decoded.amountSats !== null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount</span>
                  <div className="text-right">
                    <span className="font-mono-nums">{decoded.amountSats.toLocaleString()} sats</span>
                    {formatFiat(decoded.amountSats) && (
                      <span className="text-xs text-muted-foreground ml-1.5">({formatFiat(decoded.amountSats)})</span>
                    )}
                  </div>
                </div>
              )}
              {decoded.description && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground shrink-0">Memo</span>
                  <span className="text-right text-xs truncate">{decoded.description}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expires</span>
                <span className={cn("text-xs", decoded.isExpired ? "text-destructive" : "text-muted-foreground")}>
                  {decoded.expiresAt.toLocaleString()} ({fmtExpiry(decoded.expirySeconds)})
                </span>
              </div>
            </div>
          )}

          {destination && isInNetwork && (
            <div className="flex items-center gap-2 text-primary text-sm">
              <CheckCircle2 className="w-4 h-4" />
              In-network - no fee
            </div>
          )}
          <button
            type="button"
            data-testid="btn-next-destination"
            disabled={dest.length < 3 || (isBolt11 && decoded?.isExpired === true)}
            onClick={() => setStep(isBolt11 ? "confirm" : "amount")}
            className="w-full bg-primary text-primary-foreground rounded-xl py-4 font-semibold disabled:opacity-40"
          >
            Continue
          </button>
        </div>
      )}

      {step === "amount" && (
        <div className="space-y-6">
          <div className="text-center">
            <p className="text-muted-foreground text-sm mb-4">{dest}</p>
            {!isSats && (
              <div className="flex justify-center mb-4">
                <div className="flex bg-muted rounded-xl p-1 gap-1">
                  {(["sats", "fiat"] as Unit[]).map((u) => (
                    <button
                      key={u}
                      type="button"
                      data-testid={`btn-unit-${u}`}
                      onClick={() => { setUnit(u); setAmountStr(""); }}
                      className={cn(
                        "px-5 py-2 rounded-lg text-sm font-semibold transition-colors",
                        effectiveUnit === u ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                      )}
                    >
                      {u === "sats" ? "SATS" : <span>{symbol} {currencyLabel.toUpperCase()}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <p className="text-5xl font-bold font-mono-nums">{amountStr || "0"}</p>
            <p className="text-muted-foreground text-sm mt-1">{effectiveUnit === "sats" ? "sats" : currencyLabel.toUpperCase()}</p>
            {effectiveUnit === "fiat" && rawAmount > 0 && (
              <p className="text-muted-foreground text-sm mt-1 font-mono-nums">≈ {amountSats.toLocaleString()} sats</p>
            )}
          </div>
          {amountSats > 0 && (
            <div className="bg-card border border-border rounded-xl px-4 py-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-mono-nums">{amountSats.toLocaleString()} sats</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Network fee</span>
                <span className={cn(isInNetwork ? "text-primary font-mono-nums" : "text-xs text-muted-foreground")}>
                  {isInNetwork ? "No fee (in-network)" : "Set by your wallet"}
                </span>
              </div>
              {!hasBalance && (
                <div className="flex items-center gap-1 text-destructive text-xs pt-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Insufficient balance
                </div>
              )}
            </div>
          )}
          <NumPad value={amountStr} onChange={setAmountStr} />
          <button
            type="button"
            data-testid="btn-next-amount"
            disabled={amountSats < 1 || !hasBalance}
            onClick={() => setStep("confirm")}
            className="w-full bg-primary text-primary-foreground rounded-xl py-4 font-semibold disabled:opacity-40"
          >
            Review
          </button>
          <button type="button" onClick={() => setStep("destination")} className="w-full text-sm text-muted-foreground py-2">Back</button>
        </div>
      )}

      {step === "confirm" && (
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-2xl p-5 space-y-3 text-sm">
            <h3 className="font-semibold text-base">Confirm payment</h3>

            {/* BOLT11: rich decoded details */}
            {isBolt11 && decoded ? (
              <>
                {decoded.amountSats !== null ? (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Amount</span>
                    <div className="text-right">
                      <p className="font-mono-nums font-semibold">{decoded.amountSats.toLocaleString()} sats</p>
                      {formatFiat(decoded.amountSats) && (
                        <p className="text-xs text-muted-foreground">{formatFiat(decoded.amountSats)}</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Amount</span>
                    <span className="text-xs text-muted-foreground italic">Specified by payee</span>
                  </div>
                )}

                <div className="flex justify-between">
                  <span className="text-muted-foreground">Network fee</span>
                  <span className="text-xs text-muted-foreground">Set by your wallet</span>
                </div>

                {decoded.amountSats !== null && (
                  <div className="flex justify-between font-semibold border-t border-border pt-3">
                    <span>Total</span>
                    <div className="text-right">
                      <p className="font-mono-nums">{totalSats.toLocaleString()} sats</p>
                      {formatFiat(totalSats) && (
                        <p className="text-xs text-muted-foreground font-normal">{formatFiat(totalSats)}</p>
                      )}
                    </div>
                  </div>
                )}

                {decoded.description && (
                  <div className="flex justify-between gap-4 pt-1 border-t border-border">
                    <span className="text-muted-foreground shrink-0">Memo</span>
                    <span className="text-right text-xs break-words max-w-[200px]">{decoded.description}</span>
                  </div>
                )}

                <div className="pt-1 border-t border-border">
                  <p className="text-muted-foreground text-xs mb-1">Expires</p>
                  <p className="text-xs">{decoded.expiresAt.toLocaleString()}</p>
                </div>

                {decoded.paymentHash && (
                  <div className="pt-1 border-t border-border">
                    <p className="text-muted-foreground text-xs mb-1">Payment hash</p>
                    <div className="flex items-start gap-1">
                      <p className="text-xs font-mono break-all leading-relaxed flex-1">{decoded.paymentHash}</p>
                      <CopyButton value={decoded.paymentHash} />
                    </div>
                  </div>
                )}

                <div className="pt-1 border-t border-border">
                  <p className="text-muted-foreground text-xs mb-1">Invoice</p>
                  <div className="flex items-start gap-1">
                    <p className="text-xs font-mono break-all leading-relaxed flex-1 line-clamp-3">{dest}</p>
                    <CopyButton value={dest} />
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Lightning address: standard rows */}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">To</span>
                  <span className="font-mono text-xs text-right max-w-[200px] truncate">{dest}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount</span>
                  <div className="text-right">
                    <p className="font-mono-nums">{amountSats.toLocaleString()} sats</p>
                    {formatFiat(amountSats) && <p className="text-xs text-muted-foreground">{formatFiat(amountSats)}</p>}
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Network fee</span>
                  <span className={cn(isInNetwork ? "text-primary font-mono-nums" : "text-xs text-muted-foreground")}>
                    {isInNetwork ? "No fee" : "Set by your wallet"}
                  </span>
                </div>
                <div className="flex justify-between font-semibold border-t border-border pt-3">
                  <span>Total</span>
                  <div className="text-right">
                    <p className="font-mono-nums">{totalSats.toLocaleString()} sats</p>
                    {formatFiat(totalSats) && <p className="text-xs text-muted-foreground font-normal">{formatFiat(totalSats)}</p>}
                  </div>
                </div>
              </>
            )}

            {!hasBalance && amountSats > 0 && (
              <div className="flex items-center gap-1 text-destructive text-xs pt-1 border-t border-border">
                <AlertCircle className="w-3.5 h-3.5" />
                Insufficient balance ({(balance?.balanceSats ?? 0).toLocaleString()} sats available)
              </div>
            )}
          </div>

          {!isBolt11 && (
            showMemo ? (
              <input
                type="text"
                data-testid="input-memo"
                autoFocus
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="Add a note (optional)"
                className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            ) : (
              <button type="button" onClick={() => setShowMemo(true)} className="text-sm text-muted-foreground">
                + Add note
              </button>
            )
          )}
          <button
            type="button"
            data-testid="btn-confirm-send"
            disabled={pay.isPending || !hasBalance}
            onClick={handleConfirm}
            className="w-full bg-primary text-primary-foreground rounded-xl py-4 font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {pay.isPending ? (
              <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
            ) : "Send payment"}
          </button>
          <button type="button" onClick={() => setStep(isBolt11 ? "destination" : "amount")} className="w-full text-sm text-muted-foreground py-2">Back</button>
        </div>
      )}

      {step === "success" && (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
          <div className="w-20 h-20 rounded-full bg-green-400/10 flex items-center justify-center">
            <CheckCircle2 className="w-10 h-10 text-green-400" />
          </div>
          <div>
            <p className="text-xl font-bold">Payment sent</p>
            {amountSats > 0 && (
              <>
                <p className="text-muted-foreground mt-1 font-mono-nums">{amountSats.toLocaleString()} sats</p>
                {formatFiat(amountSats) && <p className="text-xs text-muted-foreground font-mono-nums">{formatFiat(amountSats)}</p>}
              </>
            )}
            {(pay.data?.feeSats ?? 0) > 0 && (
              <p className="text-xs text-muted-foreground mt-2 font-mono-nums" data-testid="text-network-fee">
                Network fee: {pay.data!.feeSats.toLocaleString()} sats (paid by your wallet)
              </p>
            )}
          </div>
          <button
            type="button"
            data-testid="btn-done"
            onClick={() => navigate("/dashboard")}
            className="w-full max-w-xs bg-primary text-primary-foreground rounded-xl py-4 font-semibold"
          >
            Done
          </button>
        </div>
      )}
    </FullScreenPanel>
  );
}
