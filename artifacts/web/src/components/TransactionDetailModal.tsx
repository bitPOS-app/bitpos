import { X, Copy, Check } from "lucide-react";
import { useState } from "react";
import type { Transaction } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { useFiatCurrency } from "@/hooks/use-fiat-currency";

function fmtSats(n: number) {
  return n.toLocaleString();
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      <div className="flex items-start gap-2">
        <p className="text-xs font-mono break-all flex-1 text-foreground/80">{value}</p>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted transition-colors mt-0.5"
        >
          {copied
            ? <Check className="w-3.5 h-3.5 text-green-400" />
            : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, mono = false, highlight }: { label: string; value: string; mono?: boolean; highlight?: "green" | "red" }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-0">
      <span className="text-xs text-muted-foreground shrink-0 pt-0.5">{label}</span>
      <span className={cn(
        "text-sm text-right break-all",
        mono && "font-mono",
        highlight === "green" && "text-green-400 font-semibold",
        highlight === "red" && "text-foreground font-semibold",
        !highlight && "text-foreground"
      )}>{value}</span>
    </div>
  );
}

const TYPE_LABELS: Record<string, string> = {
  lightning_send: "Lightning send",
  lightning_receive: "Lightning receive",
  internal_send: "Internal send",
  internal_receive: "Internal receive",
  card_payment: "Card payment",
  yield_distribution: "Yield",
};

const STATUS_LABELS: Record<string, string> = {
  completed: "Completed",
  pending: "Pending",
  failed: "Failed",
};

interface Props {
  tx: Transaction;
  onClose: () => void;
}

export function TransactionDetailModal({ tx, onClose }: Props) {
  const { formatFiat, symbol } = useFiatCurrency();
  const fiat = formatFiat(tx.amountSats);
  const feeFiat = tx.feeSats > 0 ? formatFiat(tx.feeSats) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-background border border-border rounded-t-3xl overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="font-semibold text-base">Transaction details</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Amount hero */}
        <div className="px-5 py-5 border-b border-border shrink-0">
          <p className={cn(
            "text-3xl font-bold font-mono-nums",
            tx.direction === "in" ? "text-green-400" : "text-foreground"
          )}>
            {tx.direction === "in" ? "+" : "−"}{fmtSats(tx.amountSats)} <span className="text-lg font-normal text-muted-foreground">sats</span>
          </p>
          {fiat && (
            <p className="text-sm text-muted-foreground font-mono-nums mt-1">≈ {fiat}</p>
          )}
          <div className="flex gap-2 mt-3">
            <span className={cn(
              "text-xs px-2.5 py-1 rounded-full font-medium",
              tx.status === "completed" && "bg-green-500/15 text-green-400",
              tx.status === "pending" && "bg-yellow-500/15 text-yellow-400",
              tx.status === "failed" && "bg-destructive/15 text-destructive"
            )}>
              {STATUS_LABELS[tx.status] ?? tx.status}
            </span>
            <span className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground font-medium">
              {TYPE_LABELS[tx.type] ?? tx.type}
            </span>
          </div>
        </div>

        {/* Scrollable details */}
        <div className="overflow-y-auto flex-1">
          <div className="px-5 divide-y divide-border">
            <Row label="Date" value={new Date(tx.createdAt).toLocaleString()} />
            <Row label="Direction" value={tx.direction === "in" ? "Received" : "Sent"} />
            {tx.counterpartHandle && (
              <Row label="Counterpart" value={`@${tx.counterpartHandle}`} mono />
            )}
            {tx.counterpartLnAddress && (
              <Row label="Lightning address" value={tx.counterpartLnAddress} mono />
            )}
            {tx.memo && (
              <Row label="Memo" value={tx.memo} />
            )}
            <Row
              label="Amount"
              value={`${fmtSats(tx.amountSats)} sats${fiat ? ` (${fiat})` : ""}`}
              highlight={tx.direction === "in" ? "green" : "red"}
              mono
            />
            {tx.feeSats > 0 && (
              <Row
                label="Fee"
                value={`${fmtSats(tx.feeSats)} sats${feeFiat ? ` (${feeFiat})` : ""}`}
                mono
              />
            )}
            {tx.cardId && (
              <Row label="Card ID" value={tx.cardId} mono />
            )}
            {tx.failureReason && (
              <Row label="Failure reason" value={tx.failureReason} highlight="red" />
            )}
          </div>

          {/* Long fields with copy buttons */}
          {(tx.paymentHash || tx.bolt11) && (
            <div className="px-5 py-4 space-y-4 border-t border-border">
              {tx.paymentHash && (
                <CopyField label="Payment hash / pre-image" value={tx.paymentHash} />
              )}
              {tx.bolt11 && (
                <CopyField label="BOLT11 invoice" value={tx.bolt11} />
              )}
            </div>
          )}

          {/* Raw ID */}
          <div className="px-5 pb-6 pt-2">
            <CopyField label="Transaction ID" value={tx.id} />
          </div>
        </div>
      </div>
    </div>
  );
}
