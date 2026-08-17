export const POSBOX_SERVICE_UUID     = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
export const CHAR_SSID_UUID          = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
export const CHAR_WIFI_PASS_UUID     = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";
export const CHAR_TOKEN_UUID         = "6e400004-b5a3-f393-e0a9-e50e24dcca9e";
export const CHAR_SERVER_URL_UUID    = "6e400005-b5a3-f393-e0a9-e50e24dcca9e";
export const CHAR_CURRENCY_UUID      = "6e400006-b5a3-f393-e0a9-e50e24dcca9e";
export const CHAR_STATUS_UUID        = "6e400007-b5a3-f393-e0a9-e50e24dcca9e";

export type DeviceStatus = "ready" | "connecting" | "connected" | `error:${string}`;

export function encodeString(s: string): DataView {
  const bytes = new TextEncoder().encode(s);
  const dv = new DataView(bytes.buffer);
  return dv;
}
