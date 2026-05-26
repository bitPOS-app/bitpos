import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Package, CheckCircle2, Truck, MapPin, Clock, ExternalLink, Copy, Check, Loader2, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import QRCodeDisplay from "@/components/QRCodeDisplay";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

function authFetch(token: string, path: string, opts?: RequestInit) {
  return fetch(`${API}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
  });
}

interface Invoice {
  bolt11: string;
  amountSats: number;
  expiresAt?: string;
}

interface CardOrder {
  id: string;
  status: string;
  designId?: string;
  quantity: number;
  shippingName: string;
  shippingEmail?: string;
  shippingPhone?: string;
  shippingAddress1: string;
  shippingAddress2?: string;
  shippingCity: string;
  shippingPostalCode: string;
  shippingCountry: string;
  trackingNumber?: string;
  amountSats: number;
  pendingInvoiceId?: string;
  invoice?: Invoice;
  createdAt: string;
  updatedAt: string;
}

const STATUS_STEPS = [
  { key: "awaiting_payment", label: "Awaiting Payment", icon: Clock },
  { key: "pending", label: "Pending", icon: Clock },
  { key: "confirmed", label: "Confirmed", icon: CheckCircle2 },
  { key: "printing", label: "Printing", icon: Package },
  { key: "shipped", label: "Shipped", icon: Truck },
  { key: "delivered", label: "Delivered", icon: MapPin },
];

function getStatusIndex(status: string): number {
  return STATUS_STEPS.findIndex((s) => s.key === status);
}

const ACTIVE_STATUSES = new Set(["awaiting_payment", "pending", "confirmed", "printing"]);

const STATUS_COLORS: Record<string, string> = {
  awaiting_payment: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  pending: "bg-muted text-muted-foreground border-border",
  confirmed: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  printing: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  shipped: "bg-primary/15 text-primary border-primary/30",
  delivered: "bg-green-500/15 text-green-400 border-green-500/30",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
};

const STATUS_HUMAN: Record<string, string> = {
  awaiting_payment: "Awaiting Payment",
  pending: "Pending",
  confirmed: "Confirmed",
  printing: "Printing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

function OrderStatusBadge({ status }: { status: string }) {
  const label = STATUS_HUMAN[status] ?? status;
  const color = STATUS_COLORS[status] ?? "bg-muted text-muted-foreground border-border";
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${color}`}>{label}</span>;
}

const EXPIRY_MS = 5 * 60 * 1000;

