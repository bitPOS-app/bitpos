export const DOMAIN =
  process.env.DOMAIN ??
  process.env.REPLIT_DOMAINS?.split(",")[0]?.trim() ??
  "bitpos.app";
