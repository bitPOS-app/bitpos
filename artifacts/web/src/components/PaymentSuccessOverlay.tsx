import { useEffect, useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";

interface PaymentSuccessOverlayProps {
  amountSats: number;
  onDone: () => void;
  title?: string;
  doneLabel?: string;
  children?: React.ReactNode;
}

/**
 * Full-screen celebratory confirmation for a received payment. Fills the whole
 * screen with a green circular wipe, pops a spring-loaded check badge, bursts
 * confetti + ripple rings, and buzzes the device. Falls back to a calm fade
 * when the user prefers reduced motion.
 */
export default function PaymentSuccessOverlay({
  amountSats,
  onDone,
  title = "Payment received",
  doneLabel = "Done",
  children,
}: PaymentSuccessOverlayProps) {
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) return;
    // Physical "buzz" on supported mobile devices - the app is used mostly on phones.
    navigator.vibrate?.([0, 45, 35, 70]);
  }, [reduce]);

  const particles = useMemo(() => {
    const colors = ["#ffffff", "#bbf7d0", "#fde047", "#86efac", "#4ade80"];
    return Array.from({ length: 20 }).map((_, i) => {
      const angle = (Math.PI * 2 * i) / 20 + (Math.random() - 0.5) * 0.6;
      const dist = 130 + Math.random() * 150;
      const size = 8 + Math.random() * 12;
      return {
        id: i,
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        size,
        color: colors[i % colors.length],
        delay: 0.18 + Math.random() * 0.18,
        rot: (Math.random() - 0.5) * 540,
        radius: Math.random() > 0.5 ? "9999px" : "2px",
      };
    });
  }, []);

  return (
    <motion.div
      className="fixed inset-0 z-[60] overflow-hidden text-white"
      initial={reduce ? { opacity: 0 } : { clipPath: "circle(0% at 50% 45%)" }}
      animate={reduce ? { opacity: 1 } : { clipPath: "circle(150% at 50% 45%)" }}
      transition={reduce ? { duration: 0.3 } : { duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      style={{
        background:
          "radial-gradient(circle at 50% 42%, #22c55e 0%, #16a34a 52%, #15803d 100%)",
      }}
      data-testid="payment-success-overlay"
    >
      {/* Ripple rings + confetti share a single centered origin point */}
      {!reduce && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-0 w-0">
          {[0, 1, 2].map((r) => (
            <motion.div
              key={`ring-${r}`}
              className="absolute rounded-full border-2 border-white/40"
              style={{ width: 150, height: 150, marginLeft: -75, marginTop: -75 }}
              initial={{ scale: 0.5, opacity: 0.7 }}
              animate={{ scale: 2.8, opacity: 0 }}
              transition={{
                duration: 1.7,
                ease: "easeOut",
                delay: 0.25 + r * 0.35,
                repeat: Infinity,
                repeatDelay: 0.5,
              }}
            />
          ))}
          {particles.map((p) => (
            <motion.div
              key={`p-${p.id}`}
              className="absolute"
              style={{
                width: p.size,
                height: p.size,
                marginLeft: -p.size / 2,
                marginTop: -p.size / 2,
                backgroundColor: p.color,
                borderRadius: p.radius,
              }}
              initial={{ x: 0, y: 0, scale: 0, opacity: 0, rotate: 0 }}
              animate={{
                x: p.x,
                y: [0, p.y, p.y + 46],
                scale: [0, 1, 0.85],
                opacity: [0, 1, 0],
                rotate: p.rot,
              }}
              transition={{ duration: 1.15, delay: p.delay, ease: "easeOut" }}
            />
          ))}
        </div>
      )}

      {/* Centered content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
        <motion.div
          className="relative flex h-28 w-28 items-center justify-center rounded-full bg-white shadow-2xl"
          initial={{ scale: 0, rotate: -30 }}
          animate={reduce ? { scale: 1, rotate: 0 } : { scale: [0, 1.18, 1], rotate: [-30, 8, 0] }}
          transition={
            reduce
              ? { duration: 0.3 }
              : { duration: 0.7, delay: 0.12, ease: [0.34, 1.56, 0.64, 1] }
          }
        >
          <svg viewBox="0 0 52 52" className="h-16 w-16" fill="none" aria-hidden="true">
            <motion.path
              d="M14 27 L23 36 L39 18"
              stroke="#16a34a"
              strokeWidth={5}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.4, delay: reduce ? 0 : 0.5, ease: "easeOut" }}
            />
          </svg>
        </motion.div>

        <motion.p
          className="mt-8 text-3xl font-extrabold tracking-tight"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: reduce ? 0.1 : 0.66 }}
        >
          {title}
        </motion.p>
        <motion.p
          className="mt-2 font-mono-nums text-xl font-semibold text-white/90"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={
            reduce
              ? { duration: 0.3, delay: 0.15 }
              : { duration: 0.5, delay: 0.82, ease: [0.34, 1.56, 0.64, 1] }
          }
        >
          +{amountSats.toLocaleString()} sats
        </motion.p>
        {children}
      </div>

      {/* Done button */}
      <motion.div
        className="absolute inset-x-0 bottom-0 px-6 pt-6"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: reduce ? 0.2 : 1.0 }}
      >
        <button
          type="button"
          data-testid="btn-done"
          onClick={onDone}
          className="mx-auto block w-full max-w-sm rounded-2xl bg-white py-4 text-lg font-bold text-green-700 shadow-lg transition-transform active:scale-95"
        >
          {doneLabel}
        </button>
      </motion.div>
    </motion.div>
  );
}
