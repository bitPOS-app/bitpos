import { useEffect, useRef } from "react";
import QRCode from "qrcode";

interface QRCodeDisplayProps {
  value: string;
  size?: number;
  className?: string;
  darkColor?: string;
  lightColor?: string;
}

export default function QRCodeDisplay({
  value,
  size = 256,
  className,
  darkColor = "#000000",
  lightColor = "#ffffff",
}: QRCodeDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !value) return;
    const canvas = canvasRef.current;
    // Render at the device pixel ratio so the code stays razor-sharp when CSS
    // scales it on mobile / high-DPI screens. Capped at 3x to bound canvas size.
    const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 3);
    QRCode.toCanvas(canvas, value, {
      width: Math.round(size * dpr),
      // Spec-recommended 4-module quiet zone so the rounded corners below can
      // never clip into the finder patterns - keeps scanning reliable.
      margin: 4,
      color: {
        dark: darkColor,
        light: lightColor,
      },
    }).then(() => {
      // The qrcode library writes inline style.width/height to the exact
      // pixel size (e.g. 720px for 240*3 DPR). Strip those so our CSS rules
      // can fluidly scale the canvas to fit its container instead.
      canvas.style.width = "";
      canvas.style.height = "";
    }).catch(() => {});
  }, [value, size, darkColor, lightColor]);

  return (
    // The square is enforced on the wrapper (divs handle `aspect-ratio`
    // reliably across browsers) while the canvas is constrained via
    // maxWidth/maxHeight so it scales proportionally. Unlike `object-fit`,
    // which is inconsistently supported on <canvas>, this is bulletproof
    // on every mobile browser.
    <div
      className={className}
      style={{
        width: size,
        maxWidth: "100%",
        aspectRatio: "1 / 1",
        borderRadius: 8,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: lightColor,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          maxWidth: "100%",
          maxHeight: "100%",
        }}
      />
    </div>
  );
}
