import { X } from "lucide-react";
import { TEMPLATES, type CardTemplate } from "./templates";
import type { SideData } from "./types";

function previewStyle(side: SideData): React.CSSProperties {
  if (side.bgType === "gradient") {
    return { background: `linear-gradient(${side.bgGradient.angle}deg, ${side.bgGradient.from}, ${side.bgGradient.to})` };
  }
  return { background: side.bgColor };
}

export function TemplatesModal({
  onApply,
  onClose,
}: {
  onApply: (t: CardTemplate) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">Templates</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>
        <p className="text-zinc-500 text-xs mb-4">Pick a starter design. This replaces both sides of your current card.</p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {TEMPLATES.map((t) => {
            const front = t.doc.front;
            const firstText = front.elements.find((e) => e.kind === "text");
            return (
              <button
                key={t.id}
                onClick={() => onApply(t)}
                className="group text-left rounded-xl overflow-hidden border border-zinc-700 hover:border-primary transition-colors"
              >
                <div className="relative flex items-center justify-center" style={{ aspectRatio: "1011 / 638", ...previewStyle(front) }}>
                  {firstText && firstText.kind === "text" && (
                    <span
                      className="px-2 text-center font-bold leading-tight truncate"
                      style={{ color: firstText.fill, fontFamily: firstText.fontFamily, fontSize: 14 }}
                    >
                      {firstText.text}
                    </span>
                  )}
                </div>
                <div className="px-2 py-1.5 bg-zinc-800 text-zinc-200 text-xs font-medium group-hover:text-white">{t.name}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
