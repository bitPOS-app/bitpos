import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCreateSwap, useGetSwapStatus, getGetSwapStatusQueryKey, getGetBalanceQueryKey, getListTransactionsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import FullScreenPanel from "@/components/FullScreenPanel";
import NumPad from "@/components/NumPad";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Step = "address" | "amount" | "confirm" | "progress";

function ProgressStep({ num, label, state }: { num: number; label: string; state: "done" | "active" | "pending" }) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-colors",
        state === "done" ? "bg-green-500/20 text-green-400" :
        state === "active" ? "bg-primary text-primary-foreground" :
        "bg-muted text-muted-foreground"
      )}>
        {state === "done" ? <CheckCircle2 className="w-4 h-4" /> : num}
      </div>
      <span className={cn("text-sm", state === "active" ? "text-foreground font-medium" : "text-muted-foreground")}>
        {label}
      </span>
      {state === "active" && <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin ml-auto" />}
    </div>
  );
}

export default function SwapPage() {
  const { account } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [step, setStep] = useState<Step>("address");
  const [address, setAddress] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [swapId, setSwapId] = useState<string | null>(null);
  const [swapDetails, setSwapDetails] = useState<{ onchainAmount: number; feeSats: number } | null>(null);

  const amountSats = parseInt(amountStr, 10) || 0;
  const feeSats = Math.ceil(amountSats * 0.005);

  const createSwap = useCreateSwap({
    mutation: {
      onSuccess: (data) => {
        setSwapId(data.swapId);
        setSwapDetails({ onchainAmount: data.onchainAmount, feeSats: data.feeSats });
        qc.invalidateQueries({ queryKey: getGetBalanceQueryKey(account?.id ?? "") });
        qc.invalidateQueries({ queryKey: getListTransactionsQueryKey(account?.id ?? "") });
        setStep("progress");
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "Swap failed";
        toast({ title: "Swap failed", description: msg, variant: "destructive" });
      },
    },
  });

  const { data: swapStatus } = useGetSwapStatus(account?.id ?? "", swapId ?? "", {
    query: {
      enabled: !!account?.id && !!swapId && step === "progress",
      queryKey: getGetSwapStatusQueryKey(account?.id ?? "", swapId ?? ""),
      refetchInterval: (data) => {
        if (!data) return 4000;
        const s = (data as { status?: string })?.status;
        if (s === "completed" || s === "failed") return false;
        return 4000;
      },
    }
  });

  const swapStep = (() => {
    const s = (swapStatus as { status?: string } | undefined)?.status;
    if (!s || s === "pending") return 1;
    if (s === "invoice_paid") return 2;
    if (s === "completed") return 3;
    return 1;
  })();

  const swapFailed = (swapStatus as { status?: string } | undefined)?.status === "failed";
  const swapDone = (swapStatus as { status?: string } | undefined)?.status === "completed";

  if (!account) return null;

  return (
    <FullScreenPanel title="On-chain swap" onBack={() => navigate("/dashboard")}>
      {step === "address" && (
        <div className="space-y-6">
          <div>
            <label className="block text-sm text-muted-foreground mb-2">Bitcoin address</label>
            <textarea
              data-testid="input-btc-address"
              autoFocus
              value={address}
              onChange={(e) => setAddress(e.target.value.trim())}
              placeholder="bc1q..."
              rows={3}
              className="w-full bg-card border border-border rounded-xl px-4 py-3 text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground resize-none"
            />
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-sm text-muted-foreground space-y-1">
            <p>Boltz submarine swap exit ramp</p>
            <p>0.5% Boltz fee applies to on-chain conversion</p>
          </div>
          <button
            type="button"
            data-testid="btn-next-address"
            disabled={address.length < 20}
            onClick={() => setStep("amount")}
            className="w-full bg-primary text-primary-foreground rounded-xl py-4 font-semibold disabled:opacity-40"
          >
            Continue
          </button>
        </div>
      )}

      {step === "amount" && (
        <div className="space-y-6">
          <div className="text-center">
            <p className="text-5xl font-bold font-mono-nums">{amountStr || "0"}</p>
            <p className="text-muted-foreground text-sm mt-1">sats to swap</p>
          </div>
          {amountSats > 0 && (
            <div className="bg-card border border-border rounded-xl px-4 py-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">You send</span>
                <span className="font-mono-nums">{amountSats.toLocaleString()} sats</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Boltz fee (0.5%)</span>
                <span className="font-mono-nums">{feeSats.toLocaleString()} sats</span>
              </div>
              <div className="flex justify-between font-semibold border-t border-border pt-2">
                <span>You receive</span>
                <span className="font-mono-nums">{(amountSats - feeSats).toLocaleString()} sats</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>To</span>
                <span className="font-mono max-w-[200px] truncate">{address.slice(0, 20)}...</span>
              </div>
            </div>
          )}
          <NumPad value={amountStr} onChange={setAmountStr} />
          <button
            type="button"
            data-testid="btn-next-amount"
            disabled={amountSats < 10000}
            onClick={() => setStep("confirm")}
            className="w-full bg-primary text-primary-foreground rounded-xl py-4 font-semibold disabled:opacity-40"
          >
            Review
          </button>
          <button type="button" onClick={() => setStep("address")} className="w-full text-sm text-muted-foreground py-2">Back</button>
        </div>
      )}

      {step === "confirm" && (
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-2xl p-5 space-y-3 text-sm">
            <h3 className="font-semibold text-base">Confirm swap</h3>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount</span>
              <span className="font-mono-nums">{amountSats.toLocaleString()} sats</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Boltz fee (0.5%)</span>
              <span className="font-mono-nums">{feeSats.toLocaleString()} sats</span>
            </div>
            <div className="flex justify-between font-semibold border-t border-border pt-2">
              <span>You receive</span>
              <span className="font-mono-nums">{(amountSats - feeSats).toLocaleString()} sats</span>
            </div>
            <div className="flex flex-col gap-1 border-t border-border pt-2">
              <span className="text-muted-foreground">Bitcoin address</span>
              <span className="font-mono text-xs break-all">{address}</span>
            </div>
          </div>
          <button
            type="button"
            data-testid="btn-confirm-swap"
            disabled={createSwap.isPending}
            onClick={() => createSwap.mutate({ id: account.id, data: { destinationAddress: address, amountSats } })}
            className="w-full bg-primary text-primary-foreground rounded-xl py-4 font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {createSwap.isPending ? <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : "Confirm swap"}
          </button>
          <button type="button" onClick={() => setStep("amount")} className="w-full text-sm text-muted-foreground py-2">Back</button>
        </div>
      )}

      {step === "progress" && (
        <div className="space-y-8">
          <div className="bg-card border border-border rounded-2xl p-5">
            <p className="text-sm font-semibold mb-1">Swap initiated</p>
            {swapDetails && (
              <p className="text-muted-foreground text-sm font-mono-nums">
                {swapDetails.onchainAmount.toLocaleString()} sats → {address.slice(0, 16)}...
              </p>
            )}
          </div>

          <div className="bg-card border border-border rounded-2xl p-5 space-y-5">
            <h3 className="font-semibold">Progress</h3>
            <ProgressStep num={1} label="Lightning payment received" state={swapStep >= 1 ? (swapStep > 1 ? "done" : "active") : "pending"} />
            <ProgressStep num={2} label="Broadcasting on-chain transaction" state={swapStep >= 2 ? (swapStep > 2 ? "done" : "active") : "pending"} />
            <ProgressStep num={3} label="Confirmed on-chain" state={swapStep >= 3 ? "done" : "pending"} />
          </div>

          {swapFailed && (
            <div className="flex items-center gap-3 bg-destructive/10 border border-destructive/20 rounded-xl p-4">
              <XCircle className="w-5 h-5 text-destructive shrink-0" />
              <p className="text-destructive text-sm">Swap failed. Your funds have been refunded.</p>
            </div>
          )}

          {swapDone && (
            <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 rounded-xl p-4">
              <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
              <p className="text-green-400 text-sm">Swap complete. Funds sent on-chain.</p>
            </div>
          )}

          {(swapDone || swapFailed) && (
            <button
              type="button"
              data-testid="btn-done"
              onClick={() => navigate("/dashboard")}
              className="w-full bg-primary text-primary-foreground rounded-xl py-4 font-semibold"
            >
              Back to wallet
            </button>
          )}
        </div>
      )}
    </FullScreenPanel>
  );
}
