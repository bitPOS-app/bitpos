import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import { CreditCard, Snowflake, Trash2, AlertTriangle, Copy, Eye, EyeOff, ArrowUpRight, ExternalLink, Pencil, Check, X, KeyRound, RefreshCw, MessageSquare, Shield, ShieldOff, ShieldAlert, Lock, Unlock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useListCards, getListCardsQueryKey,
  useIssueCard,
  useUpdateCard,
  useDeleteCard,
  useListTransactions, getListTransactionsQueryKey,
} from "@workspace/api-client-react";
import type { CardInfo, CardIssueResponse, Transaction } from "@workspace/api-client-react";
import PinPad from "@/components/PinPad";
import { TransactionDetailModal } from "@/components/TransactionDetailModal";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useFiatCurrency } from "@/hooks/use-fiat-currency";
import { cn } from "@/lib/utils";

function shortId(id: string) {
  return id.replace(/-/g, "").slice(-8).replace(/(.{4})(.{4})/, "$1 $2");
}

function cardLabel(card: CardInfo) {
  return card.name ?? shortId(card.id);
}

type CardActions = {
  onFreeze: () => void;
  onCancel: () => void;
  onViewKeys: () => void;
  onWipe: () => void;
  onSaveName: (name: string) => void;
  onSaveNote: (note: string) => void;
  isFrozen: boolean;
  freezeDisabled?: boolean;
};

function CardVisual({ card, actions }: { card: CardInfo; actions?: CardActions }) {
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(card.name ?? "");
  const [editingNote, setEditingNote] = useState(false);
  const [noteValue, setNoteValue] = useState(card.note ?? "");
  const nameRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setNameValue(card.name ?? ""); }, [card.name]);
  useEffect(() => { setNoteValue(card.note ?? ""); }, [card.note]);
  useEffect(() => { if (editingName) nameRef.current?.focus(); }, [editingName]);
  useEffect(() => { if (editingNote) noteRef.current?.focus(); }, [editingNote]);

  const commitName = () => { actions?.onSaveName(nameValue.trim()); setEditingName(false); };
  const cancelName = () => { setNameValue(card.name ?? ""); setEditingName(false); };
  const commitNote = () => { actions?.onSaveNote(noteValue.trim()); setEditingNote(false); };
  const cancelNote = () => { setNoteValue(card.note ?? ""); setEditingNote(false); };

  return (
    <div className="relative w-full max-w-sm mx-auto rounded-2xl overflow-hidden aspect-[1.586/1] bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border border-border shadow-lg p-6 flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <span className="text-base font-bold tracking-widest text-foreground">
          bit<span className="text-primary">POS</span>
        </span>
        <img src={`${import.meta.env.BASE_URL}boltcard.png`} alt="Bolt Card" className="w-6 h-6 object-contain" />
      </div>

      <div className="space-y-1.5">
        <p className="text-muted-foreground text-xs font-mono">BOLT CARD</p>
        {editingName ? (
          <div className="flex items-center gap-1.5">
            <input
              ref={nameRef}
              type="text"
              value={nameValue}
              maxLength={40}
              onChange={(e) => setNameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commitName(); if (e.key === "Escape") cancelName(); }}
              placeholder={shortId(card.id)}
              className="flex-1 min-w-0 bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-sm font-mono text-white focus:outline-none focus:border-white/50"
            />
            <button type="button" onClick={commitName} className="w-6 h-6 flex items-center justify-center rounded text-green-400 shrink-0"><Check className="w-3.5 h-3.5" /></button>
            <button type="button" onClick={cancelName} className="w-6 h-6 flex items-center justify-center rounded text-white/40 shrink-0"><X className="w-3.5 h-3.5" /></button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => actions && setEditingName(true)}
            className={cn("flex items-center gap-2 group text-left", actions ? "cursor-pointer" : "cursor-default")}
          >
            <span className="font-mono text-lg tracking-widest text-foreground">{card.name ?? shortId(card.id)}</span>
            {actions && <Pencil className="w-3 h-3 text-white/25 group-hover:text-white/60 transition-colors shrink-0" />}
          </button>
        )}
        {actions && (
          editingNote ? (
            <div className="flex items-center gap-1.5">
              <input
                ref={noteRef}
                type="text"
                value={noteValue}
                maxLength={120}
                onChange={(e) => setNoteValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") commitNote(); if (e.key === "Escape") cancelNote(); }}
                placeholder="Payment note…"
                className="flex-1 min-w-0 bg-white/10 border border-white/20 rounded-lg px-2 py-0.5 text-xs text-white focus:outline-none focus:border-white/50"
              />
              <button type="button" onClick={commitNote} className="w-6 h-6 flex items-center justify-center rounded text-green-400 shrink-0"><Check className="w-3.5 h-3.5" /></button>
              <button type="button" onClick={cancelNote} className="w-6 h-6 flex items-center justify-center rounded text-white/40 shrink-0"><X className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <button type="button" onClick={() => setEditingNote(true)} className="flex items-center gap-1.5 group">
              <MessageSquare className="w-3 h-3 text-white/25 group-hover:text-white/50 transition-colors shrink-0" />
              <span className={cn("text-xs", card.note ? "text-white/60" : "text-white/30 italic")}>{card.note ?? "Add note…"}</span>
              <Pencil className="w-2.5 h-2.5 text-white/20 group-hover:text-white/50 transition-colors shrink-0" />
            </button>
          )
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className={cn(
          "text-xs font-semibold px-2 py-1 rounded-full",
          card.status === "active" ? "bg-green-500/20 text-green-400" :
          card.status === "frozen" ? "bg-blue-500/20 text-blue-400" :
          "bg-destructive/20 text-destructive"
        )}>
          {card.status.toUpperCase()}
        </span>
        {actions ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid="btn-freeze"
              title={actions.isFrozen ? "Unfreeze card" : "Freeze card"}
              onClick={actions.onFreeze}
              disabled={actions.freezeDisabled}
              className={cn(
                "w-7 h-7 flex items-center justify-center rounded-lg border transition-colors disabled:opacity-40",
                actions.isFrozen
                  ? "bg-blue-500/20 border-blue-500/40 text-blue-400"
                  : "bg-white/5 border-white/10 text-white/50 hover:text-blue-400 hover:border-blue-500/40"
              )}
            >
              <Snowflake className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              data-testid="btn-cancel-card"
              title="Cancel card"
              onClick={actions.onCancel}
              className="w-7 h-7 flex items-center justify-center rounded-lg border bg-white/5 border-white/10 text-red-400/70 hover:text-red-400 hover:border-red-500/40 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              data-testid="btn-view-keys"
              title="View keys"
              onClick={actions.onViewKeys}
              className="w-7 h-7 flex items-center justify-center rounded-lg border bg-white/5 border-white/10 text-white/50 hover:text-white hover:border-white/20 transition-colors"
            >
              <KeyRound className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              data-testid="btn-wipe-card"
              title="Wipe card"
              onClick={actions.onWipe}
              className="w-7 h-7 flex items-center justify-center rounded-lg border bg-white/5 border-white/10 text-amber-400/70 hover:text-amber-400 hover:border-amber-500/40 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <span className="text-muted-foreground text-xs font-mono">NFC</span>
        )}
      </div>
    </div>
  );
}

