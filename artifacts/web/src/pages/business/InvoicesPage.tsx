import { useState, useEffect } from "react";
import { ArrowLeft, Plus, Copy, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useCreateInvoice } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type InvoiceStatus = "unpaid" | "paid" | "overdue";

interface InvoiceRecord {
  id: string;
  amount: number;
  description: string;
  dueDate: string;
  bolt11: string;
  paymentHash: string;
  createdAt: string;
  status: InvoiceStatus;
}

function computeStatus(inv: InvoiceRecord): InvoiceStatus {
  if (inv.status === "paid") return "paid";
  if (inv.dueDate && new Date(inv.dueDate) < new Date()) return "overdue";
  return "unpaid";
}

function loadInvoices(): InvoiceRecord[] {
  try { return JSON.parse(localStorage.getItem("bitpos_invoices") ?? "[]"); } catch { return []; }
}
function saveInvoices(i: InvoiceRecord[]) {
  localStorage.setItem("bitpos_invoices", JSON.stringify(i));
}

const statusColors: Record<InvoiceStatus, string> = {
  unpaid: "bg-primary/10 text-primary border-primary/20",
  paid: "bg-green-500/10 text-green-400 border-green-500/20",
  overdue: "bg-destructive/10 text-destructive border-destructive/20",
};

const statusLabel: Record<InvoiceStatus, string> = {
  unpaid: "Unpaid",
  paid: "Paid",
  overdue: "Overdue",
};

export default function InvoicesPage() {
  const { account } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [invoices, setInvoices] = useState<InvoiceRecord[]>(loadInvoices);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ amount: "", description: "", dueDate: "" });

  useEffect(() => { saveInvoices(invoices); }, [invoices]);

  const createInvoice = useCreateInvoice({
    mutation: {
      onSuccess: (data) => {
        const rec: InvoiceRecord = {
          id: crypto.randomUUID(),
          amount: parseInt(form.amount, 10),
          description: form.description,
          dueDate: form.dueDate,
          bolt11: data.bolt11,
          paymentHash: data.paymentHash,
          createdAt: new Date().toISOString(),
          status: "unpaid",
        };
        setInvoices((prev) => [rec, ...prev]);
        setForm({ amount: "", description: "", dueDate: "" });
        setShowCreate(false);
        toast({ title: "Invoice created" });
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "Failed to create invoice";
        toast({ title: "Error", description: msg, variant: "destructive" });
      },
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseInt(form.amount, 10);
    if (!form.description || isNaN(amt) || amt < 1 || !account?.id) return;
    createInvoice.mutate({ id: account.id, data: { amountSats: amt, memo: form.description } });
  };

  const handleCopyLink = (inv: InvoiceRecord) => {
    const link = `lightning:${inv.bolt11}`;
    navigator.clipboard.writeText(link).then(() => toast({ title: "Copied", description: "Invoice link copied" }));
  };

  const markPaid = (id: string) => {
    setInvoices((prev) => prev.map((inv) => inv.id === id ? { ...inv, status: "paid" as const } : inv));
  };

  if (!account) return null;

  return (
    <div className="flex flex-col min-h-full px-5 pt-8 pb-4 safe-top">
      <div className="flex items-center gap-3 mb-6">
        <button type="button" onClick={() => navigate("/business")} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-muted">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold flex-1">Invoices</h1>
        <button
          type="button"
          data-testid="btn-create-invoice"
          onClick={() => setShowCreate(true)}
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-primary text-primary-foreground"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-card border border-border rounded-2xl p-5 space-y-4 mb-6">
          <h3 className="font-semibold">New invoice</h3>
          <input
            type="number"
            data-testid="input-invoice-amount"
            placeholder="Amount (sats)"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <input
            type="text"
            data-testid="input-invoice-desc"
            placeholder="Description"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <input
            type="date"
            data-testid="input-invoice-due"
            placeholder="Due date (optional)"
            value={form.dueDate}
            onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
            className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <div className="flex gap-3">
            <button type="button" onClick={() => setShowCreate(false)} className="flex-1 bg-muted rounded-xl py-3 text-sm font-medium">Cancel</button>
            <button type="submit" data-testid="btn-save-invoice" disabled={createInvoice.isPending} className="flex-1 bg-primary text-primary-foreground rounded-xl py-3 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
              {createInvoice.isPending ? <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : "Create"}
            </button>
          </div>
        </form>
      )}

      {invoices.length === 0 && !showCreate ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 py-16">
          <div className="w-14 h-14 rounded-2xl bg-card border border-border flex items-center justify-center">
            <FileText className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm">No invoices yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {invoices.map((inv) => {
            const status = computeStatus(inv);
            return (
              <div key={inv.id} className="bg-card border border-border rounded-2xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{inv.description}</p>
                    <p className="text-muted-foreground text-xs mt-0.5">
                      {new Date(inv.createdAt).toLocaleDateString("en-GB")}
                      {inv.dueDate && ` · Due ${new Date(inv.dueDate).toLocaleDateString("en-GB")}`}
                    </p>
                  </div>
                  <span className={cn("text-xs px-2 py-1 rounded-full border shrink-0", statusColors[status])}>
                    {statusLabel[status]}
                  </span>
                </div>
                <p className="font-mono-nums font-bold text-lg">{inv.amount.toLocaleString()} sats</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopyLink(inv)}
                    className="flex items-center gap-1.5 bg-muted rounded-xl px-3 py-2 text-xs font-medium flex-1 justify-center"
                  >
                    <Copy className="w-3.5 h-3.5" /> Share link
                  </button>
                  {status !== "paid" && (
                    <button
                      type="button"
                      data-testid={`btn-mark-paid-${inv.id}`}
                      onClick={() => markPaid(inv.id)}
                      className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 text-green-400 rounded-xl px-3 py-2 text-xs font-medium"
                    >
                      Mark paid
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
