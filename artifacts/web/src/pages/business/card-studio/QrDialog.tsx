import { useEffect, useState } from "react";
import { generateQrDataUrl } from "./qr";

export function QrDialog({
  onConfirm,
  onClose,
}: {
  onConfirm: (v: { data: string; fg: string; bg: string }) => void;
  onClose: () => void;
}) {
  const [data, setData] = useState("");
  const [fg, setFg] = useState("#000000");
  const [bg, setBg] = useState("#ffffff");
  const [preview, setPreview] = useState<string>();

  useEffect(() => {
    let alive = true;
    generateQrDataUrl(data || "https://", fg, bg).then((u) => {
      if (alive) setPreview(u);
    });
    return () => {
      alive = false;
    };
  }, [data, fg, bg]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-white font-semibold mb-1">Add QR code</h3>
        <p className="text-zinc-500 text-xs mb-3">Lightning address, LNURL, or any URL.</p>

        <div className="flex gap-4">
          <div className="flex-1 space-y-3">
            <textarea
              autoFocus
              value={data}
              onChange={(e) => setData(e.target.value)}
              rows={3}
              placeholder="lnurl1... or https://..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm resize-none focus:outline-none focus:border-primary"
            />
            <div className="flex gap-3">
              <label className="flex items-center gap-2 text-xs text-zinc-400">
                Dark
                <input type="color" value={fg} onChange={(e) => setFg(e.target.value)} className="w-8 h-8 rounded cursor-pointer bg-transparent" />
              </label>
              <label className="flex items-center gap-2 text-xs text-zinc-400">
                Light
                <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="w-8 h-8 rounded cursor-pointer bg-transparent" />
              </label>
            </div>
          </div>
          <div className="w-28 h-28 rounded-lg bg-white/5 border border-zinc-700 flex items-center justify-center overflow-hidden shrink-0">
            {preview && <img src={preview} alt="QR preview" className="w-full h-full object-contain" />}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-zinc-400 hover:text-white text-sm transition-colors">
            Cancel
          </button>
          <button
            onClick={() => data.trim() && onConfirm({ data: data.trim(), fg, bg })}
            disabled={!data.trim()}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            Add QR
          </button>
        </div>
      </div>
    </div>
  );
}
