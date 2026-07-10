import type Konva from "konva";

// ── Canvas constants ──────────────────────────────────────────────────────────

export const CANVAS_W = 810;
export const CANVAS_H = 510;
// CR80 at 300dpi: 85.6mm / 25.4 * 300 = 1011, 53.98mm / 25.4 * 300 = 638
export const CR80_W = 1011;
export const CR80_H = 638;
// Physical CR80 dimensions in mm (used for DPI / print-readiness math).
export const CR80_MM_W = 85.6;
export const CR80_MM_H = 53.98;
// Real CR80 corner radius is 3.18mm (1/8"); keep it proportional to the canvas.
export const CORNER_R = Math.round((CANVAS_W * 3.18) / 85.6);
// Safe-area inset (~2mm from the trim edge) drawn as an editing guide only.
export const SAFE_INSET = Math.round((CANVAS_W * 2) / 85.6);
// Minimum acceptable print resolution for raster artwork.
export const MIN_PRINT_DPI = 250;

// Traces the rounded CR80 card outline. Used to clip artwork to the card shape so
// uploaded images never spill past the rounded corners (on screen and in exports).
export const clipCard = (ctx: Konva.Context) => {
  const r = CORNER_R;
  const w = CANVAS_W;
  const h = CANVAS_H;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(w, 0, w, h, r);
  ctx.arcTo(w, h, 0, h, r);
  ctx.arcTo(0, h, 0, 0, r);
  ctx.arcTo(0, 0, w, 0, r);
  ctx.closePath();
};

// ── Element + document types ──────────────────────────────────────────────────

export type ElKind = "image" | "text" | "sticker" | "qr" | "shape";

export type ShapeType = "rect" | "ellipse" | "triangle" | "line";

export interface BaseEl {
  id: string;
  kind: ElKind;
  x: number;
  y: number;
  rotation: number;
  name?: string;
  locked?: boolean;
  hidden?: boolean;
  opacity?: number;
}

export interface ImageEl extends BaseEl {
  kind: "image";
  src: string;
  width: number;
  height: number;
  naturalWidth?: number;
  naturalHeight?: number;
}

export interface TextEl extends BaseEl {
  kind: "text";
  text: string;
  fontSize: number;
  fill: string;
  fontStyle: string;
  fontFamily: string;
  align: "left" | "center" | "right";
  letterSpacing: number;
  shadow: boolean;
  scaleX: number;
  scaleY: number;
}

export interface StickerEl extends BaseEl {
  kind: "sticker";
  stickerId: string;
  src: string;
  width: number;
  height: number;
}

export interface QrEl extends BaseEl {
  kind: "qr";
  data: string;
  size: number;
  fg: string;
  bg: string;
}

export interface ShapeEl extends BaseEl {
  kind: "shape";
  shape: ShapeType;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  cornerRadius: number;
}

export type StudioEl = ImageEl | TextEl | StickerEl | QrEl | ShapeEl;

export type BgType = "solid" | "gradient" | "image";

export interface SideData {
  elements: StudioEl[];
  bgColor: string;
  bgType: BgType;
  bgGradient: { from: string; to: string; angle: number };
  bgImage: string | null;
}

export type Side = "front" | "back";

export interface StudioDoc {
  front: SideData;
  back: SideData;
}

export function emptySide(bgColor = "#1a1a2e"): SideData {
  return {
    elements: [],
    bgColor,
    bgType: "solid",
    bgGradient: { from: "#1a1a2e", to: "#16213e", angle: 135 },
    bgImage: null,
  };
}

export function emptyDoc(): StudioDoc {
  return { front: emptySide(), back: emptySide() };
}

// A side is considered to have printable content if it has visible elements or a
// non-default background (gradient, an uploaded image, or a customized solid color).
export function sideHasPrintableContent(side: SideData): boolean {
  if (side.elements.some((el) => !el.hidden)) return true;
  if (side.bgType === "gradient") return true;
  if (side.bgType === "image" && side.bgImage) return true;
  if (side.bgType === "solid" && side.bgColor.toLowerCase() !== "#1a1a2e") return true;
  return false;
}

export function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Effective print DPI for a raster element given its natural pixel size and the
// on-canvas display width (canvas units map 1:1 to the CR80 export at CR80_W).
export function imageDpi(naturalWidth: number, displayWidthCanvas: number): number {
  const printWidthInches = (displayWidthCanvas / CANVAS_W) * (CR80_MM_W / 25.4);
  if (printWidthInches <= 0) return Infinity;
  return Math.round(naturalWidth / printWidthInches);
}
