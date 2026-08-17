/** Mask an email for display, e.g. "satoshi@gmail.com" -> "sa*****@gmail.com". */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at < 0) return email;
  const user = email.slice(0, at);
  const domain = email.slice(at + 1);
  const visible = user.slice(0, 2);
  const stars = "*".repeat(Math.max(1, user.length - visible.length));
  return `${visible}${stars}@${domain}`;
}
