import axios from "axios";
import { randomBytes, createHash } from "crypto";
import { utils as secpUtils, getPublicKey, signAsync } from "@noble/secp256k1";
import { logger } from "./logger";

/**
 * Boltz v2 reverse submarine swap: Lightning -> on-chain Bitcoin.
 * Pair from=BTC (Lightning) -> to=BTC (on-chain). NOT L-BTC (Liquid).
 */
const BOLTZ_API = process.env.BOLTZ_API_URL ?? "https://api.boltz.exchange/v2";
const FROM_ASSET = "BTC";
const TO_ASSET = "BTC";

export interface ReverseSwap {
  id: string;
  invoice: string;
  onchainAmount: number;
  timeoutBlockHeight: number;
  claimPrivateKeyHex: string;
  preimageHex: string;
  invoiceAmountSats: number;
}

export interface SwapStatus {
  id: string;
  status: string;
  transaction?: { id: string; hex: string };
}

export interface ReversePairInfo {
  minSats: number;
  maxSats: number;
  percentageFee: number;
  minerFees: { claim: number; lockup: number };
  rate: number;
}

export async function getReversePairInfo(): Promise<ReversePairInfo> {
  const { data } = await axios.get(`${BOLTZ_API}/swap/reverse`, { timeout: 15_000 });
  const pair = data?.[FROM_ASSET]?.[TO_ASSET];
  if (!pair) throw new Error(`Boltz reverse pair ${FROM_ASSET}/${TO_ASSET} not available`);
  return {
    minSats: pair.limits?.minimal ?? 25_000,
    maxSats: pair.limits?.maximal ?? 25_000_000,
    percentageFee: pair.fees?.percentage ?? 0.5,
    minerFees: {
      claim: pair.fees?.minerFees?.claim ?? 0,
      lockup: pair.fees?.minerFees?.lockup ?? 0,
    },
    rate: pair.rate ?? 1,
  };
}

export function estimateOnchainAmount(
  invoiceAmountSats: number,
  pair?: Pick<ReversePairInfo, "percentageFee" | "minerFees">,
): number {
  const pct = pair?.percentageFee ?? 0.5;
  const claim = pair?.minerFees.claim ?? 278;
  const fee = Math.ceil(invoiceAmountSats * (pct / 100)) + claim;
  return Math.max(0, invoiceAmountSats - fee);
}

export async function createReverseSwap(
  invoiceAmountSats: number,
  destinationAddress: string,
): Promise<ReverseSwap> {
  const pair = await getReversePairInfo();
  if (invoiceAmountSats < pair.minSats) {
    throw new Error(`Minimum swap is ${pair.minSats} sats (Boltz Lightning->on-chain)`);
  }
  if (invoiceAmountSats > pair.maxSats) {
    throw new Error(`Maximum swap is ${pair.maxSats} sats`);
  }

  const preimage = randomBytes(32);
  const preimageHash = createHash("sha256").update(preimage).digest("hex");

  const claimPrivateKey = secpUtils.randomSecretKey();
  const claimPublicKey = getPublicKey(claimPrivateKey, true);
  const claimPublicKeyHex = Buffer.from(claimPublicKey).toString("hex");

  const addressHash = createHash("sha256").update(destinationAddress).digest();
  const compactSigBytes = await signAsync(addressHash, claimPrivateKey);
  const signatureHex = Buffer.from(compactSigBytes as Uint8Array).toString("hex");

  let data: any;
  try {
    const response = await axios.post(
      `${BOLTZ_API}/swap/reverse`,
      {
        from: FROM_ASSET,
        to: TO_ASSET,
        invoiceAmount: invoiceAmountSats,
        address: destinationAddress,
        addressSignature: signatureHex,
        claimPublicKey: claimPublicKeyHex,
        preimageHash,
      },
      { timeout: 30_000 },
    );
    data = response.data;
  } catch (err: any) {
    const body = err?.response?.data;
    const msg =
      typeof body?.error === "string"
        ? body.error
        : err instanceof Error
          ? err.message
          : "Boltz reverse swap create failed";
    logger.warn({ err: msg, invoiceAmountSats }, "Boltz createReverseSwap failed");
    throw new Error(msg);
  }

  logger.info(
    { swapId: data.id, invoiceAmountSats, onchainAmount: data.onchainAmount },
    "Boltz reverse swap created (LN->on-chain BTC)",
  );

  return {
    id: data.id,
    invoice: data.invoice,
    onchainAmount: data.onchainAmount,
    timeoutBlockHeight: data.timeoutBlockHeight,
    claimPrivateKeyHex: Buffer.from(claimPrivateKey).toString("hex"),
    preimageHex: preimage.toString("hex"),
    invoiceAmountSats,
  };
}

export async function getSwapStatus(swapId: string): Promise<SwapStatus> {
  const response = await axios.get(`${BOLTZ_API}/swap/${swapId}`, { timeout: 15_000 });
  return {
    id: swapId,
    status: response.data.status,
    transaction: response.data.transaction,
  };
}
