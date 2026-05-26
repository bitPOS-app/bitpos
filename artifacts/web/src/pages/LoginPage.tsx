import { useState } from "react";
import { Link } from "react-router-dom";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import PinPad from "@/components/PinPad";
import { useToast } from "@/hooks/use-toast";

type Step = "handle" | "pin";

export default function LoginPage() {
  const [step, setStep] = useState<Step>("handle");
  const [handle, setHandle] = useState("");
  const [pin, setPin] = useState("");
  const { setAuth } = useAuth();
  const { toast } = useToast();

  const login = useLogin({
    mutation: {
      onSuccess: (data) => {
        setAuth(data.token, data.entity, data.account);
      },
      onError: (err: unknown) => {
        setPin("");
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "Invalid handle or PIN";
        toast({ title: "Login failed", description: msg, variant: "destructive" });
      },
    },
  });

  const handleHandleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (handle.trim().length < 1) return;
    setStep("pin");
  };

  const handlePinComplete = (val: string) => {
    setPin(val);
    if (val.length >= 4) {
      login.mutate({ data: { handle: handle.trim().toLowerCase(), pin: val } });
    }
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
              maxLength={4}
            />
            {login.isPending && (
              <div className="flex justify-center">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            <button
              type="button"
              onClick={() => { setStep("handle"); setPin(""); }}
              className="w-full text-sm text-muted-foreground py-2"
            >
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
