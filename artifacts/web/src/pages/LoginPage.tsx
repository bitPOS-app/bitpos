import { useState } from "react";
import { Link } from "react-router-dom";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import PinPad from "@/components/PinPad";
import { useToast } from "@/hooks/use-toast";

type Step = "handle" | "pin" | "totp";

export default function LoginPage() {
  const [step, setStep] = useState<Step>("handle");
  const [handle, setHandle] = useState("");
  const [pin, setPin] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const { setAuth } = useAuth();
  const { toast } = useToast();

  const login = useLogin({
    mutation: {
      onSuccess: (data) => {
        setAuth(data.token, data.entity, data.account);
      },
      onError: (err: unknown) => {
        const data = (err as { data?: { error?: string; totpRequired?: boolean } })?.data;
        if (data?.totpRequired) {
          // PIN was correct; ask for the authenticator code.
          setStep("totp");
          setTotpCode("");
          if (step === "totp") {
            toast({ title: "Incorrect code", description: data.error ?? "Try again", variant: "destructive" });
          }
          return;
        }
        setPin("");
        toast({ title: "Login failed", description: data?.error ?? "Invalid handle or PIN", variant: "destructive" });
      },
    },
  });

  const handleHandleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (handle.trim().length < 1) return;
    setStep("pin");
  };

  const submitLogin = (pinVal: string, code?: string) => {
    login.mutate({
      data: {
        handle: handle.trim().toLowerCase(),
        pin: pinVal,
        ...(code ? { totpCode: code } : {}),
      } as { handle: string; pin: string; totpCode?: string },
    });
  };

  const handlePinComplete = (val: string) => {
    setPin(val);
    if (val.length === 6) {
      submitLogin(val);
    }
  };

  const handleTotpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = totpCode.trim();
    if (code.length < 6) return;
    submitLogin(pin, code);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 safe-top">
      <div className="w-full max-w-sm">
        <div className="text-center mb-12">
          <a href="/" className="inline-block">
            <h1 className="text-3xl font-bold tracking-tight mb-1">
              bit<span className="text-primary">POS</span>
            </h1>
          </a>
          <p className="text-muted-foreground text-sm">Bitcoin Lightning wallet</p>
        </div>

        {step === "handle" && (
          <form onSubmit={handleHandleSubmit} className="space-y-6">
            <div>
              <label htmlFor="input-handle" className="block text-sm font-medium text-muted-foreground mb-2">
                Your handle
              </label>
              <input
                id="input-handle"
                data-testid="input-handle"
                type="text"
                autoFocus
                autoComplete="username"
                autoCapitalize="none"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="satoshi"
                className="w-full bg-card border border-border rounded-xl px-4 py-3 text-foreground text-base focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
              />
            </div>
            <button
              type="submit"
              data-testid="btn-continue"
              disabled={handle.trim().length < 1}
              className="w-full bg-primary text-primary-foreground rounded-xl py-4 font-semibold text-base disabled:opacity-40 transition-opacity active:scale-[0.98]"
            >
              Continue
            </button>
            <p className="text-center text-sm text-muted-foreground">
              No account?{" "}
              <Link to="/signup" className="text-primary font-medium">
                Sign up
              </Link>
            </p>
          </form>
        )}

        {step === "pin" && (
          <div className="space-y-6">
            <div className="text-center">
              <p className="text-muted-foreground text-sm mb-1">Enter your PIN</p>
              <p className="font-semibold text-base text-foreground">{handle}@bitpos.app</p>
            </div>
            <PinPad
              value={pin}
              onChange={handlePinComplete}
              maxLength={6}
            />
            {login.isPending && (
              <div className="flex justify-center">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            <button
              type="button"
              data-testid="btn-login"
              onClick={() => submitLogin(pin)}
              disabled={(pin.length !== 4 && pin.length !== 6) || login.isPending}
              className="w-full bg-primary text-primary-foreground rounded-xl py-4 font-semibold text-base disabled:opacity-40 transition-opacity active:scale-[0.98]"
            >
              Log in
            </button>
            <p className="text-center text-xs text-muted-foreground">
              Using an old 4-digit PIN? Enter it and tap Log in. You can upgrade to 6 digits in Settings.
            </p>
            <div className="flex flex-col items-center gap-2">
              <Link to="/recover" className="text-sm text-primary font-medium">
                Forgot PIN?
              </Link>
              <button
                type="button"
                onClick={() => { setStep("handle"); setPin(""); }}
                className="w-full text-sm text-muted-foreground py-2"
              >
                Back
              </button>
            </div>
          </div>
        )}

        {step === "totp" && (
          <form onSubmit={handleTotpSubmit} className="space-y-6">
            <div className="text-center">
              <p className="text-muted-foreground text-sm mb-1">Two-factor authentication</p>
              <p className="font-semibold text-base text-foreground">Enter your 6-digit code</p>
            </div>
            <input
              data-testid="input-totp"
              type="text"
              inputMode="numeric"
              autoFocus
              autoComplete="one-time-code"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/[^0-9a-zA-Z-]/g, "").slice(0, 11))}
              placeholder="123456"
              className="w-full bg-card border border-border rounded-xl px-4 py-3 text-center text-lg font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="text-xs text-muted-foreground text-center">
              Open your authenticator app, or enter a recovery code.
            </p>
            <button
              type="submit"
              data-testid="btn-verify-totp"
              disabled={totpCode.trim().length < 6 || login.isPending}
              className="w-full bg-primary text-primary-foreground rounded-xl py-4 font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {login.isPending ? <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : "Verify"}
            </button>
            <div className="flex flex-col items-center gap-2">
              <Link to="/recover" className="text-sm text-primary font-medium">
                Lost your authenticator?
              </Link>
              <button
                type="button"
                onClick={() => { setStep("handle"); setPin(""); setTotpCode(""); }}
                className="w-full text-sm text-muted-foreground py-2"
              >
                Back
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
