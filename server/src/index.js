import { configureCloudinary, startMediaWorker } from "./services/media.js";
import "express-async-errors";
import "dotenv/config";
import express from "express";
import { errorHandler } from "./middleware/errors.js";
import mongoose from "mongoose";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { persistentLimiter, setting, otpEnabled, otpDevMode } from "./services/otpSecurity.js";
import { otpHashSecret } from "./services/otpCode.js";
import { validateEmailEnvironment } from "./services/email.js";
import { startNotificationWorker } from "./services/notifications.js";
import { startReminderWorker } from "./services/reminderScheduler.js";
import { startCertificateWorker } from "./services/certificateWorker.js";
import { OtpBucket, OtpLock, Challenge, Registration, MediaAsset, ReminderLog } from "./models/index.js";
import publicRoutes, { webhook } from "./routes/public.js";
import adminRoutes from "./routes/admin.js";
import { isAllowedOrigin, isLocalDevOrigin } from "./utils/origin.js";
const required = [
  "MONGODB_URI",
  "JWT_SECRET",
  "FRONTEND_URL",
];
for (const key of required)
  if (
    !process.env[key] ||
    process.env[key].length <
      (key === "JWT_SECRET" || key === "OTP_PEPPER" ? 32 : 1)
  ) {
    console.error(`Missing/too short ${key}. Check server/.env`);
    process.exit(1);
  }
try {
  configureCloudinary();
  otpHashSecret();
  const development = otpDevMode();
  if (otpEnabled() && !development) validateEmailEnvironment();
  setting('OTP_RESEND_COOLDOWN_SECONDS', 60, 30, 300);
  setting('OTP_CHALLENGE_TTL_SECONDS', 300);
  setting('OTP_AUTHORIZATION_TTL_SECONDS', 1800);
  setting('OTP_MAX_VERIFICATION_ATTEMPTS', 5, 1, 10);
  setting('OTP_EMAIL_HOURLY_LIMIT', 5);
  setting('OTP_DRAFT_HOURLY_LIMIT', 5);
  setting('OTP_IP_LIMIT', 30);
  setting('OTP_GLOBAL_HOURLY_LIMIT', 100);
  setting('TRUST_PROXY_HOPS', 0, 0, 5);
  if (process.env.NODE_ENV === 'production' && !process.env.FRONTEND_URL.startsWith('https://')) throw new Error('Production FRONTEND_URL must use HTTPS');
} catch (e) { console.error(e.message); process.exit(1); }
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", setting("TRUST_PROXY_HOPS", 0, 0, 5));
const isDev = process.env.NODE_ENV !== "production";
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.CLIENT_ORIGIN,
  ...(isDev
    ? [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
      ]
    : []),
].filter(Boolean);

const checkOriginAllowed = (origin) => {
  if (!origin) return true;
  if (isAllowedOrigin(origin, allowedOrigins)) return true;
  if (isDev && isLocalDevOrigin(origin)) return true;
  return false;
};

app.use(
  cors({
    origin: (origin, callback) => {
      if (checkOriginAllowed(origin)) return callback(null, true);
      const err = new Error("Origin not allowed by CORS");
      err.status = 403;
      return callback(err);
    },
    credentials: true,
  }),
);
app.use(cookieParser());
// Razorpay webhook MUST receive original raw bytes for HMAC verification.
app.post(
  "/api/webhooks/razorpay",
  express.raw({ type: "application/json", limit: "128kb" }),
  async (req, res, next) => {
    try {
      await webhook(req, res);
    } catch (e) {
      next(e);
    }
  },
);
app.use(express.json({ limit: "100kb" }));
app.use("/api", (req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
const limiter = persistentLimiter('api', 120, 900);
const sensitive = persistentLimiter('sensitive', setting('OTP_IP_LIMIT', 30), 900);
const adminLoginLimiter = persistentLimiter('admin_login', isDev ? 1000 : setting('ADMIN_LOGIN_LIMIT', 30), 900);
app.get("/api/health", (req, res) =>
  res.json({
    ok: mongoose.connection.readyState === 1,
    service: "shree-olympiad-api",
  }),
);
app.use("/api/registrations/start", sensitive);
app.use("/api/registrations/otp", sensitive);
app.use("/api/registrations/resume", sensitive);
app.use("/api/registrations/recovery", sensitive);
app.use("/api/status/request", sensitive);
app.use("/api/status/verify", sensitive);
app.use("/api/admin/login", adminLoginLimiter);
// Enforce same-origin on cookie-authenticated state changes, also protected by SameSite strict.
app.use("/api/admin", (req, res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.headers.origin;
    if (origin && !checkOriginAllowed(origin))
      return res.status(403).json({ error: "Invalid request origin." });
  }
  next();
});
app.use("/api", limiter, publicRoutes);
app.use("/api/admin", adminRoutes);
app.use((req, res) => res.status(404).json({ error: "Not found." }));
app.use(errorHandler);
const startupStage = "database connection and indexes";
try {
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
  });
  await Promise.all([
    OtpBucket.init(),
    OtpLock.init(),
    Challenge.init(),
    Registration.init(),
    MediaAsset.init(),
    ReminderLog.init(),
  ]);
  startNotificationWorker();
  startReminderWorker();
  startMediaWorker();
  startCertificateWorker();
  const port = Number(process.env.PORT || 5000);
  app.listen(port, () =>
    console.log(`Shree Olympiad API listening on ${port}`),
  );
} catch (e) {
  console.error(`Startup failed during ${startupStage}. Check backend configuration and service availability.`);
  process.exit(1);
}
