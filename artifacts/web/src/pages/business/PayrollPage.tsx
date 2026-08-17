import { useState, useEffect } from "react";
import { ArrowLeft, Plus, Trash2, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePay, getGetBalanceQueryKey, getListTransactionsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface Recipient {
  id: string;
  name: string;
  lightningAddress: string;
  amountSats: number;
  frequency: "weekly" | "monthly" | "one-time";
}

function loadRecipients(): Recipient[] {
  try {
    return JSON.parse(localStorage.getItem("bitpos_payroll") ?? "[]");
  } catch {
    return [];
  }
}

function saveRecipients(r: Recipient[]) {
  localStorage.setItem("bitpos_payroll", JSON.stringify(r));
}

export default function PayrollPage() {
  const { account } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [recipients, setRecipients] = useState<Recipient[]>(loadRecipients);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", lightningAddress: "", amountSats: "", frequency: "monthly" as Recipient["frequency"] });
  const [paying, setPaying] = useState<string | null>(null);

  useEffect(() => { saveRecipients(recipients); }, [recipients]);

  const pay = usePay({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetBalanceQueryKey(account?.id ?? "") });
        qc.invalidateQueries({ queryKey: getListTransactionsQueryKey(account?.id ?? "") });
        toast({ title: "Payment sent" });
        setPaying(null);
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "Payment failed";
        toast({ title: "Error", description: msg, variant: "destructive" });
        setPaying(null);
      },
    },
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseInt(form.amountSats, 10);
    if (!form.name || !form.lightningAddress || isNaN(amt) || amt < 1) return;
    setRecipients((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: form.name, lightningAddress: form.lightningAddress, amountSats: amt, frequency: form.frequency },
    ]);
    setForm({ name: "", lightningAddress: "", amountSats: "", frequency: "monthly" });
    setShowAdd(false);
  };

  const handlePay = (r: Recipient) => {
    if (!account?.id) return;
    setPaying(r.id);
    pay.mutate({ id: account.id, data: { destination: r.lightningAddress, amountSats: r.amountSats, memo: `Payroll: ${r.name}` } });
  };

  const handleDelete = (id: string) => {
    setRecipients((prev) => prev.filter((r) => r.id !== id));
  };

  if (!account) return null;

  return (
    <div className="flex flex-col min-h-full px-5 pt-8 pb-4 safe-top">
      <div className="flex items-center gap-3 mb-6">
        <button type="button" onClick={() => navigate("/business")} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-muted">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold flex-1">Payroll</h1>
        <button
          type="button"
          data-testid="btn-add-recipient"
          onClick={() => setShowAdd(true)}
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-primary text-primary-foreground"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="bg-card border border-border rounded-2xl p-5 space-y-4 mb-6">
          <h3 className="font-semibold">Add recipient</h3>
          <input
            type="text"
            data-testid="input-recipient-name"
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <input
            type="text"
            data-testid="input-recipient-address"
            placeholder="Lightning address"
            autoCapitalize="none"
            value={form.lightningAddress}
            onChange={(e) => setForm((f) => ({ ...f, lightningAddress: e.target.value.trim() }))}
            className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <input
            type="number"
            data-testid="input-recipient-amount"
            placeholder="Amount (sats)"
            value={form.amountSats}
            onChange={(e) => setForm((f) => ({ ...f, amountSats: e.target.value }))}
            className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <select
            value={form.frequency}
            onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value as Recipient["frequency"] }))}
            className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="one-time">One-time</option>
          </select>
          <div className="flex gap-3">
            <button type="button" onClick={() => setShowAdd(false)} className="flex-1 bg-muted rounded-xl py-3 text-sm font-medium">Cancel</button>
            <button type="submit" data-testid="btn-save-recipient" className="flex-1 bg-primary text-primary-foreground rounded-xl py-3 text-sm font-semibold">Add</button>
          </div>
        </form>
      )}

      {recipients.length === 0 && !showAdd ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 py-16">
          <div className="w-14 h-14 rounded-2xl bg-card border border-border flex items-center justify-center">
            <Users className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm">No recipients yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {recipients.map((r) => (
            <div key={r.id} className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                <span className="text-sm font-bold">{r.name[0].toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{r.name}</p>
                <p className="text-xs text-muted-foreground font-mono truncate">{r.lightningAddress}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {r.amountSats.toLocaleString()} sats · {r.frequency}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  data-testid={`btn-pay-${r.id}`}
                  disabled={paying === r.id}
                  onClick={() => handlePay(r)}
                  className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold disabled:opacity-50 flex items-center gap-1"
                >
                  {paying === r.id ? <div className="w-3 h-3 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : "Pay"}
                </button>
                <button type="button" onClick={() => handleDelete(r.id)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted">
                  <Trash2 className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
