import { useState } from "react";
import { X, Lock, Unlock, Eye, EyeOff, Trash2, ChevronUp, ChevronDown, Type, Image as ImageIcon, Smile, QrCode, Pencil, Shapes } from "lucide-react";
import type { StudioEl } from "./types";

function elementLabel(el: StudioEl): string {
  if (el.name) return el.name;
  switch (el.kind) {
    case "text":
      return el.text.slice(0, 18) || "Text";
    case "image":
      return "Image";
    case "sticker":
      return "Sticker";
    case "qr":
      return "QR code";
    case "shape":
      return el.shape.charAt(0).toUpperCase() + el.shape.slice(1);
  }
}

function ElIcon({ kind }: { kind: StudioEl["kind"] }) {
  if (kind === "text") return <Type size={13} />;
  if (kind === "image") return <ImageIcon size={13} />;
  if (kind === "sticker") return <Smile size={13} />;
  if (kind === "shape") return <Shapes size={13} />;
  return <QrCode size={13} />;
}

export function LayersPanel({
  elements,
  selectedId,
  onSelect,
  onBringForward,
  onSendBackward,
  onToggleLock,
  onToggleHidden,
  onRename,
  onDelete,
  onClose,
}: {
  elements: StudioEl[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onBringForward: (id: string) => void;
  onSendBackward: (id: string) => void;
  onToggleLock: (id: string) => void;
  onToggleHidden: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [editId, setEditId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");

  // Top-most layers first (last in array = top of z-order).
  const ordered = [...elements].reverse();

  const commitRename = () => {
    if (editId) onRename(editId, editVal.trim());
    setEditId(null);
  };

  return (
    <div className="w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <span className="text-white font-medium text-sm">Layers</span>
        <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {ordered.length === 0 && <div className="text-center text-zinc-500 text-xs py-8">No layers yet</div>}
        {ordered.map((el) => {
          const selected = el.id === selectedId;
          return (
            <div
              key={el.id}
              onClick={() => onSelect(el.id)}
              className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${selected ? "bg-primary/20 ring-1 ring-primary/50" : "hover:bg-zinc-800"}`}
            >
              <span className="text-zinc-400 shrink-0"><ElIcon kind={el.kind} /></span>
              {editId === el.id ? (
                <input
                  autoFocus
                  value={editVal}
                  onChange={(e) => setEditVal(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setEditId(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 min-w-0 bg-zinc-950 border border-zinc-700 rounded px-1 py-0.5 text-white text-xs focus:outline-none focus:border-primary"
                />
              ) : (
                <span className={`flex-1 min-w-0 truncate text-xs ${el.hidden ? "text-zinc-600 line-through" : "text-zinc-200"}`}>
                  {elementLabel(el)}
                </span>
              )}
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button onClick={(e) => { e.stopPropagation(); onBringForward(el.id); }} title="Bring forward" className="p-1 text-zinc-400 hover:text-white">
                  <ChevronUp size={12} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); onSendBackward(el.id); }} title="Send backward" className="p-1 text-zinc-400 hover:text-white">
                  <ChevronDown size={12} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); setEditId(el.id); setEditVal(el.name ?? elementLabel(el)); }} title="Rename" className="p-1 text-zinc-400 hover:text-white">
                  <Pencil size={12} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); onDelete(el.id); }} title="Delete" className="p-1 text-zinc-400 hover:text-red-400">
                  <Trash2 size={12} />
                </button>
              </div>
              <button onClick={(e) => { e.stopPropagation(); onToggleHidden(el.id); }} title={el.hidden ? "Show" : "Hide"} className="p-1 text-zinc-400 hover:text-white shrink-0">
                {el.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
              <button onClick={(e) => { e.stopPropagation(); onToggleLock(el.id); }} title={el.locked ? "Unlock" : "Lock"} className="p-1 text-zinc-400 hover:text-white shrink-0">
                {el.locked ? <Lock size={12} /> : <Unlock size={12} />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
