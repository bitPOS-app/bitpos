/**
 * Transactional email via SendGrid.
 *
 * Env:
 *   SENDGRID_API_KEY     (required)
 *   SENDGRID_FROM_EMAIL  (default no-reply@bitpos.app)
 *   SENDGRID_FROM_NAME   (default bitPOS)
 */
import { logger } from "./logger";

function getCreds(): { apiKey: string; fromEmail: string; fromName: string } {
  const apiKey = process.env.SENDGRID_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("SendGrid is not configured (missing SENDGRID_API_KEY)");
  }
  if (!apiKey.startsWith("SG.")) {
    logger.warn("SENDGRID_API_KEY does not look like a SendGrid key (expected SG. prefix)");
  }
  const fromEmail = (process.env.SENDGRID_FROM_EMAIL || "no-reply@bitpos.app").trim();
  const fromName = (process.env.SENDGRID_FROM_NAME || "bitPOS").trim();
  return { apiKey, fromEmail, fromName };
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.SENDGRID_API_KEY?.trim());
}

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapHtml(bodyInner: string): string {
  return `<!DOCTYPE html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#0a0a0a; color:#f0f0f0; padding:24px;">
<div style="max-width:480px;margin:0 auto;background:#141414;border:1px solid #2a2a2a;border-radius:12px;padding:28px;">
  <div style="font-size:18px;font-weight:700;margin-bottom:16px;">bit<span style="color:#f7931a;">POS</span></div>
  ${bodyInner}
  <p style="color:#888;font-size:12px;margin-top:28px;">If you did not request this, you can ignore this email.</p>
</div>
</body></html>`;
}

export async function sendEmail({ to, subject, text, html }: SendEmailInput): Promise<void> {
  const { apiKey, fromEmail, fromName } = getCreds();

  const contentArr: Array<{ type: string; value: string }> = [{ type: "text/plain", value: text }];
  const htmlBody =
    html ??
    wrapHtml(
      `<p style="font-size:15px;line-height:1.5;white-space:pre-wrap;">${escapeHtml(text)}</p>`,
    );
  contentArr.push({ type: "text/html", value: htmlBody });

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: fromEmail, name: fromName },
      subject,
      content: contentArr,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logger.error({ status: res.status, body: body.slice(0, 300) }, "SendGrid send failed");
    throw new Error(`SendGrid send failed (${res.status}): ${body.slice(0, 200)}`);
  }
  logger.info({ toDomain: to.split("@")[1] ?? "?", subject }, "Email sent via SendGrid");
}

export async function sendOtpEmail(opts: {
  to: string;
  code: string;
  purpose: "recovery_email_verify" | "account_recovery";
}): Promise<void> {
  const isVerify = opts.purpose === "recovery_email_verify";
  const subject = isVerify
    ? "Verify your bitPOS recovery email"
    : "Your bitPOS account recovery code";
  const intro = isVerify
    ? "Use this code to verify your recovery email."
    : "Use this code to recover your bitPOS account.";
  const text = `${intro}\n\nCode: ${opts.code}\n\nExpires in 10 minutes.`;
  const html = wrapHtml(`
    <p style="font-size:15px;line-height:1.5;">${intro}</p>
    <div style="font-size:32px;letter-spacing:0.35em;font-weight:700;margin:24px 0;color:#f7931a;">${opts.code}</div>
    <p style="color:#aaa;font-size:13px;">Expires in 10 minutes.</p>
  `);
  await sendEmail({ to: opts.to, subject, text, html });
}
