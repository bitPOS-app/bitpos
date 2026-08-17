import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Copy } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCreateInvoice, customFetch, getGetBalanceQueryKey, getListTransactionsQueryKey } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import FullScreenPanel from "@/components/FullScreenPanel";
import PaymentSuccessOverlay from "@/components/PaymentSuccessOverlay";
import QRCodeDisplay from "@/components/QRCodeDisplay";
import NumPad from "@/components/NumPad";
import { useToast } from "@/hooks/use-toast";

type Step = "amount" | "waiting" | "success";

export default function ReceivePage() {
  const { account } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [step, setStep] = useState<Step>("amount");
  const [amountStr, setAmountStr] = useState("");
  const [memo, setMemo] = useState("");
  const [invoice, setInvoice] = useState<{ bolt11: string; paymentHash: string; amountSats: number } | null>(null);

  const amountSats = parseInt(amountStr, 10) || 0;

  const createInvoice = useCreateInvoice({
    mutation: {
      onSuccess: (data) => {
        setInvoice({ bolt11: data.bolt11, paymentHash: data.paymentHash, amountSats: data.amountSats });
        setStep("waiting");
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "Failed to create invoice";
        toast({ title: "Error", description: msg, variant: "destructive" });
      },
    },
  });

  // Poll this invoice's settlement status directly. Every poll also drives
  // the server-side settlement machine forward - this is what actually
  // settles the payment on autoscale, so it must not depend on balance
  // changes (wallets like Primal never report a fresh balance).
  const { data: invoiceStatus } = useQuery({
    queryKey: ["invoice-status", invoice?.paymentHash],
    queryFn: () =>
      customFetch<{ status: string; detail?: string }>(
        `/api/pos/invoice/${invoice!.paymentHash}/status`,
      ),
    enabled: !!invoice?.paymentHash && step === "waiting",
    refetchInterval: 2500,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    if (step !== "waiting" || !invoiceStatus || !account?.id) return;
    if (invoiceStatus.status === "paid") {
      qc.invalidateQueries({ queryKey: getGetBalanceQueryKey(account.id) });
      qc.invalidateQueries({ queryKey: getListTransactionsQueryKey(account.id) });
      setStep("success");
    } else if (invoiceStatus.status === "expired") {
      toast({
        title: invoiceStatus.detail === "cancelled" ? "Payment refunded" : "Invoice expired",
        description:
          invoiceStatus.detail === "cancelled"
            ? "The payment could not be completed - the payer was refunded automatically"
            : "Generate a new invoice to receive this payment",
        variant: "destructive",
      });
      setInvoice(null);
      setStep("amount");
    }
  }, [invoiceStatus, step, qc, account?.id, toast]);

  const handleGenerate = () => {
    if (!account?.id) return;
    const data = amountSats > 0
      ? { amountSats, ...(memo ? { memo } : {}) }
      : { amountSats: 1, ...(memo ? { memo } : {}) };
    createInvoice.mutate({ id: account.id, data });
  };

  const copyBolt11 = () => {
    if (!invoice) return;
    navigator.clipboard.writeText(invoice.bolt11).then(() =>
      toast({ title: "Copied", description: "Invoice copied to clipboard" })
    );
  };

  if (!account) return null;

  if (step === "success" && invoice) {
    return (
      <PaymentSuccessOverlay
        amountSats={invoice.amountSats}
        onDone={() => navigate("/dashboard")}
      />
    );
  }

  return (
    <FullScreenPanel title="Receive" onBack={() => navigate("/dashboard")}>
      {step === "amount" && (
        <div className="space-y-6">
          <div className="text-center">
            <p className="text-5xl font-bold font-mono-nums">{amountStr || "0"}</p>
            <p className="text-muted-foreground text-sm mt-1">sats</p>
          </div>
          <input
            type="text"
            data-testid="input-memo"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="Add a note (optional)"
            className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
          />
          <NumPad value={amountStr} onChange={setAmountStr} />
          <button
            type="button"
            data-testid="btn-generate-invoice"
            disabled={createInvoice.isPending}
            onClick={handleGenerate}
            className="w-full bg-primary text-primary-foreground rounded-xl py-4 font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {createInvoice.isPending ? (
              <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
            ) : "Generate invoice"}
          </button>
        </div>
      )}

      {step === "waiting" && invoice && (
        <div className="flex flex-col items-center space-y-6">
          <div className="text-center">
            <p className="font-mono-nums text-2xl font-bold">{invoice.amountSats.toLocaleString()} sats</p>
            <div className="flex items-center gap-2 justify-center mt-2">
              <div className="w-2 h-2 rounded-full bg-primary pulse-dot" />
              <p className="text-muted-foreground text-sm">Waiting for payment...</p>
            </div>
          </div>
          <div className="p-4 bg-card border border-border rounded-2xl">
            <QRCodeDisplay value={invoice.bolt11.toUpperCase()} size={240} />
          </div>
          <button
            type="button"
            data-testid="btn-copy-invoice"
            onClick={copyBolt11}
            className="flex items-center gap-2 w-full bg-card border border-border rounded-xl px-4 py-3 text-sm text-muted-foreground"
          >
            <Copy className="w-4 h-4 shrink-0" />
            <span className="font-mono text-xs truncate flex-1 text-left">{invoice.bolt11.slice(0, 40)}...</span>
          </button>
        </div>
      )}
    </FullScreenPanel>
  );
}
