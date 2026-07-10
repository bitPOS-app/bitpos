import { Router, type IRouter } from "express";
import { version } from "@workspace/version";

const router: IRouter = Router();

/**
 * GET /api/version
 *
 * Returns the git commit, tag, and build timestamp the running server was
 * compiled from. Public, unauthenticated, cacheable for 60 seconds.
 *
 * "Verify, don't trust." Anyone can call this endpoint and compare the
 * commit field against github.com/bitPOS-app/bitpos to prove what code is
 * actually running in production.
 */
router.get("/version", (_req, res) => {
  res.set("Cache-Control", "public, max-age=60");
  res.json(version);
});

export default router;
