import { X, CheckCircle2, AlertTriangle, XCircle, Loader2, Send } from "lucide-react";

export type CheckLevel = "ok" | "warn" | "fail";

export interface PrintCheck {
  label: string;
  level: CheckLevel;
  detail: string;
}

function Icon({ level }: { level: CheckLevel }) {
  if (level === "ok") return <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />;
  if (level === "warn") return <AlertTriangle size={16} className="text-amber-400 shrink-0" />;
  return <XCircle size={16} className="text-red-400 shrink-0" />;
}

export function PrintCheckModal({
  checks,
  onClose,
  onConfirm,
  sending,
}: {
  checks: PrintCheck[];
  onClose: () => void;
  onConfirm: () => void;
  sending: boolean;
}) {
  const hasFail = checks.some((c) => c.level === "fail");
  const hasWarn = checks.some((c) => c.level === "warn");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">Print readiness</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <ul className="space-y-2.5">
          {checks.map((c, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <Icon level={c.level} />
              <div className="min-w-0">
                <div className="text-white text-sm">{c.label}</div>
                <div className="text-zinc-500 text-xs">{c.detail}</div>
              </div>
            </li>
          ))}
        </ul>

        {hasFail && (
          <p className="mt-4 text-red-400 text-xs">Resolve the failed checks before sending to production.</p>
        )}
        {!hasFail && hasWarn && (
          <p className="mt-4 text-amber-400 text-xs">You can proceed, but reviewing the warnings is recommended.</p>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-zinc-400 hover:text-white text-sm transition-colors">
            Back to editing
          </button>
          <button
            onClick={onConfirm}
            disabled={hasFail || sending}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            Send to production
          </button>
        </div>
      </div>
    </div>
  );
}
