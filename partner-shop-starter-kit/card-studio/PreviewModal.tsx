import { useState } from "react";
import { X, Download, Send, Loader2, Maximize2 } from "lucide-react";

const CHECKER =
  "repeating-conic-gradient(#3f3f46 0% 25%, #27272a 0% 50%) 50% / 16px 16px";

export function PreviewModal({
  frontUrl,
  backUrl,
  onClose,
  onExport,
  onSend,
  sending,
}: {
  frontUrl: string;
  backUrl: string | null;
  onClose: () => void;
  onExport: () => void;
  onSend: () => void;
  sending: boolean;
}) {
  const [expanded, setExpanded] = useState<{ url: string; label: string } | null>(null);

  const previewTile = (url: string, label: string) => (
    <figure className="space-y-2">
      <button
        type="button"
        onClick={() => setExpanded({ url, label })}
        title="Click to expand"
        className="group relative block w-full rounded-xl overflow-hidden cursor-zoom-in"
        style={{ background: CHECKER, aspectRatio: "1011 / 638" }}
      >
        <img src={url} alt={`${label} preview`} className="w-full h-full object-contain" />
        <span className="absolute top-2 right-2 flex items-center justify-center w-7 h-7 rounded-lg bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity">
          <Maximize2 size={14} />
        </span>
      </button>
      <figcaption className="text-center text-zinc-400 text-xs">{label}</figcaption>
    </figure>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">Preview</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className={`grid gap-4 ${backUrl ? "grid-cols-2" : "grid-cols-1 max-w-sm mx-auto"}`}>
          {previewTile(frontUrl, "Front")}
          {backUrl && previewTile(backUrl, "Back")}
        </div>

        <p className="text-zinc-500 text-xs text-center mt-3">
          Tap an image to view it full-size. Rounded corners and transparency shown on the checkered background. Guides are hidden in exports.
        </p>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onExport} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 text-white text-sm font-medium hover:bg-zinc-700 transition-colors">
            <Download size={15} />
            Download PNG
          </button>
          <button onClick={onSend} disabled={sending} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
            {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            Send to production
          </button>
        </div>
      </div>

      {expanded && (
        <div
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/90 p-4 cursor-zoom-out"
          onClick={(e) => { e.stopPropagation(); setExpanded(null); }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(null); }}
            className="absolute top-4 right-4 flex items-center justify-center w-9 h-9 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            <X size={20} />
          </button>
          <div
            className="rounded-2xl overflow-hidden max-w-full max-h-[80vh]"
            style={{ background: CHECKER, aspectRatio: "1011 / 638" }}
            onClick={(e) => e.stopPropagation()}
          >
            <img src={expanded.url} alt={`${expanded.label} full size`} className="w-full h-full object-contain max-h-[80vh]" />
          </div>
          <p className="text-zinc-300 text-sm mt-4">{expanded.label}</p>
        </div>
      )}
    </div>
  );
}
