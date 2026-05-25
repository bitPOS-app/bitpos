import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, CheckCircle2, Wifi, AlertCircle, XCircle, Copy, Check,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useGetBalance,
  getGetBalanceQueryKey,
  getListTransactionsQueryKey,
  getBalance,
  createInvoice as createInvoiceApi,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import QRCodeDisplay from "@/components/QRCodeDisplay";
import NumPad from "@/components/NumPad";
import PinPad from "@/components/PinPad";
import { useToast } from "@/hooks/use-toast";
import { useFiatCurrency } from "@/hooks/use-fiat-currency";
import { cn } from "@/lib/utils";

type Step = "amount" | "charging" | "nfc-pin" | "success" | "error";
type NfcStatus = "scanning" | "reading" | "paying";
type Unit = "sats" | "fiat";

interface LnurlMeta {
  callback: string;
  k1: string;
  maxWithdrawableSats: number;
  defaultDescription: string;
  pinLimit?: number;
}

interface CardPayment {
  meta: LnurlMeta;
  invoice: { bolt11: string; amountSats: number };
}

const NFC_URI_PREFIXES: string[] = [
  "",                            // 0x00 - no abbreviation
  "http://www.",                 // 0x01
  "https://www.",                // 0x02
  "http://",                     // 0x03
  "https://",                    // 0x04
  "tel:",                        // 0x05
  "mailto:",                     // 0x06
  "ftp://anonymous:anonymous@",  // 0x07
  "ftp://ftp.",                  // 0x08
  "ftps://",                     // 0x09
  "sftp://",                     // 0x0A
  "smb://",                      // 0x0B
  "nfs://",                      // 0x0C
  "ftp://",                      // 0x0D
  "dav://",                      // 0x0E
  "news:",                       // 0x0F
  "telnet://",                   // 0x10
  "imap:",                       // 0x11
  "rtsp://",                     // 0x12
  "urn:",                        // 0x13
  "pop:",                        // 0x14
  "sip:",                        // 0x15
  "sips:",                       // 0x16
  "tftp:",                       // 0x17
  "btspp://",                    // 0x18
  "btl2cap://",                  // 0x19
  "btgoep://",                   // 0x1A
  "tcpobex://",                  // 0x1B
  "irdaobex://",                 // 0x1C
  "file://",                     // 0x1D
  "urn:epc:id:",                 // 0x1E
  "urn:epc:tag:",                // 0x1F
  "urn:epc:pat:",                // 0x20
  "urn:epc:raw:",                // 0x21
  "urn:epc:",                    // 0x22
  "urn:nfc:",                    // 0x23
];

function isPaymentUrl(s: string): boolean {
  return s.startsWith("http://") || s.startsWith("https://") || s.startsWith("lnurlw://");
}

function extractUrlFromNdef(message: NDEFMessage): string {
  const decoder = new TextDecoder();
  for (const record of message.records) {
    if (record.recordType === "url" && record.data) {
      const bytes = new Uint8Array(record.data.buffer, record.data.byteOffset, record.data.byteLength);

      // Chrome on Android decodes URI records and hands back the full URL string directly.
      const fullText = decoder.decode(bytes);
      if (isPaymentUrl(fullText)) return fullText;

      // Spec-compliant raw NDEF: first byte is the URI identifier code (prefix table).
      const prefix = NFC_URI_PREFIXES[bytes[0]] ?? "";
      const urlWithPrefix = prefix + decoder.decode(bytes.slice(1));
      if (isPaymentUrl(urlWithPrefix)) return urlWithPrefix;
    }

    if (record.recordType === "text" && record.data) {
      const bytes = new Uint8Array(record.data.buffer, record.data.byteOffset, record.data.byteLength);
      const langLen = bytes[0] & 0x3f;
      const text = decoder.decode(bytes.slice(1 + langLen));
      if (isPaymentUrl(text)) return text;
    }

    if ((record.recordType === "smart-poster" || record.recordType === "mime") && record.data) {
      const text = decoder.decode(new Uint8Array(record.data.buffer, record.data.byteOffset, record.data.byteLength));
      if (isPaymentUrl(text)) return text;
    }
  }
  throw new Error("No payment URL found on card");
}

function normalizeCardUrl(url: string): string {
  if (url.startsWith("lnurlw://")) return "https://" + url.slice(9);
  return url;
}

function pinNeeded(pinLimit: number | undefined, amountSats: number): boolean {
  if (pinLimit === undefined) return false;
  return amountSats * 1000 >= pinLimit;
}

