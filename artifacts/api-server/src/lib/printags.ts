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
    carrierServiceId: "lpf_standard",
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
