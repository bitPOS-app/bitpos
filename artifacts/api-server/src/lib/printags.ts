import axios, { type AxiosError } from "axios";
import { logger } from "./logger";

const BASE_URL = "https://api.printags.com";
const API_KEY = process.env.PRINTAGS_SECRET_KEY;
const ACCOUNT_ID = process.env.PRINTAGS_ACCOUNT_ID;

function getHeaders() {
  if (!API_KEY) throw new Error("PRINTAGS_SECRET_KEY is not configured");
  return { Authorization: `Bearer ${API_KEY}` };
}

function getAccountId(): string {
  if (!ACCOUNT_ID) throw new Error("PRINTAGS_ACCOUNT_ID is not configured");
  return ACCOUNT_ID;
}

/**
 * Sanitize a shipping text field to satisfy Printags' address validation.
 *
 * Printags validates name / addressLine1 / addressLine2 / city against the
 * pattern:  ^[a-zA-Z0-9à-öø-ÿÀ-ÖØ-ß-._ ',]+$
 *
 * That set excludes very common address characters — most notably the forward
 * slash "/" (e.g. Thai house numbers like "71/57"), which previously caused a
 * silent HTTP 400 after the customer had already paid. We map the common cases
 * to allowed equivalents and replace anything else with a space so the order is
 * accepted while staying as faithful as possible to the original address.
 */
