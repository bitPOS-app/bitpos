/**
 * Transactional email helper backed by SendGrid.
 *
 * The API key is read from the SENDGRID_API_KEY environment variable. The
 * sending address defaults to no-reply@bitpos.app and can be overridden with
 * SENDGRID_FROM_EMAIL.
 */

interface SendGridCreds {
  apiKey: string;
  fromEmail: string;
}

function getCreds(): SendGridCreds {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    throw new Error("SendGrid is not configured (missing SENDGRID_API_KEY)");
  }

  // Send from the authenticated bitpos.app domain so recipients see "bitpos.app"
  // as the sending domain. Overridable via SENDGRID_FROM_EMAIL.
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || "no-reply@bitpos.app";

  return { apiKey, fromEmail };
}

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendEmail({ to, subject, text, html }: SendEmailInput): Promise<void> {
  const { apiKey, fromEmail } = getCreds();

  const content: Array<{ type: string; value: string }> = [{ type: "text/plain", value: text }];
  if (html) content.push({ type: "text/html", value: html });

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: fromEmail, name: "bitPOS" },
      subject,
      content,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`SendGrid send failed (${res.status}): ${body.slice(0, 200)}`);
  }
}
