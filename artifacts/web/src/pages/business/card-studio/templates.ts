import { CANVAS_W, CANVAS_H, uid, type StudioDoc, type SideData, type TextEl } from "./types";

function side(partial: Partial<SideData>): SideData {
  return {
    elements: [],
    bgColor: "#1a1a2e",
    bgType: "solid",
    bgGradient: { from: "#1a1a2e", to: "#16213e", angle: 135 },
    bgImage: null,
    ...partial,
  };
}

function text(t: Partial<TextEl> & { text: string; y: number }): TextEl {
  return {
    id: uid(),
    kind: "text",
    x: t.x ?? CANVAS_W / 2 - 200,
    rotation: 0,
    fontSize: 40,
    fill: "#ffffff",
    fontStyle: "bold",
    fontFamily: "Arial",
    align: "center",
    letterSpacing: 0,
    shadow: false,
    scaleX: 1,
    scaleY: 1,
    width: 400,
    ...t,
  } as TextEl;
}

export interface CardTemplate {
  id: string;
  name: string;
  doc: StudioDoc;
}

// Starter designs. Each produces a fresh document (new element ids on every call
// is not needed because templates are static, but ids are unique per definition).
export const TEMPLATES: CardTemplate[] = [
  {
    id: "midnight",
    name: "Midnight",
    doc: {
      front: side({
        bgType: "gradient",
        bgGradient: { from: "#0f172a", to: "#1e293b", angle: 135 },
        elements: [
          text({ text: "YOUR NAME", y: 200, fontSize: 52, letterSpacing: 4 }),
          text({ text: "Member", y: 270, fontSize: 24, fill: "#94a3b8", fontStyle: "normal", letterSpacing: 2 }),
        ],
      }),
      back: side({ bgType: "gradient", bgGradient: { from: "#0f172a", to: "#1e293b", angle: 135 } }),
    },
  },
  {
    id: "bitcoin",
    name: "Bitcoin Orange",
    doc: {
      front: side({
        bgType: "gradient",
        bgGradient: { from: "#f7931a", to: "#b45309", angle: 120 },
        elements: [
          text({ text: "bitPOS", y: 190, fontSize: 64, fill: "#ffffff", letterSpacing: 1 }),
          text({ text: "Lightning Card", y: 280, fontSize: 26, fill: "#fff7ed", fontStyle: "normal", letterSpacing: 3 }),
        ],
      }),
      back: side({ bgColor: "#1a1a2e" }),
    },
  },
  {
    id: "mono",
    name: "Mono",
    doc: {
      front: side({
        bgColor: "#0a0a0a",
        elements: [
          text({ text: "STAY HUMBLE", y: 180, fontSize: 44, fill: "#ffffff", fontFamily: "Courier New", letterSpacing: 2 }),
          text({ text: "STACK SATS", y: 250, fontSize: 44, fill: "#f7931a", fontFamily: "Courier New", letterSpacing: 2 }),
        ],
      }),
      back: side({ bgColor: "#0a0a0a" }),
    },
  },
  {
    id: "clean",
    name: "Clean Light",
    doc: {
      front: side({
        bgColor: "#f8fafc",
        elements: [
          text({ text: "Company", y: 210, fontSize: 50, fill: "#0f172a" }),
          text({ text: "www.example.com", y: 290, fontSize: 22, fill: "#64748b", fontStyle: "normal", letterSpacing: 1 }),
        ],
      }),
      back: side({ bgColor: "#0f172a" }),
    },
  },
  {
    id: "neon",
    name: "Neon",
    doc: {
      front: side({
        bgType: "gradient",
        bgGradient: { from: "#7c3aed", to: "#db2777", angle: 135 },
        elements: [
          text({ text: "VIP ACCESS", y: 200, fontSize: 56, fill: "#ffffff", letterSpacing: 6, shadow: true }),
          text({ text: "001", y: 280, fontSize: 30, fill: "#fce7f3", letterSpacing: 8 }),
        ],
      }),
      back: side({ bgType: "gradient", bgGradient: { from: "#7c3aed", to: "#db2777", angle: 135 } }),
    },
  },
  {
    id: "emerald",
    name: "Emerald",
    doc: {
      front: side({
        bgType: "gradient",
        bgGradient: { from: "#064e3b", to: "#065f46", angle: 120 },
        elements: [
          text({ text: "Gift Card", y: 190, fontSize: 54, fill: "#ecfdf5" }),
          text({ text: "$25", y: 270, fontSize: 64, fill: "#6ee7b7", letterSpacing: 1 }),
        ],
      }),
      back: side({ bgColor: "#064e3b" }),
    },
  },
];