function ExpiryCountdown({ createdAt, onExpired }: { createdAt: string; onExpired: () => void }) {
  const onExpiredRef = useRef(onExpired);
  onExpiredRef.current = onExpired;

  const getRemaining = useCallback(() => {
    const elapsed = Date.now() - new Date(createdAt).getTime();
    return Math.max(0, Math.ceil((EXPIRY_MS - elapsed) / 1000));
  }, [createdAt]);

  const [remaining, setRemaining] = useState(getRemaining);

  useEffect(() => {
    const id = setInterval(() => {
      const r = getRemaining();
      setRemaining(r);
      if (r <= 0) {
        clearInterval(id);
        setTimeout(() => onExpiredRef.current(), 500);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [getRemaining]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const urgent = remaining <= 60;

  return (
    <span className={urgent ? "text-destructive font-semibold" : "text-yellow-400"}>
      {mins}:{String(secs).padStart(2, "0")}
    </span>
  );
}

function shortId(uuid: string): string {
  const hex = uuid.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}

export default function ShopOrderPage() {
  const { id } = useParams<{ id: string }>();
  const { token, account } = useAuth();
  const navigate = useNavigate();
  const [order, setOrder] = useState<CardOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [paying, setPaying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [balanceSats, setBalanceSats] = useState<number | null>(null);
  const [payError, setPayError] = useState<string | null>(null);

  const loadBalance = useCallback(() => {
    if (!token || !account?.id) return;
    authFetch(token, `/accounts/${account.id}/balance`)
      .then((r) => r.json())
      .then((d) => setBalanceSats(d.balanceSats ?? null))
      .catch(() => {});
  }, [token, account?.id]);

  const loadOrder = useCallback(() => {
    if (!token || !id) return;
    authFetch(token, `/shop/orders/${id}`)
      .then((r) => r.json())
      .then(setOrder)
      .catch(() => {});
  }, [token, id]);

  useEffect(() => {
    if (!token || !id) return;
    setLoading(true);
    Promise.all([
      authFetch(token, `/shop/orders/${id}`).then((r) => r.json()).then(setOrder),
      account?.id
        ? authFetch(token, `/accounts/${account.id}/balance`).then((r) => r.json()).then((d) => setBalanceSats(d.balanceSats ?? null))
        : Promise.resolve(),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, [token, id, account?.id]);

  // Poll every 5s while order is in an active/transitional state; refresh balance too
  useEffect(() => {
    if (!order) return;
    if (!ACTIVE_STATUSES.has(order.status)) return;
    const interval = setInterval(() => { loadOrder(); loadBalance(); }, 5000);
    return () => clearInterval(interval);
  }, [order?.status, loadOrder, loadBalance]);

  async function handlePayFromBalance() {
    if (!token || !id) return;
    setPaying(true);
    setPayError(null);
    try {
      const r = await authFetch(token, `/shop/orders/${id}/pay`, { method: "POST" });
      const data = await r.json();
      if (data.paid) {
        loadOrder();
        loadBalance();
      } else {
        setPayError(data.error ?? "Payment failed");
      }
    } catch {
      setPayError("Network error - please try again");
    } finally {
      setPaying(false);
    }
  }

  async function handleCancel() {
    if (!token || !id) return;
    setCancelling(true);
    try {
      await authFetch(token, `/shop/orders/${id}/cancel`, { method: "POST" });
      loadOrder();
    } finally {
      setCancelling(false);
    }
  }

  function handleCopy(bolt11: string) {
    navigator.clipboard.writeText(bolt11).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="flex flex-col min-h-full items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex flex-col min-h-full items-center justify-center gap-4">
        <p className="text-muted-foreground">Order not found.</p>
        <button type="button" onClick={() => navigate("/business")} className="text-primary text-sm">
          Back to Business
        </button>
      </div>
    );
  }

  const currentIdx = getStatusIndex(order.status);
  const isCancelled = order.status === "cancelled";
  const isAwaitingPayment = order.status === "awaiting_payment";

  return (
    <div className="flex flex-col min-h-full pb-8 safe-top">
      {/* Header */}
      <div className="px-5 pt-6 pb-1">
        <button
          type="button"
          onClick={() => navigate("/business/shop/orders")}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to orders
        </button>
      </div>
      <div className="flex items-center gap-3 px-5 pt-3 pb-4">
        <div className="flex-1">
          <h1 className="text-xl font-bold">Card Order</h1>
          <p className="text-xs text-muted-foreground font-mono">{shortId(order.id)}</p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      <div className="px-5 space-y-5">
        {/* Status timeline */}
        {!isCancelled ? (
          <div className="bg-card border border-border rounded-2xl p-5">
            <p className="font-semibold text-sm mb-4">Order Status</p>
            <div className="space-y-0">
              {STATUS_STEPS.filter((s) => s.key !== "awaiting_payment" || isAwaitingPayment).map((step, i) => {
                const realIdx = STATUS_STEPS.findIndex((s) => s.key === step.key);
                const done = realIdx < currentIdx;
                const active = realIdx === currentIdx;
                const isLast = i === STATUS_STEPS.filter((s) => s.key !== "awaiting_payment" || isAwaitingPayment).length - 1;
                return (
                  <div key={step.key} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                        done ? "bg-primary" : active ? "bg-primary/20 border-2 border-primary" : "bg-card border-2 border-border"
                      }`}>
                        <step.icon className={`w-3.5 h-3.5 ${done ? "text-primary-foreground" : active ? "text-primary" : "text-muted-foreground"}`} />
                      </div>
                      {!isLast && <div className={`w-px flex-1 my-1 ${done ? "bg-primary" : "bg-border"}`} style={{ minHeight: 20 }} />}
                    </div>
                    <div className={`pb-4 ${isLast ? "" : ""}`}>
                      <p className={`text-sm font-medium ${active ? "text-foreground" : done ? "text-muted-foreground" : "text-muted-foreground/50"}`}>
                        {step.label}
                      </p>
                      {active && order.status === "shipped" && order.trackingNumber && (
                        <p className="text-xs text-primary mt-0.5">Tracking: {order.trackingNumber}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-4 text-center">
            <p className="font-semibold text-destructive">Order Cancelled</p>
          </div>
        )}

        {/* ── Payment panel (awaiting_payment only) ── */}
        {isAwaitingPayment && order.invoice && (
          <div className="bg-card border border-yellow-500/30 rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-sm">Payment Required</p>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                Cancels in{" "}
                <ExpiryCountdown createdAt={order.createdAt} onExpired={loadOrder} />
              </span>
            </div>

            <p className="text-xs text-muted-foreground">
              Scan the QR code or copy the invoice to pay{" "}
              <span className="text-foreground font-medium">{order.invoice.amountSats.toLocaleString()} sats</span> via Lightning,
              or pay directly from your balance below.
            </p>
            {balanceSats !== null && (
              <p className="text-xs text-muted-foreground">
                Your balance:{" "}
                <span className={balanceSats >= order.amountSats ? "text-green-400 font-medium" : "text-foreground font-medium"}>
                  {balanceSats.toLocaleString()} sats
                </span>
                {balanceSats < order.amountSats && (
                  <span className="text-muted-foreground"> - {(order.amountSats - balanceSats).toLocaleString()} sats short</span>
                )}
              </p>
            )}

            <div className="flex justify-center">
              <QRCodeDisplay value={order.invoice.bolt11} size={200} />
            </div>

            <button
              type="button"
              onClick={() => handleCopy(order.invoice!.bolt11)}
              className="w-full bg-muted border border-border rounded-xl py-3 text-sm font-medium flex items-center justify-center gap-2 hover:bg-muted/80"
            >
              {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied!" : "Copy invoice"}
            </button>

            <button
              type="button"
              disabled={paying || (balanceSats !== null && balanceSats < order.amountSats)}
              onClick={handlePayFromBalance}
              className="w-full bg-primary text-primary-foreground rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {paying && <Loader2 className="w-4 h-4 animate-spin" />}
              Pay {order.amountSats.toLocaleString()} sats from balance
            </button>
            {payError && (
              <p className="text-xs text-destructive text-center">{payError}</p>
            )}

            <button
              type="button"
              disabled={cancelling}
              onClick={handleCancel}
              className="w-full bg-transparent border border-destructive/30 text-destructive rounded-xl py-2.5 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-destructive/5"
            >
              {cancelling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
              Cancel order
            </button>
          </div>
        )}

        {/* Tracking */}
        {order.trackingNumber && (
          <div className="bg-card border border-border rounded-2xl p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Tracking number</p>
              <p className="font-mono text-sm font-medium mt-0.5">{order.trackingNumber}</p>
            </div>
            <ExternalLink className="w-4 h-4 text-muted-foreground" />
          </div>
        )}

        {/* Order details */}
        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <p className="font-semibold text-sm">Order Details</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Order ID</span>
              <span className="font-mono text-xs text-muted-foreground">{shortId(order.id)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount</span>
              <span className="font-medium">{order.amountSats.toLocaleString()} sats</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Design</span>
              <span>{order.designId === "plain-white" || !order.designId ? "Plain White" : order.designId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Quantity</span>
              <span>{order.quantity} {order.quantity === 1 ? "card" : "cards"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Payment</span>
              <span>{order.pendingInvoiceId ? "Lightning invoice" : "Wallet balance"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ordered</span>
              <span>{new Date(order.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
            </div>
          </div>
        </div>

        {/* Shipping address */}
        <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
          <p className="font-semibold text-sm">Shipping to</p>
          <div className="text-sm text-muted-foreground space-y-0.5">
            <p className="text-foreground font-medium">{order.shippingName}</p>
            {order.shippingEmail && <p>{order.shippingEmail}</p>}
            {order.shippingPhone && <p>{order.shippingPhone}</p>}
            <p className="pt-1">{order.shippingAddress1}</p>
            {order.shippingAddress2 && <p>{order.shippingAddress2}</p>}
            <p>{order.shippingCity}, {order.shippingPostalCode}</p>
            <p>{order.shippingCountry}</p>
          </div>
        </div>

        {/* Activation instructions */}
        {!isCancelled && !isAwaitingPayment && (
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 space-y-2">
            <p className="font-semibold text-sm text-primary">When your card arrives</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Open bitPOS → <strong className="text-foreground">Card → Issue New Card</strong> to generate your Bolt Card keys. Then write them to your new card using the <strong className="text-foreground">Bolt Card Creator App</strong>.
            </p>
            <button
              type="button"
              onClick={() => navigate("/bolt-card")}
              className="mt-2 text-sm text-primary font-medium flex items-center gap-1"
            >
              Go to Card section
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
