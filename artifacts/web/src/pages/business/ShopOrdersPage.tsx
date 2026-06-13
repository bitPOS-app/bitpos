import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronRight, Loader2, RefreshCw, ShoppingBag, CreditCard } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function authFetch(token: string, path: string) {
  return fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
}

interface CardOrder {
  id: string;
  status: string;
  designId?: string;
  printFileId?: string;
  quantity: number;
  amountSats: number;
  shippingName: string;
  shippingCountry: string;
  createdAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  awaiting_payment: "Awaiting Payment",
  pending: "Pending",
  confirmed: "Confirmed",
  printing: "Printing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<string, string> = {
  awaiting_payment: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  pending: "bg-muted text-muted-foreground border-border",
  confirmed: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  printing: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  shipped: "bg-primary/15 text-primary border-primary/30",
  delivered: "bg-green-500/15 text-green-400 border-green-500/30",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
};

function OrderStatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status] ?? status;
  const color = STATUS_COLORS[status] ?? "bg-muted text-muted-foreground border-border";
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${color}`}>
      {label}
    </span>
  );
}

function designLabel(designId?: string, printFileId?: string) {
  if (printFileId) return "Custom Artwork";
  if (!designId || designId === "plain-white") return "Plain White";
  if (designId === "bitpos-branded") return "bitPOS Branded";
  if (designId.startsWith("community-")) return "Community Design";
  return designId;
}

function OrderThumb({ designId, printFileId, communityPreviews }: {
  designId?: string;
  printFileId?: string;
  communityPreviews: Record<string, string>;
}) {
  let src: string | null = null;
  if (!printFileId) {
    if (designId === "bitpos-branded") src = `${BASE}/bitpos-branded-front.png`;
    else if (!designId || designId === "plain-white") src = `${BASE}/plain-white-card.png`;
    else if (designId.startsWith("community-")) src = communityPreviews[designId] ?? null;
  }

  return (
    <div className="w-16 flex-shrink-0 aspect-[85.6/53.98] rounded-lg border border-border bg-muted/40 overflow-hidden flex items-center justify-center self-center">
      {src ? (
        <img src={src} alt="Card" className="w-full h-full object-cover" draggable={false} />
      ) : (
        <CreditCard className="w-5 h-5 text-muted-foreground" />
      )}
    </div>
  );
}

export default function ShopOrdersPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<CardOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [communityPreviews, setCommunityPreviews] = useState<Record<string, string>>({});

  const loadOrders = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setError(false);
    authFetch(token, "/shop/orders")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: CardOrder[]) => setOrders(data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  // Fetch community design previews once (public endpoint, no auth)
  useEffect(() => {
    fetch(`${API}/shop/designs`)
      .then((r) => r.json())
      .then((designs: Array<{ id: string; previewUrl: string }>) => {
        const map: Record<string, string> = {};
        for (const d of designs) {
          if (d.id.startsWith("community-") && d.previewUrl) map[d.id] = d.previewUrl;
        }
        setCommunityPreviews(map);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-col min-h-full pb-8 safe-top">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-6 pb-4">
        <button
          type="button"
          onClick={() => navigate("/business/shop")}
          className="w-9 h-9 rounded-xl bg-card border border-border flex items-center justify-center"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">My Orders</h1>
          <p className="text-xs text-muted-foreground">Your card order history</p>
        </div>
        <button
          type="button"
          onClick={loadOrders}
          className="w-9 h-9 rounded-xl bg-card border border-border flex items-center justify-center"
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin opacity-50" : ""}`} />
        </button>
      </div>

      <div className="px-5 flex-1">
        {loading && orders.length === 0 && (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading orders…
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center gap-4 py-16">
            <p className="text-muted-foreground text-sm">Could not load orders.</p>
            <button
              type="button"
              onClick={loadOrders}
              className="flex items-center gap-2 text-sm text-primary font-medium"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Try again
            </button>
          </div>
        )}

        {!loading && !error && orders.length === 0 && (
          <div className="flex flex-col items-center gap-5 py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-card border border-border flex items-center justify-center">
              <ShoppingBag className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <p className="font-semibold">No orders yet</p>
              <p className="text-sm text-muted-foreground mt-1">Head to the shop to get your first Bolt Card!</p>
            </div>
            <button
              type="button"
              onClick={() => navigate("/business/shop")}
              className="bg-primary text-primary-foreground rounded-xl px-6 py-3 font-semibold text-sm"
            >
              Go to Shop
            </button>
          </div>
        )}

        {orders.length > 0 && (
          <div className="space-y-3">
            {orders.map((order) => (
              <button
                key={order.id}
                type="button"
                onClick={() => navigate(`/business/shop/orders/${order.id}`)}
                className="w-full bg-card border border-border rounded-2xl p-4 flex items-center gap-3 text-left hover:border-primary/40 transition-colors"
              >
                <OrderThumb
                  designId={order.designId}
                  printFileId={order.printFileId}
                  communityPreviews={communityPreviews}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <OrderStatusBadge status={order.status} />
                    <span className="font-mono text-xs text-muted-foreground opacity-50">{order.id.replace(/-/g, "").slice(0, 8).toUpperCase().replace(/(.{4})(.{4})/, "$1-$2")}</span>
                  </div>
                  <p className="font-medium text-sm">
                    {order.quantity > 1 ? `${order.quantity}× ` : ""}{designLabel(order.designId, order.printFileId)}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <span>{order.amountSats.toLocaleString()} sats</span>
                    <span>·</span>
                    <span>{new Date(order.createdAt).toLocaleDateString("en-GB")}</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-primary flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
