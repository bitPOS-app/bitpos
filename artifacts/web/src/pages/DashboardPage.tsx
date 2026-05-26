import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, Send, Download, CreditCard, ArrowUpDown, ArrowDownLeft, ArrowUpRight, Zap, RefreshCw, QrCode, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useGetBalance, getGetBalanceQueryKey,
  useListTransactions, getListTransactionsQueryKey,
  useGetLightningAddress, getGetLightningAddressQueryKey,
  useGetYieldHistory, getGetYieldHistoryQueryKey,
} from "@workspace/api-client-react";
import type { Transaction } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useFiatCurrency } from "@/hooks/use-fiat-currency";
import { cn } from "@/lib/utils";
import QRCodeDisplay from "@/components/QRCodeDisplay";
import { TransactionDetailModal } from "@/components/TransactionDetailModal";

function fmtSats(n: number) {
  return n.toLocaleString();
}

function txIcon(tx: Transaction) {
  const failed = tx.status === "failed";
  const pending = tx.status === "pending";
  const isInternal = tx.type === "internal_receive" || tx.type === "internal_send";
  const badge = isInternal && !failed ? (
    <span className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-card border border-border flex items-center justify-center">
      <Zap className="w-2 h-2 text-primary" />
    </span>
  ) : null;

  if (failed) return <ArrowUpRight className="w-4 h-4 text-destructive/60" />;
  if (pending) return <ArrowUpRight className="w-4 h-4 text-yellow-400/70" />;

  switch (tx.type) {
    case "receive":
      return <ArrowDownLeft className="w-4 h-4 text-green-400" />;
    case "internal_receive":
      return <div className="relative"><ArrowDownLeft className="w-4 h-4 text-green-400" />{badge}</div>;
    case "yield":
      return <Zap className="w-4 h-4 text-yellow-400" />;
    case "send": case "internal_send":
      return isInternal
        ? <div className="relative"><ArrowUpRight className="w-4 h-4 text-orange-400" />{badge}</div>
        : <ArrowUpRight className="w-4 h-4 text-orange-400" />;
    case "swap":
      return <ArrowUpDown className="w-4 h-4 text-blue-400" />;
    default:
      return <ArrowUpDown className="w-4 h-4 text-muted-foreground" />;
  }
}

function txLabel(tx: Transaction) {
  if (tx.counterpartHandle) return `@${tx.counterpartHandle}`;
  if (tx.counterpartLnAddress) return tx.counterpartLnAddress;
  if (tx.memo) return tx.memo;
  const map: Record<string, string> = {
    receive: "Received",
    send: "Sent",
    internal_receive: "Received (in-network)",
    internal_send: "Sent (in-network)",
    yield: "Weekly yield",
    swap: "On-chain swap",
    swap_refund: "Swap refund",
    fee: "Fee",
  };
  return map[tx.type] ?? tx.type;
}

