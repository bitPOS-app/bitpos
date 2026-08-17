import { Router, type IRouter } from "express";
import { createReadStream, existsSync, statSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const FIRMWARE_DIR = join(__dirname, "../public/firmware");
const FACTORY_BIN = join(FIRMWARE_DIR, "posbox-latest.bin");
const OTA_BIN = join(FIRMWARE_DIR, "posbox-ota.bin");

// Current firmware version (update when publishing a new release)
const FIRMWARE_VERSION = "1.0.1";

// GET /firmware/posbox.bin — serve the factory firmware binary for WebSerial flashing
router.get("/firmware/posbox.bin", (req, res): void => {
  if (!existsSync(FACTORY_BIN)) {
    res.status(404).json({ error: "Firmware not yet available" });
    return;
  }
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", 'attachment; filename="posbox-latest.bin"');
  res.setHeader("Cache-Control", "no-cache");
  createReadStream(FACTORY_BIN).pipe(res);
});

// GET /firmware/posbox-version — OTA check endpoint
// Returns the current firmware version and download URL for the app-only OTA binary.
// The device compares this version with its compiled-in FIRMWARE_VERSION.
router.get("/firmware/posbox-version", (req, res): void => {
  const otaExists = existsSync(OTA_BIN);

  if (!otaExists) {
    // No OTA binary available — device is up to date
    res.json({
      version: FIRMWARE_VERSION,
      url: null,
    });
    return;
  }

  const stat = statSync(OTA_BIN);
  const hash = createHash("sha256").update(
    require("fs").readFileSync(OTA_BIN)
  ).digest("hex");

  const protocol = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.get("host") || "bitpos.app";

  res.json({
    version: FIRMWARE_VERSION,
    url: `${protocol}://${host}/api/firmware/posbox-ota.bin`,
    size: stat.size,
    sha256: hash,
  });

  logger.info({ version: FIRMWARE_VERSION, size: stat.size }, "posBOX OTA version served");
});

// GET /firmware/posbox-ota.bin — serve the app-only OTA binary
router.get("/firmware/posbox-ota.bin", (req, res): void => {
  if (!existsSync(OTA_BIN)) {
    res.status(404).json({ error: "OTA firmware not available" });
    return;
  }
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", 'attachment; filename="posbox-ota.bin"');
  res.setHeader("Cache-Control", "no-cache");
  createReadStream(OTA_BIN).pipe(res);
});

export default router;
