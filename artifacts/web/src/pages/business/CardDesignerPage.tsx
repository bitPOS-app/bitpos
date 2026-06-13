import { useRef, useEffect, useState, useCallback } from "react";
import { Download, ImageDown, Zap } from "lucide-react";
import Layout from "@/components/Layout";

// CR80 standard card dimensions (mm)
const CARD_W_MM  = 85.6;
const CARD_H_MM  = 53.98;
const CORNER_R_MM = 3.18;

// SVG inner path of the user-supplied lightning bolt (415x415 viewBox).
const BOLT_SVG_D =
  "M219.429,163.223c-1.356,2.32,-1.368,5.187,-0.03,7.518" +
  "c1.337,2.331,3.818,3.768,6.505,3.768h55.111" +
  "L118.189,369.107l60.754,-162.664" +
  "c0.86,-2.302,0.537,-4.88,-0.865,-6.9" +
  "c-1.401,-2.019,-3.703,-3.224,-6.161,-3.224h-63.173" +
  "L169.939,15h136.145L219.429,163.223Z";
const BOLT_SVG_CX = 207.414;
const BOLT_SVG_CY = 192.054;
const BOLT_SVG_REF = 207.5;

// 7-vertex CW polygon (Y-down) for guilloche offset contours.
// CW winding required so offsetPoly's (-dy,dx) normals point outward.
const BOLT: Pt[] = [
  { x:  0.476, y: -0.853 },
  { x: -0.181, y: -0.853 },
  { x: -0.476, y:  0.021 },
  { x: -0.171, y:  0.021 },
  { x: -0.430, y:  0.853 },
  { x:  0.355, y: -0.085 },
  { x:  0.058, y: -0.139 },
];

type Pt = { x: number; y: number };

function lineIntersect(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const dx1 = b.x - a.x, dy1 = b.y - a.y;
  const dx2 = d.x - c.x, dy2 = d.y - c.y;
  const den = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * dy2 - (c.y - a.y) * dx2) / den;
  return { x: a.x + t * dx1, y: a.y + t * dy1 };
}

function lineSegIntersect(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const dx1 = b.x - a.x, dy1 = b.y - a.y;
  const dx2 = d.x - c.x, dy2 = d.y - c.y;
  const den = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * dy2 - (c.y - a.y) * dx2) / den;
  const u = ((c.x - a.x) * dy1 - (c.y - a.y) * dx1) / den;
  if (t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6)
    return { x: a.x + t * dx1, y: a.y + t * dy1 };
  return null;
}

function signedArea(poly: Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a * 0.5;
}

function removeLoops(poly: Pt[]): Pt[] {
  let result = poly.slice();
  let changed = true;
  while (changed) {
    changed = false;
    const m = result.length;
    outer: for (let i = 0; i < m && !changed; i++) {
      const a = result[i], b = result[(i + 1) % m];
      for (let j = i + 2; j < m; j++) {
        if (j === m - 1 && i === 0) continue;
        const c = result[j], d = result[(j + 1) % m];
        const pt = lineSegIntersect(a, b, c, d);
        if (pt) {
          const optA = [...result.slice(0, i + 1), pt, ...result.slice(j + 1)];
          const optB = [...result.slice(i + 1, j + 1), pt];
          result = Math.abs(signedArea(optA)) >= Math.abs(signedArea(optB)) ? optA : optB;
          changed = true;
          break outer;
        }
      }
    }
  }
  return result;
}

function offsetPoly(poly: Pt[], dist: number): Pt[] {
  const n = poly.length;
  const edges = poly.map((p, i) => {
    const q = poly[(i + 1) % n];
    const dx = q.x - p.x, dy = q.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * dist;
    const ny = ( dx / len) * dist;
    return {
      a: { x: p.x + nx, y: p.y + ny },
      b: { x: q.x + nx, y: q.y + ny },
    };
  });
  return edges.map((e2, i) => {
    const e1 = edges[(i - 1 + n) % n];
    return lineIntersect(e1.a, e1.b, e2.a, e2.b) ?? e2.a;
  });
}

function tracePoly(ctx: CanvasRenderingContext2D, poly: Pt[]) {
  if (!poly.length) return;
  ctx.beginPath();
  ctx.moveTo(poly[0].x, poly[0].y);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
  ctx.closePath();
}

