import { useEffect, useRef, useState } from "react";
import { X, Camera } from "lucide-react";
import jsQR from "jsqr";

interface Props {
  onResult: (value: string) => void;
  onClose: () => void;
}

export function QrScannerModal({ onResult, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          setReady(true);
        }
      } catch (err) {
        if (!cancelled) setError("Camera access denied. Please allow camera permission and try again.");
      }
    }

    start();
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  function stop() {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  useEffect(() => {
    if (!ready) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    // Try native BarcodeDetector first, fall back to jsQR
    type BD = { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
    const nativeDetector: BD | null =
      "BarcodeDetector" in window
        ? new (window as unknown as { BarcodeDetector: new (o: object) => BD }).BarcodeDetector({ formats: ["qr_code"] })
        : null;

    let found = false;

    async function scan() {
      if (!video || !canvas || !ctx || found) return;
      if (video.readyState < 2) { rafRef.current = requestAnimationFrame(scan); return; }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);

      try {
        if (nativeDetector) {
          const results = await nativeDetector.detect(video);
          if (results.length > 0 && results[0].rawValue) {
            found = true;
            stop();
            onResult(results[0].rawValue.trim());
            return;
          }
        } else {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code?.data) {
            found = true;
            stop();
            onResult(code.data.trim());
            return;
          }
        }
      } catch { /* keep scanning */ }

      rafRef.current = requestAnimationFrame(scan);
    }

    rafRef.current = requestAnimationFrame(scan);
    return () => cancelAnimationFrame(rafRef.current);
  }, [ready, onResult]);

  const handleClose = () => { stop(); onClose(); };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black" onClick={handleClose}>
      <div className="flex items-center justify-between px-5 py-4 shrink-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 text-white">
          <Camera className="w-5 h-5" />
          <span className="font-semibold">Scan QR code</span>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-white/10 transition-colors text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 relative overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
            <Camera className="w-12 h-12 text-white/40" />
            <p className="text-white/70 text-sm">{error}</p>
            <button
              type="button"
              onClick={handleClose}
              className="px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              muted
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />

            {/* Viewfinder overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-64 h-64">
                {/* Dimming around the finder */}
                <div className="absolute inset-0 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]" />
                {/* Corner brackets */}
                {[
                  "top-0 left-0 border-t-2 border-l-2 rounded-tl-lg",
                  "top-0 right-0 border-t-2 border-r-2 rounded-tr-lg",
                  "bottom-0 left-0 border-b-2 border-l-2 rounded-bl-lg",
                  "bottom-0 right-0 border-b-2 border-r-2 rounded-br-lg",
                ].map((cls, i) => (
                  <div key={i} className={`absolute w-8 h-8 border-primary ${cls}`} />
                ))}
                {/* Scanning line */}
                {!error && ready && (
                  <div className="absolute left-0 right-0 h-0.5 bg-primary/80 animate-scan" style={{ top: "50%" }} />
                )}
              </div>
              <p className="absolute bottom-20 text-white/70 text-sm">
                Point at a Lightning invoice or address QR
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
