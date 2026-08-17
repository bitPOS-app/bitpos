import { useState } from "react";
import { Link } from "react-router-dom";
import { useRegister } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import PinPad from "@/components/PinPad";
import { useToast } from "@/hooks/use-toast";

type Step = "email" | "handle" | "pin" | "confirm";

export default function SignupPage() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [handle, setHandle] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const { setAuth } = useAuth();
  const { toast } = useToast();

  const register = useRegister({
    mutation: {
      onSuccess: (data) => {
        setAuth(data.token, data.entity, data.account);
      },
      onError: (err: unknown) => {
        setConfirmPin("");
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "Registration failed";
        toast({ title: "Error", description: msg, variant: "destructive" });
        setStep("email");
      },
    },
  });

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) return;
    setStep("handle");
  };

  const handleHandleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[a-z0-9_]{3,32}$/.test(handle)) return;
    setStep("pin");
  };

  const handlePinChange = (val: string) => {
    setPin(val);
    if (val.length === 6) setStep("confirm");
  };

  const handleConfirmChange = (val: string) => {
    setConfirmPin(val);
    if (val.length === 6) {
      if (val !== pin) {
        toast({ title: "PINs don't match", description: "Please try again", variant: "destructive" });
        setPin("");
        setConfirmPin("");
        setStep("pin");
        return;
      }
      register.mutate({ data: { email, handle, pin: val } });
    }
  };

  const stepIndex = { email: 1, handle: 2, pin: 3, confirm: 4 }[step];

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 safe-top">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold tracking-tight mb-1">
            bit<span className="text-primary">POS</span>
          </h1>
          <p className="text-muted-foreground text-sm">Step {stepIndex} of 4</p>
        </div>

        {step === "email" && (
          <form onSubmit={handleEmailSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">Email address</label>
              <input
                type="email"
                data-testid="input-email"
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-card border border-border rounded-xl px-4 py-3 text-foreground text-base focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
              />
            </div>
            <button
              type="submit"
              data-testid="btn-next-email"
              disabled={!email.includes("@")}
              className="w-full bg-primary text-primary-foreground rounded-xl py-4 font-semibold disabled:opacity-40 transition-opacity active:scale-[0.98]"
            >
              Continue
            </button>
            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link to="/login" className="text-primary font-medium">Log in</Link>
            </p>
          </form>
        )}

        {step === "handle" && (
          <form onSubmit={handleHandleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">Choose a handle</label>
              <input
                type="text"
                data-testid="input-handle"
                autoFocus
                autoCapitalize="none"
                value={handle}
                onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                placeholder="satoshi"
                className="w-full bg-card border border-border rounded-xl px-4 py-3 text-foreground text-base focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
              />
              {handle.length > 0 && (
                <p className="text-primary text-sm mt-2 font-mono">
                  {handle}@bitpos.app
                </p>
              )}
              {handle.length > 0 && !/^[a-z0-9_]{3,32}$/.test(handle) && (
                <p className="text-destructive text-xs mt-1">3–32 chars, letters/numbers/underscore</p>
              )}
            </div>
            <button
              type="submit"
              data-testid="btn-next-handle"
              disabled={!/^[a-z0-9_]{3,32}$/.test(handle)}
              className="w-full bg-primary text-primary-foreground rounded-xl py-4 font-semibold disabled:opacity-40 transition-opacity active:scale-[0.98]"
            >
              Continue
            </button>
            <button type="button" onClick={() => setStep("email")} className="w-full text-sm text-muted-foreground py-2">Back</button>
          </form>
        )}

        {step === "pin" && (
          <div className="space-y-6">
            <div className="text-center">
              <p className="font-semibold text-base">{handle}@bitpos.app</p>
              <p className="text-muted-foreground text-sm mt-1">Create a PIN (6 digits)</p>
            </div>
            <PinPad value={pin} onChange={handlePinChange} maxLength={6} />
            <button type="button" onClick={() => setStep("handle")} className="w-full text-sm text-muted-foreground py-2">Back</button>
          </div>
        )}

        {step === "confirm" && (
          <div className="space-y-6">
            <div className="text-center">
              <p className="font-semibold text-base">{handle}@bitpos.app</p>
              <p className="text-muted-foreground text-sm mt-1">Confirm your PIN</p>
            </div>
            <PinPad value={confirmPin} onChange={handleConfirmChange} maxLength={6} />
            {register.isPending && (
              <div className="flex justify-center">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            <button type="button" onClick={() => { setStep("pin"); setPin(""); setConfirmPin(""); }} className="w-full text-sm text-muted-foreground py-2">Back</button>
          </div>
        )}
      </div>
    </div>
  );
}
