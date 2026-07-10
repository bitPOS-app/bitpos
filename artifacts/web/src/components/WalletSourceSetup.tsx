/**
 * Wallet source picker shared by onboarding (WalletSetupPage) and Settings.
 *
 * Three modes, self-custody first:
 *   custom    - bring your own NIP-47 NWC wallet (validated live server-side)
 *   lnaddress - receive-only lightning address (provider must support LUD-21)
 *   veil      - third-party custodial wallet; the nostr keypair is generated
 *               CLIENT-SIDE so bitPOS never chooses the key for the user, and
 *               the nsec backup is shown before anything is saved.
 */
import { useState, useEffect, useCallback } from "react";
import { generateSecretKey, getPublicKey, nip19 } from "nostr-tools";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Copy, RefreshCw } from "lucide-react";

type Mode = "custom" | "lnaddress" | "veil";

interface WalletInfo {
  walletMode: string;
  npub: string | null;
  hasKeypair: boolean;
  customNwcUrl: string | null;
  lightningAddress: string | null;
  veilPubkey?: string;
  veilRelay?: string;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface GeneratedKeypair {
  privKeyHex: string;
  pubKeyHex: string;
  nsec: string;
  npub: string;
}

export default function WalletSourceSetup({
  token,
  onSaved,
  heading,
}: {
  token: string;
  onSaved: (mode: Mode) => void;
  heading?: string;
}) {
  const { toast } = useToast();

  const [info, setInfo] = useState<WalletInfo | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [nwcInput, setNwcInput] = useState("");
  const [lnAddrInput, setLnAddrInput] = useState("");
  const [veilConsent, setVeilConsent] = useState(false);
  const [keypair, setKeypair] = useState<GeneratedKeypair | null>(null);
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadInfo = useCallback(async () => {
    try {
      const r = await fetch("/api/user/wallet-info", { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return;
      const d: WalletInfo = await r.json();
      setInfo(d);
      if (d.walletMode === "custom" || d.walletMode === "lnaddress" || d.walletMode === "veil") {
        setMode(d.walletMode);
      }
      if (d.customNwcUrl) setNwcInput(d.customNwcUrl);
      if (d.lightningAddress) setLnAddrInput(d.lightningAddress);
    } catch { /* ignore */ }
  }, [token]);

  useEffect(() => { loadInfo(); }, [loadInfo]);

  const generateVeilKeypair = () => {
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);
    setKeypair({
      privKeyHex: bytesToHex(sk),
      pubKeyHex: pk,
      nsec: nip19.nsecEncode(sk),
      npub: nip19.npubEncode(pk),
    });
    setBackupConfirmed(false);
  };

  const copyNsec = () => {
    if (!keypair) return;
    navigator.clipboard.writeText(keypair.nsec).then(() =>
      toast({ title: "Copied", description: "Private key copied - store it somewhere safe" })
    );
  };

  const patchWallet = async (body: Record<string, string>) => {
    const r = await fetch("/api/user/wallet-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error ?? "Failed to save wallet settings");
  };

  const handleSave = async () => {
    if (!mode) return;
    setSaving(true);
    try {
      if (mode === "custom") {
        await patchWallet({ walletMode: "custom", customNwcUrl: nwcInput.trim() });
        toast({ title: "Wallet connected", description: "Your NWC wallet was verified and saved" });
      } else if (mode === "lnaddress") {
        await patchWallet({ walletMode: "lnaddress", lightningAddress: lnAddrInput.trim().toLowerCase() });
        toast({ title: "Lightning address verified", description: "Payments will go directly to your provider" });
      } else {
        if (keypair) {
          await patchWallet({ walletMode: "veil", privKeyHex: keypair.privKeyHex, pubKeyHex: keypair.pubKeyHex });
        } else {
          await patchWallet({ walletMode: "veil" });
        }
        toast({ title: "Veil wallet ready" });
      }
      onSaved(mode);
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const veilNeedsKeypair = !info?.hasKeypair;
  const canSave =
    mode === "custom" ? nwcInput.trim().startsWith("nostr+walletconnect://") :
    mode === "lnaddress" ? /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(lnAddrInput.trim()) :
    mode === "veil" ? (veilConsent && (veilNeedsKeypair ? (keypair !== null && backupConfirmed) : true)) :
    false;

  const ModeOption = ({ value, title, subtitle, first, last }: {
    value: Mode; title: string; subtitle: string; first?: boolean; last?: boolean;
  }) => (
    <button
      type="button"
      data-testid={`wallet-mode-${value}`}
      onClick={() => setMode(value)}
      className={cn(
        "flex items-center gap-3 w-full px-5 py-4 transition-colors text-left",
        !last && "border-b border-border",
        first && "rounded-t-2xl",
        last && "rounded-b-2xl",
        mode === value ? "bg-primary/10" : "hover:bg-muted"
      )}
    >
      <div className={cn(
        "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0",
        mode === value ? "border-primary" : "border-muted-foreground"
      )}>
        {mode === value && <div className="w-2 h-2 rounded-full bg-primary" />}
      </div>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </button>
  );

  return (
    <div className="space-y-4">
      {heading && <p className="text-sm text-muted-foreground">{heading}</p>}

      <div className="bg-card border border-border rounded-2xl">
        <ModeOption
          value="custom"
          title="Your own wallet (NWC)"
          subtitle="Self-custody - connect any NIP-47 wallet, full send and receive"
          first
        />
        <ModeOption
          value="lnaddress"
          title="Lightning address"
          subtitle="Receive-only - payments go straight to your provider"
        />
        <ModeOption
          value="veil"
          title="Veil wallet"
          subtitle="Hosted by Veil, a third-party custodian - quickest setup"
          last
        />
      </div>

      {mode === "custom" && (
        <div>
          <p className="text-xs text-muted-foreground mb-1.5 ml-1">NWC connection string</p>
          <input
            type="text"
            data-testid="input-nwc-url"
            placeholder="nostr+walletconnect://..."
            value={nwcInput}
            onChange={(e) => setNwcInput(e.target.value)}
            className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <p className="text-xs text-muted-foreground mt-2 ml-1">
            The connection is tested live when you save - the wallet must allow creating invoices.
          </p>
        </div>
      )}

      {mode === "lnaddress" && (
        <div>
          <p className="text-xs text-muted-foreground mb-1.5 ml-1">Lightning address</p>
          <input
            type="text"
            data-testid="input-lightning-address"
            placeholder="you@wallet.example"
            autoCapitalize="none"
            value={lnAddrInput}
            onChange={(e) => setLnAddrInput(e.target.value)}
            className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <p className="text-xs text-muted-foreground mt-2 ml-1">
            Your provider must support payment verification (LUD-21) - this is checked when you save.
            Sending, swaps, and bolt card spending are not available in this mode.
          </p>
        </div>
      )}

      {mode === "veil" && (
        <div className="space-y-3">
          <label className="flex items-start gap-3 bg-card border border-border rounded-2xl p-4 cursor-pointer">
            <input
              type="checkbox"
              data-testid="checkbox-veil-consent"
              checked={veilConsent}
              onChange={(e) => setVeilConsent(e.target.checked)}
              className="mt-0.5 accent-[hsl(var(--primary))]"
            />
            <span className="text-xs text-muted-foreground">
              I understand my funds will be held by Veil, a third-party custodian.
              bitPOS never holds my money and cannot recover it - access is controlled
              by my nostr keypair.
            </span>
          </label>

          {veilConsent && veilNeedsKeypair && !keypair && (
            <button
              type="button"
              data-testid="btn-generate-keypair"
              onClick={generateVeilKeypair}
              className="w-full border border-primary text-primary rounded-xl py-3 text-sm font-semibold hover:bg-primary/10 transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" /> Generate my keypair
            </button>
          )}

          {veilConsent && keypair && (
            <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
              <p className="text-sm font-semibold">Back up your private key</p>
              <p className="text-xs text-muted-foreground">
                This key was generated in your browser and is the only way to access
                your Veil wallet outside bitPOS. It will not be shown like this again.
              </p>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Public key (npub)</p>
                <p className="text-xs font-mono bg-muted px-3 py-2 rounded-lg break-all" data-testid="text-npub">{keypair.npub}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Private key (nsec) - keep secret</p>
                <div className="flex items-start gap-2">
                  <p className="text-xs font-mono bg-muted px-3 py-2 rounded-lg break-all flex-1" data-testid="text-nsec">{keypair.nsec}</p>
                  <button
                    type="button"
                    data-testid="btn-copy-nsec"
                    onClick={copyNsec}
                    className="w-9 h-9 shrink-0 rounded-lg border border-border flex items-center justify-center hover:bg-muted"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  data-testid="checkbox-backup-confirmed"
                  checked={backupConfirmed}
                  onChange={(e) => setBackupConfirmed(e.target.checked)}
                  className="mt-0.5 accent-[hsl(var(--primary))]"
                />
                <span className="text-xs text-muted-foreground">
                  I saved my private key somewhere safe.
                </span>
              </label>
            </div>
          )}

          {veilConsent && !veilNeedsKeypair && (
            <div className="bg-card border border-border rounded-2xl p-4">
              <p className="text-xs text-muted-foreground">
                Your existing Veil keypair will be used{info?.npub ? ` (${info.npub})` : ""}.
                You can download a backup from Settings at any time.
              </p>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        data-testid="btn-save-wallet"
        onClick={handleSave}
        disabled={!canSave || saving}
        className="w-full bg-primary text-primary-foreground rounded-xl py-4 font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {saving
          ? <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
          : "Save wallet settings"
        }
      </button>
    </div>
  );
}
