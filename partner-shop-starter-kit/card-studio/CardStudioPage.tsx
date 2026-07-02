import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Stage, Layer, Rect, Group, Line, Transformer } from "react-konva";
import type Konva from "konva";
import {
  ArrowLeft,
  Type,
  ImageIcon,
  Sticker,
  ZoomIn,
  ZoomOut,
  Rocket,
  Layers as LayersIcon,
  Undo2,
  Redo2,
  Eye,
  HelpCircle,
  LayoutTemplate,
  QrCode,
  Sparkles,
  FolderOpen,
  Shapes,
  Square,
  Circle,
  Triangle,
  Minus,
  X,
  SlidersHorizontal,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import Layout from "@/components/Layout";

import {
  CANVAS_W,
  CANVAS_H,
  CR80_W,
  CORNER_R,
  SAFE_INSET,
  MIN_PRINT_DPI,
  clipCard,
  uid,
  emptyDoc,
  sideHasPrintableContent,
  imageDpi as calcImageDpi,
  type Side,
  type StudioEl,
  type StudioDoc,
  type SideData,
  type ImageEl,
  type StickerEl,
  type TextEl,
  type QrEl,
  type ShapeEl,
  type ShapeType,
} from "./card-studio/types";
import { useHistory } from "./card-studio/useHistory";
import { RasterNode, TextNodeView, QrNode, ShapeNode, BgImageNode } from "./card-studio/nodes";
import { StickerPanel, type ApiSticker } from "./card-studio/StickerPanel";
import { TextDialog } from "./card-studio/TextDialog";
import { QrDialog } from "./card-studio/QrDialog";
import { LayersPanel } from "./card-studio/LayersPanel";
import { PreviewModal } from "./card-studio/PreviewModal";
import { HelpModal } from "./card-studio/HelpModal";
import { TemplatesModal } from "./card-studio/TemplatesModal";
import { DraftsModal } from "./card-studio/DraftsModal";
import { BrandKitModal } from "./card-studio/BrandKitModal";
import { PrintCheckModal, type PrintCheck } from "./card-studio/PrintCheckModal";
import { Inspector, type AlignMode } from "./card-studio/Inspector";
import type { CardTemplate } from "./card-studio/templates";
import {
  listDrafts,
  saveDraft,
  deleteDraft,
  loadAutosave,
  saveAutosave,
  loadBrandKit,
  saveBrandKit,
  type Draft,
  type BrandKit,
} from "./card-studio/storage";

const API = "/api";
const SNAP = 6;

function gradientPoints(angle: number) {
  const rad = (angle * Math.PI) / 180;
  const x = Math.cos(rad);
  const y = Math.sin(rad);
  return {
    start: { x: CANVAS_W / 2 - (x * CANVAS_W) / 2, y: CANVAS_H / 2 - (y * CANVAS_H) / 2 },
    end: { x: CANVAS_W / 2 + (x * CANVAS_W) / 2, y: CANVAS_H / 2 + (y * CANVAS_H) / 2 },
  };
}

export default function CardStudioPage() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { toast } = useToast();

  const frontStageRef = useRef<Konva.Stage>(null);
  const backStageRef = useRef<Konva.Stage>(null);
  const frontTrRef = useRef<Konva.Transformer>(null);
  const backTrRef = useRef<Konva.Transformer>(null);
  const [trTick, setTrTick] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const clipboardRef = useRef<StudioEl | null>(null);

  const { doc, commit, undo, redo, reset, canUndo, canRedo } = useHistory<StudioDoc>(emptyDoc());

  const [activeSide, setActiveSide] = useState<Side>("front");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [stageDragging, setStageDragging] = useState(false);
  const [snapGuides, setSnapGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });

  const [showStickerPanel, setShowStickerPanel] = useState(false);
  const [showLayers, setShowLayers] = useState(false);
  const [stickers, setStickers] = useState<ApiSticker[]>([]);
  const [stickersLoaded, setStickersLoaded] = useState(false);

  const [textDialog, setTextDialog] = useState<{ mode: "add" | "edit"; editId?: string; initial: string } | null>(null);
  const [showQrDialog, setShowQrDialog] = useState(false);
  const [showShapeMenu, setShowShapeMenu] = useState(false);
  const [showInspectorMobile, setShowInspectorMobile] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showDrafts, setShowDrafts] = useState(false);
  const [showBrandKit, setShowBrandKit] = useState(false);
  const [preview, setPreview] = useState<{ front: string; back: string | null } | null>(null);
  const [printCheck, setPrintCheck] = useState<PrintCheck[] | null>(null);

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [brandKit, setBrandKit] = useState<BrandKit>({ colors: [], logo: null, font: null });
  const [sending, setSending] = useState(false);

  // ── Active side helpers ────────────────────────────────────────────────────

  const side = doc[activeSide];
  const elements = side.elements;
  const selectedEl = elements.find((e) => e.id === selectedId);

  const patchSide = useCallback(
    (patch: Partial<SideData>, coalesceKey?: string) => {
      commit((d) => ({ ...d, [activeSide]: { ...d[activeSide], ...patch } }), coalesceKey);
    },
    [activeSide, commit],
  );

  const setElements = useCallback(
    (updater: StudioEl[] | ((prev: StudioEl[]) => StudioEl[]), coalesceKey?: string) => {
      commit(
        (d) => ({
          ...d,
          [activeSide]: {
            ...d[activeSide],
            elements: typeof updater === "function" ? updater(d[activeSide].elements) : updater,
          },
        }),
        coalesceKey,
      );
    },
    [activeSide, commit],
  );

  const updateElement = useCallback(
    (id: string, attrs: Partial<StudioEl>, coalesceKey?: string) => {
      setElements((prev) => prev.map((el) => (el.id === id ? ({ ...el, ...attrs } as StudioEl) : el)), coalesceKey);
    },
    [setElements],
  );

  const addElement = useCallback(
    (el: StudioEl) => {
      setElements((prev) => [...prev, el]);
      setSelectedId(el.id);
    },
    [setElements],
  );

  const deleteById = useCallback(
    (id: string) => {
      setElements((prev) => prev.filter((el) => el.id !== id));
      setSelectedId((cur) => (cur === id ? null : cur));
    },
    [setElements],
  );

  const deleteSelected = useCallback(() => {
    if (selectedId) deleteById(selectedId);
  }, [selectedId, deleteById]);

  const moveZ = useCallback(
    (id: string, dir: 1 | -1) => {
      setElements((prev) => {
        const idx = prev.findIndex((e) => e.id === id);
        const ni = idx + dir;
        if (idx < 0 || ni < 0 || ni >= prev.length) return prev;
        const next = [...prev];
        [next[idx], next[ni]] = [next[ni], next[idx]];
        return next;
      });
    },
    [setElements],
  );

  const duplicateById = useCallback(
    (id: string) => {
      const el = doc[activeSide].elements.find((e) => e.id === id);
      if (!el) return;
      const copy = { ...el, id: uid(), x: el.x + 24, y: el.y + 24 } as StudioEl;
      addElement(copy);
    },
    [doc, activeSide, addElement],
  );

  const switchSide = (s: Side) => {
    setSelectedId(null);
    setActiveSide(s);
  };

  const copySideToOther = () => {
    const other: Side = activeSide === "front" ? "back" : "front";
    commit((d) => ({
      ...d,
      [other]: {
        ...d[activeSide],
        elements: d[activeSide].elements.map((el) => ({ ...el, id: uid() })),
      },
    }));
    toast({ title: `Copied ${activeSide} to ${other}` });
  };

  // ── Stickers ────────────────────────────────────────────────────────────────

  const loadStickers = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch(`${API}/stickers`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return;
      const data = (await r.json()) as { stickers: ApiSticker[] };
      setStickers(data.stickers);
      setStickersLoaded(true);
    } catch {
      /* ignore */
    }
  }, [token]);

  useEffect(() => {
    if (showStickerPanel && !stickersLoaded) loadStickers();
  }, [showStickerPanel, stickersLoaded, loadStickers]);

  // ── Load autosave + brand kit on mount ──────────────────────────────────────

  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    setBrandKit(loadBrandKit());
    const a = loadAutosave();
    if (a) reset(a);
  }, [reset]);

  // ── Autosave (debounced) ─────────────────────────────────────────────────────

  const storageWarned = useRef(false);
  const warnStorageFull = useCallback(() => {
    if (storageWarned.current) return;
    storageWarned.current = true;
    toast({
      title: "Browser storage is full",
      description: "Recent changes may not be saved automatically. Export or remove old drafts to free space.",
      variant: "destructive",
    });
  }, [toast]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!saveAutosave(doc)) warnStorageFull();
    }, 800);
    return () => clearTimeout(t);
  }, [doc, warnStorageFull]);

  // ── Brand kit persistence ────────────────────────────────────────────────────

  const updateBrandKit = (kit: BrandKit) => {
    setBrandKit(kit);
    if (!saveBrandKit(kit)) warnStorageFull();
  };

  // ── Add image / sticker / text / qr ──────────────────────────────────────────

  const handleImageFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      const img = new window.Image();
      img.onload = () => {
        const ratio = Math.min(300 / img.width, 200 / img.height, 1);
        addElement({
          id: uid(),
          kind: "image",
          src,
          x: CANVAS_W / 2 - (img.width * ratio) / 2,
          y: CANVAS_H / 2 - (img.height * ratio) / 2,
          width: img.width * ratio,
          height: img.height * ratio,
          naturalWidth: img.width,
          naturalHeight: img.height,
          rotation: 0,
          opacity: 1,
        });
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  const addLogoFromKit = (src: string) => {
    const img = new window.Image();
    img.onload = () => {
      const ratio = Math.min(200 / img.width, 160 / img.height, 1);
      addElement({
        id: uid(),
        kind: "image",
        src,
        x: CANVAS_W / 2 - (img.width * ratio) / 2,
        y: CANVAS_H / 2 - (img.height * ratio) / 2,
        width: img.width * ratio,
        height: img.height * ratio,
        naturalWidth: img.width,
        naturalHeight: img.height,
        rotation: 0,
        opacity: 1,
      });
    };
    img.src = src;
    setShowBrandKit(false);
  };

  const handleBgImageFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => patchSide({ bgType: "image", bgImage: e.target?.result as string });
    reader.readAsDataURL(file);
  };

  const addSticker = (s: ApiSticker) => {
    const size = 100;
    addElement({
      id: uid(),
      kind: "sticker",
      stickerId: s.id,
      src: s.imageUrl,
      x: CANVAS_W / 2 - size / 2,
      y: CANVAS_H / 2 - size / 2,
      width: size,
      height: size,
      rotation: 0,
      opacity: 1,
    });
    setShowStickerPanel(false);
  };

  const confirmText = (text: string) => {
    if (textDialog?.mode === "edit" && textDialog.editId) {
      updateElement(textDialog.editId, { text });
    } else {
      addElement({
        id: uid(),
        kind: "text",
        text,
        fontSize: 40,
        fill: "#ffffff",
        fontStyle: "bold",
        fontFamily: brandKit.font ?? "Arial",
        align: "center",
        letterSpacing: 0,
        shadow: false,
        x: CANVAS_W / 2 - 150,
        y: CANVAS_H / 2 - 20,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        opacity: 1,
      });
    }
    setTextDialog(null);
  };

  const confirmQr = (v: { data: string; fg: string; bg: string }) => {
    const size = 160;
    addElement({
      id: uid(),
      kind: "qr",
      data: v.data,
      fg: v.fg,
      bg: v.bg,
      size,
      x: CANVAS_W / 2 - size / 2,
      y: CANVAS_H / 2 - size / 2,
      rotation: 0,
      opacity: 1,
    });
    setShowQrDialog(false);
  };

  const addShape = (shape: ShapeType) => {
    const w = shape === "line" ? 280 : 160;
    const h = shape === "line" ? 0 : 120;
    const accent = brandKit.colors[0] ?? "#f7931a";
    addElement({
      id: uid(),
      kind: "shape",
      shape,
      x: CANVAS_W / 2 - w / 2,
      y: CANVAS_H / 2 - (h || 6) / 2,
      width: w,
      height: h || 6,
      fill: accent,
      stroke: shape === "line" ? accent : "#ffffff",
      strokeWidth: shape === "line" ? 6 : 0,
      cornerRadius: shape === "rect" ? 14 : 0,
      rotation: 0,
      opacity: 1,
    });
    setShowShapeMenu(false);
  };

  // ── Templates ────────────────────────────────────────────────────────────────

  const applyTemplate = (t: CardTemplate) => {
    const clone: StudioDoc = {
      front: { ...t.doc.front, elements: t.doc.front.elements.map((el) => ({ ...el, id: uid() })) },
      back: { ...t.doc.back, elements: t.doc.back.elements.map((el) => ({ ...el, id: uid() })) },
    };
    reset(clone);
    setSelectedId(null);
    setActiveSide("front");
    setShowTemplates(false);
  };

  // ── Drafts ───────────────────────────────────────────────────────────────────

  const openDrafts = () => {
    setDrafts(listDrafts());
    setShowDrafts(true);
  };

  const saveCurrentDraft = (name: string) => {
    let thumb: string | null = null;
    try {
      if (frontStageRef.current) thumb = exportStageDataUrl(frontStageRef.current, 0.18);
    } catch {
      /* ignore */
    }
    const ok = saveDraft({ id: uid(), name, updatedAt: Date.now(), doc, thumb });
    setDrafts(listDrafts());
    toast(ok ? { title: "Draft saved" } : { title: "Could not save draft", description: "Storage may be full.", variant: "destructive" });
  };

  const loadDraft = (d: Draft) => {
    reset(d.doc);
    setSelectedId(null);
    setActiveSide("front");
    setShowDrafts(false);
    toast({ title: `Loaded "${d.name}"` });
  };

  const removeDraft = (id: string) => {
    deleteDraft(id);
    setDrafts(listDrafts());
  };

  // ── Zoom / pan ───────────────────────────────────────────────────────────────

  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const scaleBy = 1.08;
    const stage = e.target.getStage()!;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition()!;
    const mousePointTo = { x: (pointer.x - stage.x()) / oldScale, y: (pointer.y - stage.y()) / oldScale };
    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    const clamped = Math.min(Math.max(newScale, 0.25), 4);
    const newPos = { x: pointer.x - mousePointTo.x * clamped, y: pointer.y - mousePointTo.y * clamped };
    stage.scale({ x: clamped, y: clamped });
    stage.position(newPos);
    const otherRef = stage === frontStageRef.current ? backStageRef : frontStageRef;
    if (otherRef.current) {
      otherRef.current.scale({ x: clamped, y: clamped });
      otherRef.current.position(newPos);
    }
    setZoom(clamped);
    setStagePos(newPos);
  }, []);

  const zoomTo = (factor: number) => {
    const ref = activeSide === "front" ? frontStageRef : backStageRef;
    const stage = ref.current;
    if (!stage) return;
    const cx = stage.width() / 2;
    const cy = stage.height() / 2;
    const oldScale = stage.scaleX();
    const newScale = Math.min(Math.max(factor, 0.25), 4);
    const mousePointTo = { x: (cx - stage.x()) / oldScale, y: (cy - stage.y()) / oldScale };
    const newPos = { x: cx - mousePointTo.x * newScale, y: cy - mousePointTo.y * newScale };
    [frontStageRef, backStageRef].forEach((r) => {
      if (!r.current) return;
      r.current.scale({ x: newScale, y: newScale });
      r.current.position(newPos);
    });
    setZoom(newScale);
    setStagePos(newPos);
  };

  const fitCanvas = () => {
    [frontStageRef, backStageRef].forEach((r) => {
      if (!r.current) return;
      r.current.scale({ x: 1, y: 1 });
      r.current.position({ x: 0, y: 0 });
    });
    setZoom(1);
    setStagePos({ x: 0, y: 0 });
  };

  // ── Snapping ─────────────────────────────────────────────────────────────────

  const handleDragMove = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target;
    const layer = node.getLayer();
    if (!layer) return;
    const box = node.getClientRect({ relativeTo: layer });
    const vTargets = [0, CANVAS_W / 2, CANVAS_W];
    const hTargets = [0, CANVAS_H / 2, CANVAS_H];
    const nodeXs = [box.x, box.x + box.width / 2, box.x + box.width];
    const nodeYs = [box.y, box.y + box.height / 2, box.y + box.height];

    let bestDx = 0;
    let guideVx = 0;
    let foundV = false;
    let minDX = SNAP + 0.01;
    for (const t of vTargets) {
      for (const nx of nodeXs) {
        const d = Math.abs(t - nx);
        if (d < minDX) {
          minDX = d;
          bestDx = t - nx;
          guideVx = t;
          foundV = true;
        }
      }
    }

    let bestDy = 0;
    let guideHy = 0;
    let foundH = false;
    let minDY = SNAP + 0.01;
    for (const t of hTargets) {
      for (const ny of nodeYs) {
        const d = Math.abs(t - ny);
        if (d < minDY) {
          minDY = d;
          bestDy = t - ny;
          guideHy = t;
          foundH = true;
        }
      }
    }

    if (foundV) node.x(node.x() + bestDx);
    if (foundH) node.y(node.y() + bestDy);
    setSnapGuides({ v: foundV ? [guideVx] : [], h: foundH ? [guideHy] : [] });
  }, []);

  const clearGuides = useCallback(() => setSnapGuides({ v: [], h: [] }), []);

  // ── Align ────────────────────────────────────────────────────────────────────

  const alignSelected = (mode: AlignMode) => {
    if (!selectedEl) return;
    const stage = activeSide === "front" ? frontStageRef.current : backStageRef.current;
    const node = stage?.findOne("#" + selectedEl.id);
    const layer = node?.getLayer();
    if (!node || !layer) return;
    const box = node.getClientRect({ relativeTo: layer });
    let dx = 0;
    let dy = 0;
    if (mode === "left") dx = 0 - box.x;
    if (mode === "centerH") dx = (CANVAS_W - box.width) / 2 - box.x;
    if (mode === "right") dx = CANVAS_W - box.width - box.x;
    if (mode === "top") dy = 0 - box.y;
    if (mode === "middleV") dy = (CANVAS_H - box.height) / 2 - box.y;
    if (mode === "bottom") dy = CANVAS_H - box.height - box.y;
    updateElement(selectedEl.id, { x: selectedEl.x + dx, y: selectedEl.y + dy });
  };

  // ── Export ───────────────────────────────────────────────────────────────────

  const exportStageDataUrl = (stage: Konva.Stage, pixelRatioFactor = 1): string => {
    const oldScale = stage.scaleX();
    const oldPos = { x: stage.x(), y: stage.y() };
    stage.scale({ x: 1, y: 1 });
    stage.position({ x: 0, y: 0 });
    const hidden: Konva.Node[] = [];
    stage.find(".studio-guide").forEach((n) => hidden.push(n));
    stage.find("Transformer").forEach((n) => hidden.push(n));
    hidden.forEach((n) => n.visible(false));
    stage.getLayers().forEach((l) => l.draw());
    try {
      return stage.toDataURL({
        x: 0,
        y: 0,
        width: CANVAS_W,
        height: CANVAS_H,
        pixelRatio: (CR80_W / CANVAS_W) * pixelRatioFactor,
        mimeType: "image/png",
      });
    } finally {
      hidden.forEach((n) => n.visible(true));
      stage.scale({ x: oldScale, y: oldScale });
      stage.position(oldPos);
      stage.getLayers().forEach((l) => l.draw());
    }
  };

  const downloadDataUrl = (dataUrl: string, filename: string) => {
    const a = document.createElement("a");
    a.download = filename;
    a.href = dataUrl;
    a.click();
  };

  const exportPNG = () => {
    if (frontStageRef.current) {
      downloadDataUrl(exportStageDataUrl(frontStageRef.current), "card-studio-front-CR80.png");
    }
    if (sideHasPrintableContent(doc.back) && backStageRef.current) {
      const backUrl = exportStageDataUrl(backStageRef.current);
      setTimeout(() => downloadDataUrl(backUrl, "card-studio-back-CR80.png"), 150);
    }
  };

  const openPreview = () => {
    if (!frontStageRef.current) return;
    const front = exportStageDataUrl(frontStageRef.current);
    const back = sideHasPrintableContent(doc.back) && backStageRef.current ? exportStageDataUrl(backStageRef.current) : null;
    setPreview({ front, back });
  };

  // ── Print readiness ──────────────────────────────────────────────────────────

  const buildChecks = (): PrintCheck[] => {
    const checks: PrintCheck[] = [];
    const front = doc.front;

    checks.push(
      front.elements.length > 0
        ? { label: "Front has content", level: "ok", detail: "Your front design is not empty." }
        : { label: "Front is empty", level: "fail", detail: "Add at least one element to the front." },
    );

    // Safe area: raster/qr/sticker boxes inside the safe inset.
    const outside = doc.front.elements.concat(doc.back.elements).some((el) => {
      if (el.hidden) return false;
      let w = 0;
      let h = 0;
      if (el.kind === "image" || el.kind === "sticker") {
        w = el.width;
        h = el.height;
      } else if (el.kind === "qr") {
        w = el.size;
        h = el.size;
      } else {
        return false;
      }
      return el.x < SAFE_INSET || el.y < SAFE_INSET || el.x + w > CANVAS_W - SAFE_INSET || el.y + h > CANVAS_H - SAFE_INSET;
    });
    checks.push(
      outside
        ? { label: "Some elements near the edge", level: "warn", detail: "Keep important content inside the red safe area." }
        : { label: "Content within safe area", level: "ok", detail: "Nothing critical is too close to the trim edge." },
    );

    // Image resolution.
    const lowRes = doc.front.elements
      .concat(doc.back.elements)
      .filter((el): el is ImageEl => el.kind === "image" && !!el.naturalWidth)
      .map((el) => calcImageDpi(el.naturalWidth!, el.width));
    const worst = lowRes.length ? Math.min(...lowRes) : Infinity;
    if (lowRes.length === 0) {
      checks.push({ label: "No raster resolution issues", level: "ok", detail: "No uploaded photos to check." });
    } else if (worst >= MIN_PRINT_DPI) {
      checks.push({ label: "Image resolution is good", level: "ok", detail: `Lowest is ~${worst} DPI.` });
    } else {
      checks.push({ label: "Low-resolution image", level: "warn", detail: `Lowest is ~${worst} DPI (recommended ${MIN_PRINT_DPI}+).` });
    }

    checks.push(
      sideHasPrintableContent(doc.back)
        ? { label: "Back design included", level: "ok", detail: "Both sides will be sent." }
        : { label: "Back is blank", level: "ok", detail: "Only the front will be printed." },
    );

    return checks;
  };

  const runPrintCheck = () => setPrintCheck(buildChecks());

  // ── Send to production ───────────────────────────────────────────────────────

  const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => (await fetch(dataUrl)).blob();

  const sendToProduction = async () => {
    if (!token) return;
    setSending(true);
    try {
      const frontStage = frontStageRef.current!;
      const frontDataUrl = exportStageDataUrl(frontStage);
      const frontBlob = await dataUrlToBlob(frontDataUrl);
      const frontForm = new FormData();
      frontForm.append("file", frontBlob, "card-front.png");
      frontForm.append("side", "front");
      const frontRes = await fetch(`${API}/shop/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: frontForm,
      });
      if (!frontRes.ok) throw new Error("Front upload failed");
      const { fileId: frontFileId } = (await frontRes.json()) as { fileId: string };

      let backFileId: string | null = null;
      let backDataUrl: string | null = null;
      if (sideHasPrintableContent(doc.back) && backStageRef.current) {
        backDataUrl = exportStageDataUrl(backStageRef.current);
        const backBlob = await dataUrlToBlob(backDataUrl);
        const backForm = new FormData();
        backForm.append("file", backBlob, "card-back.png");
        backForm.append("side", "back");
        const backRes = await fetch(`${API}/shop/upload`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: backForm,
        });
        if (backRes.ok) {
          const { fileId } = (await backRes.json()) as { fileId: string };
          backFileId = fileId;
        }
      }

      const stickerIds = doc.front.elements
        .filter((el): el is StickerEl => el.kind === "sticker")
        .map((el) => el.stickerId);

      toast({ title: "Design uploaded!", description: "Loading your card in the shop..." });
      navigate("/business/shop", {
        state: {
          studioFileId: frontFileId,
          studioPreviewUrl: frontDataUrl,
          ...(backFileId ? { studioBackFileId: backFileId } : {}),
          ...(backDataUrl ? { studioBackPreviewUrl: backDataUrl } : {}),
          studioStickerIds: stickerIds,
        },
      });
    } catch (err) {
      toast({
        title: "Failed to send to production",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  // ── Drag and drop image ───────────────────────────────────────────────────────

  const handleContainerDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleImageFile(file);
  };

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (selectedId) duplicateById(selectedId);
        return;
      }
      if (mod && e.key.toLowerCase() === "c") {
        if (selectedEl) clipboardRef.current = selectedEl;
        return;
      }
      if (mod && e.key.toLowerCase() === "v") {
        const c = clipboardRef.current;
        if (c) {
          e.preventDefault();
          addElement({ ...c, id: uid(), x: c.x + 24, y: c.y + 24 } as StudioEl);
        }
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelected();
        return;
      }
      if (e.key === "Escape") {
        setSelectedId(null);
        return;
      }
      if (e.key.startsWith("Arrow") && selectedEl) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        let dx = 0;
        let dy = 0;
        if (e.key === "ArrowLeft") dx = -step;
        if (e.key === "ArrowRight") dx = step;
        if (e.key === "ArrowUp") dy = -step;
        if (e.key === "ArrowDown") dy = step;
        updateElement(selectedEl.id, { x: selectedEl.x + dx, y: selectedEl.y + dy }, "nudge");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId, selectedEl, undo, redo, duplicateById, addElement, deleteSelected, updateElement]);

  // ── Transformer attach ────────────────────────────────────────────────────────

  const stageProps = {
    width: CANVAS_W,
    height: CANVAS_H,
    scaleX: zoom,
    scaleY: zoom,
    x: stagePos.x,
    y: stagePos.y,
    draggable: true,
    onWheel: handleWheel,
    style: { cursor: stageDragging ? "grabbing" : "grab" } as React.CSSProperties,
  };

  useEffect(() => {
    const tr = activeSide === "front" ? frontTrRef.current : backTrRef.current;
    const stage = activeSide === "front" ? frontStageRef.current : backStageRef.current;
    if (!tr || !stage) return;
    const sel = doc[activeSide].elements.find((e) => e.id === selectedId);
    const node = selectedId && sel && !sel.locked && !sel.hidden ? stage.findOne("#" + selectedId) : null;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selectedId, activeSide, trTick, doc]);

  // ── Selected image DPI ──────────────────────────────────────────────────────────

  const selectedImageDpi =
    selectedEl && selectedEl.kind === "image" && selectedEl.naturalWidth
      ? calcImageDpi(selectedEl.naturalWidth, selectedEl.width)
      : null;

  // ── Render a stage for a side ─────────────────────────────────────────────────

  const renderSide = (sideName: Side, stageRef: React.RefObject<Konva.Stage | null>, trRef: React.RefObject<Konva.Transformer | null>) => {
    const sd = doc[sideName];
    const grad = gradientPoints(sd.bgGradient.angle);
    const other = sideName === "front" ? backStageRef : frontStageRef;
    return (
      <Stage
        ref={stageRef}
        {...stageProps}
        onDragStart={(e) => { if (e.target === e.target.getStage()) setStageDragging(true); }}
        onDragEnd={(e) => {
          setStageDragging(false);
          if (e.target === e.target.getStage()) {
            const pos = { x: e.target.x(), y: e.target.y() };
            other.current?.position(pos);
            setStagePos(pos);
          }
        }}
        onClick={(e) => { if (e.target === e.target.getStage()) setSelectedId(null); }}
        onTap={(e) => { if (e.target === e.target.getStage()) setSelectedId(null); }}
      >
        <Layer>
          <Rect
            x={0}
            y={0}
            width={CANVAS_W}
            height={CANVAS_H}
            cornerRadius={CORNER_R}
            fill={sd.bgType === "gradient" ? undefined : sd.bgColor}
            fillLinearGradientStartPoint={sd.bgType === "gradient" ? grad.start : undefined}
            fillLinearGradientEndPoint={sd.bgType === "gradient" ? grad.end : undefined}
            fillLinearGradientColorStops={sd.bgType === "gradient" ? [0, sd.bgGradient.from, 1, sd.bgGradient.to] : undefined}
            onClick={() => setSelectedId(null)}
            onTap={() => setSelectedId(null)}
          />
          <Group clipFunc={clipCard}>
            {sd.bgType === "image" && sd.bgImage && <BgImageNode src={sd.bgImage} />}
            {sd.elements.map((el) => {
              const common = {
                onSelect: () => setSelectedId(el.id),
                onChange: (attrs: Partial<StudioEl>) => updateElement(el.id, attrs),
                onDragMove: handleDragMove,
                onDragEnd: clearGuides,
              };
              if (el.kind === "image" || el.kind === "sticker") {
                return <RasterNode key={el.id} el={el as ImageEl | StickerEl} {...common} onReady={() => setTrTick((t) => t + 1)} />;
              }
              if (el.kind === "text") {
                return (
                  <TextNodeView
                    key={el.id}
                    el={el as TextEl}
                    {...common}
                    onEdit={() => setTextDialog({ mode: "edit", editId: el.id, initial: (el as TextEl).text })}
                  />
                );
              }
              if (el.kind === "qr") {
                return <QrNode key={el.id} el={el as QrEl} {...common} onReady={() => setTrTick((t) => t + 1)} />;
              }
              if (el.kind === "shape") {
                return <ShapeNode key={el.id} el={el as ShapeEl} {...common} />;
              }
              return null;
            })}
          </Group>

          {sideName === activeSide && (
            <>
              <Rect name="studio-guide" listening={false} x={0} y={0} width={CANVAS_W} height={CANVAS_H} cornerRadius={CORNER_R} stroke="#ffffff" strokeWidth={2} />
              <Rect name="studio-guide" listening={false} x={SAFE_INSET} y={SAFE_INSET} width={CANVAS_W - SAFE_INSET * 2} height={CANVAS_H - SAFE_INSET * 2} cornerRadius={Math.max(CORNER_R - SAFE_INSET, 0)} stroke="#ef4444" strokeWidth={2} dash={[10, 8]} />
              {snapGuides.v.map((x, i) => (
                <Line key={"v" + i} name="studio-guide" listening={false} points={[x, 0, x, CANVAS_H]} stroke="#22d3ee" strokeWidth={1} dash={[4, 4]} />
              ))}
              {snapGuides.h.map((y, i) => (
                <Line key={"h" + i} name="studio-guide" listening={false} points={[0, y, CANVAS_W, y]} stroke="#22d3ee" strokeWidth={1} dash={[4, 4]} />
              ))}
            </>
          )}

          <Transformer
            ref={trRef}
            enabledAnchors={
              selectedEl?.kind === "shape" && selectedEl.shape === "line"
                ? ["middle-left", "middle-right"]
                : ["top-left", "top-right", "bottom-left", "bottom-right"]
            }
            boundBoxFunc={(oldBox, newBox) => {
              const isLine = selectedEl?.kind === "shape" && selectedEl.shape === "line";
              if (isLine) return newBox.width < 20 ? oldBox : newBox;
              return newBox.width < 20 || newBox.height < 20 ? oldBox : newBox;
            }}
          />
        </Layer>
      </Stage>
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <Layout active="business">
      <div className="flex flex-col h-[calc(100vh-3.5rem)] bg-zinc-950 select-none overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-zinc-900 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors text-sm">
              <ArrowLeft size={16} />
              Back
            </button>
            <div className="w-px h-4 bg-zinc-700" />
            <span className="text-white font-semibold text-sm">Card Studio</span>
            <div className="hidden md:flex items-center gap-1 ml-2">
              <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl/Cmd+Z)" className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
                <Undo2 size={15} />
              </button>
              <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl/Cmd+Shift+Z)" className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
                <Redo2 size={15} />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowHelp(true)} title="Help" className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
              <HelpCircle size={16} />
            </button>
            <button onClick={openDrafts} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition-colors text-xs font-medium">
              <FolderOpen size={13} />
              <span className="hidden sm:inline">Drafts</span>
            </button>
            <button onClick={openPreview} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition-colors text-xs font-medium">
              <Eye size={13} />
              Preview
            </button>
            <button onClick={runPrintCheck} disabled={sending} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity text-xs font-medium disabled:opacity-60">
              <Rocket size={13} />
              {sending ? "Uploading..." : "Send to production"}
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left toolbar */}
          <div className="w-14 bg-zinc-900 border-r border-zinc-800 flex flex-col items-center py-3 gap-1 shrink-0">
            <div className="md:hidden flex flex-col items-center gap-1">
              <ToolButton icon={<Undo2 size={16} />} label="Undo" disabled={!canUndo} onClick={undo} />
              <ToolButton icon={<Redo2 size={16} />} label="Redo" disabled={!canRedo} onClick={redo} />
              <div className="w-8 h-px bg-zinc-800 my-1" />
            </div>
            <ToolButton icon={<LayoutTemplate size={16} />} label="Templates" onClick={() => setShowTemplates(true)} />
            <label title="Add image">
              <ToolButton
                icon={<ImageIcon size={16} />}
                label="Image"
                extra={<input type="file" accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageFile(f); e.target.value = ""; }} />}
              />
            </label>
            <ToolButton icon={<Type size={16} />} label="Add text" onClick={() => setTextDialog({ mode: "add", initial: "Your Text" })} />
            <ToolButton icon={<QrCode size={16} />} label="Add QR code" onClick={() => setShowQrDialog(true)} />
            <div className="relative">
              <ToolButton icon={<Shapes size={16} />} label="Shapes" active={showShapeMenu} onClick={() => setShowShapeMenu((v) => !v)} />
              {showShapeMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowShapeMenu(false)} />
                  <div className="absolute left-12 top-0 z-20 bg-zinc-800 border border-zinc-700 rounded-xl p-1.5 shadow-xl grid grid-cols-2 gap-1 w-28">
                    <button onClick={() => addShape("rect")} title="Rectangle" className="aspect-square flex items-center justify-center rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors"><Square size={18} /></button>
                    <button onClick={() => addShape("ellipse")} title="Ellipse" className="aspect-square flex items-center justify-center rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors"><Circle size={18} /></button>
                    <button onClick={() => addShape("triangle")} title="Triangle" className="aspect-square flex items-center justify-center rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors"><Triangle size={18} /></button>
                    <button onClick={() => addShape("line")} title="Line" className="aspect-square flex items-center justify-center rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors"><Minus size={18} /></button>
                  </div>
                </>
              )}
            </div>
            <ToolButton icon={<Sticker size={16} />} label="Stickers" active={showStickerPanel} onClick={() => setShowStickerPanel((v) => !v)} />

            <div className="w-8 h-px bg-zinc-800 my-1" />

            <ToolButton icon={<LayersIcon size={16} />} label="Layers" active={showLayers} onClick={() => setShowLayers((v) => !v)} />
            <ToolButton icon={<Sparkles size={16} />} label="Brand kit" onClick={() => setShowBrandKit(true)} />
          </div>

          {/* Layers panel */}
          {showLayers && (
            <LayersPanel
              elements={elements}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onBringForward={(id) => moveZ(id, 1)}
              onSendBackward={(id) => moveZ(id, -1)}
              onToggleLock={(id) => { const el = elements.find((e) => e.id === id); if (el) updateElement(id, { locked: !el.locked }); }}
              onToggleHidden={(id) => { const el = elements.find((e) => e.id === id); if (el) updateElement(id, { hidden: !el.hidden }); }}
              onRename={(id, name) => updateElement(id, { name })}
              onDelete={deleteById}
              onClose={() => setShowLayers(false)}
            />
          )}

          {/* Canvas area */}
          <div ref={containerRef} className="flex-1 flex flex-col overflow-hidden bg-zinc-950" onDrop={handleContainerDrop} onDragOver={(e) => e.preventDefault()}>
            {/* Front / Back toggle */}
            <div className="flex items-center justify-center gap-2 py-2 bg-zinc-900 border-b border-zinc-800 shrink-0">
              <div className="flex">
                <button onClick={() => switchSide("front")} className={`px-5 py-1 rounded-l-lg text-xs font-semibold border transition-colors ${activeSide === "front" ? "bg-primary text-primary-foreground border-primary" : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white hover:bg-zinc-700"}`}>
                  Front
                </button>
                <button onClick={() => switchSide("back")} className={`px-5 py-1 rounded-r-lg text-xs font-semibold border border-l-0 transition-colors ${activeSide === "back" ? "bg-primary text-primary-foreground border-primary" : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white hover:bg-zinc-700"}`}>
                  Back
                  {sideHasPrintableContent(doc.back) && <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-current opacity-70 align-middle" />}
                </button>
              </div>
              <button onClick={copySideToOther} title={`Copy ${activeSide} to the other side`} className="text-[11px] text-zinc-400 hover:text-white px-2 py-1 rounded-lg hover:bg-zinc-800 transition-colors">
                Copy {activeSide} -&gt; {activeSide === "front" ? "back" : "front"}
              </button>
            </div>

            {/* Canvas viewport */}
            <div className="flex-1 overflow-hidden relative">
              {elements.length === 0 && side.bgType !== "image" && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                  <div className="text-center text-zinc-600">
                    <ImageIcon size={32} className="mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Drop an image, pick a template, or use the toolbar</p>
                  </div>
                </div>
              )}

              <div className="absolute inset-0 flex items-center justify-center" style={{ display: activeSide === "front" ? "flex" : "none" }}>
                {renderSide("front", frontStageRef, frontTrRef)}
              </div>
              <div className="absolute inset-0 flex items-center justify-center" style={{ display: activeSide === "back" ? "flex" : "none" }}>
                {renderSide("back", backStageRef, backTrRef)}
              </div>
            </div>

            {/* Zoom controls */}
            <div className="flex items-center justify-center gap-3 py-2 bg-zinc-900 border-t border-zinc-800 shrink-0">
              <button onClick={() => zoomTo(zoom / 1.25)} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
                <ZoomOut size={14} />
              </button>
              <button onClick={fitCanvas} className="px-2 py-1 rounded text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors min-w-[3.5rem] text-center">
                {Math.round(zoom * 100)}%
              </button>
              <button onClick={() => zoomTo(zoom * 1.25)} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
                <ZoomIn size={14} />
              </button>
            </div>
          </div>

          {/* Mobile inspector toggle (floating button) */}
          <button
            onClick={() => setShowInspectorMobile((v) => !v)}
            className="md:hidden absolute right-3 bottom-16 z-40 flex items-center gap-1.5 px-3 py-2 rounded-full bg-primary text-primary-foreground shadow-lg text-xs font-medium"
          >
            {showInspectorMobile ? <X size={15} /> : <SlidersHorizontal size={15} />}
            {showInspectorMobile ? "Close" : "Edit"}
          </button>

          {/* Backdrop for mobile drawer */}
          {showInspectorMobile && (
            <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setShowInspectorMobile(false)} />
          )}

          {/* Right inspector - static panel on desktop, slide-in drawer on mobile */}
          <div
            className={`${showInspectorMobile ? "translate-x-0" : "translate-x-full"} fixed inset-y-0 right-0 z-50 transition-transform duration-200 md:static md:translate-x-0 md:z-auto md:transition-none`}
          >
            <Inspector
              side={side}
              selectedEl={selectedEl}
              brandColors={brandKit.colors}
              imageDpi={selectedImageDpi}
              onPatchSide={patchSide}
              onUpdateEl={updateElement}
              onUploadBgImage={handleBgImageFile}
              onAlign={alignSelected}
              onDuplicate={() => selectedId && duplicateById(selectedId)}
              onDelete={deleteSelected}
              onToggleLock={() => selectedEl && updateElement(selectedEl.id, { locked: !selectedEl.locked })}
              onToggleHidden={() => selectedEl && updateElement(selectedEl.id, { hidden: !selectedEl.hidden })}
              onEditText={() => selectedEl?.kind === "text" && setTextDialog({ mode: "edit", editId: selectedEl.id, initial: selectedEl.text })}
            />
          </div>

          {/* Sticker panel */}
          {showStickerPanel && (
            <StickerPanel stickers={stickers} onAdd={addSticker} onClose={() => setShowStickerPanel(false)} token={token!} onRefresh={loadStickers} />
          )}
        </div>
      </div>

      {/* Dialogs / modals */}
      {textDialog && (
        <TextDialog
          initial={textDialog.initial}
          title={textDialog.mode === "edit" ? "Edit text" : "Add text"}
          onConfirm={confirmText}
          onClose={() => setTextDialog(null)}
        />
      )}
      {showQrDialog && <QrDialog onConfirm={confirmQr} onClose={() => setShowQrDialog(false)} />}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      {showTemplates && <TemplatesModal onApply={applyTemplate} onClose={() => setShowTemplates(false)} />}
      {showBrandKit && <BrandKitModal kit={brandKit} onChange={updateBrandKit} onAddLogo={addLogoFromKit} onClose={() => setShowBrandKit(false)} />}
      {showDrafts && (
        <DraftsModal drafts={drafts} onLoad={loadDraft} onDelete={removeDraft} onSaveNew={saveCurrentDraft} onClose={() => setShowDrafts(false)} />
      )}
      {preview && (
        <PreviewModal
          frontUrl={preview.front}
          backUrl={preview.back}
          onClose={() => setPreview(null)}
          onExport={exportPNG}
          onSend={() => { setPreview(null); runPrintCheck(); }}
          sending={sending}
        />
      )}
      {printCheck && (
        <PrintCheckModal
          checks={printCheck}
          sending={sending}
          onClose={() => setPrintCheck(null)}
          onConfirm={() => { setPrintCheck(null); sendToProduction(); }}
        />
      )}
    </Layout>
  );
}

// ── Tool button ───────────────────────────────────────────────────────────────

function ToolButton({
  icon,
  label,
  onClick,
  active,
  disabled,
  danger,
  extra,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
  extra?: React.ReactNode;
}) {
  return (
    <div className="relative" title={label}>
      <button
        onClick={onClick}
        disabled={disabled}
        className={`relative w-10 h-10 flex items-center justify-center rounded-lg transition-colors
          ${active ? "bg-primary text-primary-foreground" : ""}
          ${!active && !danger ? "text-zinc-400 hover:text-white hover:bg-zinc-800" : ""}
          ${danger && !disabled ? "text-red-400 hover:text-red-300 hover:bg-red-900/30" : ""}
          ${disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}
        `}
      >
        {icon}
        {extra}
      </button>
    </div>
  );
}
