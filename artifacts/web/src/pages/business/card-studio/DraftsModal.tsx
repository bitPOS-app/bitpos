import { useState } from "react";
import { X, Trash2, FolderOpen, Save } from "lucide-react";
import type { Draft } from "./storage";

export function DraftsModal({
  drafts,
  onLoad,
  onDelete,
  onSaveNew,
  onClose,
}: {
  drafts: Draft[];
  onLoad: (d: Draft) => void;
  onDelete: (id: string) => void;
  onSaveNew: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">Drafts</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Save current as..."
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary"
          />
          <button
            onClick={() => { if (name.trim()) { onSaveNew(name.trim()); setName(""); } }}
            disabled={!name.trim()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            <Save size={14} />
            Save
          </button>
        </div>

        <div className="space-y-2">
          {drafts.length === 0 && <div className="text-center text-zinc-500 text-xs py-8">No saved drafts yet</div>}
          {drafts.map((d) => (
            <div key={d.id} className="flex items-center gap-3 p-2 rounded-lg bg-zinc-800 border border-zinc-700">
              <div className="w-14 h-9 rounded bg-zinc-950 overflow-hidden shrink-0 flex items-center justify-center">
                {d.thumb ? <img src={d.thumb} alt={d.name} className="w-full h-full object-contain" /> : <span className="text-zinc-600 text-[9px]">no preview</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white text-sm truncate">{d.name}</div>
                <div className="text-zinc-500 text-[11px]">{new Date(d.updatedAt).toLocaleString()}</div>
              </div>
              <button onClick={() => onLoad(d)} title="Load" className="p-1.5 text-zinc-400 hover:text-primary transition-colors">
                <FolderOpen size={15} />
              </button>
              <button onClick={() => onDelete(d.id)} title="Delete" className="p-1.5 text-zinc-400 hover:text-red-400 transition-colors">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
