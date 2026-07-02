import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import PinPad from "@/components/PinPad";
import { useToast } from "@/hooks/use-toast";

type Step = "handle" | "code" | "reset" | "done";

async function postJson(path: string, body: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Request failed");
  return data;
}

export default function RecoverPage() {
  const [step, setStep] = useState<Step>("handle");
  const [handle, setHandle] = useState("");
  const [code, setCode] = useState("");
  const [emailHint, setEmailHint] = useState("");
  const [recoveryToken, setRecoveryToken] = useState("");
  const [newPin, setNewPin] = useState("");
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const submitHandle = async (e: React.FormEvent) => {
    e.preventDefault();
    const h = handle.trim().toLowerCase();
    if (!h) return;
    setBusy(true);
    try {
      const data = await postJson("/api/auth/recovery/start", { handle: h }) as { sent: boolean; emailHint: string | null };
      if (!data.sent) {
        toast({
          title: "No recovery email on file",
          description: "This account has no verified recovery email. Contact support.",
          variant: "destructive",
        });
        return;
      }
      setEmailHint(data.emailHint ?? "");
      setStep("code");
      setCode("");
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim().length < 6) return;
    setBusy(true);
    try {
      const data = await postJson("/api/auth/recovery/verify", { handle: handle.trim().toLowerCase(), code: code.trim() }) as { recoveryToken: string };
      setRecoveryToken(data.recoveryToken);
      setStep("reset");
      setNewPin("");
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const submitReset = async (pin: string) => {
    setNewPin(pin);
    if (pin.length !== 6) return;
    setBusy(true);
    try {
      await postJson("/api/auth/recovery/reset", { recoveryToken, newPin: pin });
      setStep("done");
    } catch (err) {
      setNewPin("");
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 safe-top">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold tracking-tight mb-1">
            bit<span className="text-primary">POS</span>
          </h1>
          <p className="text-muted-foreground text-sm">Account recovery</p>
        </div>

        {step === "handle" && (
          <form onSubmit={submitHandle} className="space-y-6">
            <div>
              <label htmlFor="recover-handle" className="block text-sm font-medium text-muted-foreground mb-2">
                Your handle
              </label>
              <input
                id="recover-handle"
                data-testid="input-recover-handle"
                type="text"
                autoFocus
                autoCapitalize="none"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="satoshi"
                className="w-full bg-card border border-border rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
              />
              <p className="text-xs text-muted-foreground mt-2">We will email a code to your verified recovery email.</p>
            </div>
            <button
              type="submit"
              data-testid="btn-recover-start"
              disabled={handle.trim().length < 1 || busy}
              className="w-full bg-primary text-primary-foreground rounded-xl py-4 font-semibold disabled:opacity-40 flex items-center justify-center"
            >
              {busy ? <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : "Send recovery code"}
            </button>
            <p className="text-center text-sm text-muted-foreground">
              <Link to="/login" className="text-primary font-medium">Back to login</Link>
            </p>
          </form>
        )}

        {step === "code" && (
          <form onSubmit={submitCode} className="space-y-6">
            <div className="text-center">
              <p className="text-muted-foreground text-sm mb-1">Enter the code we sent to</p>
              <p className="font-semibold text-base">{emailHint}</p>
            </div>
            <input
              data-testid="input-recover-code"
              type="text"
              inputMode="numeric"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              className="w-full bg-card border border-border rounded-xl px-4 py-3 text-center text-lg font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              type="submit"
              data-testid="btn-recover-verify"
              disabled={code.trim().length < 6 || busy}
              className="w-full bg-primary text-primary-foreground rounded-xl py-4 font-semibold disabled:opacity-40 flex items-center justify-center"
            >
              {busy ? <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : "Verify code"}
            </button>
            <button type="button" onClick={() => setStep("handle")} className="w-full text-sm text-muted-foreground py-2">Back</button>
          </form>
        )}

        {step === "reset" && (
          <div className="space-y-6">
            <div className="text-center">
              <p className="text-muted-foreground text-sm mb-1">Set a new PIN</p>
              <p className="font-semibold text-base">6 digits</p>
            </div>
            <PinPad value={newPin} onChange={submitReset} maxLength={6} />
            {busy && (
              <div className="flex justify-center">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            <p className="text-xs text-muted-foreground text-center">Resetting your PIN also turns off two-factor authentication.</p>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-6 text-center">
            <p className="text-base font-semibold">Your PIN has been reset.</p>
            <p className="text-sm text-muted-foreground">You can now log in with your new PIN.</p>
            <button
              type="button"
              data-testid="btn-recover-done"
              onClick={() => navigate("/login")}
              className="w-full bg-primary text-primary-foreground rounded-xl py-4 font-semibold"
            >
              Go to login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
