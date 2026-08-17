import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle, XCircle, Clock, AlertTriangle, Zap } from "lucide-react";
import PinPad from "@/components/PinPad";
import { cn } from "@/lib/utils";

type SessionStatus = "pending" | "processing" | "authorized" | "expired" | "failed";

interface SessionInfo {
  amountSats: number;
  status: SessionStatus;
  expiresAt: string;
  cardLabel: string | null;
}

function formatSats(sats: number): string {
  if (sats >= 1_000_000) return `${(sats / 100_000_000).toFixed(6)} BTC`;
  return `${sats.toLocaleString()} sats`;
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function PayPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const fetchSession = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/pin-session/${sessionId}`);
      if (!res.ok) {
        setLoadError(res.status === 404 ? "Session not found or already expired" : "Failed to load session");
        return;
      }
      const data = (await res.json()) as SessionInfo;
      setLoadError(null); // Clear any previous transient error - successful fetch recovers the UI
      setSession(data);
      const remaining = Math.max(0, Math.floor((new Date(data.expiresAt).getTime() - Date.now()) / 1000));
      setTimeLeft((prev) => (prev === null ? remaining : prev));
    } catch {
      // Only surface connection errors if we have no data yet (initial load)
      setLoadError((prev) => (session === null ? "Connection error" : prev));
    }
  }, [sessionId]);

  // Initial load
  useEffect(() => { fetchSession(); }, [fetchSession]);

  // Poll every 3 s while pending or while a concurrent submission is processing
  useEffect(() => {
    if (session?.status !== "pending" && session?.status !== "processing") return;
    const interval = setInterval(() => {
      fetchSession();
    }, 3000);
    return () => clearInterval(interval);
  }, [session?.status, fetchSession]);

  // Live countdown
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((t) => (t === null || t <= 1 ? 0 : t - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft !== null && timeLeft > 0]);

  const handleAuthorize = useCallback(async (submittedPin: string) => {
    if (submittedPin.length !== 4 || !sessionId || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/pin-session/${sessionId}/authorize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: submittedPin }),
      });
      const data = (await res.json()) as { status: string; reason?: string; attemptsLeft?: number };
      if (data.status === "OK") {
        setSession((prev) => (prev ? { ...prev, status: "authorized" } : prev));
      } else if (data.status === "PENDING") {
        // Another concurrent submit already claimed this session - keep polling
        // until the in-progress payment resolves to authorized or failed
      } else {
        setSubmitError(data.reason ?? "Incorrect PIN");
        setPin("");
        if (data.reason?.toLowerCase().includes("locked")) {
          setSession((prev) => (prev ? { ...prev, status: "failed" } : prev));
        }
      }
    } catch {
      setSubmitError("Connection error - please try again");
      setPin("");
    } finally {
      setSubmitting(false);
    }
  }, [sessionId, submitting]);

  // Auto-submit when 4 digits entered
  useEffect(() => {
    if (pin.length === 4 && session?.status === "pending" && !submitting) {
      handleAuthorize(pin);
    }
  }, [pin]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (!session && !loadError) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Error loading (only shown before any data arrives) ────────────────────
  if (loadError && !session) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-5 p-8">
        <XCircle className="w-20 h-20 text-red-400" />
        <p className="text-white text-xl font-semibold text-center">{loadError}</p>
      </div>
    );
  }

  // ── Processing (concurrent claim in flight - keep polling) ────────────────
  if (session!.status === "processing") {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-6 p-8">
        <div className="w-16 h-16 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin" />
        <div className="text-center space-y-2">
          <p className="text-yellow-400 text-2xl font-bold">Processing Payment…</p>
          <p className="text-white/60 text-base">Please wait while the payment settles</p>
        </div>
      </div>
    );
  }

  // ── Authorized ─────────────────────────────────────────────────────────────
  if (session!.status === "authorized") {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-6 p-8">
        <CheckCircle className="w-28 h-28 text-green-400" />
        <div className="text-center space-y-2">
          <p className="text-green-400 text-4xl font-bold tracking-tight">Payment Approved</p>
          <p className="text-white/70 text-2xl">{formatSats(session!.amountSats)}</p>
          {session!.cardLabel && (
            <p className="text-white/40 text-sm mt-1">Card: {session!.cardLabel}</p>
          )}
        </div>
      </div>
    );
  }

  // ── Expired ────────────────────────────────────────────────────────────────
  if (session!.status === "expired" || (timeLeft === 0 && session!.status === "pending")) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-6 p-8">
        <Clock className="w-24 h-24 text-yellow-400" />
        <div className="text-center space-y-2">
          <p className="text-yellow-400 text-3xl font-bold">Session Expired</p>
          <p className="text-white/60 text-lg">Please tap your card again to retry</p>
        </div>
      </div>
    );
  }

  // ── Locked / Failed ────────────────────────────────────────────────────────
  if (session!.status === "failed") {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-6 p-8">
        <AlertTriangle className="w-24 h-24 text-red-400" />
        <div className="text-center space-y-2">
          <p className="text-red-400 text-3xl font-bold">Card Locked</p>
          <p className="text-white/60 text-lg">Too many incorrect PINs.</p>
          <p className="text-white/40 text-base">Unlock the card in the bitPOS app.</p>
        </div>
      </div>
    );
  }

  // ── PIN Entry (main state) ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 gap-8">
      {/* Brand mark */}
      <div className="flex items-center gap-2 text-white/30 text-sm">
        <Zap className="w-4 h-4 text-yellow-400/60" />
        <span>bit<span className="text-yellow-400/60">POS</span> · Secure Payment</span>
      </div>

      {/* Amount */}
      <div className="text-center space-y-1">
        <p className="text-white/40 text-xs uppercase tracking-[0.2em]">Amount to Pay</p>
        <p className="text-white text-5xl font-bold tracking-tight tabular-nums">
          {formatSats(session!.amountSats)}
        </p>
        {session!.cardLabel && (
          <p className="text-white/35 text-sm">Card: {session!.cardLabel}</p>
        )}
      </div>

      {/* PIN prompt */}
      <div className="text-center space-y-2">
        <p className="text-white/70 text-lg font-medium">Enter your card PIN</p>
        <div className={cn(
          "text-sm min-h-[1.25rem] transition-all",
          submitError ? "text-red-400" : "text-transparent"
        )}>
          {submitError ?? "-"}
        </div>
      </div>

      {/* PIN pad - large variant for POS terminal */}
      <PinPad
        value={pin}
        onChange={setPin}
        maxLength={4}
        large
        disabled={submitting}
      />

      {/* Submitting indicator */}
      {submitting && (
        <div className="flex items-center gap-2 text-white/50 text-sm">
          <div className="w-4 h-4 border-2 border-white/50 border-t-transparent rounded-full animate-spin" />
          Verifying…
        </div>
      )}

      {/* Countdown */}
      {timeLeft !== null && timeLeft > 0 && !submitting && (
        <p className="text-white/25 text-sm tabular-nums">
          Expires in {formatCountdown(timeLeft)}
        </p>
      )}
    </div>
  );
}
