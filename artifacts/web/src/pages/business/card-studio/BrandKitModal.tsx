import { useState } from "react";
import { X, Plus, Trash2, Image as ImageIcon } from "lucide-react";
import type { BrandKit } from "./storage";
import { FONT_FAMILIES } from "./fonts";

export function BrandKitModal({
  kit,
  onChange,
  onAddLogo,
  onClose,
}: {
  kit: BrandKit;
  onChange: (kit: BrandKit) => void;
  onAddLogo: (src: string) => void;
  onClose: () => void;
}) {
  const [newColor, setNewColor] = useState("#f7931a");

  const addColor = () => {
    if (kit.colors.includes(newColor)) return;
    onChange({ ...kit, colors: [...kit.colors, newColor] });
  };

  const removeColor = (c: string) => onChange({ ...kit, colors: kit.colors.filter((x) => x !== c) });

  const handleLogo = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => onChange({ ...kit, logo: e.target?.result as string });
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">Brand kit</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <section className="mb-5">
          <h4 className="text-white text-sm font-medium mb-2">Brand colors</h4>
          <div className="flex flex-wrap gap-2 mb-2">
            {kit.colors.map((c) => (
              <div key={c} className="group relative">
                <div className="w-9 h-9 rounded-lg border border-zinc-700" style={{ background: c }} />
                <button
                  onClick={() => removeColor(c)}
                  className="absolute -top-1.5 -right-1.5 bg-zinc-950 rounded-full p-0.5 text-zinc-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
            {kit.colors.length === 0 && <span className="text-zinc-500 text-xs py-2">No colors saved</span>}
          </div>
          <div className="flex items-center gap-2">
            <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="w-9 h-9 rounded cursor-pointer bg-transparent" />
            <button onClick={addColor} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-200 text-xs font-medium hover:bg-zinc-700 transition-colors">
              <Plus size={13} /> Add color
            </button>
          </div>
        </section>

        <section className="mb-5">
          <h4 className="text-white text-sm font-medium mb-2">Logo</h4>
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center overflow-hidden shrink-0">
              {kit.logo ? <img src={kit.logo} alt="logo" className="w-full h-full object-contain p-1" /> : <ImageIcon size={20} className="text-zinc-600" />}
            </div>
            <div className="flex flex-col gap-2">
              <label className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-200 text-xs font-medium hover:bg-zinc-700 transition-colors cursor-pointer">
                {kit.logo ? "Replace logo" : "Upload logo"}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogo(f); }} />
              </label>
              {kit.logo && (
                <button onClick={() => onAddLogo(kit.logo!)} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity">
                  Add logo to card
                </button>
              )}
            </div>
          </div>
        </section>

        <section>
          <h4 className="text-white text-sm font-medium mb-2">Default font</h4>
          <select
            value={kit.font ?? ""}
            onChange={(e) => onChange({ ...kit, font: e.target.value || null })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary"
          >
            <option value="">System default (Arial)</option>
            {FONT_FAMILIES.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </section>
      </div>
    </div>
  );
}
