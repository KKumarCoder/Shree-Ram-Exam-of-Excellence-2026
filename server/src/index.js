import "express-async-errors";
import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import publicRoutes, { webhook } from "./routes/public.js";
import adminRoutes from "./routes/admin.js";
import { isAllowedOrigin } from "./utils/origin.js";
const required = ["MONGODB_URI", "JWT_SECRET", "OTP_PEPPER", "FRONTEND_URL"];
for (const key of required)
  if (
    !process.env[key] ||
    process.env[key].length <
      (key === "JWT_SECRET" || key === "OTP_PEPPER" ? 32 : 1)
  ) {
    console.error(`Missing/too short ${key}. Check server/.env`);
    process.exit(1);
  }
if (
  process.env.NODE_ENV === "production" &&
  process.env.OTP_DELIVERY === "dev"
) {
  console.error("Development OTP is not permitted in production.");
  process.exit(1);
}
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet());
const allowedOrigins = [process.env.FRONTEND_URL];
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || isAllowedOrigin(origin, allowedOrigins))
        return callback(null, true);
      return callback(new Error("Origin not allowed by CORS"));
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
const wrap = (router) => (req, res, next) => router(req, res, next);
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});
const sensitive = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests. Please retry later." },
});
app.get("/api/health", (req, res) =>
  res.json({
    ok: mongoose.connection.readyState === 1,
    service: "shree-olympiad-api",
  }),
);
app.use("/api/registrations/start", sensitive);
app.use("/api/registrations/otp", sensitive);
app.use("/api/status/request", sensitive);
app.use("/api/status/verify", sensitive);
app.use("/api/admin/login", sensitive);
// Enforce same-origin on cookie-authenticated state changes, also protected by SameSite strict.
app.use("/api/admin", (req, res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.headers.origin;
    if (origin && !isAllowedOrigin(origin, allowedOrigins))
      return res.status(403).json({ error: "Invalid request origin." });
  }
  next();
});
app.use("/api", limiter, publicRoutes);
app.use("/api/admin", adminRoutes);
app.use((req, res) => res.status(404).json({ error: "Not found." }));
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status =
    err.status ||
    (err.code === "LIMIT_FILE_SIZE"
      ? 413
      : err.name === "CastError"
        ? 400
        : 500);
  if (status === 500) console.error(err);
  res
    .status(status)
    .json({ error: status === 500 ? "Unexpected server error." : err.message });
});
try {
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
  });
  const port = Number(process.env.PORT || 5000);
  app.listen(port, () =>
    console.log(`Shree Olympiad API listening on ${port}`),
  );
} catch (e) {
  console.error("Database connection failed:", e.message);
  process.exit(1);
}
