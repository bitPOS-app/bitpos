import axios from "axios";
import { randomBytes, createHash } from "crypto";
import { utils as secpUtils, getPublicKey, signAsync, Signature } from "@noble/secp256k1";
import { logger } from "./logger";

const BOLTZ_API = "https://api.boltz.exchange/v2";

export interface ReverseSwap {
  id: string;
  invoice: string;
  onchainAmount: number;
  timeoutBlockHeight: number;
  claimPrivateKeyHex: string;
  preimageHex: string;
}

export interface SwapStatus {
  id: string;
  status: string;
  transaction?: {
    id: string;
    hex: string;
  };
}

export async function createReverseSwap(
  invoiceAmountSats: number,
  destinationAddress: string,
): Promise<ReverseSwap> {
  // Generate preimage and its hash
  const preimage = randomBytes(32);
  const preimageHash = createHash("sha256").update(preimage).digest("hex");

  // Generate claim keypair using secp256k1
  const claimPrivateKey = secpUtils.randomSecretKey();
  const claimPublicKey = getPublicKey(claimPrivateKey, true);
  const claimPublicKeyHex = Buffer.from(claimPublicKey).toString("hex");

  // Sign the destination address for Boltz v2 verification
  // signAsync returns compact 64-byte signature bytes
  const addressHash = createHash("sha256").update(destinationAddress).digest();
  const compactSigBytes = await signAsync(addressHash, claimPrivateKey);
  // Use compact (64-byte) signature format for Boltz
  const signatureHex = Buffer.from(compactSigBytes as Uint8Array).toString("hex");

  const response = await axios.post(`${BOLTZ_API}/swap/reverse`, {
    from: "L-BTC",
    to: "BTC",
    invoiceAmount: invoiceAmountSats,
    address: destinationAddress,
    addressSignature: signatureHex,
    claimPublicKey: claimPublicKeyHex,
    preimageHash,
  });

  const data = response.data;
  logger.info({ swapId: data.id }, "Boltz reverse swap created");

  return {
    id: data.id,
    invoice: data.invoice,
    onchainAmount: data.onchainAmount,
    timeoutBlockHeight: data.timeoutBlockHeight,
    claimPrivateKeyHex: Buffer.from(claimPrivateKey).toString("hex"),
    preimageHex: preimage.toString("hex"),
  };
}

export async function getSwapStatus(swapId: string): Promise<SwapStatus> {
  const response = await axios.get(`${BOLTZ_API}/swap/${swapId}`);
  return {
    id: swapId,
    status: response.data.status,
    transaction: response.data.transaction,
  };
}

export function estimateOnchainAmount(invoiceAmountSats: number): number {
  const fee = Math.ceil(invoiceAmountSats * 0.005);
  return invoiceAmountSats - fee;
}