export function sanitizeForPrintags(value: string): string {
  return value
    .replace(/[/\\|]+/g, "-")        // slashes / pipes -> hyphen ("71/57" -> "71-57")
    .replace(/&/g, " and ")           // ampersand -> "and"
    .replace(/[^a-zA-Z0-9à-öø-ÿÀ-ÖØ-ß\-._ ',]/g, " ") // strip remaining disallowed chars
    .replace(/\s+/g, " ")             // collapse whitespace
    .trim();
}

function logAxiosError(context: string, err: unknown) {
  const e = err as AxiosError;
  if (e?.isAxiosError) {
    logger.error(
      {
        context,
        httpStatus: e.response?.status,
        responseBody: e.response?.data,
        requestUrl: e.config?.url,
        requestBody: e.config?.data,
      },
      `Printags API error — ${context}`,
    );
  } else {
    logger.error({ context, err }, `Printags unexpected error — ${context}`);
  }
}

export interface PrintagsUploadResult {
  fileId: string;
}

export interface PrintagsOrderPayload {
  reference?: string;
  quantity: number;
  modelId?: string;            // defaults to ntag424_pvccard_white
  carrierServiceId?: string;   // chosen shipping service; defaults to lpf_standard
  printingVisuals?: string[];  // file UUIDs from upload API; omit for plain white
  shippingName: string;
  shippingPhone?: string;
  shippingEmail: string;
  shippingAddress1: string;
  shippingAddress2?: string;
  shippingCity: string;
  shippingPostalCode: string;
  shippingCountry: string;     // ISO 3166-1 alpha-2
  internalOrderId?: string;    // stored in product metadata for traceability
}

export interface PrintagsOrderResult {
  orderId: string;
}

export interface PrintagsOrderStatus {
  orderId: string;
  status: string;
  trackingNumber?: string;
}

/**
 * Upload a print-ready artwork file to Printags account storage.
 * Returns the file UUID to use in printingVisuals when creating an order.
 */
export async function uploadFile(
  buffer: Buffer,
  filename: string,
  mimetype: string,
): Promise<PrintagsUploadResult> {
  const accountId = getAccountId();
  const url = `${BASE_URL}/accounts/${accountId}/files`;

  const form = new FormData();
  const ab = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
  form.append("file", new Blob([ab], { type: mimetype }), filename);

  logger.info({ url, filename, mimetype, sizeBytes: buffer.byteLength }, "Printags → uploadFile request");

  let response;
  try {
    response = await axios.post(url, form, {
      headers: { ...getHeaders() },
      timeout: 30_000,
    });
  } catch (err) {
    logAxiosError("uploadFile", err);
    throw err;
  }

  const data = response.data;
  logger.info({ httpStatus: response.status, responseData: data }, "Printags ← uploadFile response");

  // Live API response confirmed from real upload:
  //   { "success": true, "files": { "file": { "id": "uuid", ... } } }
  // The upload endpoint wraps in "files" (plural) unlike the GET /files/{id} endpoint.
  // Field: data.files.file.id
  const fileId: string = data?.files?.file?.id;

  if (!fileId) {
    logger.error({ responseData: data }, "Printags uploadFile: response missing data.files.file.id");
    throw new Error("Unexpected Printags upload response — no file ID at data.files.file.id");
  }
  return { fileId };
}

/**
 * Create a physical NFC card order with Printags.
 *
 * - Plain white cards: omit printingVisuals, modelId defaults to ntag424_pvccard_white
 * - Printed cards:     pass printingVisuals with the file UUID(s) from uploadFile()
 *
 * Endpoint: POST /accounts/{accountId}/orders
 * Docs:     https://docs.printags.com/create-a-new-order-32371917e0
 */
export async function createOrder(
  payload: PrintagsOrderPayload,
): Promise<PrintagsOrderResult> {
  const accountId = getAccountId();
  const url = `${BASE_URL}/accounts/${accountId}/orders`;

  const name = sanitizeForPrintags(payload.shippingName);
  const addressLine1 = sanitizeForPrintags(payload.shippingAddress1);
  const city = sanitizeForPrintags(payload.shippingCity);

  // If sanitization removes every allowed character (e.g. a name or address
  // written entirely in a non-Latin script), the field would be empty and
  // Printags would reject the order with a cryptic 400 on every retry. Fail
  // loudly here instead so the log names the exact offending field.
  const emptied = [
    ["shippingName", name],
    ["shippingAddress1", addressLine1],
    ["shippingCity", city],
  ].filter(([, v]) => !v).map(([k]) => k);
  if (emptied.length) {
    throw new Error(
      `Printags createOrder: required field(s) empty after sanitization: ${emptied.join(", ")}. ` +
        "Original value contained no characters allowed by the Printags address charset.",
    );
  }

  const body: Record<string, unknown> = {
    isDraft: false,
    reference: payload.reference,
    carrierServiceId: payload.carrierServiceId ?? "lpf_standard",
    shipTo: {
      name,
      phone: payload.shippingPhone ?? "",
      email: payload.shippingEmail,
      address: {
        addressLine1,
        ...(payload.shippingAddress2
          ? { addressLine2: sanitizeForPrintags(payload.shippingAddress2) }
          : {}),
        city,
        postcode: payload.shippingPostalCode,
        countryCode: payload.shippingCountry,
      },
    },
    groups: [
      {
        quantity: payload.quantity ?? 1,
        modelId: payload.modelId ?? "ntag424_pvccard_white",
        nfc: { type: "empty" },
        ...(payload.printingVisuals?.length
          ? { printingVisuals: payload.printingVisuals }
          : {}),
        ...(payload.internalOrderId
          ? { metadata: { internalId: payload.internalOrderId } }
          : {}),
      },
    ],
  };

  logger.info({ url, requestBody: body }, "Printags → createOrder request");

  let response;
  try {
    response = await axios.post(url, body, {
      headers: { ...getHeaders(), "Content-Type": "application/json" },
      timeout: 15_000,
    });
  } catch (err) {
    logAxiosError("createOrder", err);
    throw err;
  }

  const data = response.data;
  logger.info({ httpStatus: response.status, responseData: data }, "Printags ← createOrder response");

  // Docs confirm: POST /accounts/{accountId}/orders returns { "success": true, "orderId": "uuid" }
  // orderId is always at the root level — no nested fallbacks needed.
  const orderId: string = data?.orderId;

  if (!orderId) {
    logger.error({ responseData: data }, "Printags createOrder: response missing orderId at data.orderId");
    throw new Error("Unexpected Printags order response — no orderId returned");
  }

  logger.info({ orderId, reference: payload.reference }, "Printags order created successfully");
  return { orderId };
}

export interface PrintagsShippingItem {
  modelId: string;
  quantity: number;
  packagingId?: string;
}

export interface PrintagsShippingRateParams {
  toCountry: string;       // ISO 3166-1 alpha-2
  toPostalCode: string;
  items: PrintagsShippingItem[];
}

export interface PrintagsCarrierRate {
  serviceId: string;       // carrierServiceId to pass back when creating the order
  name: string;            // human-friendly carrier/service name for display
  priceEurCents: number;   // normalized to EUR cents (integer)
  currency: string;        // currency reported by Printags (expected "EUR")
  estimatedDaysMin?: number;
  estimatedDaysMax?: number;
}

/**
 * Normalize a Printags rate price into EUR cents (integer).
 *
 * Printags' rate shape is not publicly documented, so this is defensive:
 * - If an explicit minor-unit (cents) field is present, use it directly.
 * - Otherwise treat the major-unit amount (e.g. "6.24" or 6.24) as EUR and
 *   multiply by 100. The full raw rate is logged at the call site so the first
 *   real rate fetch can confirm which interpretation Printags actually uses.
 */
function rateToEurCents(rate: Record<string, unknown>): number {
  const centsKeys = ["priceCents", "amountCents", "costCents", "priceEurCents", "priceInCents"];
  for (const k of centsKeys) {
    const v = rate[k];
    if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  }
  const majorKeys = ["price", "amount", "cost", "rate", "total"];
  for (const k of majorKeys) {
    const v = rate[k];
    const num = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
    if (Number.isFinite(num)) return Math.round(num * 100);
  }
  return NaN;
}

function pickString(rate: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = rate[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return undefined;
}

function pickNumber(rate: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = rate[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  }
  return undefined;
}

/**
 * Fetch live shipping rates for a destination + set of items.
 *
 * Endpoint: POST /shipping/rates
 * Request:  { to_country, to_postal_code, items: [{ modelId, quantity, packagingId? }] }
 *
 * Returns the list of carrier services with prices normalized to EUR cents.
 * Throws on transport/HTTP errors so the caller can block checkout (there is
 * intentionally no flat-rate fallback).
 */
export async function getShippingRates(
  params: PrintagsShippingRateParams,
): Promise<PrintagsCarrierRate[]> {
  const url = `${BASE_URL}/shipping/rates`;
  const body = {
    to_country: params.toCountry,
    to_postal_code: params.toPostalCode,
    items: params.items.map((it) => ({
      modelId: it.modelId,
      quantity: it.quantity,
      ...(it.packagingId ? { packagingId: it.packagingId } : {}),
    })),
  };

  logger.info({ url, requestBody: body }, "Printags → getShippingRates request");

  let response;
  try {
    response = await axios.post(url, body, {
      headers: { ...getHeaders(), "Content-Type": "application/json" },
      timeout: 15_000,
    });
  } catch (err) {
    logAxiosError("getShippingRates", err);
    throw err;
  }

  const data = response.data;
  logger.info({ httpStatus: response.status, responseData: data }, "Printags ← getShippingRates response");

  // The exact response shape is undocumented; defensively look for the rates
  // array under several plausible keys.
  const rawRates: unknown =
    data?.rates ??
    data?.carriers ??
    data?.services ??
    data?.shippingRates ??
    data?.carrierServices ??
    (Array.isArray(data?.data) ? data.data : undefined) ??
    (Array.isArray(data) ? data : undefined);

  if (!Array.isArray(rawRates)) {
    logger.error({ responseData: data }, "Printags getShippingRates: no rates array in response");
    throw new Error("Unexpected Printags shipping rates response - no rates array found");
  }

  const rates: PrintagsCarrierRate[] = [];
  for (const entry of rawRates) {
    if (!entry || typeof entry !== "object") continue;
    const r = entry as Record<string, unknown>;
    const serviceId = pickString(r, ["serviceId", "carrierServiceId", "id", "code", "service"]);
    const priceEurCents = rateToEurCents(r);
    if (!serviceId || !Number.isFinite(priceEurCents)) {
      logger.warn({ entry: r }, "Printags getShippingRates: skipping rate with missing serviceId/price");
      continue;
    }
    // bitPOS prices everything in EUR (baseEurCents, btcEurRate). The amount is
    // normalized as EUR cents above, so fail closed on any explicit non-EUR
    // currency rather than silently charging the wrong value. Absent currency is
    // treated as EUR (Printags is a EUR-based merchant).
    const currency = pickString(r, ["currency", "currencyCode"]) ?? "EUR";
    if (currency.toUpperCase() !== "EUR") {
      logger.warn({ entry: r, currency }, "Printags getShippingRates: skipping non-EUR rate");
      continue;
    }
    rates.push({
      serviceId,
      name: pickString(r, ["name", "carrierName", "serviceName", "label", "title"]) ?? serviceId,
      priceEurCents,
      currency,
      estimatedDaysMin: pickNumber(r, ["estimatedDaysMin", "minDays", "deliveryDaysMin", "transitTimeMin"]),
      estimatedDaysMax: pickNumber(r, ["estimatedDaysMax", "maxDays", "deliveryDaysMax", "transitTimeMax", "estimatedDays", "deliveryDays"]),
    });
  }

  if (!rates.length) {
    logger.error({ responseData: data }, "Printags getShippingRates: response contained no usable rates");
    throw new Error("Printags returned no usable shipping rates for this destination");
  }

  return rates;
}

/**
 * Fetch live status and tracking info for an existing Printags order.
 *
 * Endpoint: GET /accounts/{accountId}/orders/{orderId}
 */
export async function getOrder(orderId: string): Promise<PrintagsOrderStatus> {
  const accountId = getAccountId();
  const url = `${BASE_URL}/accounts/${accountId}/orders/${orderId}`;

  logger.info({ url, orderId }, "Printags → getOrder request");

  let response;
  try {
    response = await axios.get(url, { headers: getHeaders(), timeout: 10_000 });
  } catch (err) {
    logAxiosError("getOrder", err);
    throw err;
  }

  const data = response.data;
  logger.info({ httpStatus: response.status, responseData: data }, "Printags ← getOrder response");

  // Docs confirm: GET /accounts/{accountId}/orders/{orderId} returns
  //   { "success": true, "order": { "status": "...", "shippings": [{ "trackingNumber": "..." }] } }
  // Status is always at data.order.status; tracking number is nested in shippings[0].
  return {
    orderId,
    status: data?.order?.status ?? "unknown",
    trackingNumber: data?.order?.shippings?.[0]?.trackingNumber,
  };
}

export interface PrintagsFile {
  buffer: Buffer;
  contentType: string;
}

/**
 * Download a previously-uploaded file (artwork) from Printags account storage.
 * Returns the raw image bytes plus its content type so the API can proxy it to
 * the browser without exposing the Printags secret key.
 *
 * Endpoint: GET /accounts/{accountId}/files/{fileId} (returns the raw image)
 */
export async function getFile(fileId: string): Promise<PrintagsFile> {
  const accountId = getAccountId();
  const url = `${BASE_URL}/accounts/${accountId}/files/${fileId}`;

  let response;
  try {
    response = await axios.get(url, {
      headers: getHeaders(),
      responseType: "arraybuffer",
      timeout: 30_000,
    });
  } catch (err) {
    logAxiosError("getFile", err);
    throw err;
  }

  const contentType =
    (response.headers["content-type"] as string | undefined) ?? "application/octet-stream";
  return { buffer: Buffer.from(response.data as ArrayBuffer), contentType };
}

/** Returns true only if both required env vars are present. */
export function isConfigured(): boolean {
  return Boolean(API_KEY) && Boolean(ACCOUNT_ID);
}
