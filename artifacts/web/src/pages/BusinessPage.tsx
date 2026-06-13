import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Monitor, Users, FileText, BarChart2, Briefcase, ShoppingBag, ClipboardList, Cpu, Zap } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useActivateBusiness, getGetBalanceQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const modules = [
  { id: "pos", label: "Point of Sale", icon: Monitor, href: "/business/pos", desc: "Accept Lightning payments" },
  { id: "payroll", label: "Payroll", icon: Users, href: "/business/payroll", desc: "Pay your team in sats" },
  { id: "invoices", label: "Invoices", icon: FileText, href: "/business/invoices", desc: "Create and track invoices" },
  { id: "reports", label: "Reports", icon: BarChart2, href: "/business/reports", desc: "Cash flow analytics" },
  { id: "shop", label: "Card Shop", icon: ShoppingBag, href: "/business/shop", desc: "Order printed Bolt Cards" },
  { id: "orders", label: "My Orders", icon: ClipboardList, href: "/business/shop/orders", desc: "Track your card orders" },
  { id: "posbox", label: "posBOX", icon: Cpu, href: "/business/pos-box", desc: "Standalone Lightning terminal" },
  { id: "card-studio", label: "Card Studio", icon: Zap, href: "/business/card-studio", desc: "Drag-and-drop card design editor" },
];

export default function BusinessPage() {
  const { account, updateAccount } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [businessName, setBusinessName] = useState("");

  const activate = useActivateBusiness({
    mutation: {
      onSuccess: (data) => {
        updateAccount(data);
        qc.invalidateQueries({ queryKey: getGetBalanceQueryKey(account?.id ?? "") });
        toast({ title: "Business activated", description: data.businessName ?? "" });
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "Activation failed";
        toast({ title: "Error", description: msg, variant: "destructive" });
      },
    },
  });

  const handleActivate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!account?.id || businessName.trim().length < 2) return;
    activate.mutate({ id: account.id, data: { businessName: businessName.trim() } });
  };

  if (!account) return null;

  if (!account.businessActive) {
    return (
      <div className="flex flex-col min-h-full px-5 pt-8 pb-4 safe-top">
        <h1 className="text-2xl font-bold mb-8">Business</h1>
        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6 py-8">
          <div className="w-16 h-16 rounded-2xl bg-card border border-border flex items-center justify-center">
            <Briefcase className="w-8 h-8 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold text-lg">Activate Business</p>
            <p className="text-muted-foreground text-sm mt-1 max-w-xs mx-auto">
              Accept payments, run payroll, and track revenue in sats
            </p>
          </div>
          <form onSubmit={handleActivate} className="w-full max-w-xs space-y-4">
            <input
              type="text"
              data-testid="input-business-name"
              autoFocus
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Your business name"
              className="w-full bg-card border border-border rounded-xl px-4 py-3 text-foreground text-base focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              data-testid="btn-activate-business"
              disabled={businessName.trim().length < 2 || activate.isPending}
              className="w-full bg-primary text-primary-foreground rounded-xl py-4 font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {activate.isPending ? <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : "Activate Business"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full px-5 pt-8 pb-4 safe-top">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{account.businessName ?? "Business"}</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Business account</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {modules.map((mod) => {
          const Icon = mod.icon;
          return (
            <button
              key={mod.id}
              type="button"
              data-testid={`btn-${mod.id}`}
              onClick={() => navigate(mod.href)}
              className="bg-card border border-border rounded-2xl p-5 text-left hover:bg-card/80 active:scale-95 transition-all space-y-3"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm">{mod.label}</p>
                <p className="text-muted-foreground text-xs mt-0.5">{mod.desc}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
