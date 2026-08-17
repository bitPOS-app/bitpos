import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Search,
  RefreshCw,
  ChevronRight,
  ArrowLeft,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Play,
  Eye,
  Wrench,
  StickyNote,
  Wallet,
  TrendingUp,
  Activity,
  Layers,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

/* ───────── types ───────── */
type PipeStep = { key: string; done: boolean; current?: boolean; label?: string };

type WrapCard = {
  id: string;
  kind: "wrap";
  accountId: string;
  amountSats: number;
  feeSats: number | null;
  wrapStatus: string | null;
  paymentHash: string;
  merchantPaymentHash: string | null;
  memo: string | null;
  paidAt: string | null;
  wrapUpdatedAt: string | null;
  expiresAt: string;
  createdAt: string;
  handle: string | null;
  businessName: string | null;
  statusMeta: { label: string; color: string; mile: string; step: number };
  pipeline: PipeStep[];
  firstMile: { label: string; hash: string; amountSats: number; done: boolean };
  lastMile: { label: string; hash: string | null; amountSats: number; feeSats: number | null; done: boolean };
};

type TxCard = {
  id: string;
  kind: "tx";
  accountId: string;
  direction: string;
  amountSats: number;
  feeSats: number;
  type: string;
  status: string;
  paymentHash: string | null;
  memo: string | null;
  failureReason: string | null;
  counterpartHandle: string | null;
  createdAt: string;
  handle: string | null;
};

type Treasury = {
  float: {
    balanceSats: number | null;
    obligationSats: number;
    availableSats: number | null;
    openWraps: number;
    openCap: number;
    marginSats: number;
    error: string | null;
    configured: boolean;
  };
  revenue: {
    feeRevenueSats: number;
    wrappedVolumeSats: number;
    merchantPaidSats: number;
    settledWraps: number;
    cancelledWraps: number;
    cancelledVolumeSats: number;
    effectiveFeeBps: number;
  };
  mix: {
    wrappedInvoices: number;
    directInvoices: number;
    directPaidVolumeSats: number;
    note: string;
  };
  pipeline: Record<string, { count: number; volumeSats: number }>;
  transactions: {
    completedIn: number;
    completedOut: number;
    failedOut: number;
    pending: number;
    volumeInSats: number;
    volumeOutSats: number;
    failedOutSats: number;
  };
  last24h: {
    wrapsSettled: number;
    feeSats: number;
    wrapVolumeSats: number;
    sends: number;
    sendFails: number;
    sendVolumeSats: number;
  };
  wraps: { settled: number; cancelled: number; open: number; stuck: number; openVolumeSats: number };
};

type TimelineItem = {
  at: string;
  event: string;
  status: string;
  mile: string | null;
  message: string | null;
  durationMs?: number | null;
  errorClass?: string | null;
  errorMessage?: string | null;
  source: "synthetic" | "event";
};

const STATUS_PILL: Record<string, string> = {
  green: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  blue: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  amber: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  violet: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  red: "bg-red-500/15 text-red-300 border-red-500/30",
  rose: "bg-rose-500/20 text-rose-200 border-rose-500/40",
  slate: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};

const EVENT_DOT: Record<string, string> = {
  success: "bg-emerald-400",
  fail: "bg-red-400",
  ambiguous: "bg-amber-400",
  pending: "bg-yellow-400",
  info: "bg-slate-400",
};

const PIPE_LABELS: Record<string, string> = {
  created: "HOLD",
  accepted: "PAID",
  forwarding: "FWD",
  forwarded: "MRCH",
  settled: "SETL",
};

function fmtSats(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString();
}

function fmtTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

function shortHash(h: string | null | undefined, n = 10) {
  if (!h) return "—";
  return h.length > n + 4 ? `${h.slice(0, n)}…` : h;
}