export default function PosPage() {
  const { account } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { btcPrice, fiatToSats, isSats, label: currencyLabel } = useFiatCurrency();

  const [step, setStep] = useState<Step>("amount");
  const [nfcStatus, setNfcStatus] = useState<NfcStatus>("scanning");
  const [amountStr, setAmountStr] = useState("");
  const [unit, setUnit] = useState<Unit>("sats");
  const [invoice, setInvoice] = useState<{ bolt11: string; amountSats: number; expiresAt: string } | null>(null);
  const [prevBalance, setPrevBalance] = useState<number | null>(null);
  const [cardPayment, setCardPayment] = useState<CardPayment | null>(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [charging, setCharging] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  // Shared invoice promise so NFC handler reuses whatever the QR display already requested
  const invoicePromiseRef = useRef<Promise<{ bolt11: string; amountSats: number; expiresAt: string }> | null>(null);
  const nfcAbortRef = useRef<AbortController | null>(null);
  const [nfcSupported] = useState<boolean>(() => typeof window !== "undefined" && "NDEFReader" in window);

  useEffect(() => { if (isSats) setUnit("sats"); }, [isSats]);

  const rawAmount = parseFloat(amountStr) || 0;
  const amountSats = unit === "sats" ? Math.round(rawAmount) : fiatToSats(rawAmount);
  const fiatLabel = isSats ? null : currencyLabel;
  const approxSats = unit === "fiat" && rawAmount > 0 && btcPrice
    ? `≈ ${amountSats.toLocaleString()} sats` : null;

  // Poll balance while the charging screen is visible
  const { data: balance } = useGetBalance(account?.id ?? "", {
    query: {
      enabled: !!account?.id && step === "charging",
      queryKey: getGetBalanceQueryKey(account?.id ?? ""),
      refetchInterval: 2000,
    },
  });

  useEffect(() => {
    if (step !== "charging" || prevBalance === null || !balance) return;
    if (balance.balanceSats > prevBalance) {
      qc.invalidateQueries({ queryKey: getListTransactionsQueryKey(account?.id ?? "") });
      nfcAbortRef.current?.abort();
      setStep("success");
    }
  }, [balance, prevBalance, step, qc, account?.id]);

  const reset = useCallback(() => {
    nfcAbortRef.current?.abort();
    nfcAbortRef.current = null;
    invoicePromiseRef.current = null;
    setStep("amount");
    setAmountStr("");
    setInvoice(null);
    setPrevBalance(null);
    setCardPayment(null);
    setPin("");
    setPinError(null);
    setErrorMsg(null);
    setCharging(false);
    setNfcStatus("scanning");
    setSecondsLeft(null);
    setCopied(false);
  }, []);

  useEffect(() => () => { nfcAbortRef.current?.abort(); }, []);

  // ── Countdown timer ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!invoice?.expiresAt) return;
    const calc = () => Math.max(0, Math.floor((new Date(invoice.expiresAt).getTime() - Date.now()) / 1000));
    setSecondsLeft(calc());
    const id = setInterval(() => {
      const s = calc();
      setSecondsLeft(s);
      if (s === 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [invoice?.expiresAt]);

  // ── Submit NFC callback ──────────────────────────────────────────────────
  const submitCallback = useCallback(async (cp: CardPayment, pinValue?: string) => {
    setNfcStatus("paying");
    try {
      const url = new URL(cp.meta.callback);
      url.searchParams.set("k1", cp.meta.k1);
      url.searchParams.set("pr", cp.invoice.bolt11);
      if (pinValue) url.searchParams.set("pin", pinValue);

      const res = await fetch(url.toString());
      const data = await res.json() as { status: string; reason?: string };

      if (data.status === "OK") {
        qc.invalidateQueries({ queryKey: getListTransactionsQueryKey(account?.id ?? "") });
        qc.invalidateQueries({ queryKey: getGetBalanceQueryKey(account?.id ?? "") });
        setStep("success");
      } else {
        setErrorMsg(data.reason ?? "Card payment failed");
        setStep("error");
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Payment failed");
      setStep("error");
    }
  }, [account?.id, qc]);

  // ── Process NFC tag ───────────────────────────────────────────────────────
  const processNfcTag = useCallback(async (message: NDEFMessage, tapAmountSats: number) => {
    setNfcStatus("reading");
    try {
      const rawUrl = extractUrlFromNdef(message);
      const cardUrl = normalizeCardUrl(rawUrl);

      const metaRes = await fetch(cardUrl);
      if (!metaRes.ok) throw new Error("Card server unreachable");
      const meta = await metaRes.json() as {
        tag?: string; status?: string; reason?: string;
        callback?: string; k1?: string;
        maxWithdrawable?: number; defaultDescription?: string;
        pinLimit?: number;
      };

      if (meta.status === "ERROR") throw new Error(meta.reason ?? "Card declined");
      if (meta.tag !== "withdrawRequest" || !meta.callback || !meta.k1) {
        throw new Error("Card returned an invalid response");
      }

      const maxSats = Math.floor((meta.maxWithdrawable ?? 0) / 1000);
      if (tapAmountSats > maxSats) {
        throw new Error(`Amount exceeds card limit of ${maxSats.toLocaleString()} sats`);
      }

      // Reuse the shared invoice that was already kicked off for the QR code
      if (!invoicePromiseRef.current) throw new Error("Invoice not ready");
      const invoiceData = await invoicePromiseRef.current;

      const cp: CardPayment = {
        meta: {
          callback: meta.callback,
          k1: meta.k1,
          maxWithdrawableSats: maxSats,
          defaultDescription: meta.defaultDescription ?? "Card payment",
          pinLimit: meta.pinLimit,
        },
        invoice: { bolt11: invoiceData.bolt11, amountSats: invoiceData.amountSats },
      };
      setCardPayment(cp);

      if (pinNeeded(meta.pinLimit, tapAmountSats)) {
        setPin("");
        setPinError(null);
        setStep("nfc-pin");
      } else {
        await submitCallback(cp, undefined);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setErrorMsg(err instanceof Error ? err.message : "Card read failed");
      setStep("error");
    }
  }, [submitCallback]);

  // ── Start NFC reader ──────────────────────────────────────────────────────
  const startNfcScan = useCallback(async (capturedAmount: number) => {
    const controller = new AbortController();
    nfcAbortRef.current = controller;
    setNfcStatus("scanning");

    try {
      const reader = new NDEFReader();

      reader.addEventListener("reading", (event: NDEFReadingEvent) => {
        controller.abort();
        processNfcTag(event.message, capturedAmount);
      });

      reader.addEventListener("readingerror", () => {
        setErrorMsg("Failed to read card - please try again");
        setStep("error");
      });

      await reader.scan({ signal: controller.signal });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError") {
        setErrorMsg("NFC permission denied. Please allow NFC access in your browser settings.");
      } else if (name === "NotSupportedError") {
        setErrorMsg("NFC is not supported on this device.");
      } else {
        setErrorMsg(err instanceof Error ? err.message : "NFC scan failed");
      }
      setStep("error");
    }
  }, [processNfcTag]);

  // ── Single charge action ──────────────────────────────────────────────────
  const handleCharge = useCallback(async () => {
    if (!account?.id || amountSats < 1 || charging) return;
    setCharging(true);
    try {
      const fresh = await qc.fetchQuery({
        queryKey: getGetBalanceQueryKey(account.id),
        queryFn: () => getBalance(account.id),
        staleTime: 0,
      });
      setPrevBalance(fresh.balanceSats);

      const captured = amountSats;

      // Kick off invoice; store promise so NFC handler can await it too
      const promise = createInvoiceApi(account.id, { amountSats: captured, memo: "POS payment" });
      invoicePromiseRef.current = promise;

      setStep("charging");

      // Resolve invoice for QR display (non-blocking)
      promise
        .then(data => setInvoice({ bolt11: data.bolt11, amountSats: data.amountSats, expiresAt: data.expiresAt }))
        .catch(err => {
          const msg = (err as { data?: { error?: string } })?.data?.error
            ?? (err instanceof Error ? err.message : "Failed to create invoice");
          setErrorMsg(msg);
          setStep("error");
        });

      // Arm NFC in parallel (if supported)
      if (nfcSupported) {
        startNfcScan(captured);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      toast({ title: "Error", description: msg, variant: "destructive" });
      setCharging(false);
    }
  }, [account?.id, amountSats, charging, qc, nfcSupported, startNfcScan, toast]);

  // Auto-submit PIN when 4 digits entered
  useEffect(() => {
    if (step === "nfc-pin" && pin.length === 4 && cardPayment) {
      submitCallback(cardPayment, pin);
    }
  }, [pin, step, cardPayment, submitCallback]);

  if (!account) return null;

  // ── Amount screen ─────────────────────────────────────────────────────────
  if (step === "amount") {
    const buttonLabel = amountSats > 0
      ? `Charge ${amountSats.toLocaleString()} sats`
      : "Enter an amount";

    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col" style={{ paddingTop: "max(0px, env(safe-area-inset-top))" }}>
        <header className="flex items-center gap-3 px-4 py-4 border-b border-border shrink-0">
          <button
            type="button"
            onClick={() => navigate("/business")}
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-muted"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold flex-1">Point of Sale</h1>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-6">
            {fiatLabel && (
              <div className="flex justify-center">
                <div className="flex bg-muted rounded-xl p-1 gap-1">
                  {(["sats", "fiat"] as Unit[]).map((u) => (
                    <button
                      key={u}
                      type="button"
                      data-testid={`btn-unit-${u}`}
                      onClick={() => { setUnit(u); setAmountStr(""); }}
                      className={cn(
                        "px-5 py-2 rounded-lg text-sm font-semibold transition-colors",
                        unit === u ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                      )}
                    >
                      {u === "sats" ? "SATS" : fiatLabel}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="text-center py-4">
              <p className="text-6xl font-bold font-mono-nums">{amountStr || "0"}</p>
              <p className="text-muted-foreground text-lg mt-2">{unit === "sats" ? "sats" : currencyLabel}</p>
              {approxSats && <p className="text-muted-foreground text-sm mt-1 font-mono-nums">{approxSats}</p>}
            </div>

            <NumPad value={amountStr} onChange={setAmountStr} />

            <button
              type="button"
              data-testid="btn-charge"
              disabled={amountSats < 1}
              onClick={handleCharge}
              className="w-full bg-primary text-primary-foreground rounded-xl py-5 font-bold text-base disabled:opacity-40"
            >
              {buttonLabel}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Charging screen (QR + NFC in parallel) ────────────────────────────────
  if (step === "charging") {
    const isNfcBusy = nfcStatus === "reading" || nfcStatus === "paying";
    const nfcLabel = nfcStatus === "reading" ? "Reading card…" : nfcStatus === "paying" ? "Processing card…" : "Tap Bolt Card to pay instantly";

    const fmtCountdown = (s: number) => {
      const m = Math.floor(s / 60);
      const sec = s % 60;
      return `${m}:${sec.toString().padStart(2, "0")}`;
    };
    const isExpired = secondsLeft === 0;
    const isLow = secondsLeft !== null && secondsLeft <= 60 && secondsLeft > 0;

    const handleCopy = () => {
      if (!invoice) return;
      navigator.clipboard.writeText(invoice.bolt11).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    };

    // Fill screen width minus padding, capped at 380
    const qrSize = Math.min(380, (typeof window !== "undefined" ? window.innerWidth : 400) - 48);

    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col" style={{ paddingTop: "max(0px, env(safe-area-inset-top))" }}>
        {/* Header */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
          <button
            type="button"
            onClick={reset}
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-muted"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold flex-1">
            {invoice ? `${invoice.amountSats.toLocaleString()} sats` : "Preparing…"}
          </h1>
          {/* Countdown */}
          {secondsLeft !== null && (
            <span className={cn(
              "text-sm font-mono font-semibold tabular-nums px-2 py-1 rounded-lg",
              isExpired
                ? "text-destructive bg-destructive/10"
                : isLow
                  ? "text-orange-400 bg-orange-400/10"
                  : "text-muted-foreground",
            )}>
              {isExpired ? "Expired" : fmtCountdown(secondsLeft)}
            </span>
          )}
          {secondsLeft === null && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span>Waiting</span>
            </div>
          )}
        </header>

        <div className="flex-1 overflow-y-auto flex flex-col items-center py-4 px-6 gap-4">
          {/* QR code - bright white for easy scanning */}
          {invoice ? (
            <>
              <div className="rounded-2xl overflow-hidden shadow-2xl">
                <QRCodeDisplay
                  value={invoice.bolt11.toUpperCase()}
                  size={qrSize}
                  darkColor="#000000"
                  lightColor="#ffffff"
                />
              </div>

              {/* Copy button */}
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-xl hover:bg-muted w-full max-w-sm"
              >
                {copied
                  ? <Check className="w-4 h-4 text-green-400 shrink-0" />
                  : <Copy className="w-4 h-4 shrink-0" />}
                <span className="font-mono truncate flex-1 text-left text-xs">
                  {copied ? "Copied!" : invoice.bolt11.slice(0, 32) + "…"}
                </span>
              </button>
            </>
          ) : (
            <div
              className="rounded-2xl border border-border bg-card flex items-center justify-center"
              style={{ width: qrSize, height: qrSize }}
            >
              <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* NFC strip */}
          {nfcSupported && (
            <div className={cn(
              "w-full max-w-sm rounded-2xl border px-5 py-4 flex items-center gap-4 transition-colors mt-auto",
              isNfcBusy
                ? "border-primary/40 bg-primary/5"
                : "border-border bg-muted/30",
            )}>
              {isNfcBusy ? (
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
              ) : (
                <div className="relative w-8 h-8 shrink-0 flex items-center justify-center">
                  <span className="absolute inset-0 rounded-full border border-primary/40 animate-ping" style={{ animationDuration: "2s" }} />
                  <Wifi className="w-5 h-5 text-primary relative" />
                </div>
              )}
              <div>
                <p className={cn("text-sm font-medium", isNfcBusy ? "text-primary" : "text-foreground")}>
                  {nfcLabel}
                </p>
                {nfcStatus === "scanning" && (
                  <p className="text-xs text-muted-foreground mt-0.5">Hold card to the back of the phone</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── PIN entry ─────────────────────────────────────────────────────────────
  if (step === "nfc-pin") {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col" style={{ paddingTop: "max(0px, env(safe-area-inset-top))" }}>
        <header className="flex items-center gap-3 px-4 py-4 border-b border-border shrink-0">
          <button
            type="button"
            onClick={reset}
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-muted"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold flex-1">Enter PIN</h1>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
          <div className="text-center space-y-1">
            <p className="text-4xl font-bold font-mono-nums">
              {(cardPayment?.invoice.amountSats ?? amountSats).toLocaleString()} sats
            </p>
            {cardPayment?.meta.defaultDescription && (
              <p className="text-muted-foreground text-sm">{cardPayment.meta.defaultDescription}</p>
            )}
          </div>

          <p className="text-muted-foreground text-sm text-center max-w-xs">
            Ask the cardholder to enter their 4-digit PIN
          </p>

          {pinError && (
            <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-xl px-4 py-3 text-sm max-w-sm w-full">
              <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{pinError}</span>
            </div>
          )}

          <PinPad
            value={pin}
            onChange={setPin}
            maxLength={4}
            large
            disabled={nfcStatus === "paying"}
          />
        </div>
      </div>
    );
  }

  // ── Success ───────────────────────────────────────────────────────────────
  if (step === "success") {
    const paidSats = cardPayment?.invoice.amountSats ?? invoice?.amountSats ?? amountSats;
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center" style={{ paddingTop: "max(0px, env(safe-area-inset-top))" }}>
        <div className="flex flex-col items-center justify-center text-center space-y-6 px-8 py-12">
          <div className="w-28 h-28 rounded-full bg-green-500/10 flex items-center justify-center">
            <CheckCircle2 className="w-14 h-14 text-green-400" />
          </div>
          <div className="space-y-2">
            <p className="text-3xl font-bold">Payment received</p>
            <p className="text-muted-foreground font-mono-nums text-2xl">{paidSats.toLocaleString()} sats</p>
            {cardPayment && (
              <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm mt-1">
                <Wifi className="w-3.5 h-3.5" />
                <span>Bolt Card</span>
              </div>
            )}
          </div>
          <button
            type="button"
            data-testid="btn-new-payment"
            onClick={reset}
            className="w-full max-w-xs bg-primary text-primary-foreground rounded-xl py-4 font-semibold text-lg"
          >
            New payment
          </button>
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (step === "error") {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center p-8 text-center gap-6" style={{ paddingTop: "max(0px, env(safe-area-inset-top))" }}>
        <div className="w-24 h-24 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertCircle className="w-12 h-12 text-destructive" />
        </div>
        <div className="space-y-2 max-w-sm">
          <p className="text-2xl font-bold">Payment failed</p>
          <p className="text-muted-foreground text-sm leading-relaxed">{errorMsg ?? "An unexpected error occurred"}</p>
        </div>
        <button
          type="button"
          onClick={reset}
          className="bg-primary text-primary-foreground rounded-xl px-10 py-4 font-semibold text-base"
        >
          Try Again
        </button>
      </div>
    );
  }

  return null;
}
