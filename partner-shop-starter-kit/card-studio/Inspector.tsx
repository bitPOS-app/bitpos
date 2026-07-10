import {
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Copy,
  Trash2,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Pencil,
  AlertTriangle,
} from "lucide-react";
import type { SideData, StudioEl, BgType } from "./types";
import { FONT_FAMILIES } from "./fonts";

export type AlignMode = "left" | "centerH" | "right" | "top" | "middleV" | "bottom";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-zinc-800 p-3">
      <h4 className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium mb-2.5">{title}</h4>
      {children}
    </div>
  );
}

function Swatches({ colors, onPick }: { colors: string[]; onPick: (c: string) => void }) {
  if (colors.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {colors.map((c) => (
        <button key={c} onClick={() => onPick(c)} className="w-6 h-6 rounded-md border border-zinc-700 hover:scale-110 transition-transform" style={{ background: c }} title={c} />
      ))}
    </div>
  );
}

export function Inspector({
  side,
  selectedEl,
  brandColors,
  imageDpi,
  onPatchSide,
  onUpdateEl,
  onUploadBgImage,
  onAlign,
  onDuplicate,
  onDelete,
  onToggleLock,
  onToggleHidden,
  onEditText,
}: {
  side: SideData;
  selectedEl: StudioEl | undefined;
  brandColors: string[];
  imageDpi: number | null;
  onPatchSide: (patch: Partial<SideData>, coalesceKey?: string) => void;
  onUpdateEl: (id: string, attrs: Partial<StudioEl>, coalesceKey?: string) => void;
  onUploadBgImage: (file: File) => void;
  onAlign: (mode: AlignMode) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggleLock: () => void;
  onToggleHidden: () => void;
  onEditText: () => void;
}) {
  const bgTypeBtn = (t: BgType, label: string) => (
    <button
      onClick={() => onPatchSide({ bgType: t })}
      className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${side.bgType === t ? "bg-primary text-primary-foreground" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="w-64 bg-zinc-900 border-l border-zinc-800 flex flex-col h-full overflow-y-auto">
      <Section title="Background">
        <div className="flex gap-1.5 mb-3">
          {bgTypeBtn("solid", "Solid")}
          {bgTypeBtn("gradient", "Gradient")}
          {bgTypeBtn("image", "Image")}
        </div>

        {side.bgType === "solid" && (
          <div>
            <div className="flex items-center gap-2">
              <input type="color" value={side.bgColor} onChange={(e) => onPatchSide({ bgColor: e.target.value }, "bgColor")} className="w-9 h-9 rounded cursor-pointer bg-transparent" />
              <span className="text-zinc-400 text-xs">{side.bgColor}</span>
            </div>
            <Swatches colors={brandColors} onPick={(c) => onPatchSide({ bgColor: c })} />
          </div>
        )}

        {side.bgType === "gradient" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input type="color" value={side.bgGradient.from} onChange={(e) => onPatchSide({ bgGradient: { ...side.bgGradient, from: e.target.value } }, "bgFrom")} className="w-8 h-8 rounded cursor-pointer bg-transparent" />
              <input type="color" value={side.bgGradient.to} onChange={(e) => onPatchSide({ bgGradient: { ...side.bgGradient, to: e.target.value } }, "bgTo")} className="w-8 h-8 rounded cursor-pointer bg-transparent" />
              <span className="text-zinc-500 text-xs">from / to</span>
            </div>
            <label className="block text-xs text-zinc-400">
              Angle: {side.bgGradient.angle}deg
              <input type="range" min={0} max={360} value={side.bgGradient.angle} onChange={(e) => onPatchSide({ bgGradient: { ...side.bgGradient, angle: Number(e.target.value) } }, "bgAngle")} className="w-full accent-primary" />
            </label>
          </div>
        )}

        {side.bgType === "image" && (
          <div>
            <label className="block w-full border border-dashed border-zinc-600 rounded-lg px-2 py-3 text-center cursor-pointer hover:border-zinc-500 text-xs text-zinc-400">
              {side.bgImage ? "Replace background image" : "Upload background image"}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadBgImage(f); e.target.value = ""; }} />
            </label>
            {side.bgImage && (
              <button onClick={() => onPatchSide({ bgImage: null, bgType: "solid" })} className="mt-2 text-xs text-red-400 hover:text-red-300">Remove background image</button>
            )}
          </div>
        )}
      </Section>

      {!selectedEl && <div className="p-4 text-center text-zinc-600 text-xs">Select an element to edit it.</div>}

      {selectedEl && (
        <>
          <Section title="Arrange">
            <div className="grid grid-cols-3 gap-1.5 mb-2">
              <button onClick={() => onAlign("left")} title="Align left" className="p-2 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 flex items-center justify-center"><AlignHorizontalJustifyStart size={15} /></button>
              <button onClick={() => onAlign("centerH")} title="Center horizontally" className="p-2 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 flex items-center justify-center"><AlignHorizontalJustifyCenter size={15} /></button>
              <button onClick={() => onAlign("right")} title="Align right" className="p-2 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 flex items-center justify-center"><AlignHorizontalJustifyEnd size={15} /></button>
              <button onClick={() => onAlign("top")} title="Align top" className="p-2 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 flex items-center justify-center"><AlignVerticalJustifyStart size={15} /></button>
              <button onClick={() => onAlign("middleV")} title="Center vertically" className="p-2 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 flex items-center justify-center"><AlignVerticalJustifyCenter size={15} /></button>
              <button onClick={() => onAlign("bottom")} title="Align bottom" className="p-2 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 flex items-center justify-center"><AlignVerticalJustifyEnd size={15} /></button>
            </div>
            <div className="flex gap-1.5">
              <button onClick={onDuplicate} className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 text-xs"><Copy size={13} /> Duplicate</button>
              <button onClick={onToggleLock} title={selectedEl.locked ? "Unlock" : "Lock"} className="p-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700">{selectedEl.locked ? <Lock size={14} /> : <Unlock size={14} />}</button>
              <button onClick={onToggleHidden} title={selectedEl.hidden ? "Show" : "Hide"} className="p-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700">{selectedEl.hidden ? <EyeOff size={14} /> : <Eye size={14} />}</button>
              <button onClick={onDelete} title="Delete" className="p-1.5 rounded-lg bg-zinc-800 text-red-400 hover:bg-red-900/30"><Trash2 size={14} /></button>
            </div>
          </Section>

          <Section title="Opacity">
            <input type="range" min={0} max={1} step={0.05} value={selectedEl.opacity ?? 1} onChange={(e) => onUpdateEl(selectedEl.id, { opacity: Number(e.target.value) }, "opacity")} className="w-full accent-primary" />
          </Section>

          {selectedEl.kind === "text" && (
            <Section title="Text">
              <button onClick={onEditText} className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 mb-2.5 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 text-xs"><Pencil size={13} /> Edit content</button>
              <label className="block text-xs text-zinc-400 mb-2">
                Font
                <select value={selectedEl.fontFamily} onChange={(e) => onUpdateEl(selectedEl.id, { fontFamily: e.target.value })} className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-primary" style={{ fontFamily: selectedEl.fontFamily }}>
                  {FONT_FAMILIES.map((f) => <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>)}
                </select>
              </label>
              <label className="block text-xs text-zinc-400 mb-2">
                Size: {selectedEl.fontSize}
                <input type="range" min={8} max={140} value={selectedEl.fontSize} onChange={(e) => onUpdateEl(selectedEl.id, { fontSize: Number(e.target.value) }, "fontSize")} className="w-full accent-primary" />
              </label>
              <div className="flex items-center gap-2 mb-2">
                <input type="color" value={selectedEl.fill} onChange={(e) => onUpdateEl(selectedEl.id, { fill: e.target.value }, "textFill")} className="w-8 h-8 rounded cursor-pointer bg-transparent" />
                <div className="flex gap-1">
                  <button onClick={() => { const has = selectedEl.fontStyle.includes("bold"); const it = selectedEl.fontStyle.includes("italic"); onUpdateEl(selectedEl.id, { fontStyle: [!has ? "bold" : "", it ? "italic" : ""].filter(Boolean).join(" ") || "normal" }); }} className={`px-2.5 py-1 rounded text-xs font-bold ${selectedEl.fontStyle.includes("bold") ? "bg-primary text-primary-foreground" : "bg-zinc-800 text-zinc-300"}`}>B</button>
                  <button onClick={() => { const b = selectedEl.fontStyle.includes("bold"); const has = selectedEl.fontStyle.includes("italic"); onUpdateEl(selectedEl.id, { fontStyle: [b ? "bold" : "", !has ? "italic" : ""].filter(Boolean).join(" ") || "normal" }); }} className={`px-2.5 py-1 rounded text-xs italic ${selectedEl.fontStyle.includes("italic") ? "bg-primary text-primary-foreground" : "bg-zinc-800 text-zinc-300"}`}>I</button>
                </div>
              </div>
              <Swatches colors={brandColors} onPick={(c) => onUpdateEl(selectedEl.id, { fill: c })} />
              <div className="flex gap-1 mt-2.5 mb-2">
                {(["left", "center", "right"] as const).map((a) => (
                  <button key={a} onClick={() => onUpdateEl(selectedEl.id, { align: a })} className={`flex-1 p-1.5 rounded flex items-center justify-center ${selectedEl.align === a ? "bg-primary text-primary-foreground" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}>
                    {a === "left" ? <AlignLeft size={14} /> : a === "center" ? <AlignCenter size={14} /> : <AlignRight size={14} />}
                  </button>
                ))}
              </div>
              <label className="block text-xs text-zinc-400 mb-2">
                Letter spacing: {selectedEl.letterSpacing}
                <input type="range" min={-5} max={30} value={selectedEl.letterSpacing} onChange={(e) => onUpdateEl(selectedEl.id, { letterSpacing: Number(e.target.value) }, "letterSpacing")} className="w-full accent-primary" />
              </label>
              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                <input type="checkbox" checked={selectedEl.shadow} onChange={(e) => onUpdateEl(selectedEl.id, { shadow: e.target.checked })} className="accent-primary" />
                Drop shadow
              </label>
            </Section>
          )}

          {selectedEl.kind === "qr" && (
            <Section title="QR code">
              <label className="block text-xs text-zinc-400 mb-2">
                Data
                <textarea value={selectedEl.data} onChange={(e) => onUpdateEl(selectedEl.id, { data: e.target.value }, "qrData")} rows={2} className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-white text-xs resize-none focus:outline-none focus:border-primary" />
              </label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-zinc-400">Dark<input type="color" value={selectedEl.fg} onChange={(e) => onUpdateEl(selectedEl.id, { fg: e.target.value }, "qrFg")} className="w-7 h-7 rounded cursor-pointer bg-transparent" /></label>
                <label className="flex items-center gap-1.5 text-xs text-zinc-400">Light<input type="color" value={selectedEl.bg} onChange={(e) => onUpdateEl(selectedEl.id, { bg: e.target.value }, "qrBg")} className="w-7 h-7 rounded cursor-pointer bg-transparent" /></label>
              </div>
            </Section>
          )}

          {selectedEl.kind === "shape" && (
            <Section title="Shape">
              {selectedEl.shape !== "line" && (
                <div className="mb-2.5">
                  <div className="flex items-center gap-2">
                    <input type="color" value={selectedEl.fill} onChange={(e) => onUpdateEl(selectedEl.id, { fill: e.target.value }, "shapeFill")} className="w-8 h-8 rounded cursor-pointer bg-transparent" />
                    <span className="text-zinc-400 text-xs">Fill</span>
                  </div>
                  <Swatches colors={brandColors} onPick={(c) => onUpdateEl(selectedEl.id, { fill: c })} />
                </div>
              )}
              <div className="flex items-center gap-2 mb-2">
                <input type="color" value={selectedEl.stroke} onChange={(e) => onUpdateEl(selectedEl.id, { stroke: e.target.value }, "shapeStroke")} className="w-8 h-8 rounded cursor-pointer bg-transparent" />
                <span className="text-zinc-400 text-xs">{selectedEl.shape === "line" ? "Color" : "Border"}</span>
              </div>
              <label className="block text-xs text-zinc-400 mb-2">
                {selectedEl.shape === "line" ? "Thickness" : "Border width"}: {selectedEl.strokeWidth}
                <input type="range" min={selectedEl.shape === "line" ? 1 : 0} max={40} value={selectedEl.strokeWidth} onChange={(e) => onUpdateEl(selectedEl.id, { strokeWidth: Number(e.target.value) }, "shapeStrokeW")} className="w-full accent-primary" />
              </label>
              {selectedEl.shape === "rect" && (
                <label className="block text-xs text-zinc-400">
                  Corner radius: {selectedEl.cornerRadius}
                  <input type="range" min={0} max={80} value={selectedEl.cornerRadius} onChange={(e) => onUpdateEl(selectedEl.id, { cornerRadius: Number(e.target.value) }, "shapeRadius")} className="w-full accent-primary" />
                </label>
              )}
            </Section>
          )}

          {selectedEl.kind === "image" && imageDpi !== null && (
            <Section title="Print quality">
              {imageDpi >= 250 ? (
                <p className="text-xs text-emerald-400">Good resolution (~{imageDpi} DPI at current size).</p>
              ) : (
                <p className="text-xs text-amber-400 flex items-start gap-1.5">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                  Low resolution (~{imageDpi} DPI). Scale down or use a larger image for a crisp print.
                </p>
              )}
            </Section>
          )}
        </>
      )}
    </div>
  );
}