async function adminFetch(path: string, token: string | null, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const r = await fetch(path, { ...init, headers, credentials: "include" });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

/* ───────── pipeline bar (2-leg visual) ───────── */
function DualMileBar({
  pipeline,
  firstDone,
  lastDone,
  compact,
}: {
  pipeline?: PipeStep[];
  firstDone: boolean;
  lastDone: boolean;
  compact?: boolean;
}) {
  if (pipeline && pipeline.length) {
    return (
      <div className={cn("flex items-center min-w-0", compact ? "gap-0.5" : "gap-1")}>
        {/* leg 1 bracket */}
        <div className="flex items-center gap-0.5 px-1 py-0.5 rounded border border-sky-500/30 bg-sky-500/5">
          <span className="font-['Ubuntu_Mono'] text-[8px] text-sky-400/90 tracking-wider mr-0.5">L1</span>
          {pipeline.slice(0, 2).map((s) => (
            <StepDot key={s.key} step={s} tone="sky" compact={compact} />
          ))}
        </div>
        <span className="text-muted-foreground/40 text-[10px] px-0.5">→</span>
        {/* leg 2 bracket */}
        <div className="flex items-center gap-0.5 px-1 py-0.5 rounded border border-violet-500/30 bg-violet-500/5">
          <span className="font-['Ubuntu_Mono'] text-[8px] text-violet-400/90 tracking-wider mr-0.5">L2</span>
          {pipeline.slice(2).map((s) => (
            <StepDot key={s.key} step={s} tone="violet" compact={compact} />
          ))}
        </div>
      </div>
    );
  }
  // fallback 2 boxes for tx pairs
  return (
    <div className="flex items-center gap-1 min-w-0">
      <div
        className={cn(
          "px-1.5 py-0.5 rounded text-[9px] font-['Ubuntu_Mono'] border",
          firstDone ? "border-sky-500/40 text-sky-300 bg-sky-500/10" : "border-border text-muted-foreground",
        )}
      >
        OUT {firstDone ? "✓" : "·"}
      </div>
      <span className="text-muted-foreground/40">→</span>
      <div
        className={cn(
          "px-1.5 py-0.5 rounded text-[9px] font-['Ubuntu_Mono'] border",
          lastDone ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10" : "border-border text-muted-foreground",
        )}
      >
        IN {lastDone ? "✓" : "·"}
      </div>
    </div>
  );
}

function StepDot({
  step,
  tone,
  compact,
}: {
  step: PipeStep;
  tone: "sky" | "violet";
  compact?: boolean;
}) {
  const on = step.done || step.current;
  const cur = step.current;
  return (
    <div
      title={step.label || step.key}
      className={cn(
        "font-['Ubuntu_Mono'] rounded flex items-center justify-center border",
        compact ? "text-[8px] px-1 h-4 min-w-[28px]" : "text-[9px] px-1.5 h-5 min-w-[34px]",
        cur
          ? tone === "sky"
            ? "bg-sky-400 text-black border-sky-300 font-bold"
            : "bg-violet-400 text-black border-violet-300 font-bold"
          : on
            ? tone === "sky"
              ? "bg-sky-500/25 text-sky-200 border-sky-500/40"
              : "bg-violet-500/25 text-violet-200 border-violet-500/40"
            : "bg-transparent text-muted-foreground/40 border-border/60",
      )}
    >
      {PIPE_LABELS[step.key] ?? step.key.slice(0, 4).toUpperCase()}
    </div>
  );
}


function ageLabel(iso: string, nowMs: number) {
  const ms = Math.max(0, nowMs - new Date(iso).getTime());
  if (ms < 1000) return "now";
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m`;
  return `${Math.floor(ms / 3600_000)}h`;
}

function isInFlightWrap(status: string | null | undefined) {
  return !!status && ["created", "accepted", "forwarding", "forwarded"].includes(status);
}

function wrapProgressPct(status: string | null | undefined): number {
  switch (status) {
    case "created":
      return 15;
    case "accepted":
      return 40;
    case "forwarding":
      return 65;
    case "forwarded":
      return 85;
    case "settled":
      return 100;
    case "cancelled":
    case "needs_reconciliation":
      return 100;
    default:
      return 5;
  }
}

function LiveProgress({
  pct,
  tone,
  label,
}: {
  pct: number;
  tone: "sky" | "amber" | "violet" | "emerald" | "rose" | "slate";
  label?: string;
}) {
  const bar: Record<string, string> = {
    sky: "bg-sky-400",
    amber: "bg-amber-400",
    violet: "bg-violet-400",
    emerald: "bg-emerald-400",
    rose: "bg-rose-400",
    slate: "bg-slate-400",
  };
  return (
    <div className="w-full min-w-0">
      {label && (
        <div className="font-['Ubuntu_Mono'] text-[8px] text-muted-foreground mb-0.5 flex justify-between gap-2">
          <span className="truncate">{label}</span>
          <span>{Math.round(pct)}%</span>
        </div>
      )}
      <div className="h-1 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-700 ease-out", bar[tone])}
          style={{ width: `${Math.min(100, Math.max(2, pct))}%` }}
        />
      </div>
    </div>
  );
}

/* ───────── metric chip ───────── */
function Metric({
  label,
  value,
  sub,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "green" | "amber" | "rose" | "sky" | "default";
  icon?: typeof Wallet;
}) {
  const tones = {
    green: "text-emerald-300",
    amber: "text-amber-300",
    rose: "text-rose-300",
    sky: "text-sky-300",
    default: "text-foreground",
  };
  return (
    <div className="rounded-md border border-border bg-card px-2.5 py-1.5 min-w-0">
      <div className="flex items-center gap-1 font-['Ubuntu_Mono'] text-[8px] uppercase tracking-widest text-muted-foreground">
        {Icon && <Icon className="w-2.5 h-2.5" />}
        {label}
      </div>
      <div className={cn("font-['Ubuntu'] text-base font-bold leading-tight mt-0.5 tabular-nums", tones[tone ?? "default"])}>
        {value}
      </div>
      {sub && <div className="font-['Ubuntu_Mono'] text-[9px] text-muted-foreground truncate">{sub}</div>}
    </div>
  );
}

/* ───────── main page ───────── */
export default function AdminPaymentsPage() {
  const { token, entity, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [kind, setKind] = useState(searchParams.get("kind") ?? "all");
  const [status, setStatus] = useState(searchParams.get("status") ?? "all");
  const [list, setList] = useState<{ wraps: WrapCard[]; transactions: TxCard[]; treasury: Treasury | null } | null>(
    null,
  );
  const [detail, setDetail] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [liveOn, setLiveOn] = useState(true);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const isAdminUser = (entity?.handle ?? "").toLowerCase() === "kongzi";

  const loadList = useCallback(async (opts?: { silent?: boolean }) => {
    if (!token) return;
    const silent = !!opts?.silent;
    if (!silent) {
      setBusy(true);
      setErr(null);
    } else {
      setSyncing(true);
    }
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (kind !== "all") params.set("kind", kind);
      if (status !== "all") params.set("status", status);
      params.set("limit", "100");
      // Skip heavy treasury float NWC on high-frequency silent polls
      if (silent) params.set("treasury", "0");
      const data = await adminFetch(`/api/admin/payments?${params}`, token);
      setList((prev) => {
        if (silent && prev?.treasury && !data.treasury) {
          return { ...data, treasury: prev.treasury };
        }
        return data;
      });
      setLastSync(new Date());
    } catch (e) {
      if (!silent) setErr(e instanceof Error ? e.message : String(e));
    } finally {
      if (!silent) setBusy(false);
      else setSyncing(false);
    }
  }, [token, q, kind, status]);

  const loadDetail = useCallback(async (opts?: { silent?: boolean }) => {
    if (!token || !id) return;
    const silent = !!opts?.silent;
    if (!silent) {
      setBusy(true);
      setErr(null);
    } else {
      setSyncing(true);
    }
    try {
      const data = await adminFetch(`/api/admin/payments/${encodeURIComponent(id)}`, token);
      setDetail(data);
      setLastSync(new Date());
    } catch (e) {
      if (!silent) setErr(e instanceof Error ? e.message : String(e));
    } finally {
      if (!silent) setBusy(false);
      else setSyncing(false);
    }
  }, [token, id]);

  useEffect(() => {
    if (authLoading) return;
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }
    if (!isAdminUser) {
      setErr("Admin access required (handle must be allowlisted).");
      return;
    }
    if (id) loadDetail();
    else loadList();
  }, [authLoading, token, isAdminUser, id, loadDetail, loadList, navigate]);

  // Clock for age labels
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Live poll — list every 3s, detail every 2s when open / in-flight
  useEffect(() => {
    if (!liveOn || authLoading || !token || !isAdminUser) return;
    const tick = () => {
      if (id) void loadDetail({ silent: true });
      else void loadList({ silent: true });
    };
    // immediate soft refresh after mount path
    const iv = setInterval(tick, id ? 2000 : 3000);
    return () => clearInterval(iv);
  }, [liveOn, authLoading, token, isAdminUser, id, loadDetail, loadList]);

  const runAction = async (action: "advance" | "lookup" | "remediate-tx", body?: object) => {
    if (!token || !id) return;
    setActionMsg(null);
    setBusy(true);
    try {
      const data = await adminFetch(`/api/admin/payments/${encodeURIComponent(id)}/${action}`, token, {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      });
      setActionMsg(JSON.stringify(data, null, 2));
      await loadDetail();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const addNote = async () => {
    if (!token || !id || !note.trim()) return;
    setBusy(true);
    try {
      await adminFetch(`/api/admin/payments/events`, token, {
        method: "POST",
        body: JSON.stringify({ paymentId: id, message: note.trim() }),
      });
      setNote("");
      await loadDetail();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // Deduplicate tx pairs: show one row per payment_hash when both legs exist
  const mixed = useMemo(() => {
    if (!list) return [] as Array<
      | { type: "wrap"; item: WrapCard }
      | { type: "tx"; item: TxCard }
      | { type: "pair"; out: TxCard; inn: TxCard | null; hash: string }
    >;

    const items: Array<
      | { type: "wrap"; item: WrapCard; sort: string }
      | { type: "tx"; item: TxCard; sort: string }
      | { type: "pair"; out: TxCard; inn: TxCard | null; hash: string; sort: string }
    > = [];

    for (const w of list.wraps) {
      items.push({ type: "wrap", item: w, sort: w.createdAt });
    }

    const seenHash = new Set<string>();
    const byHash = new Map<string, TxCard[]>();
    for (const t of list.transactions) {
      if (t.paymentHash) {
        const arr = byHash.get(t.paymentHash) ?? [];
        arr.push(t);
        byHash.set(t.paymentHash, arr);
      }
    }

    for (const t of list.transactions) {
      if (t.paymentHash && seenHash.has(t.paymentHash)) continue;
      if (t.paymentHash) {
        const group = byHash.get(t.paymentHash) ?? [t];
        if (group.length > 1) {
          seenHash.add(t.paymentHash);
          const out = group.find((g) => g.direction === "out") ?? group[0];
          const inn = group.find((g) => g.direction === "in") ?? null;
          items.push({
            type: "pair",
            out,
            inn,
            hash: t.paymentHash,
            sort: out.createdAt,
          });
          continue;
        }
      }
      if (t.paymentHash) seenHash.add(t.paymentHash);
      items.push({ type: "tx", item: t, sort: t.createdAt });
    }

    items.sort((a, b) => b.sort.localeCompare(a.sort));
    return items;
  }, [list]);

  const T = list?.treasury;

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground font-['Ubuntu_Mono'] text-xs">
        loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* header */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur px-3 py-2">
        <div className="max-w-[1400px] mx-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => (id ? navigate("/admin") : navigate("/business/pos"))}
            className="p-1 rounded hover:bg-muted text-muted-foreground"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <Zap className="w-3.5 h-3.5 text-primary shrink-0" />
          <div className="min-w-0">
            <div className="font-['Ubuntu'] font-bold text-[13px] leading-none">
              bit<span className="text-primary">POS</span>{" "}
              <span className="text-muted-foreground font-normal">Treasury</span>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setLiveOn((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] font-['Ubuntu_Mono'] uppercase tracking-wider",
                liveOn
                  ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10"
                  : "border-border text-muted-foreground",
              )}
              title="Toggle live updates"
            >
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  liveOn ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground/40",
                )}
              />
              {liveOn ? "LIVE" : "PAUSED"}
              {lastSync && (
                <span className="text-muted-foreground normal-case tracking-normal">
                  {syncing ? "sync…" : `${Math.max(0, Math.round((now - lastSync.getTime()) / 1000))}s`}
                </span>
              )}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => (id ? loadDetail() : loadList())}
              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border text-[10px] font-['Ubuntu_Mono'] uppercase tracking-wider hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw className={cn("w-3 h-3", (busy || syncing) && "animate-spin")} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-3 py-3 space-y-3">
        {err && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200 flex gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{err}</span>
          </div>
        )}

        {/* ═══ TREASURY DESK (list only) ═══ */}
        {!id && T && (
          <div className="space-y-2">
            {/* row 1: float + revenue */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5">
              <Metric
                icon={Wallet}
                label="Float balance"
                value={T.float.balanceSats == null ? "ERR" : `${fmtSats(T.float.balanceSats)}`}
                sub={
                  T.float.error
                    ? T.float.error.slice(0, 40)
                    : `avail ${fmtSats(T.float.availableSats)} · obl ${fmtSats(T.float.obligationSats)}`
                }
                tone={T.float.balanceSats == null ? "rose" : (T.float.availableSats ?? 0) < 1000 ? "amber" : "green"}
              />
              <Metric
                icon={TrendingUp}
                label="Fee revenue"
                value={fmtSats(T.revenue.feeRevenueSats)}
                sub={`${T.revenue.settledWraps} wraps · ${T.revenue.effectiveFeeBps} bps eff`}
                tone="green"
              />
              <Metric
                icon={Layers}
                label="Wrapped volume"
                value={fmtSats(T.revenue.wrappedVolumeSats)}
                sub={`merchant got ${fmtSats(T.revenue.merchantPaidSats)}`}
                tone="sky"
              />
              <Metric
                label="Open wraps"
                value={`${T.float.openWraps}/${T.float.openCap}`}
                sub={`${fmtSats(T.wraps.openVolumeSats)} sats locked`}
                tone={T.wraps.stuck > 0 ? "rose" : T.float.openWraps > 0 ? "amber" : "default"}
              />
              <Metric
                label="Needs recon"
                value={String(T.wraps.stuck)}
                sub={`${T.wraps.cancelled} cancelled · ${fmtSats(T.revenue.cancelledVolumeSats)} sats`}
                tone={T.wraps.stuck > 0 ? "rose" : "default"}
              />
              <Metric
                icon={Activity}
                label="24h"
                value={`${T.last24h.wrapsSettled} wraps`}
                sub={`fee ${fmtSats(T.last24h.feeSats)} · send fail ${T.last24h.sendFails}`}
                tone={T.last24h.sendFails > 0 ? "amber" : "default"}
              />
            </div>

            {/* row 2: dual-leg pipeline overview + mix explanation */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-1.5">
              <div className="lg:col-span-2 rounded-md border border-border bg-card px-3 py-2">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="font-['Ubuntu_Mono'] text-[9px] uppercase tracking-widest text-muted-foreground">
                    Hold-wrap pipeline · two legs
                  </div>
                  <div className="font-['Ubuntu_Mono'] text-[9px] text-muted-foreground">
                    L1 customer→hold · L2 float→merchant
                  </div>
                </div>
                <div className="flex items-stretch gap-1 overflow-x-auto">
                  {/* L1 group */}
                  <div className="flex-1 min-w-[140px] rounded border border-sky-500/25 bg-sky-500/5 p-1.5">
                    <div className="font-['Ubuntu_Mono'] text-[8px] text-sky-400 tracking-widest mb-1">
                      1ST MILE · CUSTOMER PAYS HOLD
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      <PipeCell label="HOLD" count={T.pipeline.created?.count ?? 0} vol={T.pipeline.created?.volumeSats ?? 0} tone="slate" />
                      <PipeCell label="PAID" count={T.pipeline.accepted?.count ?? 0} vol={T.pipeline.accepted?.volumeSats ?? 0} tone="sky" />
                    </div>
                  </div>
                  <div className="flex items-center text-muted-foreground/30 text-lg px-0.5">→</div>
                  {/* L2 group */}
                  <div className="flex-1 min-w-[140px] rounded border border-violet-500/25 bg-violet-500/5 p-1.5">
                    <div className="font-['Ubuntu_Mono'] text-[8px] text-violet-400 tracking-widest mb-1">
                      2ND MILE · FLOAT PAYS MERCHANT
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      <PipeCell label="FWD" count={T.pipeline.forwarding?.count ?? 0} vol={T.pipeline.forwarding?.volumeSats ?? 0} tone="amber" />
                      <PipeCell label="MRCH" count={T.pipeline.forwarded?.count ?? 0} vol={T.pipeline.forwarded?.volumeSats ?? 0} tone="violet" />
                    </div>
                  </div>
                  <div className="flex items-center text-muted-foreground/30 text-lg px-0.5">→</div>
                  <div className="w-[110px] rounded border border-emerald-500/25 bg-emerald-500/5 p-1.5">
                    <div className="font-['Ubuntu_Mono'] text-[8px] text-emerald-400 tracking-widest mb-1">DONE</div>
                    <PipeCell label="SETL" count={T.pipeline.settled?.count ?? 0} vol={T.pipeline.settled?.volumeSats ?? 0} tone="green" />
                  </div>
                  <div className="w-[90px] rounded border border-red-500/20 bg-red-500/5 p-1.5">
                    <div className="font-['Ubuntu_Mono'] text-[8px] text-red-400 tracking-widest mb-1">DEAD</div>
                    <PipeCell label="CXL" count={T.pipeline.cancelled?.count ?? 0} vol={T.pipeline.cancelled?.volumeSats ?? 0} tone="red" />
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-border bg-card px-3 py-2 space-y-1.5">
                <div className="font-['Ubuntu_Mono'] text-[9px] uppercase tracking-widest text-muted-foreground">
                  Why only {T.revenue.settledWraps} settled wraps?
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <div className="rounded bg-background/60 border border-border/60 px-2 py-1">
                    <div className="font-['Ubuntu_Mono'] text-[8px] text-muted-foreground">WRAPPED</div>
                    <div className="font-['Ubuntu'] text-lg font-bold text-sky-300">{fmtSats(T.mix.wrappedInvoices)}</div>
                  </div>
                  <div className="rounded bg-background/60 border border-border/60 px-2 py-1">
                    <div className="font-['Ubuntu_Mono'] text-[8px] text-muted-foreground">DIRECT (no fee)</div>
                    <div className="font-['Ubuntu'] text-lg font-bold">{fmtSats(T.mix.directInvoices)}</div>
                  </div>
                </div>
                <p className="font-['Ubuntu_Mono'] text-[9px] text-muted-foreground leading-snug">{T.mix.note}</p>
                <div className="font-['Ubuntu_Mono'] text-[9px] text-muted-foreground">
                  Tx in {fmtSats(T.transactions.volumeInSats)} · out {fmtSats(T.transactions.volumeOutSats)} · fail{" "}
                  {T.transactions.failedOut}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ filters ═══ */}
        {!id && (
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setSearchParams(() => {
                      const n = new URLSearchParams();
                      if (q) n.set("q", q);
                      if (kind !== "all") n.set("kind", kind);
                      if (status !== "all") n.set("status", status);
                      return n;
                    });
                    loadList();
                  }
                }}
                placeholder="hash · handle · memo · uuid"
                className="w-full bg-card border border-border rounded-md pl-7 pr-2 py-1.5 text-xs font-['Ubuntu_Mono'] outline-none focus:border-primary/50"
              />
            </div>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="bg-card border border-border rounded-md px-2 py-1.5 text-[11px] font-['Ubuntu_Mono']"
            >
              <option value="all">All</option>
              <option value="wrap">Wraps only</option>
              <option value="send">Sends only</option>
              <option value="stuck">Stuck</option>
            </select>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="bg-card border border-border rounded-md px-2 py-1.5 text-[11px] font-['Ubuntu_Mono']"
            >
              <option value="all">Any status</option>
              <option value="created">created</option>
              <option value="accepted">accepted</option>
              <option value="forwarding">forwarding</option>
              <option value="forwarded">forwarded</option>
              <option value="settled">settled</option>
              <option value="cancelled">cancelled</option>
              <option value="needs_reconciliation">needs_recon</option>
              <option value="pending">tx pending</option>
              <option value="completed">tx completed</option>
              <option value="failed">tx failed</option>
            </select>
            <button
              type="button"
              onClick={() => {
                setSearchParams(() => {
                  const n = new URLSearchParams();
                  if (q) n.set("q", q);
                  if (kind !== "all") n.set("kind", kind);
                  if (status !== "all") n.set("status", status);
                  return n;
                });
                loadList();
              }}
              className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-[10px] font-['Ubuntu_Mono'] uppercase tracking-wider"
            >
              Search
            </button>
          </div>
        )}

        {/* ═══ COMPACT TABLE LIST ═══ */}
        {!id && (
          <div className="rounded-md border border-border overflow-hidden">
            {/* table header */}
            <div className="hidden md:grid grid-cols-[88px_100px_1fr_160px_90px_70px_24px] gap-2 px-2.5 py-1 bg-muted/40 border-b border-border font-['Ubuntu_Mono'] text-[8px] uppercase tracking-widest text-muted-foreground">
              <div>Type</div>
              <div>Status</div>
              <div>Two-leg path</div>
              <div>Who</div>
              <div className="text-right">Sats</div>
              <div>When</div>
              <div />
            </div>

            {mixed.length === 0 && !busy && (
              <div className="text-center text-muted-foreground text-xs py-8 font-['Ubuntu_Mono']">No payments match.</div>
            )}

            <div className="divide-y divide-border/60">
              {mixed.map((row) => {
                if (row.type === "wrap") {
                  const w = row.item;
                  return (
                    <button
                      key={`w-${w.id}`}
                      type="button"
                      onClick={() => navigate(`/admin/${w.id}`)}
                      className="w-full text-left grid grid-cols-1 md:grid-cols-[88px_100px_1fr_160px_90px_70px_24px] gap-1 md:gap-2 items-center px-2.5 py-1.5 hover:bg-muted/30 transition-colors"
                    >
                      <div className="font-['Ubuntu_Mono'] text-[9px] uppercase tracking-wider text-primary">
                        Hodl wrap
                      </div>
                      <div>
                        <span
                          className={cn(
                            "text-[9px] font-['Ubuntu_Mono'] px-1.5 py-0.5 rounded border",
                            STATUS_PILL[w.statusMeta?.color ?? "slate"],
                          )}
                        >
                          {w.wrapStatus}
                        </span>
                      </div>
                      <div className="min-w-0 space-y-1">
                        <DualMileBar pipeline={w.pipeline} firstDone={w.firstMile.done} lastDone={w.lastMile.done} compact />
                        {isInFlightWrap(w.wrapStatus) ? (
                          <LiveProgress
                            pct={wrapProgressPct(w.wrapStatus)}
                            tone={
                              w.wrapStatus === "forwarding" || w.wrapStatus === "forwarded"
                                ? "violet"
                                : w.wrapStatus === "accepted"
                                  ? "sky"
                                  : "amber"
                            }
                            label={
                              w.wrapStatus === "created"
                                ? `waiting customer pay · ${ageLabel(w.createdAt, now)}`
                                : w.wrapStatus === "accepted"
                                  ? `hold locked — forwarding · ${ageLabel(w.wrapUpdatedAt || w.createdAt, now)}`
                                  : w.wrapStatus === "forwarding"
                                    ? `paying merchant from float · ${ageLabel(w.wrapUpdatedAt || w.createdAt, now)}`
                                    : `settling hold · ${ageLabel(w.wrapUpdatedAt || w.createdAt, now)}`
                            }
                          />
                        ) : (
                          <div className="font-['Ubuntu_Mono'] text-[9px] text-muted-foreground truncate">
                            L1 {shortHash(w.paymentHash, 8)} · L2 {shortHash(w.merchantPaymentHash, 8)}
                            {w.memo ? ` · ${w.memo}` : ""}
                          </div>
                        )}
                      </div>
                      <div className="font-['Ubuntu_Mono'] text-[11px] truncate">
                        {w.handle ? `@${w.handle}` : "—"}
                        {w.businessName ? (
                          <span className="text-muted-foreground"> · {w.businessName}</span>
                        ) : null}
                      </div>
                      <div className="text-right">
                        <div className="font-['Ubuntu'] text-sm font-bold tabular-nums">{fmtSats(w.amountSats)}</div>
                        {(w.feeSats ?? 0) > 0 && (
                          <div className="font-['Ubuntu_Mono'] text-[9px] text-amber-300">fee {w.feeSats}</div>
                        )}
                      </div>
                      <div className="font-['Ubuntu_Mono'] text-[9px] text-muted-foreground">{fmtTime(w.createdAt)}</div>
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground justify-self-end" />
                    </button>
                  );
                }

                if (row.type === "pair") {
                  const outOk = row.out.status === "completed";
                  const inOk = row.inn?.status === "completed";
                  const failed = row.out.status === "failed" || row.inn?.status === "failed";
                  return (
                    <button
                      key={`p-${row.hash}`}
                      type="button"
                      onClick={() => navigate(`/admin/${row.out.id}`)}
                      className="w-full text-left grid grid-cols-1 md:grid-cols-[88px_100px_1fr_160px_90px_70px_24px] gap-1 md:gap-2 items-center px-2.5 py-1.5 hover:bg-muted/30 transition-colors"
                    >
                      <div className="font-['Ubuntu_Mono'] text-[9px] uppercase tracking-wider text-orange-300/90">
                        P2P xfer
                      </div>
                      <div>
                        <span
                          className={cn(
                            "text-[9px] font-['Ubuntu_Mono'] px-1.5 py-0.5 rounded border",
                            STATUS_PILL[failed ? "red" : outOk && inOk ? "green" : "amber"],
                          )}
                        >
                          {failed ? "failed" : outOk && inOk ? "settled" : row.out.status}
                        </span>
                      </div>
                      <div className="min-w-0 space-y-1">
                        <DualMileBar firstDone={outOk} lastDone={!!inOk} compact />
                        {!outOk || !inOk ? (
                          <LiveProgress
                            pct={failed ? 100 : outOk ? 70 : row.out.status === "pending" ? 45 : 20}
                            tone={failed ? "rose" : "amber"}
                            label={
                              failed
                                ? (row.out.failureReason || "failed").slice(0, 64)
                                : row.out.status === "pending"
                                  ? `resolving NWC outcome · ${ageLabel(row.out.createdAt, now)}`
                                  : !outOk
                                    ? "outbound open"
                                    : "waiting merchant credit"
                            }
                          />
                        ) : (
                          <div className="font-['Ubuntu_Mono'] text-[9px] text-muted-foreground truncate">
                            out @{row.out.handle ?? "?"}
                            {row.inn ? ` → in @${row.inn.handle ?? "?"}` : ""} · {shortHash(row.hash, 10)}
                          </div>
                        )}
                      </div>
                      <div className="font-['Ubuntu_Mono'] text-[11px] truncate">
                        @{row.out.handle ?? "—"}
                        {row.inn ? <span className="text-muted-foreground"> → @{row.inn.handle}</span> : null}
                      </div>
                      <div className="text-right font-['Ubuntu'] text-sm font-bold tabular-nums">
                        {fmtSats(row.out.amountSats)}
                      </div>
                      <div className="font-['Ubuntu_Mono'] text-[9px] text-muted-foreground">
                        {fmtTime(row.out.createdAt)}
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground justify-self-end" />
                    </button>
                  );
                }

                const t = row.item;
                const st = t.status === "completed" ? "green" : t.status === "failed" ? "red" : "amber";
                return (
                  <button
                    key={`t-${t.id}`}
                    type="button"
                    onClick={() => navigate(`/admin/${t.id}`)}
                    className="w-full text-left grid grid-cols-1 md:grid-cols-[88px_100px_1fr_160px_90px_70px_24px] gap-1 md:gap-2 items-center px-2.5 py-1.5 hover:bg-muted/30 transition-colors"
                  >
                    <div className="font-['Ubuntu_Mono'] text-[9px] uppercase tracking-wider text-muted-foreground">
                      {t.direction}·{t.type}
                    </div>
                    <div>
                      <span
                        className={cn(
                          "text-[9px] font-['Ubuntu_Mono'] px-1.5 py-0.5 rounded border",
                          STATUS_PILL[st],
                        )}
                      >
                        {t.status}
                      </span>
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="font-['Ubuntu_Mono'] text-[9px] text-muted-foreground truncate">
                        {shortHash(t.paymentHash, 12)}
                        {t.failureReason ? ` · ${t.failureReason}` : ""}
                        {t.memo ? ` · ${t.memo}` : ""}
                      </div>
                      {t.status === "pending" && (
                        <LiveProgress
                          pct={55}
                          tone="amber"
                          label={`in flight · ${ageLabel(t.createdAt, now)} · reconciling`}
                        />
                      )}
                    </div>
                    <div className="font-['Ubuntu_Mono'] text-[11px] truncate">
                      {t.handle ? `@${t.handle}` : "—"}
                      {t.counterpartHandle ? (
                        <span className="text-muted-foreground"> → @{t.counterpartHandle}</span>
                      ) : null}
                    </div>
                    <div className="text-right font-['Ubuntu'] text-sm font-bold tabular-nums">
                      {fmtSats(t.amountSats)}
                    </div>
                    <div className="font-['Ubuntu_Mono'] text-[9px] text-muted-foreground">{fmtTime(t.createdAt)}</div>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground justify-self-end" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ DETAIL ═══ */}
        {id && detail && (
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-card p-3 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-['Ubuntu_Mono'] text-[9px] uppercase tracking-widest text-muted-foreground">
                    {detail.invoice?.wrapStatus ? "Hold-wrap invoice" : "Transaction"}
                  </div>
                  <div className="font-['Ubuntu'] text-xl font-bold mt-0.5 tabular-nums">
                    {fmtSats(detail.invoice?.amountSats ?? detail.transaction?.amountSats)}{" "}
                    <span className="text-xs font-normal text-muted-foreground">sats</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {detail.handle ? `@${detail.handle}` : ""}{" "}
                    {detail.businessName ? `· ${detail.businessName}` : ""}
                  </div>
                </div>
                {(detail.statusMeta || detail.transaction) && (
                  <span
                    className={cn(
                      "text-[10px] font-['Ubuntu_Mono'] px-2 py-0.5 rounded-full border",
                      STATUS_PILL[
                        detail.statusMeta?.color ??
                          (detail.transaction?.status === "completed"
                            ? "green"
                            : detail.transaction?.status === "failed"
                              ? "red"
                              : "amber")
                      ],
                    )}
                  >
                    {detail.invoice?.wrapStatus ?? detail.transaction?.status}
                    {detail.statusMeta ? ` — ${detail.statusMeta.label}` : ""}
                  </span>
                )}
              </div>

              {/* big two-leg viz */}
              {detail.pipeline && (
                <div className="space-y-1.5">
                  <div className="font-['Ubuntu_Mono'] text-[9px] uppercase tracking-widest text-muted-foreground">
                    Two-leg hold wrap
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex-1 min-w-[200px] rounded-md border border-sky-500/30 bg-sky-500/5 p-2">
                      <div className="font-['Ubuntu_Mono'] text-[8px] text-sky-400 tracking-widest mb-1 flex items-center gap-1">
                        1ST MILE · CUSTOMER → HOLD
                        {detail.firstMile?.done ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-400 ml-auto" />
                        ) : (
                          <Clock className="w-3 h-3 text-muted-foreground ml-auto" />
                        )}
                      </div>
                      <div className="font-['Ubuntu'] text-sm font-bold tabular-nums">
                        {fmtSats(detail.firstMile?.amountSats)} sats
                      </div>
                      <div className="font-['Ubuntu_Mono'] text-[9px] text-muted-foreground truncate">
                        {detail.firstMile?.paymentHash}
                      </div>
                    </div>
                    <div className="text-muted-foreground/40">→</div>
                    <div className="flex-1 min-w-[200px] rounded-md border border-violet-500/30 bg-violet-500/5 p-2">
                      <div className="font-['Ubuntu_Mono'] text-[8px] text-violet-400 tracking-widest mb-1 flex items-center gap-1">
                        2ND MILE · FLOAT → MERCHANT
                        {detail.lastMile?.done ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-400 ml-auto" />
                        ) : (
                          <Clock className="w-3 h-3 text-muted-foreground ml-auto" />
                        )}
                      </div>
                      <div className="font-['Ubuntu'] text-sm font-bold tabular-nums">
                        {fmtSats(detail.lastMile?.amountSats)} sats
                        {detail.lastMile?.feeSats ? (
                          <span className="text-amber-300 text-xs font-normal ml-2">
                            fee {detail.lastMile.feeSats}
                          </span>
                        ) : null}
                      </div>
                      <div className="font-['Ubuntu_Mono'] text-[9px] text-muted-foreground truncate">
                        {detail.lastMile?.paymentHash ?? "—"}
                      </div>
                    </div>
                  </div>
                  <DualMileBar
                    pipeline={detail.pipeline}
                    firstDone={!!detail.firstMile?.done}
                    lastDone={!!detail.lastMile?.done}
                  />
                  {isInFlightWrap(detail.invoice?.wrapStatus) && (
                    <div className="mt-2">
                      <LiveProgress
                        pct={wrapProgressPct(detail.invoice?.wrapStatus)}
                        tone={
                          detail.invoice?.wrapStatus === "forwarding" ||
                          detail.invoice?.wrapStatus === "forwarded"
                            ? "violet"
                            : detail.invoice?.wrapStatus === "accepted"
                              ? "sky"
                              : "amber"
                        }
                        label={`LIVE · ${detail.invoice?.wrapStatus} · age ${ageLabel(detail.invoice?.wrapUpdatedAt || detail.invoice?.createdAt || new Date().toISOString(), now)}`}
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 font-['Ubuntu_Mono'] text-[10px]">
                <InfoRow label="ID" value={detail.invoice?.id ?? detail.transaction?.id} />
                <InfoRow label="Payment hash" value={detail.invoice?.paymentHash ?? detail.transaction?.paymentHash} />
                <InfoRow label="Merchant hash" value={detail.invoice?.merchantPaymentHash} />
                <InfoRow label="Created" value={detail.invoice?.createdAt ?? detail.transaction?.createdAt} />
                <InfoRow label="Updated" value={detail.invoice?.wrapUpdatedAt} />
                <InfoRow label="Paid at" value={detail.invoice?.paidAt} />
                <InfoRow
                  label="Preimages"
                  value={
                    detail.invoice
                      ? `hold=${detail.invoice.hasHoldPreimage ? "yes" : "no"} m=${detail.invoice.hasPreimage ? "yes" : "no"}`
                      : null
                  }
                />
                <InfoRow label="Failure" value={detail.transaction?.failureReason} />
              </div>

              {detail.counterparts?.length > 0 && (
                <div>
                  <div className="font-['Ubuntu_Mono'] text-[9px] uppercase tracking-widest text-muted-foreground mb-1">
                    Legs on this hash
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {detail.counterparts.map((c: any) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => navigate(`/admin/${c.id}`)}
                        className="text-[10px] font-['Ubuntu_Mono'] px-2 py-0.5 rounded border border-border hover:border-primary/40"
                      >
                        {c.direction} @{c.handle ?? "?"} · {c.status} · {c.amountSats}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* manage */}
            <div className="rounded-md border border-border bg-card p-3 space-y-2">
              <div className="font-['Ubuntu_Mono'] text-[9px] uppercase tracking-widest text-muted-foreground">
                Manage
              </div>
              <div className="flex flex-wrap gap-1.5">
                {detail.actions?.canAdvance && (
                  <ActionBtn icon={Play} label="Advance wrap" onClick={() => runAction("advance")} disabled={busy} />
                )}
                {detail.actions?.canLookup && (
                  <ActionBtn icon={Eye} label="Live NWC lookup" onClick={() => runAction("lookup")} disabled={busy} />
                )}
                {detail.actions?.canRemediateTx && (
                  <ActionBtn
                    icon={Wrench}
                    label="Remediate tx"
                    onClick={() => {
                      if (confirm("Mark completed only with proof?")) runAction("remediate-tx", {});
                    }}
                    disabled={busy}
                  />
                )}
                {detail.actions?.canRemediateTx && (
                  <ActionBtn
                    icon={Wrench}
                    label="Force remediate"
                    danger
                    onClick={() => {
                      if (confirm("FORCE without wallet proof?")) runAction("remediate-tx", { force: true });
                    }}
                    disabled={busy}
                  />
                )}
              </div>
              <div className="flex gap-1.5">
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ops note…"
                  className="flex-1 bg-background border border-border rounded-md px-2 py-1.5 text-xs font-['Ubuntu_Mono']"
                />
                <button
                  type="button"
                  onClick={addNote}
                  disabled={busy || !note.trim()}
                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md border border-border text-[10px] font-['Ubuntu_Mono'] uppercase tracking-wider hover:bg-muted disabled:opacity-40"
                >
                  <StickyNote className="w-3 h-3" />
                  Note
                </button>
              </div>
              {actionMsg && (
                <pre className="text-[10px] font-['Ubuntu_Mono'] bg-background border border-border rounded-md p-2 overflow-x-auto whitespace-pre-wrap text-muted-foreground max-h-40">
                  {actionMsg}
                </pre>
              )}
              {detail.live && (
                <pre className="text-[10px] font-['Ubuntu_Mono'] bg-background border border-border rounded-md p-2 overflow-x-auto whitespace-pre-wrap text-muted-foreground max-h-32">
                  LIVE: {JSON.stringify(detail.live, null, 2)}
                </pre>
              )}
            </div>

            {/* timeline */}
            <div className="rounded-md border border-border bg-card p-3">
              <div className="font-['Ubuntu_Mono'] text-[9px] uppercase tracking-widest text-muted-foreground mb-2">
                Lifecycle timeline
              </div>
              <ol className="space-y-0">
                {(detail.timeline as TimelineItem[]).map((ev, i) => (
                  <li key={`${ev.at}-${ev.event}-${i}`} className="flex gap-2 pb-2.5 last:pb-0">
                    <div className="flex flex-col items-center">
                      <span
                        className={cn("w-2 h-2 rounded-full mt-1 ring-2 ring-card", EVENT_DOT[ev.status] ?? EVENT_DOT.info)}
                      />
                      {i < detail.timeline.length - 1 && <span className="w-px flex-1 bg-border mt-0.5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-['Ubuntu_Mono'] text-[9px] text-muted-foreground">{fmtTime(ev.at)}</span>
                        <span className="font-['Ubuntu_Mono'] text-[9px] uppercase tracking-wider text-foreground/80">
                          {ev.event}
                        </span>
                        {ev.mile && (
                          <span
                            className={cn(
                              "text-[8px] font-['Ubuntu_Mono'] uppercase px-1 py-0.5 rounded border",
                              ev.mile === "first_mile"
                                ? "border-sky-500/40 text-sky-300"
                                : ev.mile === "last_mile"
                                  ? "border-violet-500/40 text-violet-300"
                                  : "border-border text-muted-foreground",
                            )}
                          >
                            {ev.mile.replace("_", " ")}
                          </span>
                        )}
                        {ev.source === "event" && (
                          <span className="text-[8px] text-primary/80 font-['Ubuntu_Mono']">rec</span>
                        )}
                        {typeof ev.durationMs === "number" && (
                          <span className="text-[8px] text-muted-foreground font-['Ubuntu_Mono']">{ev.durationMs}ms</span>
                        )}
                      </div>
                      <div className="text-[12px] text-foreground/90">{ev.message}</div>
                      {ev.errorMessage && (
                        <div className="text-[10px] text-red-300/90 font-['Ubuntu_Mono']">
                          {ev.errorClass ? `[${ev.errorClass}] ` : ""}
                          {ev.errorMessage}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function PipeCell({
  label,
  count,
  vol,
  tone,
}: {
  label: string;
  count: number;
  vol: number;
  tone: "slate" | "sky" | "amber" | "violet" | "green" | "red";
}) {
  const map: Record<string, string> = {
    slate: "text-slate-300",
    sky: "text-sky-300",
    amber: "text-amber-300",
    violet: "text-violet-300",
    green: "text-emerald-300",
    red: "text-red-300",
  };
  return (
    <div className="rounded bg-background/50 border border-border/50 px-1.5 py-1">
      <div className="font-['Ubuntu_Mono'] text-[8px] text-muted-foreground">{label}</div>
      <div className={cn("font-['Ubuntu'] text-base font-bold tabular-nums leading-none", map[tone])}>{count}</div>
      <div className="font-['Ubuntu_Mono'] text-[8px] text-muted-foreground">{fmtSats(vol)} sats</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (value == null || value === "") return null;
  return (
    <div className="rounded bg-background/60 border border-border/60 px-2 py-1 min-w-0">
      <div className="text-[8px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="truncate text-foreground/90">{String(value)}</div>
    </div>
  );
}

function ActionBtn({
  icon: Icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: typeof Play;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border text-[10px] font-['Ubuntu_Mono'] uppercase tracking-wider disabled:opacity-40",
        danger ? "border-red-500/40 text-red-200 hover:bg-red-500/10" : "border-border hover:bg-muted",
      )}
    >
      <Icon className="w-3 h-3" />
      {label}
    </button>
  );
}
