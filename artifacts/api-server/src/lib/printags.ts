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

  const fileId: string =
    data?.files?.file?.id ??
    data?.id ??
    data?.fileId ??
    data?.file_id ??
    data?.uuid;

  if (!fileId) {
    logger.error({ responseData: data }, "Printags uploadFile: response missing file ID — check field names");
    throw new Error("Unexpected Printags upload response — no file ID returned");
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

  const body: Record<string, unknown> = {
    isDraft: false,
    reference: payload.reference,
    carrierServiceId: "lpf_standard",
    shipTo: {
      name: payload.shippingName,
      phone: payload.shippingPhone ?? "",
      email: payload.shippingEmail,
      address: {
        addressLine1: payload.shippingAddress1,
        ...(payload.shippingAddress2 ? { addressLine2: payload.shippingAddress2 } : {}),
        city: payload.shippingCity,
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

  // Try the most likely field names for the order ID in the response
  const orderId: string =
    data?.orderId ??
    data?.id ??
    data?.order?.id ??
    data?.order?.orderId;

  if (!orderId) {
    logger.error({ responseData: data }, "Printags createOrder: response missing orderId — check field names");
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

  return {
    orderId,
    status:
      data?.order?.status ?? data?.status ?? "unknown",
    trackingNumber:
      data?.order?.trackingNumber ??
      data?.order?.trackingCode ??
      data?.trackingNumber ??
      data?.trackingCode,
  };
}

/** Returns true only if both required env vars are present. */
export function isConfigured(): boolean {
  return Boolean(API_KEY) && Boolean(ACCOUNT_ID);
}
