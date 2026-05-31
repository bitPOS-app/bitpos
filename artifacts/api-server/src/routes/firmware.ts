import { Router, type IRouter } from "express";
import { createReadStream, existsSync } from "fs";
import { join } from "path";

const router: IRouter = Router();

const FIRMWARE_PATH = join(__dirname, "../public/firmware/posbox-latest.bin");

// GET /firmware/posbox.bin — serve the compiled posBOX firmware binary for WebSerial flashing
router.get("/firmware/posbox.bin", (req, res): void => {
  if (!existsSync(FIRMWARE_PATH)) {
    res.status(404).json({ error: "Firmware not yet available" });
    return;
  }

  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", 'attachment; filename="posbox-latest.bin"');
  res.setHeader("Cache-Control", "no-cache");
  createReadStream(FIRMWARE_PATH).pipe(res);
});

export default router;