function traceSmooth(ctx: CanvasRenderingContext2D, poly: Pt[], tension: number) {
  const n = poly.length;
  if (n < 2) return;
  ctx.beginPath();
  ctx.moveTo(poly[0].x, poly[0].y);
  for (let i = 0; i < n; i++) {
    const p0 = poly[(i - 1 + n) % n];
    const p1 = poly[i];
    const p2 = poly[(i + 1) % n];
    const p3 = poly[(i + 2) % n];
    const cp1x = p1.x + (p2.x - p0.x) * tension / 6;
    const cp1y = p1.y + (p2.y - p0.y) * tension / 6;
    const cp2x = p2.x - (p3.x - p1.x) * tension / 6;
    const cp2y = p2.y - (p3.y - p1.y) * tension / 6;
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
  ctx.closePath();
}

function smoothToD(poly: Pt[], tension: number): string {
  const n = poly.length;
  if (!n) return "";
  const f = (v: number) => v.toFixed(4);
  let d = `M${f(poly[0].x)},${f(poly[0].y)}`;
  for (let i = 0; i < n; i++) {
    const p0 = poly[(i - 1 + n) % n];
    const p1 = poly[i];
    const p2 = poly[(i + 1) % n];
    const p3 = poly[(i + 2) % n];
    const cp1x = p1.x + (p2.x - p0.x) * tension / 6;
    const cp1y = p1.y + (p2.y - p0.y) * tension / 6;
    const cp2x = p2.x - (p3.x - p1.x) * tension / 6;
    const cp2y = p2.y - (p3.y - p1.y) * tension / 6;
    d += `C${f(cp1x)},${f(cp1y)} ${f(cp2x)},${f(cp2y)} ${f(p2.x)},${f(p2.y)}`;
  }
  return d + "Z";
}

function polyToD(poly: Pt[]): string {
  if (!poly.length) return "";
  return (
    `M${poly[0].x.toFixed(4)},${poly[0].y.toFixed(4)}` +
    poly.slice(1).map(p => `L${p.x.toFixed(4)},${p.y.toFixed(4)}`).join("") +
    "Z"
  );
}

const PRESETS = [
  { label: "Phantom",  bg: "#0d0d0d", line: "#c8ff00", bolt: "#0d0d0d" },
  { label: "Silver",   bg: "#c8c8c8", line: "#1a1a1a", bolt: "#c8c8c8" },
  { label: "Gold",     bg: "#120e00", line: "#e8c84a", bolt: "#120e00" },
  { label: "Arctic",   bg: "#0a1628", line: "#38bdf8", bolt: "#0a1628" },
  { label: "Crimson",  bg: "#0f0000", line: "#ff4444", bolt: "#0f0000" },
  { label: "Paper",    bg: "#f5f0e8", line: "#2a2a2a", bolt: "#f5f0e8" },
];

const DISP_W = 856;
const DISP_H = Math.round(DISP_W / (CARD_W_MM / CARD_H_MM));
const PAD = 0.06;

// Draw the three QR finder-pattern corner squares
function drawQRFinder(ctx: CanvasRenderingContext2D, ox: number, oy: number, cs: number) {
  ctx.fillStyle = "#ff9900";
  ctx.fillRect(ox, oy, cs * 7, cs * 7);
  ctx.fillStyle = "#000000";
  ctx.fillRect(ox + cs, oy + cs, cs * 5, cs * 5);
  ctx.fillStyle = "#ff9900";
  ctx.fillRect(ox + cs * 2, oy + cs * 2, cs * 3, cs * 3);
}

export default function CardDesignerPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const logoRef   = useRef<HTMLImageElement | null>(null);

  // Shared between front and back
  const [bgColor,    setBgColor]    = useState(PRESETS[0].bg);
  const [lineColor,  setLineColor]  = useState(PRESETS[0].line);
  const [lineW,      setLineW]      = useState(1.0);

  // Front-only
  const [numLines,   setNumLines]   = useState(70);
  const [spacing,    setSpacing]    = useState(7);
  const [boltPct,    setBoltPct]    = useState(36);
  const [smoothness, setSmoothness] = useState(0);
  const [boltColor,  setBoltColor]  = useState(PRESETS[0].bolt);

  // Back-only
  const [backFocus,  setBackFocus]  = useState(0.46); // focal spread (0-1)
  const [backLines,  setBackLines]  = useState(55);   // rings per family
  const [backSpacing,setBackSpacing]= useState(8);    // ring pitch (px)

  // Side toggle
  const [side, setSide] = useState<'front' | 'back'>('front');

  const [logoLoaded, setLogoLoaded] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.src = "/app/boltcard.png";
    img.onload = () => { logoRef.current = img; setLogoLoaded(true); };
    img.onerror = () => { logoRef.current = null; setLogoLoaded(true); };
  }, []);

  // ── Front render ───────────────────────────────────────────────────────
  const renderFront = useCallback((
    ctx: CanvasRenderingContext2D, W: number, H: number, logo: HTMLImageElement | null,
  ) => {
    const cornerR  = (CORNER_R_MM / CARD_H_MM) * H;
    const cx = W / 2, cy = H / 2;
    const boltHalf = (boltPct / 100) * H * 0.5;
    const pad = H * PAD;

    const boltPx: Pt[] = BOLT.map(p => ({
      x: cx + p.x * boltHalf, y: cy + p.y * boltHalf,
    }));

    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, cornerR);
    ctx.fillStyle = bgColor;
    ctx.fill();
    ctx.clip();

    ctx.lineWidth   = lineW;
    ctx.strokeStyle = lineColor;
    for (let i = numLines; i >= 1; i--) {
      const off = removeLoops(offsetPoly(boltPx, i * spacing));
      traceSmooth(ctx, off, smoothness);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(boltHalf / BOLT_SVG_REF, boltHalf / BOLT_SVG_REF);
    ctx.translate(-BOLT_SVG_CX, -BOLT_SVG_CY);
    ctx.fillStyle = boltColor;
    ctx.fill(new Path2D(BOLT_SVG_D), "nonzero");
    ctx.restore();

    const fontSize = Math.round(H * 0.085);
    ctx.font = `900 ${fontSize}px system-ui, sans-serif`;
    ctx.textBaseline = "top";
    ctx.textAlign    = "left";
    ctx.shadowColor  = bgColor;
    ctx.shadowBlur   = fontSize * 0.4;
    ctx.fillStyle    = "#ffffff";
    ctx.fillText("bit", pad, pad);
    const bitW = ctx.measureText("bit").width;
    ctx.fillStyle = "#ff9900";
    ctx.fillText("POS", pad + bitW, pad);
    ctx.shadowBlur = 0;

    if (logo) {
      const logoH = H * 0.18;
      const logoW = (logo.naturalWidth / logo.naturalHeight) * logoH;
      ctx.globalAlpha = 0.90;
      ctx.drawImage(logo, W - pad - logoW, H - pad - logoH, logoW, logoH);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }, [numLines, spacing, boltPct, lineW, smoothness, bgColor, lineColor, boltColor]);

  // ── Back render ────────────────────────────────────────────────────────
  const renderBack = useCallback((
    ctx: CanvasRenderingContext2D, W: number, H: number,
  ) => {
    const cornerR = (CORNER_R_MM / CARD_H_MM) * H;
    const pad = H * PAD;

    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, cornerR);
    ctx.fillStyle = bgColor;
    ctx.fill();
    ctx.clip();

    // Two-center interference guilloche:
    // Two families of concentric circles from offset focal points.
    // Where they overlap the eye perceives moiré interference bands -
    // the same technique used on banknotes and passports.
    const halfD   = W * backFocus * 0.5;
    const f1x = W * 0.5 - halfD, f1y = H * 0.5;
    const f2x = W * 0.5 + halfD, f2y = H * 0.5;
    const maxR = Math.hypot(W, H);

    ctx.strokeStyle = lineColor;
    ctx.lineWidth   = lineW;

    for (let i = 1; i <= backLines; i++) {
      const r = i * backSpacing;
      if (r > maxR) break;
      ctx.beginPath(); ctx.arc(f1x, f1y, r, 0, 2 * Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.arc(f2x, f2y, r, 0, 2 * Math.PI); ctx.stroke();
    }

    // QR code placeholder (LNURL)
    const qrSize = H * 0.31;
    const qrX    = W - pad - qrSize;
    const qrY    = H * 0.40;
    const qrPad  = 5;
    ctx.fillStyle = "#000000";
    ctx.fillRect(qrX - qrPad, qrY - qrPad, qrSize + qrPad * 2, qrSize + qrPad * 2);
    const mods = 21;
    const cs   = qrSize / mods;
    // Three finder-pattern corners
    drawQRFinder(ctx, qrX,                       qrY,                        cs);
    drawQRFinder(ctx, qrX + (mods - 7) * cs,     qrY,                        cs);
    drawQRFinder(ctx, qrX,                        qrY + (mods - 7) * cs,     cs);
    // Timing pattern + pseudo-random data modules
    ctx.fillStyle = "#ff9900";
    for (let r = 0; r < mods; r++) {
      for (let c = 0; c < mods; c++) {
        const inFinderTL = r < 9 && c < 9;
        const inFinderTR = r < 9 && c >= mods - 8;
        const inFinderBL = r >= mods - 8 && c < 9;
        if (inFinderTL || inFinderTR || inFinderBL) continue;
        // Timing patterns (row 6 and col 6)
        if (r === 6 || c === 6) { if ((r + c) % 2 === 0) ctx.fillRect(qrX + c * cs, qrY + r * cs, cs, cs); continue; }
        // Data modules
        const hash = ((r * 37) ^ (c * 19) ^ (r + c * 3)) & 0xff;
        if (hash % 3 !== 0) ctx.fillRect(qrX + c * cs, qrY + r * cs, cs, cs);
      }
    }
    // Label below QR
    ctx.fillStyle    = lineColor;
    ctx.font         = `bold ${H * 0.022}px system-ui`;
    ctx.textAlign    = "center";
    ctx.textBaseline = "top";
    ctx.fillText("bitpos.app", qrX + qrSize / 2, qrY + qrSize + 5);

    // bitPOS bottom-left
    const fontSize = Math.round(H * 0.065);
    ctx.font         = `900 ${fontSize}px system-ui, sans-serif`;
    ctx.textBaseline = "bottom";
    ctx.textAlign    = "left";
    ctx.shadowColor  = bgColor;
    ctx.shadowBlur   = fontSize * 0.3;
    ctx.fillStyle    = "#ffffff";
    ctx.fillText("bit", pad, H - pad);
    const bW = ctx.measureText("bit").width;
    ctx.fillStyle = "#ff9900";
    ctx.fillText("POS", pad + bW, H - pad);
    ctx.shadowBlur = 0;

    // Website URL (center bottom)
    ctx.fillStyle    = "#ffffff";
    ctx.font         = `${H * 0.021}px system-ui`;
    ctx.textAlign    = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("bitpos.app  -  Lightning Network Payment Card", W / 2, H - pad * 0.4);

    ctx.restore();
  }, [bgColor, lineColor, lineW, backFocus, backLines, backSpacing]);

  // ── Canvas effect ──────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width  = DISP_W;
    canvas.height = DISP_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (side === 'front') renderFront(ctx, DISP_W, DISP_H, logoRef.current);
    else                  renderBack(ctx,  DISP_W, DISP_H);
  }, [side, renderFront, renderBack, logoLoaded]);

  // ── Exports ────────────────────────────────────────────────────────────
  const exportSVG = () => {
    if (side === 'back') {
      // Back: emit SVG with two-circle arc elements
      const W  = CARD_W_MM;
      const H  = CARD_H_MM;
      const halfD = W * backFocus * 0.5;
      const f1x = W / 2 - halfD, f1y = H / 2;
      const f2x = W / 2 + halfD, f2y = H / 2;
      const maxR = Math.hypot(W, H);
      const lw   = ((lineW * H) / DISP_H).toFixed(4);
      let circles = "";
      for (let i = 1; i <= backLines; i++) {
        const r = i * (backSpacing * H / DISP_H);
        if (r > maxR) break;
        circles += `  <circle cx="${f1x.toFixed(4)}" cy="${f1y.toFixed(4)}" r="${r.toFixed(4)}" fill="none" stroke="${lineColor}" stroke-width="${lw}"/>\n`;
        circles += `  <circle cx="${f2x.toFixed(4)}" cy="${f2y.toFixed(4)}" r="${r.toFixed(4)}" fill="none" stroke="${lineColor}" stroke-width="${lw}"/>\n`;
      }
      const stripeY = H * 0.055, stripeH = H * 0.235;
      const svg =
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<!-- bitPOS card back - CR80 ${CARD_W_MM}x${CARD_H_MM}mm -->\n` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm">\n` +
        `  <rect width="${W}" height="${H}" rx="${CORNER_R_MM}" ry="${CORNER_R_MM}" fill="${bgColor}"/>\n` +
        circles +
        `  <rect x="0" y="${stripeY.toFixed(4)}" width="${W}" height="${stripeH.toFixed(4)}" fill="#111111"/>\n` +
        `  <text x="${(W*PAD).toFixed(4)}" y="${(H-H*PAD*0.8).toFixed(4)}" font-family="system-ui,sans-serif" font-weight="900" font-size="${(H*0.065).toFixed(4)}" dominant-baseline="auto"><tspan fill="#ffffff">bit</tspan><tspan fill="#ff9900">POS</tspan></text>\n` +
        `</svg>`;
      const blob = new Blob([svg], { type: "image/svg+xml" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = "bitpos-card-back.svg"; a.click();
      URL.revokeObjectURL(url);
      return;
    }

    // Front SVG
    const W = CARD_W_MM, H = CARD_H_MM;
    const cx = W / 2, cy = H / 2;
    const pxToMm   = H / DISP_H;
    const boltHalf = (boltPct / 100) * H * 0.5;
    const spacingMm = spacing * pxToMm;
    const lineWMm   = (lineW * pxToMm).toFixed(4);
    const pad       = H * PAD;
    const fontSize  = (H * 0.085).toFixed(4);
    const boltMm: Pt[] = BOLT.map(p => ({ x: cx + p.x * boltHalf, y: cy + p.y * boltHalf }));
    let paths = "";
    for (let i = numLines; i >= 1; i--) {
      const off = removeLoops(offsetPoly(boltMm, i * spacingMm));
      paths += `  <path d="${smoothToD(off, smoothness)}" fill="none" stroke="${lineColor}" stroke-width="${lineWMm}"/>\n`;
    }
    const boltSvgScale = boltHalf / BOLT_SVG_REF;
    const boltTx = cx - BOLT_SVG_CX * boltSvgScale;
    const boltTy = cy - BOLT_SVG_CY * boltSvgScale;
    paths += `  <g transform="translate(${boltTx.toFixed(4)},${boltTy.toFixed(4)}) scale(${boltSvgScale.toFixed(6)})">\n`;
    paths += `    <path d="${BOLT_SVG_D}" fill="${boltColor}" fill-rule="nonzero"/>\n`;
    paths += `  </g>\n`;

    let logoEl = "";
    const logo = logoRef.current;
    if (logo) {
      try {
        const tmp = document.createElement("canvas");
        const lh = H * 0.18, lw = (logo.naturalWidth / logo.naturalHeight) * lh;
        tmp.width  = Math.round(lw * 10);
        tmp.height = Math.round(lh * 10);
        const tc = tmp.getContext("2d");
        if (tc) {
          tc.drawImage(logo, 0, 0, tmp.width, tmp.height);
          const b64 = tmp.toDataURL("image/png");
          logoEl = `  <image href="${b64}" x="${(W-pad-lw).toFixed(4)}" y="${(H-pad-lh).toFixed(4)}" width="${lw.toFixed(4)}" height="${lh.toFixed(4)}" opacity="0.90"/>\n`;
        }
      } catch (_) {}
    }

    const svg =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<!-- bitPOS card front - CR80 ${CARD_W_MM}x${CARD_H_MM}mm -->\n` +
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm">\n` +
      `  <rect width="${W}" height="${H}" rx="${CORNER_R_MM}" ry="${CORNER_R_MM}" fill="${bgColor}"/>\n` +
      paths +
      `  <text x="${pad.toFixed(4)}" y="${pad.toFixed(4)}" font-family="system-ui,sans-serif" font-weight="900" font-size="${fontSize}" dominant-baseline="text-before-edge"><tspan fill="#ffffff">bit</tspan><tspan fill="#ff9900">POS</tspan></text>\n` +
      logoEl +
      `</svg>`;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "bitpos-card-front.svg"; a.click();
    URL.revokeObjectURL(url);
  };

  const exportPNG = () => {
    const scale = 3;
    const off   = document.createElement("canvas");
    off.width   = DISP_W * scale;
    off.height  = DISP_H * scale;
    const ctx   = off.getContext("2d");
    if (!ctx) return;
    ctx.scale(scale, scale);
    if (side === 'front') renderFront(ctx, DISP_W, DISP_H, logoRef.current);
    else                  renderBack(ctx,  DISP_W, DISP_H);
    const a = document.createElement("a");
    a.href     = off.toDataURL("image/png");
    a.download = `bitpos-card-${side}.png`;
    a.click();
  };

  // ── UI ─────────────────────────────────────────────────────────────────
  return (
    <Layout active="business">
      <div className="flex flex-col min-h-full px-4 pt-8 pb-10 safe-top gap-5">

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold leading-tight">Card Designer</h1>
            <p className="text-xs text-muted-foreground">CR80 guilloche - print-ready SVG</p>
          </div>
        </div>

        {/* Front / Back toggle */}
        <div className="flex gap-1 p-1 bg-card border border-border rounded-xl self-start">
          {(['front', 'back'] as const).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setSide(s)}
              className={`px-5 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                side === s
                  ? 'bg-primary text-primary-foreground shadow'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {s === 'front' ? 'Front' : 'Back'}
            </button>
          ))}
        </div>

        {/* Card preview */}
        <div className="w-full rounded-2xl overflow-hidden shadow-xl border border-border">
          <canvas ref={canvasRef} style={{ width: "100%", height: "auto", display: "block" }} />
        </div>

        {/* Presets */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Presets</p>
          <div className="flex gap-2 flex-wrap">
            {PRESETS.map(p => (
              <button
                key={p.label}
                type="button"
                onClick={() => { setBgColor(p.bg); setLineColor(p.line); setBoltColor(p.bolt); }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/10 transition-transform active:scale-95"
                style={{ background: p.bg, color: p.line }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Controls - side-specific */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          {side === 'front' ? (
            <>
              <Slider label="Lines"        value={numLines}   min={5}   max={120} step={1}   onChange={setNumLines} />
              <Slider label="Spacing (px)" value={spacing}    min={2}   max={16}  step={1}   onChange={setSpacing} />
              <Slider label="Bolt size %"  value={boltPct}    min={10}  max={70}  step={1}   onChange={setBoltPct} />
              <Slider label="Line weight"  value={lineW}      min={0.2} max={3.0} step={0.1} onChange={setLineW}      fmt={(v) => v.toFixed(1)} />
              <Slider label="Smoothness"   value={smoothness} min={0}   max={2.0} step={0.1} onChange={setSmoothness} fmt={(v) => v.toFixed(1)} />
              <ColorRow label="Background" value={bgColor}   onChange={setBgColor}   />
              <ColorRow label="Line color" value={lineColor} onChange={setLineColor} />
              <ColorRow label="Bolt fill"  value={boltColor} onChange={setBoltColor} />
            </>
          ) : (
            <>
              <Slider label="Rings per focus"  value={backLines}   min={10}  max={100} step={1}   onChange={setBackLines}   />
              <Slider label="Ring pitch (px)"  value={backSpacing} min={3}   max={20}  step={1}   onChange={setBackSpacing} />
              <Slider label="Focus spread"     value={backFocus}   min={0.0} max={0.9} step={0.01} onChange={setBackFocus}  fmt={(v) => v.toFixed(2)} />
              <Slider label="Line weight"      value={lineW}       min={0.2} max={3.0} step={0.1} onChange={setLineW}       fmt={(v) => v.toFixed(1)} />
              <ColorRow label="Background" value={bgColor}   onChange={setBgColor}   />
              <ColorRow label="Line color" value={lineColor} onChange={setLineColor} />
            </>
          )}
        </div>

        {/* Back design idea callout */}
        {side === 'back' && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-xs text-muted-foreground leading-relaxed">
            <span className="font-semibold text-primary">Design idea:</span> Two families of concentric circles from offset focal points create a natural interference (moire) pattern across the entire card - the same security printing technique used on banknotes and passports. Drag <span className="font-semibold text-foreground">Focus spread</span> to morph between tight concentric rings and a wide lens-like field.
          </div>
        )}

        {/* Export */}
        <div className="flex gap-3 flex-wrap">
          <button
            type="button" onClick={exportSVG}
            className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-xl px-5 py-3 font-semibold text-sm hover:bg-primary/90 active:scale-95 transition-all"
          >
            <Download className="w-4 h-4" />
            Export SVG
          </button>
          <button
            type="button" onClick={exportPNG}
            className="flex-1 flex items-center justify-center gap-2 bg-card border border-border text-foreground rounded-xl px-5 py-3 font-semibold text-sm hover:bg-card/80 active:scale-95 transition-all"
          >
            <ImageDown className="w-4 h-4" />
            Export PNG (3x)
          </button>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          SVG exports at true CR80 dimensions (85.6 x 53.98 mm). Open in Inkscape to add bleed and crop marks before sending to print.
        </p>
      </div>
    </Layout>
  );
}

function Slider({ label, value, min, max, step, onChange, fmt }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; fmt?: (v: number) => string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-baseline">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="font-mono text-xs text-foreground">{fmt ? fmt(value) : value}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
    </div>
  );
}

function ColorRow({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="color" value={value}
        onChange={e => onChange(e.target.value)}
        className="w-8 h-8 rounded-lg cursor-pointer border border-border bg-transparent"
      />
      <span className="text-sm text-muted-foreground flex-1">{label}</span>
      <span className="font-mono text-xs text-muted-foreground">{value}</span>
    </div>
  );
}
