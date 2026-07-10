import { X } from "lucide-react";

const SHORTCUTS: [string, string][] = [
  ["Undo", "Ctrl/Cmd + Z"],
  ["Redo", "Ctrl/Cmd + Shift + Z"],
  ["Duplicate", "Ctrl/Cmd + D"],
  ["Copy", "Ctrl/Cmd + C"],
  ["Paste", "Ctrl/Cmd + V"],
  ["Delete", "Delete / Backspace"],
  ["Nudge", "Arrow keys"],
  ["Nudge x10", "Shift + Arrow keys"],
  ["Deselect", "Esc"],
];

export function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">How the Card Studio works</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 text-sm">
          <section>
            <h4 className="text-white font-medium mb-2">Guides</h4>
            <ul className="space-y-2 text-zinc-300">
              <li className="flex items-center gap-2">
                <span className="inline-block w-5 h-3 rounded-sm border-2 border-white" />
                White outline: the trim edge (where the card is cut).
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block w-5 h-3 rounded-sm border-2 border-dashed border-red-500" />
                Red dashed line: safe area. Keep important text and logos inside it.
              </li>
            </ul>
            <p className="text-zinc-500 text-xs mt-2">Guides are only shown while editing. They never appear in previews or exports.</p>
          </section>

          <section>
            <h4 className="text-white font-medium mb-2">Getting started</h4>
            <ol className="list-decimal list-inside space-y-1 text-zinc-300">
              <li>Pick a template or start from a blank card.</li>
              <li>Add images, text, stickers, or a QR code.</li>
              <li>Drag to position; elements snap to centers and edges.</li>
              <li>Use the Layers panel to reorder, lock, hide, or rename.</li>
              <li>Preview, then run the print check and send to production.</li>
            </ol>
          </section>

          <section>
            <h4 className="text-white font-medium mb-2">Keyboard shortcuts</h4>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {SHORTCUTS.map(([label, keys]) => (
                <div key={label} className="flex items-center justify-between gap-2">
                  <span className="text-zinc-400">{label}</span>
                  <kbd className="text-[11px] bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-zinc-300">{keys}</kbd>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
