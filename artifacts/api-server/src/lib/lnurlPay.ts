/**
 * Shared LNURL-pay helper.
 *
 * Resolves a Lightning address (user@domain) to a bolt11 invoice using the
 * LNURL-pay protocol, then the caller is responsible for paying it.
 */

/** Resolve `address` (user@domain) to a bolt11 invoice for `amountMsats`. */
export async function resolveLnAddress(address: string, amountMsats: number): Promise<string> {
  const atIdx = address.lastIndexOf("@");
  if (atIdx < 1) throw new Error(`Invalid Lightning address format: ${address}`);
  const user = address.slice(0, atIdx);
  const domain = address.slice(atIdx + 1);

  const wellKnownUrl = `https://${domain}/.well-known/lnurlp/${encodeURIComponent(user)}`;
  const metaResp = await fetch(wellKnownUrl, { signal: AbortSignal.timeout(30_000) });
  if (!metaResp.ok) {
    throw new Error(
      `LNURL-pay metadata request failed: ${metaResp.status} ${metaResp.statusText} (${wellKnownUrl})`,
    );
  }

  const meta = await metaResp.json() as Record<string, unknown>;
  if (meta.status === "ERROR") throw new Error(`LNURL-pay metadata error: ${meta.reason}`);
  if (meta.tag !== "payRequest") throw new Error(`Expected payRequest tag, got: ${meta.tag}`);

  const minSendable = Number(meta.minSendable ?? 1000);
  const maxSendable = Number(meta.maxSendable ?? 100_000_000_000);

  if (amountMsats < minSendable || amountMsats > maxSendable) {
    throw new Error(
      `Amount ${amountMsats} msats out of sendable range [${minSendable}, ${maxSendable}] for ${address}`,
    );
  }

  const callbackBase = String(meta.callback);
  const sep = callbackBase.includes("?") ? "&" : "?";
  const invoiceUrl = `${callbackBase}${sep}amount=${amountMsats}`;

  const invoiceResp = await fetch(invoiceUrl, { signal: AbortSignal.timeout(30_000) });
  if (!invoiceResp.ok) {
    throw new Error(
      `LNURL-pay callback failed: ${invoiceResp.status} ${invoiceResp.statusText}`,
    );
  }

  const invoiceData = await invoiceResp.json() as Record<string, unknown>;
  if (invoiceData.status === "ERROR") throw new Error(`LNURL-pay invoice error: ${invoiceData.reason}`);

  const pr = String(invoiceData.pr ?? "");
  if (!pr) throw new Error("LNURL-pay callback returned no bolt11 invoice");
  return pr;
}
