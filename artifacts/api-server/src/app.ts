import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import router from "./routes";
import lnurlpRouter from "./routes/lnurlp";
import lnurlwRouter from "./routes/lnurlw";
import pinSessionsRouter from "./routes/pin-sessions";
import { logger } from "./lib/logger";

const app: Express = express();

// Trust the reverse-proxy so express-rate-limit keys on the real client IP
// (X-Forwarded-For) instead of the shared proxy IP.  Without this every rate
// limiter would be shared across ALL users, making auth brute-force trivially
// possible and DoS-locking everyone out with just 10 requests.
app.set("trust proxy", 1);

app.use(helmet());

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

const CORS_ORIGINS = [
  ...(process.env.CORS_ORIGINS ?? "http://localhost:8081,http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  ...(process.env.REPLIT_DOMAINS
    ? process.env.REPLIT_DOMAINS.split(",").map((d) => `https://${d.trim()}`).filter(Boolean)
    : []),
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (
        // No Origin header (same-origin requests, curl, React Native fetch)
        !origin ||
        // Explicitly whitelisted HTTP/HTTPS origins
        CORS_ORIGINS.includes(origin) ||
        // Native WebView schemes used by Capacitor / Android App Links.
        // These are not browser contexts and cannot carry cookies to other sites,
        // so they cannot be used for CSRF or cross-origin data theft.
        // NOTE: "null" (file:// / sandboxed iframes) is intentionally NOT included
        // because browsers do send cookies for those and they can be exploited.
        origin.startsWith("capacitor://") ||
        origin.startsWith("android-app://")
      ) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
);

app.use(cookieParser());
app.use(express.json({
  limit: "512kb",
  verify: (req, _res, buf) => {
    (req as import("express").Request & { rawBody?: string }).rawBody = buf.toString("utf8");
  },
}));
app.use(express.urlencoded({ extended: true, limit: "512kb" }));

// ── Rate limiters ─────────────────────────────────────────────────────────────

// Strict limiter for auth endpoints — prevents brute-force and registration spam
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

// Card tap limiter — one legitimate tap per second is plenty
const tapLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { status: "ERROR", reason: "Too many requests, please slow down." },
});

// General API limiter — broad protection against scripted abuse
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

// ── Route registration ────────────────────────────────────────────────────────

// LNURL-pay routes: .well-known must be at root (not /api)
// lnurlp callback is under /api/lnurlp
app.use(lnurlpRouter);

// LNURLw routes: Bolt Card tap endpoint and callback at root level
// Apply tap-specific rate limiting before the route handler
app.use("/card", tapLimiter);
app.use(lnurlwRouter);

// Auth endpoints: strict rate limit to prevent brute-force
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);

app.use("/api", apiLimiter);
app.use("/api", pinSessionsRouter);
app.use("/api", router);

export default app;
