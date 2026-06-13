import { useState } from "react";
import { ShieldCheck, ShieldOff, Mail, Copy, Check } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import QRCodeDisplay from "@/components/QRCodeDisplay";

type TotpStage = "idle" | "setup" | "codes" | "disable";
type EmailStage = "idle" | "enter" | "verify";

async function authFetch(path: string, token: string, method: string, body?: unknown) {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Request failed");
  return data;
}

export default function SecuritySettings() {
  const { entity, account, token, setAuth } = useAuth();
  const { toast } = useToast();

  const totpEnabled = Boolean((entity as { totpEnabled?: boolean } | null)?.totpEnabled);
  const recoveryEmail = (entity as { recoveryEmail?: string | null } | null)?.recoveryEmail ?? null;
  const recoveryVerified = Boolean((entity as { recoveryEmailVerified?: boolean } | null)?.recoveryEmailVerified);

  // ── TOTP ──────────────────────────────────────────────────────────────────
  const [totpStage, setTotpStage] = useState<TotpStage>("idle");
  const [otpauthUrl, setOtpauthUrl] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [disablePin, setDisablePin] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // ── Recovery email ──────────────────────────────────────────────────────────
  const [emailStage, setEmailStage] = useState<EmailStage>("idle");
  const [emailInput, setEmailInput] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [emailHint, setEmailHint] = useState("");
  const [removePin, setRemovePin] = useState("");
  const [showRemove, setShowRemove] = useState(false);

  async function refreshEntity() {
    if (!token) return;
    try {
      const data = await authFetch("/api/auth/me", token, "GET");
      const d = data as { entity?: unknown; account?: unknown };
      if (d.entity && d.account) setAuth(token, d.entity as never, d.account as never);
    } catch { /* keep current state */ }
  }

  if (!entity || !account || !token) return null;

  // ── TOTP handlers ───────────────────────────────────────────────────────────
  const startTotp = async () => {
    setBusy(true);
    try {
      const data = await authFetch("/api/auth/totp/setup", token, "POST") as { secret: string; otpauthUrl: string };
      setTotpSecret(data.secret);
      setOtpauthUrl(data.otpauthUrl);
      setTotpStage("setup");
      setTotpCode("");
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const confirmTotp = async () => {
    if (totpCode.trim().length < 6) return;
    setBusy(true);
    try {
      const data = await authFetch("/api/auth/totp/enable", token, "POST", { code: totpCode.trim() }) as { recoveryCodes: string[] };
      setRecoveryCodes(data.recoveryCodes);
      setTotpStage("codes");
      await refreshEntity();
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const disableTotp = async () => {
    if (disablePin.length < 6) return;
    setBusy(true);
    try {
      await authFetch("/api/auth/totp/disable", token, "POST", { pin: disablePin });
      toast({ title: "Two-factor disabled" });
      setDisablePin("");
      setTotpStage("idle");
      await refreshEntity();
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const copyCodes = async () => {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  const finishCodes = () => {
    setRecoveryCodes([]);
    setTotpStage("idle");
    setTotpCode("");
  };

  // ── Recovery email handlers ─────────────────────────────────────────────────
  const startEmail = async () => {
    const email = emailInput.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: "Enter a valid email", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const data = await authFetch("/api/auth/recovery-email/start", token, "POST", { email }) as { emailHint: string };
      setEmailHint(data.emailHint);
      setEmailStage("verify");
      setEmailCode("");
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const verifyEmail = async () => {
    if (emailCode.trim().length < 6) return;
    setBusy(true);
    try {
      await authFetch("/api/auth/recovery-email/verify", token, "POST", { code: emailCode.trim() });
      toast({ title: "Recovery email verified" });
      setEmailStage("idle");
      setEmailInput("");
      await refreshEntity();
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const removeEmail = async () => {
    if (removePin.length < 6) return;
    setBusy(true);
    try {
      await authFetch("/api/auth/recovery-email", token, "DELETE", { pin: removePin });
      toast({ title: "Recovery email removed" });
      setRemovePin("");
      setShowRemove(false);
      await refreshEntity();
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const spinner = <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />;

  return (
    <div className="space-y-4">
      {/* ── Two-factor authentication ─────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          {totpEnabled ? <ShieldCheck className="w-5 h-5 text-primary" /> : <ShieldOff className="w-5 h-5 text-muted-foreground" />}
          <div className="flex-1">
            <p className="font-semibold text-sm">Two-factor authentication</p>
            <p className="text-xs text-muted-foreground">
              {totpEnabled ? "Enabled - required at login" : "Add a code from an authenticator app"}
            </p>
          </div>
        </div>

        {!totpEnabled && totpStage === "idle" && (
          <button
            type="button"
            data-testid="btn-enable-totp"
            onClick={startTotp}
            disabled={busy}
            className="w-full bg-primary text-primary-foreground rounded-xl py-3 text-sm font-semibold disabled:opacity-40 flex items-center justify-center"
          >
            {busy ? spinner : "Enable 2FA"}
          </button>
        )}

        {totpStage === "setup" && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">Scan this with your authenticator app, then enter the 6-digit code.</p>
            <div className="flex justify-center">
              {otpauthUrl && <QRCodeDisplay value={otpauthUrl} size={180} />}
            </div>
            <div className="bg-muted rounded-xl px-3 py-2">
              <p className="text-[10px] text-muted-foreground mb-0.5">Or enter this key manually</p>
              <p className="font-mono text-xs break-all">{totpSecret}</p>
            </div>
            <input
              type="text"
              data-testid="input-totp-confirm"
              inputMode="numeric"
              placeholder="123456"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-center text-lg font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setTotpStage("idle")} className="flex-1 bg-muted rounded-xl py-3 text-sm font-medium">Cancel</button>
              <button
                type="button"
                data-testid="btn-confirm-totp"
                onClick={confirmTotp}
                disabled={totpCode.length < 6 || busy}
                className="flex-1 bg-primary text-primary-foreground rounded-xl py-3 text-sm font-semibold disabled:opacity-40 flex items-center justify-center"
              >
                {busy ? spinner : "Confirm"}
              </button>
            </div>
          </div>
        )}

        {totpStage === "codes" && (
          <div className="space-y-3">
            <div className="bg-primary/10 border border-primary/30 rounded-xl p-3">
              <p className="text-xs font-semibold text-primary mb-1">Save your recovery codes</p>
              <p className="text-[11px] text-muted-foreground">Store these somewhere safe. Each code can be used once if you lose your authenticator.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 font-mono text-xs">
              {recoveryCodes.map((c) => (
                <div key={c} className="bg-muted rounded-lg px-2 py-1.5 text-center">{c}</div>
              ))}
            </div>
            <button type="button" onClick={copyCodes} className="w-full bg-muted rounded-xl py-2.5 text-sm font-medium flex items-center justify-center gap-2">
              {copied ? <><Check className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy codes</>}
            </button>
            <button type="button" data-testid="btn-totp-done" onClick={finishCodes} className="w-full bg-primary text-primary-foreground rounded-xl py-3 text-sm font-semibold">
              I have saved my codes
            </button>
          </div>
        )}

        {totpEnabled && totpStage !== "disable" && (
          <button
            type="button"
            data-testid="btn-disable-totp"
            onClick={() => { setTotpStage("disable"); setDisablePin(""); }}
            className="w-full bg-muted text-foreground rounded-xl py-3 text-sm font-semibold"
          >
            Disable 2FA
          </button>
        )}

        {totpStage === "disable" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Enter your PIN to disable two-factor.</p>
            <input
              type="password"
              data-testid="input-disable-totp-pin"
              inputMode="numeric"
              placeholder="PIN"
              value={disablePin}
              onChange={(e) => setDisablePin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setTotpStage("idle")} className="flex-1 bg-muted rounded-xl py-3 text-sm font-medium">Cancel</button>
              <button
                type="button"
                data-testid="btn-confirm-disable-totp"
                onClick={disableTotp}
                disabled={disablePin.length < 6 || busy}
                className="flex-1 bg-destructive text-destructive-foreground rounded-xl py-3 text-sm font-semibold disabled:opacity-40 flex items-center justify-center"
              >
                {busy ? spinner : "Disable"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Recovery email ─────────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          <Mail className={recoveryVerified ? "w-5 h-5 text-primary" : "w-5 h-5 text-muted-foreground"} />
          <div className="flex-1">
            <p className="font-semibold text-sm">Recovery email</p>
            <p className="text-xs text-muted-foreground">
              {recoveryVerified && recoveryEmail ? `Verified: ${recoveryEmail}` : "Recover your account if you forget your PIN"}
            </p>
          </div>
        </div>

        {!recoveryVerified && emailStage === "idle" && (
          <button
            type="button"
            data-testid="btn-add-recovery-email"
            onClick={() => { setEmailStage("enter"); setEmailInput(""); }}
            className="w-full bg-primary text-primary-foreground rounded-xl py-3 text-sm font-semibold"
          >
            Add recovery email
          </button>
        )}

        {emailStage === "enter" && (
          <div className="space-y-3">
            <input
              type="email"
              data-testid="input-recovery-email"
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="you@example.com"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setEmailStage("idle")} className="flex-1 bg-muted rounded-xl py-3 text-sm font-medium">Cancel</button>
              <button
                type="button"
                data-testid="btn-send-recovery-code"
                onClick={startEmail}
                disabled={busy}
                className="flex-1 bg-primary text-primary-foreground rounded-xl py-3 text-sm font-semibold disabled:opacity-40 flex items-center justify-center"
              >
                {busy ? spinner : "Send code"}
              </button>
            </div>
          </div>
        )}

        {emailStage === "verify" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">We sent a 6-digit code to {emailHint}.</p>
            <input
              type="text"
              data-testid="input-recovery-email-code"
              inputMode="numeric"
              placeholder="123456"
              value={emailCode}
              onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-center text-lg font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setEmailStage("enter")} className="flex-1 bg-muted rounded-xl py-3 text-sm font-medium">Back</button>
              <button
                type="button"
                data-testid="btn-verify-recovery-email"
                onClick={verifyEmail}
                disabled={emailCode.length < 6 || busy}
                className="flex-1 bg-primary text-primary-foreground rounded-xl py-3 text-sm font-semibold disabled:opacity-40 flex items-center justify-center"
              >
                {busy ? spinner : "Verify"}
              </button>
            </div>
          </div>
        )}

        {recoveryVerified && !showRemove && (
          <button
            type="button"
            data-testid="btn-remove-recovery-email"
            onClick={() => { setShowRemove(true); setRemovePin(""); }}
            className="w-full bg-muted text-foreground rounded-xl py-3 text-sm font-semibold"
          >
            Remove recovery email
          </button>
        )}

        {showRemove && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Enter your PIN to remove your recovery email.</p>
            <input
              type="password"
              data-testid="input-remove-email-pin"
              inputMode="numeric"
              placeholder="PIN"
              value={removePin}
              onChange={(e) => setRemovePin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowRemove(false)} className="flex-1 bg-muted rounded-xl py-3 text-sm font-medium">Cancel</button>
              <button
                type="button"
                data-testid="btn-confirm-remove-email"
                onClick={removeEmail}
                disabled={removePin.length < 6 || busy}
                className="flex-1 bg-destructive text-destructive-foreground rounded-xl py-3 text-sm font-semibold disabled:opacity-40 flex items-center justify-center"
              >
                {busy ? spinner : "Remove"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
