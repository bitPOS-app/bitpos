import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Cpu, Zap, Bluetooth, AlertCircle,
  CheckCircle2, XCircle, Loader2, Usb, LogOut,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  POSBOX_SERVICE_UUID, CHAR_SSID_UUID, CHAR_WIFI_PASS_UUID,
  CHAR_TOKEN_UUID, CHAR_SERVER_URL_UUID, CHAR_CURRENCY_UUID,
  CHAR_STATUS_UUID, encodeString,
} from "@/lib/posbox-ble";

// Use origin-relative /api — the deployment routes /api/* to the API server
// directly. Adding the app base-path (e.g. /app/api) hits the static-file
// handler in production and returns index.html instead of JSON.
const API_BASE = `${window.location.origin}/api`;

interface DeviceToken {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
}

function fmtDate(s: string | null): string {
  if (!s) return "Never used";
  return new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Device is "online" if it made an authenticated API call within the last 10 minutes. */
function isOnline(lastUsedAt: string | null): boolean {
  if (!lastUsedAt) return false;
  return Date.now() - new Date(lastUsedAt).getTime() < 10 * 60 * 1000;
}

function useDeviceTokens(accountId: string | undefined) {
  const [tokens, setTokens] = useState<DeviceToken[]>([]);
  const [loading, setLoading] = useState(false);
  const { token: authToken } = useAuth();

  const load = useCallback(async () => {
    if (!accountId || !authToken) return;
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/accounts/${accountId}/device-tokens`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!r.ok) throw new Error("Failed to load");
      const data = await r.json() as DeviceToken[];
      setTokens(data);
    } catch {
      setTokens([]);
    } finally {
      setLoading(false);
    }
  }, [accountId, authToken]);

  useEffect(() => { load(); }, [load]);

  return { tokens, loading, reload: load };
}

async function revokeToken(accountId: string, authToken: string, tokenId: string) {
  const r = await fetch(`${API_BASE}/accounts/${accountId}/device-tokens/${tokenId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!r.ok) throw new Error("Failed to revoke token");
}

type FlashPhase = "idle" | "connecting" | "connected" | "flashing" | "done" | "error";

function FlashModal({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<FlashPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [chipDesc, setChipDesc] = useState<string | null>(null);
  const portRef = useRef<unknown>(null);

  const serial = (navigator as unknown as Record<string, unknown>).serial as { requestPort: () => Promise<unknown> } | undefined;
  const hasSerial = !!serial;

  const handleConnect = async () => {
    if (!serial) return;
    setPhase("connecting");
    setError(null);
    try {
      const port = await serial.requestPort();
      portRef.current = port;
      setPhase("connected");
    } catch (err) {
      if (err instanceof Error && err.name === "NotFoundError") {
        setPhase("idle");
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to open port");
      setPhase("error");
    }
  };

  const handleFlash = async () => {
    if (!portRef.current) return;
    setPhase("flashing");
    setProgress(0);
    setError(null);
    try {
      const { ESPLoader, Transport } = await import("esptool-js");

      const transport = new Transport(portRef.current as never, true);
      const loader = new ESPLoader({
        transport,
        baudrate: 115200,
        terminal: { clean: () => {}, writeLine: () => {}, write: () => {} },
        enableTracing: false,
      });

      const chip = await loader.main();
      setChipDesc(chip ?? "ESP32");

      const fwRes = await fetch(`${API_BASE}/firmware/posbox.bin`);
      if (!fwRes.ok) throw new Error("Failed to download firmware");
      const buf = await fwRes.arrayBuffer();
      const data = new Uint8Array(buf);

      await loader.writeFlash({
        fileArray: [{ data, address: 0x0 }],
        flashSize: "keep",
        flashMode: "keep",
        flashFreq: "keep",
        eraseAll: false,
        compress: true,
        reportProgress: (_fileIndex: number, written: number, total: number) => {
          setProgress(total > 0 ? Math.round((written / total) * 100) : 0);
        },
      });

      await loader.softReset(false);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Flash failed");
      setPhase("error");
    }
  };

  const handleRetry = () => {
    portRef.current = null;
    setPhase("idle");
    setProgress(0);
    setError(null);
    setChipDesc(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-background border border-border rounded-2xl w-full max-w-md p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-base">Flash device</h2>
              <p className="text-xs text-muted-foreground">Install posBOX firmware via USB</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-muted text-muted-foreground">
            <XCircle className="w-4 h-4" />
          </button>
        </div>

        {!hasSerial && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertCircle className="w-4 h-4 inline mr-2" />
            WebSerial is not available. Use Chrome or Edge on a desktop computer, with the ESP32 connected via USB.
          </div>
        )}

        {hasSerial && (
          <div className="space-y-4">
            <div className="space-y-3">
              <StepCard
                number={1}
                label="Connect"
                active={phase === "idle" || phase === "connecting"}
                done={phase === "connected" || phase === "flashing" || phase === "done"}
              >
                {phase === "idle" && (
                  <button type="button" onClick={handleConnect}
                    className="flex items-center gap-2 bg-primary text-primary-foreground rounded-xl px-4 py-2.5 text-sm font-semibold">
                    <Usb className="w-4 h-4" /> Connect to device
                  </button>
                )}
                {phase === "connecting" && (
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Opening port picker…
                  </span>
                )}
                {(phase === "connected" || phase === "flashing" || phase === "done") && (
                  <span className="text-sm text-green-400 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> Port selected
                    {chipDesc && ` · ${chipDesc} detected`}
                  </span>
                )}
              </StepCard>

              <StepCard
                number={2}
                label="Flash firmware"
                active={phase === "connected" || phase === "flashing"}
                done={phase === "done"}
              >
                {phase === "connected" && (
                  <button type="button" onClick={handleFlash}
                    className="flex items-center gap-2 bg-primary text-primary-foreground rounded-xl px-4 py-2.5 text-sm font-semibold">
                    <Zap className="w-4 h-4" /> Flash firmware
                  </button>
                )}
                {phase === "flashing" && (
                  <div className="space-y-2">
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all duration-200" style={{ width: `${progress}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground">{progress}% written</p>
                  </div>
                )}
                {phase === "done" && (
                  <span className="text-sm text-green-400 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> Written successfully
                  </span>
                )}
              </StepCard>

              <StepCard number={3} label="Result" active={phase === "done" || phase === "error"} done={false}>
                {phase === "done" && (
                  <div className="text-sm space-y-1">
                    <p className="font-semibold text-green-400 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" /> Firmware installed
                    </p>
                    <p className="text-muted-foreground">
                      The device will now boot and start Bluetooth provisioning. Use "Link device" to connect it to your account.
                    </p>
                  </div>
                )}
                {phase === "error" && (
                  <div className="space-y-3">
                    <p className="text-sm text-destructive flex items-center gap-2">
                      <XCircle className="w-4 h-4" /> {error ?? "An error occurred"}
                    </p>
                    <button type="button" onClick={handleRetry}
                      className="bg-muted text-foreground rounded-xl px-4 py-2 text-sm font-semibold">
                      Try again
                    </button>
                  </div>
                )}
              </StepCard>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              Requires Chrome or Edge on desktop (USB access)
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function StepCard({ number, label, active, done, children }: {
  number: number;
  label: string;
  active: boolean;
  done: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn(
      "rounded-xl border p-4 space-y-3 transition-colors",
      done ? "border-green-400/30 bg-green-400/5 opacity-70"
        : active ? "border-primary/40 bg-primary/5"
        : "border-border bg-muted/20 opacity-40",
    )}>
      <div className="flex items-center gap-2">
        <div className={cn(
          "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
          done ? "bg-green-400/20 text-green-400"
            : active ? "bg-primary/20 text-primary"
            : "bg-muted text-muted-foreground",
        )}>
          {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : number}
        </div>
        <p className="text-sm font-semibold">{label}</p>
      </div>
      {active && children}
    </div>
  );
}

type LinkPhase = "idle" | "scanning" | "connected" | "provisioning" | "done" | "error";

interface BleCharacteristic {
  writeValueWithoutResponse(value: DataView): Promise<void>;
  startNotifications(): Promise<void>;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  value?: DataView;
}

interface BleService {
  getCharacteristic(uuid: string): Promise<BleCharacteristic>;
}

interface BleGattServer {
  getPrimaryService(uuid: string): Promise<BleService>;
}

interface BleDevice {
  name?: string;
  gatt?: BleGattServer;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
}

function LinkModal({ accountId, authToken, onClose, onLinked }: {
  accountId: string;
  authToken: string;
  onClose: () => void;
  onLinked: () => void;
}) {
  const [phase, setPhase] = useState<LinkPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [ssid, setSsid] = useState("");
  const [wifiPass, setWifiPass] = useState("");
  const [statusMsg, setStatusMsg] = useState("Sending credentials...");
  const gattRef = useRef<BleGattServer | null>(null);
  const deviceRef = useRef<BleDevice | null>(null);
  const issuedTokenIdRef = useRef<string | null>(null);

  const bluetooth = (navigator as unknown as Record<string, unknown>).bluetooth as {
    requestDevice(options: unknown): Promise<BleDevice>;
  } | undefined;
  const hasBluetooth = !!bluetooth;

  const handleScan = async () => {
    if (!bluetooth) return;
    setPhase("scanning");
    setError(null);
    try {
      const device = await bluetooth.requestDevice({
        filters: [{ name: "posBOX" }],
        optionalServices: [POSBOX_SERVICE_UUID],
      });
      if (!device.gatt) throw new Error("Device has no GATT server");
      const server = await (device.gatt as unknown as { connect(): Promise<BleGattServer> }).connect();
      gattRef.current = server;
      deviceRef.current = device;
      setDeviceName(device.name ?? "posBOX");
      setPhase("connected");
    } catch (err) {
      if (err instanceof Error && err.name === "NotFoundError") {
        setPhase("idle");
        return;
      }
      setError(err instanceof Error ? err.message : "Bluetooth scan failed");
      setPhase("error");
    }
  };

  const handleProvision = async () => {
    if (!ssid.trim()) return;
    setPhase("provisioning");
    setStatusMsg("Sending credentials...");
    setError(null);

    let issuedTokenId: string | null = null;
    // Track whether the token was physically written to the device.
    // If true, the device has the token in NVS — never revoke it even on timeout,
    // because the device restarts immediately after connecting which drops BLE
    // before the browser receives the "connected" notification.
    let tokenWrittenToDevice = false;

    try {
      const server = gattRef.current!;
      const service = await server.getPrimaryService(POSBOX_SERVICE_UUID);

      const [cSsid, cPass, cToken, cUrl, cCurrency, cStatus] = await Promise.all([
        service.getCharacteristic(CHAR_SSID_UUID),
        service.getCharacteristic(CHAR_WIFI_PASS_UUID),
        service.getCharacteristic(CHAR_TOKEN_UUID),
        service.getCharacteristic(CHAR_SERVER_URL_UUID),
        service.getCharacteristic(CHAR_CURRENCY_UUID),
        service.getCharacteristic(CHAR_STATUS_UUID),
      ]);

      const currency = localStorage.getItem("bitpos_fiat") ?? "usd";
      // VITE_DEVICE_SERVER_URL lets ops pin the URL written to the device
      // to the Replit-deployed domain (*.replit.app) rather than a custom
      // domain that may use a P-384 / SHA-384 cert the ESP32 can't parse.
      const serverUrl = import.meta.env.VITE_DEVICE_SERVER_URL ?? `${window.location.origin}/api`;

      setStatusMsg("Issuing device token...");
      const tokenResp = await fetch(`${API_BASE}/accounts/${accountId}/device-tokens`, {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ label: deviceName ?? "posBOX" }),
      });
      if (!tokenResp.ok) throw new Error("Failed to issue device token");
      const { token: rawToken, id: tokenId } = await tokenResp.json() as { token: string; id: string };
      issuedTokenId = tokenId;
      issuedTokenIdRef.current = tokenId;

      // Subscribe to status notifications BEFORE writing credentials so we
      // never miss a fast notification (e.g. error:server_unreachable sent
      // seconds after WiFi connects, before startNotifications could finish).
      setStatusMsg("Waiting for device to connect...");
      await cStatus.startNotifications();

      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const settle = (fn: () => void) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          deviceRef.current?.removeEventListener("gattserverdisconnected", onDisconnect);
          fn();
        };

        const timeout = setTimeout(
          () => settle(() => {
            if (tokenWrittenToDevice) {
              resolve();
            } else {
              reject(new Error("Timed out — credentials not written to device"));
            }
          }),
          45_000,
        );

        // If BLE disconnects (device reboots after WiFi connects) and the token
        // is already in NVS, treat it as success immediately — no 45s wait.
        const onDisconnect = () => settle(() => {
          if (tokenWrittenToDevice) {
            resolve();
          } else {
            reject(new Error("Device disconnected before provisioning completed"));
          }
        });
        deviceRef.current?.addEventListener("gattserverdisconnected", onDisconnect);

        cStatus.addEventListener("characteristicvaluechanged", (event: Event) => {
          const target = event.target as { value?: DataView };
          const bytes = target.value ?? new DataView(new ArrayBuffer(0));
          const raw = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
          // Trim C-string null terminator; strip non-printable bytes (garbled BLE frames)
          const val = raw.replace(/\0.*$/, "").replace(/[^\x20-\x7E]/g, "").trim();
          if (val) setStatusMsg(val);
          if (val === "connected") {
            settle(() => resolve());
          } else if (val.startsWith("error:")) {
            settle(() => reject(new Error(val.slice(6) || "Device reported an error")));
          }
        });

        // Write credentials after notifications are live
        (async () => {
          try {
            setStatusMsg("Writing to device...");
            await cSsid.writeValueWithoutResponse(encodeString(ssid));
            await cPass.writeValueWithoutResponse(encodeString(wifiPass));
            await cToken.writeValueWithoutResponse(encodeString(rawToken));
            tokenWrittenToDevice = true; // token is now in device NVS — do not revoke
            await cUrl.writeValueWithoutResponse(encodeString(serverUrl));
            await cCurrency.writeValueWithoutResponse(encodeString(currency));
            setStatusMsg("Waiting for device to connect...");
          } catch (e) {
            settle(() => reject(e instanceof Error ? e : new Error("Write failed")));
          }
        })();
      });

      setPhase("done");
      onLinked();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Provisioning failed";
      setError(msg);
      // Only revoke if the token was never written to the device.
      // If it was written, the device has it stored in NVS and will use it.
      if (issuedTokenId && !tokenWrittenToDevice) {
        revokeToken(accountId, authToken, issuedTokenId).catch(() => {});
      }
      setPhase("error");
    }
  };

  const handleRetry = () => {
    gattRef.current = null;
    deviceRef.current = null;
    issuedTokenIdRef.current = null;
    setPhase("idle");
    setError(null);
    setDeviceName(null);
    setSsid("");
    setWifiPass("");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-background border border-border rounded-2xl w-full max-w-md p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Bluetooth className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="font-semibold text-base">Link device</h2>
              <p className="text-xs text-muted-foreground">Pair via Bluetooth</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-muted text-muted-foreground">
            <XCircle className="w-4 h-4" />
          </button>
        </div>

        {!hasBluetooth && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertCircle className="w-4 h-4 inline mr-2" />
            Web Bluetooth is not available in this browser. Use Chrome or Edge.
          </div>
        )}

        {hasBluetooth && (
          <div className="space-y-3">
            <StepCard
              number={1}
              label="Connect"
              active={phase === "idle" || phase === "scanning"}
              done={["connected", "provisioning", "done"].includes(phase)}
            >
              {phase === "idle" && (
                <button type="button" onClick={handleScan}
                  className="flex items-center gap-2 bg-primary text-primary-foreground rounded-xl px-4 py-2.5 text-sm font-semibold">
                  <Bluetooth className="w-4 h-4" /> Scan for nearby device
                </button>
              )}
              {phase === "scanning" && (
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Scanning…
                </span>
              )}
              {["connected", "provisioning", "done"].includes(phase) && (
                <span className="text-sm text-green-400 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> {deviceName ?? "posBOX"} found
                </span>
              )}
            </StepCard>

            <StepCard
              number={2}
              label="WiFi credentials"
              active={phase === "connected"}
              done={["provisioning", "done"].includes(phase)}
            >
              {phase === "connected" && (
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Network name (SSID)"
                    value={ssid}
                    onChange={(e) => setSsid(e.target.value)}
                    className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    value={wifiPass}
                    onChange={(e) => setWifiPass(e.target.value)}
                    className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                  />
                  <button
                    type="button"
                    onClick={handleProvision}
                    disabled={!ssid.trim()}
                    className="flex items-center gap-2 bg-primary text-primary-foreground rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
                  >
                    Provision device
                  </button>
                </div>
              )}
              {["provisioning", "done"].includes(phase) && (
                <span className="text-sm text-green-400 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> Credentials ready
                </span>
              )}
            </StepCard>

            <StepCard
              number={3}
              label="Result"
              active={phase === "provisioning" || phase === "done" || phase === "error"}
              done={false}
            >
              {phase === "provisioning" && (
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin shrink-0 text-primary" />
                  {statusMsg}
                </div>
              )}
              {phase === "done" && (
                <div className="text-sm space-y-1">
                  <p className="font-semibold text-green-400 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> Device is ready to accept payments
                  </p>
                  <p className="text-muted-foreground">
                    Your posBOX is connected and linked to this account.
                  </p>
                </div>
              )}
              {phase === "error" && (
                <div className="space-y-3">
                  <p className="text-sm text-destructive flex items-center gap-2">
                    <XCircle className="w-4 h-4" /> {error ?? "An error occurred"}
                  </p>
                  <button type="button" onClick={handleRetry}
                    className="bg-muted text-foreground rounded-xl px-4 py-2 text-sm font-semibold">
                    Try again
                  </button>
                </div>
              )}
            </StepCard>
          </div>
        )}
      </div>
    </div>
  );
}

function ReleaseModal({ device, accountId, authToken, onClose, onReleased }: {
  device: DeviceToken;
  accountId: string;
  authToken: string;
  onClose: () => void;
  onReleased: () => void;
}) {
  const [phase, setPhase] = useState<"confirm" | "revoking" | "done" | "error">("confirm");
  const [error, setError] = useState<string | null>(null);

  const handleRelease = async () => {
    setPhase("revoking");
    try {
      await revokeToken(accountId, authToken, device.id);
      setPhase("done");
      onReleased();
    } catch {
      setError("Failed to release device. Try again.");
      setPhase("error");
    }
  };

  const STEPS = [
    `Enable the WiFi network "${device.label || "your old WiFi"}" that the device is configured for (even briefly — 30 s is enough).`,
    "The device will connect, detect the revocation, wipe its config, and reboot into Bluetooth setup mode.",
    "Turn off that WiFi again.",
    'Tap "Link device" to pair it with the new WiFi and this account.',
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-background border border-border rounded-2xl w-full max-w-md p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
              <LogOut className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h2 className="font-semibold text-base">Release device</h2>
              <p className="text-xs text-muted-foreground">{device.label || "posBOX"}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-muted text-muted-foreground">
            <XCircle className="w-4 h-4" />
          </button>
        </div>

        {phase === "confirm" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This revokes the device token. The next time it connects to WiFi it will detect the change, wipe its configuration, and reboot into Bluetooth setup mode — ready to be linked to a new WiFi network or account.
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={handleRelease}
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors">
                Release device
              </button>
              <button type="button" onClick={onClose}
                className="flex-1 bg-muted text-foreground rounded-xl px-4 py-2.5 text-sm font-semibold">
                Cancel
              </button>
            </div>
          </div>
        )}

        {phase === "revoking" && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground py-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
            Revoking token…
          </div>
        )}

        {phase === "done" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-green-400/30 bg-green-400/5 p-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
              <p className="text-sm font-semibold text-green-400">Device released</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">What to do next</p>
              <ol className="space-y-3">
                {STEPS.map((step, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                    <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
            <button type="button" onClick={onClose}
              className="w-full bg-muted text-foreground rounded-xl px-4 py-2.5 text-sm font-semibold">
              Done
            </button>
          </div>
        )}

        {phase === "error" && (
          <div className="space-y-3">
            <p className="text-sm text-destructive flex items-center gap-2">
              <XCircle className="w-4 h-4" /> {error}
            </p>
            <button type="button" onClick={() => setPhase("confirm")}
              className="w-full bg-muted text-foreground rounded-xl px-4 py-2 text-sm font-semibold">
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PosBoxPage() {
  const { account, token: authToken } = useAuth();
  const navigate = useNavigate();
  const { tokens, loading, reload } = useDeviceTokens(account?.id);
  const [showFlash, setShowFlash]     = useState(false);
  const [showLink, setShowLink]       = useState(false);
  const [releaseDevice, setReleaseDevice] = useState<DeviceToken | null>(null);

  if (!account) return null;

  return (
    <>
      <div className="flex flex-col min-h-full">
        <header className="flex items-center gap-3 px-5 pt-8 pb-4 safe-top border-b border-border">
          <button
            type="button"
            onClick={() => navigate("/business")}
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-muted"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Cpu className="w-5 h-5 text-primary" /> posBOX
            </h1>
            <p className="text-xs text-muted-foreground">Standalone Lightning terminal</p>
          </div>
        </header>

        <div className="flex-1 px-5 py-6 space-y-6">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setShowFlash(true)}
              className="bg-card border border-border rounded-2xl p-5 text-left hover:bg-card/80 active:scale-95 transition-all space-y-3"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Zap className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm">Flash device</p>
                <p className="text-muted-foreground text-xs mt-0.5">
                  Plug your ESP32 in and install the firmware
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setShowLink(true)}
              className="bg-card border border-border rounded-2xl p-5 text-left hover:bg-card/80 active:scale-95 transition-all space-y-3"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <Bluetooth className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="font-semibold text-sm">Link device</p>
                <p className="text-muted-foreground text-xs mt-0.5">
                  Pair a flashed device to your account
                </p>
              </div>
            </button>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Paired devices
            </h2>

            {loading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {!loading && tokens.length === 0 && (
              <div className="rounded-2xl border border-border bg-card p-6 text-center space-y-2">
                <Cpu className="w-8 h-8 text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">No devices linked yet</p>
                <p className="text-xs text-muted-foreground">Flash and link your first posBOX to get started</p>
              </div>
            )}

            {!loading && tokens.length > 0 && (
              <div className="space-y-2">
                {tokens.map((t) => (
                  <div
                    key={t.id}
                    className="bg-card border border-border rounded-2xl px-5 py-4 flex items-center justify-between gap-3"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold">{t.label || "posBOX"}</p>
                        {isOnline(t.lastUsedAt) ? (
                          <span className="flex items-center gap-1 text-xs font-medium text-green-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                            online
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 inline-block" />
                            offline
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Linked {fmtDate(t.createdAt)} · Last used {fmtDate(t.lastUsedAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReleaseDevice(t)}
                      title="Release device"
                      className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-orange-500/10 text-muted-foreground hover:text-orange-400 transition-colors shrink-0"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showFlash && <FlashModal onClose={() => setShowFlash(false)} />}
      {showLink && authToken && (
        <LinkModal
          accountId={account.id}
          authToken={authToken}
          onClose={() => setShowLink(false)}
          onLinked={() => { setShowLink(false); reload(); }}
        />
      )}
      {releaseDevice && authToken && (
        <ReleaseModal
          device={releaseDevice}
          accountId={account.id}
          authToken={authToken}
          onClose={() => setReleaseDevice(null)}
          onReleased={() => { reload(); }}
        />
      )}
    </>
  );
}
