import { useMemo } from "react";
import { ArrowLeft, Download } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useListTransactions, getListTransactionsQueryKey } from "@workspace/api-client-react";
import type { Transaction } from "@workspace/api-client-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

function weekStart(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}

function aggregateByWeek(txs: Transaction[]) {
  const map: Record<string, { in: number; out: number }> = {};
  for (const tx of txs) {
    const w = weekStart(new Date(tx.createdAt));
    if (!map[w]) map[w] = { in: 0, out: 0 };
    if (tx.direction === "in") map[w].in += tx.amountSats;
    else map[w].out += tx.amountSats;
  }
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([week, vals]) => ({
      week: week.slice(5),
      received: vals.in,
      sent: vals.out,
      net: vals.in - vals.out,
    }));
}

function exportCSV(txs: Transaction[]) {
  const header = "id,direction,amountSats,feeSats,type,status,memo,createdAt";
  const rows = txs.map((t) =>
    `${t.id},${t.direction},${t.amountSats},${t.feeSats ?? 0},${t.type},${t.status},"${t.memo ?? ""}",${t.createdAt}`
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bitpos-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl p-3 text-xs space-y-1 shadow-lg">
      <p className="text-muted-foreground font-mono">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.name === "received" ? "#4ade80" : p.name === "sent" ? "#f7931a" : "#94a3b8" }}>
          {p.name}: {p.value.toLocaleString()} sats
        </p>
      ))}
    </div>
  );
};

export default function ReportsPage() {
  const { account } = useAuth();
  const navigate = useNavigate();

  const { data: transactions, isLoading } = useListTransactions(account?.id ?? "", {
    query: { enabled: !!account?.id, queryKey: getListTransactionsQueryKey(account?.id ?? "") }
  });

  const txs = transactions ?? [];

  const totalIn = txs.filter((t) => t.direction === "in").reduce((s, t) => s + t.amountSats, 0);
  const totalOut = txs.filter((t) => t.direction === "out").reduce((s, t) => s + t.amountSats, 0);
  const totalFees = txs.reduce((s, t) => s + (t.feeSats ?? 0), 0);
  const yieldTotal = txs.filter((t) => t.type === "yield").reduce((s, t) => s + t.amountSats, 0);

  const chartData = useMemo(() => aggregateByWeek(txs), [txs]);

  if (!account) return null;

  return (
    <div className="flex flex-col min-h-full px-5 pt-8 pb-4 safe-top">
      <div className="flex items-center gap-3 mb-6">
        <button type="button" onClick={() => navigate("/business")} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-muted">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold flex-1">Reports</h1>
        <button
          type="button"
          data-testid="btn-export-csv"
          onClick={() => exportCSV(txs)}
          className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2 text-sm font-medium"
        >
          <Download className="w-4 h-4" />
          CSV
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {[
          { label: "Total received", value: totalIn, color: "text-green-400" },
          { label: "Total sent", value: totalOut, color: "text-foreground" },
        ].map((item) => (
          <div key={item.label} className="bg-card border border-border rounded-2xl p-4">
            <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
            <p className={`font-mono-nums font-bold text-lg ${item.color}`}>{item.value.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">sats</p>
          </div>
        ))}
      </div>

      {/* Cash flow chart */}
      <div className="bg-card border border-border rounded-2xl p-4 mb-4">
        <h3 className="font-semibold text-sm mb-4">Weekly cash flow</h3>
        {isLoading ? (
          <div className="h-40 bg-muted rounded animate-pulse" />
        ) : chartData.length < 2 ? (
          <div className="h-40 flex items-center justify-center">
            <p className="text-muted-foreground text-sm">Not enough data yet</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 15%)" />
              <XAxis dataKey="week" tick={{ fontSize: 10, fill: "hsl(0 0% 55%)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(0 0% 55%)" }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="received" stroke="#4ade80" strokeWidth={2} dot={false} name="received" />
              <Line type="monotone" dataKey="sent" stroke="#f7931a" strokeWidth={2} dot={false} name="sent" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Recent transactions table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-sm">Transaction history</h3>
        </div>
        {txs.slice(0, 30).map((tx) => (
          <div key={tx.id} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0">
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">{tx.type}</p>
              <p className="text-xs text-muted-foreground">{new Date(tx.createdAt).toLocaleDateString("en-GB")}</p>
            </div>
            <p className={`text-sm font-mono-nums font-semibold ${tx.direction === "in" ? "text-green-400" : ""}`}>
              {tx.direction === "in" ? "+" : "-"}{tx.amountSats.toLocaleString()}
            </p>
          </div>
        ))}
        {txs.length === 0 && !isLoading && (
          <div className="px-4 py-8 text-center text-muted-foreground text-sm">No transactions yet</div>
        )}
      </div>
    </div>
  );
}