export default function DashboardPage() {
  const { account } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showLnQr, setShowLnQr] = useState(false);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  const { formatFiat, isSats, label: currencyLabel } = useFiatCurrency();

  const { data: balance, isLoading: balLoading, refetch: refetchBal } = useGetBalance(
    account?.id ?? "",
    { query: { enabled: !!account?.id, queryKey: getGetBalanceQueryKey(account?.id ?? "") } }
  );

  const { data: transactions, isLoading: txLoading } = useListTransactions(
    account?.id ?? "",
    { query: { enabled: !!account?.id, queryKey: getListTransactionsQueryKey(account?.id ?? "") } }
  );

  const { data: lnAddress } = useGetLightningAddress(account?.id ?? "", {
    query: { enabled: !!account?.id, queryKey: getGetLightningAddressQueryKey(account?.id ?? "") }
  });

  const { data: yieldHistory } = useGetYieldHistory(account?.id ?? "", {
    query: { enabled: !!account?.id, queryKey: getGetYieldHistoryQueryKey(account?.id ?? "") }
  });

  const balanceSats = balance?.balanceSats ?? account?.balanceSats ?? 0;
  const lastYield = yieldHistory?.distributions?.[0]?.amountSats;

  const copyAddress = () => {
    const addr = lnAddress?.lightningAddress;
    if (!addr) return;
    navigator.clipboard.writeText(addr).then(() =>
      toast({ title: "Copied", description: addr })
    );
  };

  const quickActions = [
    { label: "Send", icon: Send, action: () => navigate("/send"), testId: "btn-send" },
    { label: "Receive", icon: Download, action: () => navigate("/receive"), testId: "btn-receive" },
    { label: "Card", icon: CreditCard, action: () => navigate("/bolt-card"), testId: "btn-card" },
    { label: "Swap", icon: ArrowUpDown, action: () => navigate("/swap"), testId: "btn-swap" },
  ];

  const balanceFiat = !isSats ? formatFiat(balanceSats) : null;

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="px-5 pt-8 pb-4 safe-top">
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-muted-foreground text-sm mb-1">Balance</p>
            {balLoading ? (
              <div className="h-10 w-48 bg-muted rounded animate-pulse" />
            ) : (
              <div data-testid="balance-display">
                <p className="text-4xl font-bold font-mono-nums tracking-tight leading-none">
                  {fmtSats(balanceSats)} <span className="text-2xl text-muted-foreground">sats</span>
                </p>
                {balanceFiat && (
                  <p className="text-lg text-muted-foreground font-mono-nums mt-1">
                    {balanceFiat}
                  </p>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            data-testid="btn-refresh"
            onClick={() => refetchBal()}
            className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center"
          >
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Lightning address */}
        {lnAddress && (
          <div className="flex items-center gap-2 mb-4">
            <button
              type="button"
              data-testid="lightning-address"
              onClick={copyAddress}
              className="flex items-center gap-2 bg-card border border-border rounded-xl px-4 py-2.5 flex-1 min-w-0"
            >
              <Zap className="w-4 h-4 text-primary shrink-0" />
              <span className="text-sm font-mono text-muted-foreground truncate flex-1 text-left">
                {lnAddress.lightningAddress}
              </span>
              <Copy className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            </button>
            <button
              type="button"
              data-testid="ln-address-qr"
              onClick={() => setShowLnQr(true)}
              className="flex items-center justify-center w-10 h-10 bg-card border border-border rounded-xl shrink-0"
            >
              <QrCode className="w-4 h-4 text-primary" />
            </button>
          </div>
        )}

        {/* Yield chip */}
        {lastYield !== undefined && lastYield > 0 && (
          <div
            data-testid="yield-chip"
            className="inline-flex items-center gap-1.5 bg-primary/10 border border-primary/20 rounded-full px-3 py-1.5 mb-4"
          >
            <Zap className="w-3 h-3 text-primary" />
            <span className="text-xs text-primary font-medium">
              +{fmtSats(lastYield)} sats this week
            </span>
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="px-5 pb-6">
        <div className="grid grid-cols-4 gap-3">
          {quickActions.map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.label}
                type="button"
                data-testid={a.testId}
                onClick={a.action}
                className="flex flex-col items-center gap-2 bg-card border border-border rounded-2xl py-4 hover:bg-card/80 active:scale-95 transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                  <Icon className="w-5 h-5 text-foreground" />
                </div>
                <span className="text-xs text-muted-foreground font-medium">{a.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Transactions */}
      <div className="flex-1 px-5">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Transactions
        </h2>
        {txLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 bg-muted rounded-xl animate-pulse" />
            ))}
          </div>
        ) : !transactions?.length ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-sm">No transactions yet</p>
            <p className="text-muted-foreground text-xs mt-1">Send or receive sats to get started</p>
          </div>
        ) : (
          <div className="space-y-1">
            {transactions.slice(0, 50).map((tx) => {
              const fiat = formatFiat(tx.amountSats);
              return (
                <div
                  key={tx.id}
                  data-testid={`tx-${tx.id}`}
                  className={cn(
                    "flex items-center gap-3 py-3 px-1 cursor-pointer rounded-xl transition-colors",
                    tx.status === "failed" ? "opacity-60 hover:opacity-80 hover:bg-destructive/5" : "hover:bg-muted/40",
                  )}
                  onClick={() => setSelectedTx(tx)}
                >
                  <div className={cn(
                    "w-9 h-9 rounded-xl border flex items-center justify-center shrink-0",
                    tx.status === "failed" ? "bg-destructive/10 border-destructive/20" :
                    tx.status === "pending" ? "bg-yellow-500/10 border-yellow-500/20" :
                    "bg-card border-border"
                  )}>
                    {txIcon(tx)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-sm font-medium truncate",
                      tx.status === "failed" && "line-through decoration-destructive/50"
                    )}>{txLabel(tx)}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(tx.createdAt).toLocaleDateString()}
                      {tx.status === "pending" && <span className="text-yellow-400"> · Pending</span>}
                      {tx.status === "failed" && <span className="text-destructive"> · Failed</span>}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={cn(
                      "text-sm font-semibold font-mono-nums",
                      tx.status === "failed" ? "text-muted-foreground line-through" :
                      tx.direction === "in" ? "text-green-400" : "text-foreground"
                    )}>
                      {tx.direction === "in" ? "+" : "-"}{fmtSats(tx.amountSats)} sats
                    </p>
                    {fiat && !tx.status.startsWith("fail") && (
                      <p className="text-xs text-muted-foreground font-mono-nums">{fiat}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Lightning address QR modal */}
      {showLnQr && lnAddress && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setShowLnQr(false)}
        >
          <div
            className="bg-card border border-border rounded-2xl p-6 mx-4 flex flex-col items-center gap-4 max-w-xs w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between w-full">
              <span className="text-sm font-semibold">Lightning Address</span>
              <button
                type="button"
                onClick={() => setShowLnQr(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <QRCodeDisplay value={`lightning:${lnAddress.lightningAddress}`} size={220} />
            <p className="text-xs font-mono text-muted-foreground text-center break-all">
              {lnAddress.lightningAddress}
            </p>
            <button
              type="button"
              onClick={() => { copyAddress(); setShowLnQr(false); }}
              className="flex items-center gap-2 bg-muted rounded-xl px-4 py-2.5 w-full justify-center"
            >
              <Copy className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Copy address</span>
            </button>
          </div>
        </div>
      )}

      {selectedTx && (
        <TransactionDetailModal tx={selectedTx} onClose={() => setSelectedTx(null)} />
      )}
    </div>
  );
}
