import app from "./app";
import { logger } from "./lib/logger";
import { startInvoiceMonitor } from "./lib/invoiceMonitor";
import { startBoltzMonitor } from "./lib/boltzMonitor";
import { isConfigured } from "./lib/nwc";
import { getBankAccountId } from "./lib/bankAccount";
import { expireStalePinSessions } from "./routes/pin-sessions";
import { startShopOrderExpiryJob } from "./lib/shopOrderExpiry";
import { startShopOrderStatusPoller } from "./lib/shopOrderStatusPoller";
import { seedDefaultStickers } from "./routes/stickers";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Ensure bank revenue account exists
  try {
    const bankAccountId = await getBankAccountId();
    logger.info({ bankAccountId }, "Bank revenue account ready");
  } catch (err) {
    logger.error({ err }, "Failed to initialize bank revenue account");
  }

  // Seed default platform stickers
  await seedDefaultStickers();

  if (isConfigured()) {
    startInvoiceMonitor();
    startBoltzMonitor();
  } else {
    logger.warn("ALBY_NWC_URL not set - invoice monitor and Boltz monitor disabled");
  }

  // Expire stale PIN payment sessions every minute
  setInterval(() => {
    expireStalePinSessions().catch((err) =>
      logger.error({ err }, "PIN session expiry cron failed"),
    );
  }, 60_000);

  // Auto-cancel shop orders stuck in awaiting_payment for > 5 minutes
  startShopOrderExpiryJob();

  // Poll Printags for status/tracking changes on in-flight orders (so they
  // advance even when no one has the order page open). Webhooks update them
  // instantly; this is the background safety net.
  startShopOrderStatusPoller();
});
