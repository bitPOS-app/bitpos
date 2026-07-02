import { useState } from "react";
import { X, Plus, ChevronUp, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export interface ApiSticker {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string;
  royaltySatsPerUse: number;
}

const API = "/api";

export function StickerPanel({
  stickers,
  onAdd,
  onClose,
  token,
  onRefresh,
}: {
  stickers: ApiSticker[];
  onAdd: (s: ApiSticker) => void;
  onClose: () => void;
  token: string;
  onRefresh: () => void;
}) {
  const [publishName, setPublishName] = useState("");
  const [publishDesc, setPublishDesc] = useState("");
  const [publishImg, setPublishImg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);
  const { toast } = useToast();

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => setPublishImg(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const submitSticker = async () => {
    if (!publishName.trim() || !publishImg) return;
    setSubmitting(true);
    try {
      const r = await fetch(`${API}/stickers/publish`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: publishName.trim(), description: publishDesc.trim(), imageUrl: publishImg }),
      });
      if (!r.ok) throw new Error(await r.text());
      toast({ title: "Sticker submitted!", description: "It will appear once approved by our team." });
      setPublishName("");
      setPublishDesc("");
      setPublishImg(null);
      setShowSubmit(false);
      onRefresh();
    } catch {
      toast({ title: "Submission failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-72 bg-zinc-900 border-l border-zinc-800 flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <span className="text-white font-medium text-sm">Community Stickers</span>
        <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-3 gap-2">
          {stickers.map((s) => (
            <button
              key={s.id}
              onClick={() => onAdd(s)}
              title={s.name + (s.royaltySatsPerUse > 0 ? ` (+${s.royaltySatsPerUse} sats creator royalty)` : "")}
              className="relative group aspect-square rounded-lg bg-zinc-800 border border-zinc-700 hover:border-primary hover:bg-zinc-700 transition-all overflow-hidden p-1.5"
            >
              <img src={s.imageUrl} alt={s.name} className="w-full h-full object-contain" />
              {s.royaltySatsPerUse > 0 && (
                <div className="absolute bottom-0 left-0 right-0 bg-amber-500/90 text-black text-[9px] font-bold text-center py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  +{s.royaltySatsPerUse} sats
                </div>
              )}
            </button>
          ))}
          {stickers.length === 0 && (
            <div className="col-span-3 text-center text-zinc-500 text-xs py-8">No stickers yet</div>
          )}
        </div>
      </div>

      <div className="border-t border-zinc-800 p-3">
        <button
          onClick={() => setShowSubmit(!showSubmit)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors text-xs font-medium"
        >
          <Plus size={12} />
          Submit your sticker
          {showSubmit ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        </button>

        {showSubmit && (
          <div className="mt-3 space-y-2">
            <input
              type="text"
              placeholder="Sticker name"
              value={publishName}
              onChange={(e) => setPublishName(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-primary"
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={publishDesc}
              onChange={(e) => setPublishDesc(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-primary"
            />
            <label className="block">
              <div className={`w-full border border-dashed rounded-lg px-2 py-3 text-center cursor-pointer transition-colors text-xs ${publishImg ? "border-primary bg-primary/10 text-primary" : "border-zinc-600 text-zinc-500 hover:border-zinc-500"}`}>
                {publishImg ? "Image ready" : "Click to upload image"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
              </div>
            </label>
            {publishImg && <img src={publishImg} alt="preview" className="w-12 h-12 object-contain mx-auto rounded" />}
            <button
              onClick={submitSticker}
              disabled={submitting || !publishName.trim() || !publishImg}
              className="w-full px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {submitting ? "Submitting..." : "Submit for review"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