function buildProvisionUrl(issued: CardIssueResponse): string {
  return issued.provisionUrl ?? "";
}

function IssuedCardModal({ issued, onClose }: { issued: CardIssueResponse; onClose: () => void }) {
  const [tab, setTab] = useState<"program" | "keys">("program");
  const [shown, setShown] = useState(false);
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const provisionUrl = buildProvisionUrl(issued);

  useEffect(() => {
    if (tab === "program" && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, provisionUrl, {
        width: 220,
        margin: 2,
        color: { dark: "#ffffff", light: "#111111" },
      });
    }
  }, [tab, provisionUrl]);

  const copyProvisionUrl = () => {
    navigator.clipboard.writeText(provisionUrl).then(() =>
      toast({ title: "Auth URL copied" })
    );
  };

  const copyAllKeys = () => {
    const text = Object.entries(issued.keys).map(([k, v]) => `${k}: ${v}`).join("\n");
    navigator.clipboard.writeText(text + `\nlnurlwTemplate: ${issued.lnurlwTemplate ?? ""}`).then(() =>
      toast({ title: "Copied all keys" })
    );
  };

  return (
    <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-destructive/20 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-destructive" />
          </div>
          <div>
            <h3 className="font-semibold text-base">Card issued - program it now</h3>
            <p className="text-muted-foreground text-sm mt-1">QR is shown once only and cannot be recovered.</p>
          </div>
        </div>

        <div className="flex bg-muted rounded-xl p-1 gap-1">
          <button
            type="button"
            onClick={() => setTab("program")}
            className={cn(
              "flex-1 py-2 rounded-lg text-sm font-medium transition-colors",
              tab === "program" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            Program card
          </button>
          <button
            type="button"
            onClick={() => setTab("keys")}
            className={cn(
              "flex-1 py-2 rounded-lg text-sm font-medium transition-colors",
              tab === "keys" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            Raw keys
          </button>
        </div>

        {tab === "program" && (
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm text-center">
              Scan with{" "}
              <a
                href="https://play.google.com/store/search?q=bolt+card+nfc+creator"
                target="_blank"
                rel="noreferrer"
                className="text-primary inline-flex items-center gap-0.5"
              >
                Bolt Card NFC Creator <ExternalLink className="w-3 h-3" />
              </a>{" "}
              (Android) to program your NTAG 424 DNA card.
            </p>
            <div className="flex justify-center">
              <div className="rounded-xl overflow-hidden bg-[#111111] p-2">
                <canvas ref={canvasRef} />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Auth URL</p>
              <div className="bg-muted rounded-xl px-3 py-2">
                <p className="font-mono text-xs text-foreground break-all leading-relaxed">{provisionUrl}</p>
              </div>
            </div>
            <button
              type="button"
              data-testid="btn-copy-auth-url"
              onClick={copyProvisionUrl}
              className="flex items-center gap-2 w-full bg-muted rounded-xl px-4 py-3 text-sm font-medium justify-center"
            >
              <Copy className="w-4 h-4" /> Copy Auth URL
            </button>
          </div>
        )}

        {tab === "keys" && (
          <div className="space-y-4">
            <div className="bg-muted rounded-xl p-4 space-y-2">
              {!shown ? (
                <button type="button" onClick={() => setShown(true)} className="flex items-center gap-2 text-sm text-primary w-full justify-center py-2">
                  <Eye className="w-4 h-4" /> Reveal keys
                </button>
              ) : (
                <>
                  {Object.entries(issued.keys).map(([k, v]) => (
                    <div key={k}>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">{k}</p>
                      <p className="font-mono text-xs text-foreground break-all">{v}</p>
                    </div>
                  ))}
                  {issued.lnurlwTemplate && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mt-2">lnurlw template</p>
                      <p className="font-mono text-xs text-foreground break-all">{issued.lnurlwTemplate}</p>
                    </div>
                  )}
                </>
              )}
            </div>
            <button type="button" data-testid="btn-copy-keys" onClick={copyAllKeys} className="flex items-center gap-2 w-full bg-muted rounded-xl px-4 py-3 text-sm font-medium justify-center">
              <Copy className="w-4 h-4" /> Copy all keys
            </button>
          </div>
        )}

        <button type="button" data-testid="btn-close-modal" onClick={onClose} className="w-full bg-primary text-primary-foreground rounded-xl py-3 font-semibold text-sm">
          I have saved my keys
        </button>
      </div>
    </div>
  );
}

type ViewedKeys = { k0: string; k1: string; k2: string; k3: string; k4: string; lnurlwTemplate: string };

function CancelConfirmModal({ onConfirm, onClose, isLoading }: { onConfirm: () => void; onClose: () => void; isLoading: boolean }) {
  return (
    <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-xs p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-destructive/20 flex items-center justify-center shrink-0">
            <Trash2 className="w-5 h-5 text-destructive" />
          </div>
          <div>
            <h3 className="font-semibold text-base">Cancel this card?</h3>
            <p className="text-muted-foreground text-sm mt-1">
              The card record will be removed and <span className="text-foreground font-medium">all future taps will be rejected</span>. The NFC chip is not erased - use Wipe (↺) if you want to reuse the physical card.
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl py-3 text-sm font-medium bg-muted text-muted-foreground"
          >
            Keep card
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 rounded-xl py-3 text-sm font-semibold bg-destructive text-destructive-foreground disabled:opacity-50"
          >
            {isLoading ? "Cancelling…" : "Cancel card"}
          </button>
        </div>
      </div>
    </div>
  );
}

function WipeConfirmModal({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-xs p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-destructive/20 flex items-center justify-center shrink-0">
            <RefreshCw className="w-5 h-5 text-destructive" />
          </div>
          <div>
            <h3 className="font-semibold text-base">Wipe this card?</h3>
            <p className="text-muted-foreground text-sm mt-1">
              This will generate a one-time wipe URL. Scanning it with the Bolt Card NFC Creator app will <span className="text-foreground font-medium">erase all keys from the NFC chip</span> and rotate the card's keys. The chip must be re-provisioned before it can be used again.
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl py-3 text-sm font-medium bg-muted text-muted-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-xl py-3 text-sm font-semibold bg-destructive text-destructive-foreground"
          >
            Wipe card
          </button>
        </div>
      </div>
    </div>
  );
}

function PinModal({
  title,
  description,
  loading,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  loading: boolean;
  error: string | null;
  onConfirm: (pin: string) => void;
  onClose: () => void;
}) {
  const [pin, setPin] = useState("");

  const submit = () => {
    if (pin.length >= 4) onConfirm(pin);
  };

  return (
    <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-xs p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <KeyRound className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-base">{title}</h3>
            <p className="text-muted-foreground text-sm mt-1">{description}</p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground uppercase tracking-wider">PIN</label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={8}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder="Enter PIN"
            autoFocus
            className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm font-mono tracking-widest focus:outline-none focus:border-primary"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl py-3 text-sm font-medium bg-muted text-muted-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pin.length < 4 || loading}
            className="flex-1 rounded-xl py-3 text-sm font-semibold bg-primary text-primary-foreground disabled:opacity-50"
          >
            {loading ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />Verifying…</span> : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ViewKeysModal({ keys, onClose }: { keys: ViewedKeys; onClose: () => void }) {
  const [shown, setShown] = useState(false);
  const { toast } = useToast();

  const copyAll = () => {
    const text = [
      `k0: ${keys.k0}`,
      `k1: ${keys.k1}`,
      `k2: ${keys.k2}`,
      `k3: ${keys.k3}`,
      `k4: ${keys.k4}`,
      `lnurlwTemplate: ${keys.lnurlwTemplate}`,
    ].join("\n");
    navigator.clipboard.writeText(text).then(() => toast({ title: "Keys copied" }));
  };

  const entries: [string, string][] = [
    ["k0 (encryption)", keys.k0],
    ["k1 (auth)", keys.k1],
    ["k2 (piccData)", keys.k2],
    ["k3 (file data)", keys.k3],
    ["k4 (ndef)", keys.k4],
  ];

  return (
    <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <KeyRound className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-base">Card keys</h3>
            <p className="text-muted-foreground text-sm mt-1">Store these securely. Keep them off your screen.</p>
          </div>
        </div>

        <div className="bg-muted rounded-xl p-4 space-y-3">
          {!shown ? (
            <button
              type="button"
              onClick={() => setShown(true)}
              className="flex items-center gap-2 text-sm text-primary w-full justify-center py-2"
            >
              <Eye className="w-4 h-4" /> Reveal keys
            </button>
          ) : (
            <>
              {entries.map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
                  <p className="font-mono text-xs text-foreground break-all">{value}</p>
                </div>
              ))}
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">lnurlw template</p>
                <p className="font-mono text-xs text-foreground break-all">{keys.lnurlwTemplate}</p>
              </div>
              <button
                type="button"
                onClick={() => setShown(false)}
                className="flex items-center gap-2 text-xs text-muted-foreground w-full justify-center pt-1"
              >
                <EyeOff className="w-3 h-3" /> Hide
              </button>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={copyAll}
          className="flex items-center gap-2 w-full bg-muted rounded-xl px-4 py-3 text-sm font-medium justify-center"
        >
          <Copy className="w-4 h-4" /> Copy all keys
        </button>

        <button
          type="button"
          onClick={onClose}
          className="w-full bg-primary text-primary-foreground rounded-xl py-3 font-semibold text-sm"
        >
          Done
        </button>
      </div>
    </div>
  );
}

type WipeData = {
  wipeKeys: { protocol_name: string; protocol_version: number; k0: string; k1: string; k2: string; k3: string; k4: string };
  newProvisionUrl: string;
};

function WipeModal({
  wipeData,
  cardId,
  onClose,
  onCancelCard,
  isCancelling,
}: {
  wipeData: WipeData;
  cardId: string;
  onClose: () => void;
  onCancelCard: (id: string) => void;
  isCancelling: boolean;
}) {
  const wipeJsonRef = useRef<HTMLCanvasElement>(null);
  const [pendingCancel, setPendingCancel] = useState(false);
  const { toast } = useToast();

  const wipeJson = JSON.stringify(wipeData.wipeKeys);

  useEffect(() => {
    if (wipeJsonRef.current) {
      QRCode.toCanvas(wipeJsonRef.current, wipeJson, {
        width: 220,
        margin: 2,
        color: { dark: "#ffffff", light: "#111111" },
      });
    }
  }, [wipeJson]);

  return (
    <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        {!pendingCancel ? (
          <>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-destructive/20 flex items-center justify-center shrink-0">
                <RefreshCw className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h3 className="font-semibold text-base">Wipe card</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  In Bolt Card NFC Creator, go to <span className="text-foreground font-medium">Reset</span> → tap NFC chip against phone → tap <span className="text-foreground font-medium">Scan QR Code</span> and scan this.
                </p>
              </div>
            </div>

            <div className="flex justify-center">
              <div className="rounded-xl overflow-hidden bg-[#111111] p-2">
                <canvas ref={wipeJsonRef} />
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(wipeJson).then(() => toast({ title: "Wipe JSON copied" }))}
              className="flex items-center gap-2 w-full bg-muted rounded-xl px-4 py-3 text-sm font-medium justify-center"
            >
              <Copy className="w-4 h-4" /> Copy wipe JSON
            </button>

            <button
              type="button"
              onClick={() => setPendingCancel(true)}
              className="w-full bg-primary text-primary-foreground rounded-xl py-3 font-semibold text-sm"
            >
              Done
            </button>
          </>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                <RefreshCw className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-semibold text-base">Did you wipe the card?</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  The card record is still in your dashboard. Cancel it now so it no longer shows up, or keep it if you want to retry the wipe.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl py-3 text-sm font-medium bg-muted text-muted-foreground"
              >
                Keep card
              </button>
              <button
                type="button"
                onClick={() => onCancelCard(cardId)}
                disabled={isCancelling}
                className="flex-1 rounded-xl py-3 text-sm font-semibold bg-destructive text-destructive-foreground disabled:opacity-50"
              >
                {isCancelling ? "Cancelling…" : "Cancel card"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Card tap-PIN modals ───────────────────────────────────────────────────────

type CardPinFlow = "set" | "change-current" | "change-new" | "remove";

function CardPinModal({
  flow,
  loading,
  error,
  onConfirm,
  onClose,
}: {
  flow: CardPinFlow;
  loading: boolean;
  error: string | null;
  onConfirm: (pin: string) => void;
  onClose: () => void;
}) {
  const [pin, setPin] = useState("");

  const isReady = pin.length === 4;

  const titles: Record<CardPinFlow, string> = {
    "set": "Set card PIN",
    "change-current": "Enter current PIN",
    "change-new": "Enter new PIN",
    "remove": "Confirm removal",
  };

  const descriptions: Record<CardPinFlow, string> = {
    "set": "Choose a 4-digit PIN. You'll need it at payment terminals for amounts at or above your threshold.",
    "change-current": "Enter your current card PIN to continue.",
    "change-new": "Enter a new 4-digit PIN for this card.",
    "remove": "Enter your current card PIN to remove PIN protection.",
  };

  const confirmLabels: Record<CardPinFlow, string> = {
    "set": "Set PIN",
    "change-current": "Continue",
    "change-new": "Save new PIN",
    "remove": "Remove PIN",
  };

  const icons: Record<CardPinFlow, React.ReactNode> = {
    "set": <Shield className="w-5 h-5 text-primary" />,
    "change-current": <KeyRound className="w-5 h-5 text-primary" />,
    "change-new": <Shield className="w-5 h-5 text-primary" />,
    "remove": <ShieldOff className="w-5 h-5 text-destructive" />,
  };

  return (
    <div className="fixed inset-0 z-60 bg-black/80 flex items-end justify-center sm:items-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-xs p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
            flow === "remove" ? "bg-destructive/10" : "bg-primary/10"
          )}>
            {icons[flow]}
          </div>
          <div>
            <h3 className="font-semibold text-base">{titles[flow]}</h3>
            <p className="text-muted-foreground text-sm mt-1">{descriptions[flow]}</p>
          </div>
        </div>

        <PinPad value={pin} onChange={setPin} maxLength={4} />

        {error && (
          <p className="text-xs text-destructive text-center -mt-2">{error}</p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl py-3 text-sm font-medium bg-muted text-muted-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => isReady && onConfirm(pin)}
            disabled={!isReady || loading}
            className={cn(
              "flex-1 rounded-xl py-3 text-sm font-semibold disabled:opacity-50",
              flow === "remove"
                ? "bg-destructive text-destructive-foreground"
                : "bg-primary text-primary-foreground"
            )}
          >
            {loading
              ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />Working…</span>
              : confirmLabels[flow]}
          </button>
        </div>
      </div>
    </div>
  );
}

function UnlockCardPinModal({
  loading,
  error,
  onConfirm,
  onClose,
}: {
  loading: boolean;
  error: string | null;
  onConfirm: (entityPin: string) => void;
  onClose: () => void;
}) {
  const [entityPin, setEntityPin] = useState("");
  const submit = () => { if (entityPin.length >= 4) onConfirm(entityPin); };

  return (
    <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-xs p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <h3 className="font-semibold text-base">Unlock card PIN</h3>
            <p className="text-muted-foreground text-sm mt-1">Enter your account PIN to unlock this card after too many failed tap-PIN attempts.</p>
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground uppercase tracking-wider">Account PIN</label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={8}
            value={entityPin}
            onChange={(e) => setEntityPin(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder="Enter PIN"
            autoFocus
            className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm font-mono tracking-widest focus:outline-none focus:border-primary"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl py-3 text-sm font-medium bg-muted text-muted-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={entityPin.length < 4 || loading}
            className="flex-1 rounded-xl py-3 text-sm font-semibold bg-amber-500 text-white disabled:opacity-50"
          >
            {loading
              ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Unlocking…</span>
              : "Unlock card"}
          </button>
        </div>
      </div>
    </div>
  );
}

// PIN threshold options (msats)
const PIN_LIMIT_OPTIONS = [
  { label: "Always required", value: null },
  { label: "≥ 1,000 sats", value: 1_000_000 },
  { label: "≥ 5,000 sats", value: 5_000_000 },
  { label: "≥ 10,000 sats", value: 10_000_000 },
  { label: "≥ 21,000 sats", value: 21_000_000 },
  { label: "≥ 50,000 sats", value: 50_000_000 },
  { label: "≥ 100,000 sats", value: 100_000_000 },
];

function formatPinLimit(msats: number | null | undefined) {
  if (msats == null) return "Always required";
  const sats = msats / 1000;
  const opt = PIN_LIMIT_OPTIONS.find((o) => o.value === msats);
  return opt ? opt.label : `≥ ${sats.toLocaleString()} sats`;
}

function CardPinSection({
  card,
  token,
  onUpdated,
}: {
  card: CardInfo;
  token: string;
  onUpdated: () => void;
}) {
  type CardPinModalFlow = "set" | "change-current" | "change-new" | "remove";
  const [modalFlow, setModalFlow] = useState<CardPinModalFlow | null>(null);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingCurrentPin, setPendingCurrentPin] = useState("");
  const [editingLimit, setEditingLimit] = useState(false);
  const [limitLoading, setLimitLoading] = useState(false);
  const { toast } = useToast();

  const openFlow = (flow: CardPinModalFlow) => {
    setError(null);
    setModalFlow(flow);
  };

  const closeModal = () => {
    setModalFlow(null);
    setError(null);
    setPendingCurrentPin("");
  };

  const handlePinConfirm = async (pin: string) => {
    setLoading(true);
    setError(null);

    try {
      if (modalFlow === "set") {
        const res = await fetch(`/api/cards/${card.id}/pin`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ newPin: pin }),
        });
        const data = await res.json() as Record<string, unknown>;
        if (!res.ok) { setError((data as { error?: string }).error ?? "Failed"); setLoading(false); return; }
        toast({ title: "Card PIN set" });
        closeModal();
        onUpdated();

      } else if (modalFlow === "change-current") {
        setPendingCurrentPin(pin);
        setModalFlow("change-new");
        setLoading(false);

      } else if (modalFlow === "change-new") {
        const res = await fetch(`/api/cards/${card.id}/pin`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ pin: pendingCurrentPin, newPin: pin }),
        });
        const data = await res.json() as Record<string, unknown>;
        if (!res.ok) { setError((data as { error?: string }).error ?? "Failed"); setLoading(false); return; }
        toast({ title: "Card PIN changed" });
        closeModal();
        onUpdated();

      } else if (modalFlow === "remove") {
        const res = await fetch(`/api/cards/${card.id}/pin`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ pin, newPin: null }),
        });
        const data = await res.json() as Record<string, unknown>;
        if (!res.ok) { setError((data as { error?: string }).error ?? "Failed"); setLoading(false); return; }
        toast({ title: "Card PIN removed" });
        closeModal();
        onUpdated();
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setLoading(false);
  };

  const handleUnlock = async (entityPin: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cards/${card.id}/pin/unlock`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ entityPin }),
      });
      const data = await res.json() as Record<string, unknown>;
      if (!res.ok) { setError((data as { error?: string }).error ?? "Failed"); setLoading(false); return; }
      toast({ title: "Card unlocked" });
      setUnlockOpen(false);
      setError(null);
      onUpdated();
    } catch {
      setError("Network error. Please try again.");
    }
    setLoading(false);
  };

  const handleLimitChange = async (newLimitMsats: number | null) => {
    setLimitLoading(true);
    try {
      const res = await fetch(`/api/cards/${card.id}/pin/limit`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pinLimitMsats: newLimitMsats }),
      });
      if (!res.ok) { toast({ title: "Failed to update threshold", variant: "destructive" }); setLimitLoading(false); return; }
      toast({ title: "PIN threshold updated" });
      setEditingLimit(false);
      onUpdated();
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    }
    setLimitLoading(false);
  };

  return (
    <>
      {modalFlow && (
        <CardPinModal
          flow={modalFlow}
          loading={loading}
          error={error}
          onConfirm={handlePinConfirm}
          onClose={closeModal}
        />
      )}
      {unlockOpen && (
        <UnlockCardPinModal
          loading={loading}
          error={error}
          onConfirm={handleUnlock}
          onClose={() => { setUnlockOpen(false); setError(null); }}
        />
      )}

      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold">Tap PIN</h3>
          </div>
          <span className={cn(
            "text-xs font-semibold px-2 py-0.5 rounded-full",
            card.pinLocked
              ? "bg-destructive/20 text-destructive"
              : card.pinEnabled
              ? "bg-green-500/20 text-green-400"
              : "bg-muted text-muted-foreground"
          )}>
            {card.pinLocked ? "LOCKED" : card.pinEnabled ? "ENABLED" : "DISABLED"}
          </span>
        </div>

        {/* Locked warning banner */}
        {card.pinLocked && (
          <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-3">
            <Lock className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-destructive">Card is locked</p>
              <p className="text-xs text-destructive/80 mt-0.5">3 incorrect PIN attempts. Enter your account PIN to unlock.</p>
            </div>
            <button
              type="button"
              onClick={() => { setError(null); setUnlockOpen(true); }}
              className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-destructive border border-destructive/30 rounded-lg px-2.5 py-1.5"
            >
              <Unlock className="w-3 h-3" /> Unlock
            </button>
          </div>
        )}

        {card.pinEnabled ? (
          <div className="space-y-3">
            {/* PIN threshold */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Require PIN above</span>
              {editingLimit ? (
                <select
                  className="bg-muted border border-border rounded-lg px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
                  defaultValue={card.pinLimitMsats ?? "null"}
                  onChange={(e) => {
                    const v = e.target.value;
                    handleLimitChange(v === "null" ? null : Number(v));
                  }}
                  disabled={limitLoading}
                >
                  {PIN_LIMIT_OPTIONS.map((opt) => (
                    <option key={String(opt.value)} value={opt.value ?? "null"}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingLimit(true)}
                  className="flex items-center gap-1.5 text-sm font-medium text-primary"
                >
                  {formatPinLimit(card.pinLimitMsats)}
                  <Pencil className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* PIN actions */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => openFlow("change-current")}
                className="flex-1 flex items-center justify-center gap-1.5 bg-muted rounded-xl py-2.5 text-xs font-medium text-foreground"
              >
                <KeyRound className="w-3.5 h-3.5" /> Change PIN
              </button>
              <button
                type="button"
                onClick={() => openFlow("remove")}
                className="flex-1 flex items-center justify-center gap-1.5 bg-destructive/10 rounded-xl py-2.5 text-xs font-medium text-destructive"
              >
                <ShieldOff className="w-3.5 h-3.5" /> Remove PIN
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Add a 4-digit PIN that payment terminals will require before processing a tap. Protects against unauthorised use if the card is lost.
            </p>
            <button
              type="button"
              onClick={() => openFlow("set")}
              className="w-full flex items-center justify-center gap-2 bg-primary/10 text-primary border border-primary/20 rounded-xl py-3 text-sm font-semibold"
            >
              <Shield className="w-4 h-4" /> Set card PIN
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function fmtSats(n: number) { return n.toLocaleString(); }

function CardNoteEditor({ card, onSave }: { card: CardInfo; onSave: (note: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(card.note ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    onSave(value.trim());
    setEditing(false);
  };

  const cancel = () => {
    setValue(card.note ?? "");
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={value}
          maxLength={120}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") cancel(); }}
          placeholder="bitPOS card payment"
          className="flex-1 bg-muted border border-border rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:border-primary"
        />
        <button type="button" onClick={commit} className="w-8 h-8 flex items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Check className="w-4 h-4" />
        </button>
        <button type="button" onClick={cancel} className="w-8 h-8 flex items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      data-testid="btn-edit-card-note"
      onClick={() => setEditing(true)}
      className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      <span className={card.note ? "text-foreground" : "italic"}>{card.note ?? "Add note…"}</span>
      <Pencil className="w-3.5 h-3.5" />
    </button>
  );
}

function CardNameEditor({ card, onSave }: { card: CardInfo; onSave: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(card.name ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    onSave(value.trim());
    setEditing(false);
  };

  const cancel = () => {
    setValue(card.name ?? "");
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={value}
          maxLength={40}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") cancel(); }}
          placeholder={shortId(card.id)}
          className="flex-1 bg-muted border border-border rounded-xl px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-primary"
        />
        <button type="button" onClick={commit} className="w-8 h-8 flex items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Check className="w-4 h-4" />
        </button>
        <button type="button" onClick={cancel} className="w-8 h-8 flex items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      data-testid="btn-edit-card-name"
      onClick={() => setEditing(true)}
      className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      <span className="font-mono">{card.name ?? shortId(card.id)}</span>
      <Pencil className="w-3.5 h-3.5" />
    </button>
  );
}

export default function CardPage() {
  const { account, token } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { formatFiat } = useFiatCurrency();

  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [issuedCard, setIssuedCard] = useState<CardIssueResponse | null>(null);
  const [editingLimits, setEditingLimits] = useState(false);
  const [perTapLimit, setPerTapLimit] = useState(21000);
  const [dailyLimit, setDailyLimit] = useState(210000);

  // PIN-gated flows
  type PinFlow = "keys" | "wipe" | "cancel";
  const [cancelConfirming, setCancelConfirming] = useState(false);
  const [wipeConfirming, setWipeConfirming] = useState(false);
  const [pinFlow, setPinFlow] = useState<PinFlow | null>(null);
  const [pinLoading, setPinLoading] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [viewedKeys, setViewedKeys] = useState<ViewedKeys | null>(null);
  const [wipeData, setWipeData] = useState<WipeData | null>(null);

  // Wallet mode - lightning-address wallets cannot spend, show a notice.
  const [walletMode, setWalletMode] = useState<string | null>(null);
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch("/api/user/wallet-info", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setWalletMode(d.walletMode ?? null); })
      .catch(() => { /* non-blocking */ });
    return () => { cancelled = true; };
  }, [token]);

  const { data: cards, isLoading } = useListCards(account?.id ?? "", {
    query: { enabled: !!account?.id, queryKey: getListCardsQueryKey(account?.id ?? "") }
  });

  const { data: transactions } = useListTransactions(account?.id ?? "", {
    query: { enabled: !!account?.id, queryKey: getListTransactionsQueryKey(account?.id ?? "") }
  });

  const issueCard = useIssueCard({
    mutation: {
      onSuccess: (data) => {
        qc.invalidateQueries({ queryKey: getListCardsQueryKey(account?.id ?? "") });
        setIssuedCard(data);
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "Failed to issue card";
        toast({ title: "Error", description: msg, variant: "destructive" });
      },
    },
  });

  const updateCard = useUpdateCard({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListCardsQueryKey(account?.id ?? "") });
        setEditingLimits(false);
        toast({ title: "Card updated" });
      },
    },
  });

  const deleteCard = useDeleteCard({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListCardsQueryKey(account?.id ?? "") });
        setSelectedCardId(null);
        setWipeData(null);
        setCancelConfirming(false);
        toast({ title: "Card cancelled" });
      },
    },
  });

  const activeCards = cards?.filter((c) => c.status !== "cancelled") ?? [];
  const selectedCard = activeCards.find((c) => c.id === selectedCardId) ?? activeCards[0];

  const recentTaps = (transactions ?? [])
    .filter((tx) => tx.direction === "out" && tx.cardId)
    .slice(0, 10);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const spentToday = (transactions ?? [])
    .filter((tx) =>
      tx.cardId === selectedCard?.id &&
      tx.direction === "out" &&
      tx.status === "completed" &&
      new Date(tx.createdAt) >= todayStart
    )
    .reduce((sum, tx) => sum + tx.amountSats, 0);

  const handleToggleFreeze = () => {
    if (!selectedCard) return;
    updateCard.mutate({
      id: selectedCard.id,
      data: { status: selectedCard.status === "frozen" ? "active" : "frozen" }
    });
  };

  const handleSaveLimits = () => {
    if (!selectedCard) return;
    updateCard.mutate({
      id: selectedCard.id,
      data: { perTapLimitSats: perTapLimit, dailyLimitSats: dailyLimit }
    });
  };

  const handleSaveName = (name: string) => {
    if (!selectedCard) return;
    updateCard.mutate({ id: selectedCard.id, data: { name } });
  };

  const handleSaveNote = (note: string) => {
    if (!selectedCard) return;
    updateCard.mutate({ id: selectedCard.id, data: { note } });
  };

  const handleSelectCard = (card: CardInfo) => {
    setSelectedCardId(card.id);
    setPerTapLimit(card.perTapLimitSats);
    setDailyLimit(card.dailyLimitSats);
    setEditingLimits(false);
  };

  const handleIssueCard = () => {
    if (!account?.id) return;
    issueCard.mutate({ accountId: account.id });
  };

  const openPinFlow = (flow: "keys" | "wipe") => {
    setPinError(null);
    if (flow === "wipe") {
      setWipeConfirming(true);
    } else {
      setPinFlow(flow);
    }
  };

  const closePinFlow = () => {
    setPinFlow(null);
    setPinError(null);
    setPinLoading(false);
  };

  const handlePinConfirm = async (pin: string) => {
    if (!selectedCard) return;
    setPinLoading(true);
    setPinError(null);
    try {
      const endpoint = pinFlow === "wipe"
        ? `/api/cards/${selectedCard.id}/wipe`
        : pinFlow === "cancel"
        ? `/api/cards/${selectedCard.id}/cancel`
        : `/api/cards/${selectedCard.id}/keys`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json() as Record<string, unknown>;
      if (!res.ok) {
        const msg = (data as { error?: string }).error ?? "Request failed";
        setPinError(msg === "Incorrect PIN" ? "Incorrect PIN. Try again." : msg);
        setPinLoading(false);
        return;
      }
      setPinFlow(null);
      setPinLoading(false);
      if (pinFlow === "keys") {
        setViewedKeys(data as ViewedKeys);
      } else if (pinFlow === "cancel") {
        qc.invalidateQueries({ queryKey: getListCardsQueryKey(account.id) });
        setSelectedCardId(null);
        toast({ title: "Card cancelled" });
      } else {
        setWipeData(data as WipeData);
      }
    } catch {
      setPinError("Network error. Please try again.");
      setPinLoading(false);
    }
  };

  if (!account) return null;

  return (
    <div className="flex flex-col min-h-full px-5 pt-8 pb-4 safe-top">
      {walletMode === "lnaddress" && (
        <div className="mb-4 bg-card border border-border rounded-xl p-4 flex items-start gap-3" data-testid="banner-lnaddress-cards">
          <AlertTriangle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            Card spending is not available with a lightning address wallet - lightning
            addresses can only receive payments. Switch to your own NWC wallet or a Veil
            wallet in Settings to spend with your Bolt Card.
          </p>
        </div>
      )}
      {issuedCard && <IssuedCardModal issued={issuedCard} onClose={() => setIssuedCard(null)} />}
      {cancelConfirming && selectedCard && (
        <CancelConfirmModal
          isLoading={false}
          onConfirm={() => { setCancelConfirming(false); setPinFlow("cancel"); }}
          onClose={() => setCancelConfirming(false)}
        />
      )}
      {wipeConfirming && (
        <WipeConfirmModal
          onConfirm={() => { setWipeConfirming(false); setPinFlow("wipe"); }}
          onClose={() => setWipeConfirming(false)}
        />
      )}
      {pinFlow && (
        <PinModal
          title={pinFlow === "keys" ? "View card keys" : pinFlow === "cancel" ? "Confirm cancel" : "Wipe card"}
          description={
            pinFlow === "keys"
              ? "Enter your PIN to reveal the AES encryption keys for this card."
              : pinFlow === "cancel"
              ? "Enter your PIN to permanently cancel this card."
              : "Enter your PIN to generate the wipe QR. Keys rotate immediately - scan the QR in Bolt Card NFC Creator to reset the chip."
          }
          loading={pinLoading}
          error={pinError}
          onConfirm={handlePinConfirm}
          onClose={closePinFlow}
        />
      )}
      {viewedKeys && <ViewKeysModal keys={viewedKeys} onClose={() => setViewedKeys(null)} />}
      {wipeData && selectedCard && (
        <WipeModal
          wipeData={wipeData}
          cardId={selectedCard.id}
          onClose={() => {
            setWipeData(null);
            qc.invalidateQueries({ queryKey: getListCardsQueryKey(account.id) });
          }}
          onCancelCard={(id) => deleteCard.mutate({ id })}
          isCancelling={deleteCard.isPending}
        />
      )}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Bolt Card</h1>
        {activeCards.length > 0 && (
          <button
            type="button"
            data-testid="btn-issue-another"
            disabled={issueCard.isPending}
            onClick={handleIssueCard}
            className="flex items-center gap-1.5 bg-primary hover:opacity-90 active:opacity-80 text-primary-foreground rounded-lg px-3.5 py-1.5 font-['Ubuntu_Mono'] text-[11px] uppercase tracking-[0.1em] font-medium transition-opacity disabled:opacity-50"
          >
            {issueCard.isPending
              ? <div className="w-3 h-3 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              : "+ Issue card"}
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <div className="h-48 bg-muted rounded-2xl animate-pulse" />
        </div>
      ) : activeCards.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6 py-16">
          <div className="w-16 h-16 rounded-2xl bg-card border border-border flex items-center justify-center">
            <CreditCard className="w-8 h-8 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold text-lg">No card yet</p>
            <p className="text-muted-foreground text-sm mt-1">Issue a Bolt Card to tap and pay at Lightning POS terminals</p>
          </div>
          <button
            type="button"
            data-testid="btn-issue-card"
            disabled={issueCard.isPending}
            onClick={handleIssueCard}
            className="bg-primary text-primary-foreground rounded-xl px-8 py-4 font-semibold flex items-center gap-2 disabled:opacity-50"
          >
            {issueCard.isPending ? <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : "Issue Bolt Card"}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Card selector */}
          {activeCards.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {activeCards.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => handleSelectCard(card)}
                  className={cn(
                    "shrink-0 px-4 py-2 rounded-xl text-sm font-medium border transition-colors font-mono",
                    selectedCard?.id === card.id ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground"
                  )}
                >
                  {card.name ?? shortId(card.id)}
                </button>
              ))}
            </div>
          )}

          {selectedCard && (
            <>
              <CardVisual
                card={selectedCard}
                actions={{
                  isFrozen: selectedCard.status === "frozen",
                  freezeDisabled: updateCard.isPending,
                  onFreeze: handleToggleFreeze,
                  onCancel: () => setCancelConfirming(true),
                  onViewKeys: () => openPinFlow("keys"),
                  onWipe: () => openPinFlow("wipe"),
                  onSaveName: handleSaveName,
                  onSaveNote: handleSaveNote,
                }}
              />

              {/* Limits */}
              <div className="bg-card border border-border rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">Spending limits</h3>
                  <button type="button" data-testid="btn-edit-limits" onClick={() => setEditingLimits(!editingLimits)} className="text-xs text-primary">
                    {editingLimits ? "Cancel" : "Edit"}
                  </button>
                </div>

                {editingLimits ? (
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-muted-foreground">Per tap limit</span>
                        <span className="font-mono-nums">{fmtSats(perTapLimit)} sats</span>
                      </div>
                      <input type="range" min={1000} max={500000} step={1000} value={perTapLimit}
                        onChange={(e) => setPerTapLimit(Number(e.target.value))} className="w-full accent-primary" />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-muted-foreground">Daily limit</span>
                        <span className="font-mono-nums">{fmtSats(dailyLimit)} sats</span>
                      </div>
                      <input type="range" min={10000} max={5000000} step={10000} value={dailyLimit}
                        onChange={(e) => setDailyLimit(Number(e.target.value))} className="w-full accent-primary" />
                    </div>
                    <button type="button" data-testid="btn-save-limits" onClick={handleSaveLimits}
                      disabled={updateCard.isPending}
                      className="w-full bg-primary text-primary-foreground rounded-xl py-3 font-semibold text-sm disabled:opacity-50">
                      Save limits
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Per tap - max per payment, no counter */}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Per tap</span>
                      <span className="font-mono-nums font-medium">{fmtSats(selectedCard.perTapLimitSats)} sats</span>
                    </div>

                    {/* Daily - progress bar with usage */}
                    <div>
                      <div className="flex items-center justify-between text-sm mb-1.5">
                        <span className="text-muted-foreground">Daily</span>
                        <span className="text-xs text-muted-foreground">
                          {fmtSats(spentToday)} / {fmtSats(selectedCard.dailyLimitSats)} sats
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                        {(() => {
                          const pct = Math.min(100, selectedCard.dailyLimitSats > 0 ? (spentToday / selectedCard.dailyLimitSats) * 100 : 0);
                          return (
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${pct >= 90 ? "bg-destructive" : pct >= 60 ? "bg-yellow-500" : "bg-primary"}`}
                              style={{ width: `${pct || 0}%` }}
                            />
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Tap PIN (LUD-21) */}
              <CardPinSection
                card={selectedCard}
                token={token ?? ""}
                onUpdated={() => qc.invalidateQueries({ queryKey: getListCardsQueryKey(account.id) })}
              />

              {/* Tap history - filtered to this card */}
              <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <h3 className="font-semibold text-sm">Recent card activity</h3>
                </div>
                {recentTaps.length === 0 ? (
                  <div className="px-5 py-6 text-center text-muted-foreground text-sm">No taps yet</div>
                ) : (
                  recentTaps.map((tx) => {
                    const txCard = cards?.find((c) => c.id === tx.cardId);
                    const txCardLabel = txCard ? cardLabel(txCard) : tx.cardId ? shortId(tx.cardId) : null;
                    return (
                      <div key={tx.id} className="flex items-center gap-3 px-5 py-3 border-b border-border last:border-0 cursor-pointer hover:bg-muted/40 transition-colors" onClick={() => setSelectedTx(tx)}>
                        <div className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center shrink-0">
                          <ArrowUpRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">
                            {txCardLabel ? (
                              <span>Card payment <span className="font-mono text-xs text-muted-foreground">({txCardLabel})</span></span>
                            ) : (
                              tx.memo ?? "Card payment"
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">{new Date(tx.createdAt).toLocaleDateString("en-GB")}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-mono-nums text-muted-foreground">
                            -{tx.amountSats.toLocaleString()} sats
                          </p>
                          {formatFiat(tx.amountSats) && (
                            <p className="text-xs text-muted-foreground/70 font-mono-nums">
                              {formatFiat(tx.amountSats)}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      )}

      {selectedTx && (
        <TransactionDetailModal tx={selectedTx} onClose={() => setSelectedTx(null)} />
      )}
    </div>
  );
}
