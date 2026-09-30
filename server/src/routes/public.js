import { publicPortal } from "../utils/portalContent.js";
import { supportedClasses } from "../../../shared/branding.mjs";
import express from "express";
import crypto from "node:crypto";
import { memoryUpload, validateUpload } from "../utils/uploads.js";
import { uploadMedia, deleteMedia } from "../services/media.js";
import QRCode from "qrcode";
import { Registration, Payment, Settings, Audit } from "../models/index.js";
import { issueToken, authenticate } from "../middleware/auth.js";
import {
  phone,
  parse,
  startSchema,
  otpSchema,
  manualSchema,
  lookupSchema,
  requireConfigured,
} from "../utils/validation.js";
import { sendOtp, verifyOtp } from "../services/notifications.js";
import { confirmRegistration } from "../services/confirm.js";
import { admitPdf, applicationReceiptPdf } from "../services/pdf.js";
import { assertDraft, assertAuthorization, otpDevMode, withOtpLock, limit } from "../services/otpSecurity.js";
import { Challenge } from "../models/index.js";
const r = express.Router();
// Serialize mutations of a draft across processes, including payment initiation.
r.use('/registrations', async (req, res, next) => {
  if (req.path === '/start') return next();
  return authenticate('draft')(req, res, () => {
    withOtpLock(`draft:${req.viewer.sub}`, () => new Promise(resolve => {
      res.once('finish', resolve); res.once('close', resolve); next();
    })).catch(next);
  });
});
const uploadLimit = async (req, res, next) => {
  try { await limit(`media:${req.viewer.sub}`, 20, 900); next(); } catch (error) { next(error); }
};
const photoUpload = memoryUpload('photo', 5, ['image/jpeg', 'image/png']);
const receiptUpload = memoryUpload('receipt', 3, ['image/jpeg', 'image/png', 'application/pdf']);
const publicSettings = async () =>
  Settings.findOneAndUpdate(
    { _id: "primary" },
    { $setOnInsert: { _id: "primary" } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
const notFound = () =>
  Object.assign(new Error("Registration not found."), { status: 404 });
const safeRegistration = (s) => ({
  id: String(s._id),
  studentName: s.studentName,
  guardianName: s.guardianName,
  studentClass: s.studentClass,
  currentSchool: s.currentSchool,
  registrationNumber: s.registrationNumber || null,
  applicationRef: s.applicationRef,
  status: s.status,
  photoUploaded: !!s.photo?.publicId,
  paymentMode: s.paymentMode,
  verified: !!s.verifiedAt,
  guardianPhone: s.guardianPhone,
  email: s.email,
  notificationStatus: s.notificationStatus,
  verificationExpiresAt: s.verificationExpiresAt,
  seat: s.seat,
  room: s.room,
  checkInAt: s.checkInAt,
});
const getOwn = async (req) => {
  const s = await Registration.findById(req.viewer.sub);
  if (!s) throw notFound();
  assertDraft(s);
  if (s.status === 'OTP_VERIFIED' && (!s.verifiedEmail || s.verifiedEmail !== s.email || !s.verificationExpiresAt || s.verificationExpiresAt <= new Date() || (s.verificationDevMode && !otpDevMode()))) {
    const reset = await Registration.findOneAndUpdate({ _id: s._id, status: 'OTP_VERIFIED', verificationExpiresAt: s.verificationExpiresAt || null },
      { $set: { status: 'DRAFT', verifiedAt: null, verificationExpiresAt: null, verificationDevMode: false } }, { new: true });
    return reset || Registration.findById(s._id);
  }
  return s;
};
r.get("/settings", async (req, res) => {
  const s = await publicSettings();
  res.json({
    eventName: s.eventName,
    eligibleClasses: supportedClasses,
    portal: publicPortal(s.portal),
    fee: s.fee,
    registrationOpen: s.registrationOpen,
    examDate: s.examDate,
    reportingTime: s.reportingTime,
    examTime: s.examTime,
    venue: s.venue,
    paymentMode: s.paymentMode,
    upiId: s.upiId,
    payeeName: s.payeeName,
    contactPhone: s.contactPhone,
    contactEmail: s.contactEmail,
    terms: s.terms,
    privacy: s.privacy,
    refund: s.refund,
    instructions: s.instructions,
    scholarships: s.scholarships,
    razorpayConfigured:
      !!process.env.RAZORPAY_KEY_ID && !!process.env.RAZORPAY_KEY_SECRET,
  });
});
r.get("/payment-qr", async (req, res) => {
  const s = await publicSettings();
  if (!s.upiId || !s.payeeName)
    return res.status(404).send("UPI details are not configured");
  const upi = `upi://pay?pa=${encodeURIComponent(s.upiId)}&pn=${encodeURIComponent(s.payeeName)}&am=${s.fee.toFixed(2)}&cu=INR`;
  const svg = await QRCode.toString(upi, {
    type: "svg",
    margin: 1,
    width: 230,
  });
  res.type("image/svg+xml").set("Cache-Control", "no-store").send(svg);
});
r.post("/registrations/start", async (req, res) => {
  const data = parse(startSchema, req.body);
  const settings = await publicSettings();
  if (!settings.registrationOpen)
    return res.status(403).json({ error: "Registration is currently closed." });
  const dob = new Date(data.dob + "T00:00:00Z");
  if (
    !Number.isFinite(dob.getTime()) ||
    dob.toISOString().slice(0, 10) !== data.dob ||
    dob > new Date() ||
    dob.getUTCFullYear() < 1995
  )
    return res.status(400).json({ error: "Enter a valid date of birth." });
  const key = req.headers['idempotency-key'];
  if (key && (typeof key !== 'string' || !/^[a-f0-9-]{36}$/i.test(key))) return res.status(400).json({ error: 'Invalid application request key.' });
  const values = { ...data, draftExpiresAt: new Date(Date.now() + 10800000), applicationRef: `APP-${crypto.randomBytes(5).toString("hex").toUpperCase()}` };
  const hash = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  let s;
  if (key) {
    try {
      s = await Registration.findOneAndUpdate({ draftRequestKey: key }, { $setOnInsert: { ...values, draftRequestHash: hash } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    } catch (e) {
      if (e.code !== 11000) throw e;
      s = await Registration.findOne({ draftRequestKey: key });
    }
    if (!s || s.draftRequestHash !== hash) return res.status(409).json({ error: 'This application request has already been used with different details.' });
    assertDraft(s);
  } else s = await Registration.create(values);
  res
    .status(201)
    .json({
      token: issueToken({ sub: String(s._id), scope: "draft" }, "3h"),
      registration: safeRegistration(s),
    });
});
r.post(["/registrations/otp/send", "/registrations/otp/resend"], authenticate("draft"), async (req, res) => {
  const s = await getOwn(req);
  if (s.status !== "DRAFT")
    return res
      .status(400)
      .json({ error: "OTP verification is already complete." });
  res.json(await sendOtp(s, "register"));
});
r.post("/registrations/otp/verify", authenticate("draft"), async (req, res) => {
  const { otp } = parse(otpSchema, req.body);
  const s = await getOwn(req);
  if (s.status !== "DRAFT")
    return res.status(400).json({ error: "Already verified." });
  const verified = await verifyOtp(s, "register", otp);
  res.json({
    message: "Email address verified.",
    registration: safeRegistration(verified),
  });
});
r.patch('/registrations/mobile', authenticate('draft'), async (req, res) => {
  const mobile = parse(phone, req.body?.guardianPhone);
  const s = await getOwn(req);
  if (!['DRAFT', 'OTP_VERIFIED'].includes(s.status)) return res.status(409).json({ error: 'Mobile cannot change after payment submission.' });
  const updated = await Registration.findOneAndUpdate({ _id: s._id, status: { $in: ['DRAFT', 'OTP_VERIFIED'] } },
    { $set: { guardianPhone: mobile, status: 'DRAFT', verifiedAt: null, verificationExpiresAt: null, verificationDevMode: false } }, { new: true });
  await Challenge.updateMany({ registrationId: s._id, verificationStatus: 'pending' }, { $set: { verificationStatus: 'superseded' } });
  res.json({ registration: safeRegistration(updated), message: 'Mobile updated. Request a new verification code.' });
});
r.patch('/registrations/email', authenticate('draft'), async (req, res) => {
  const email = parse(startSchema.shape.email, req.body?.email);
  const s = await getOwn(req);
  if (!['DRAFT', 'OTP_VERIFIED'].includes(s.status)) return res.status(409).json({ error: 'Email cannot change after payment submission. Contact the school.' });
  const updated = await Registration.findOneAndUpdate({ _id: s._id, status: { $in: ['DRAFT', 'OTP_VERIFIED'] } },
    { $set: { email, verifiedEmail: '', status: 'DRAFT', verifiedAt: null, verificationExpiresAt: null, verificationDevMode: false } }, { new: true });
  if (!updated) return res.status(409).json({error:'Registration changed. Reload and retry.'});
  await Challenge.updateMany({ registrationId: s._id, verificationStatus: 'pending' }, { $set: { verificationStatus: 'superseded' } });
  res.json({ registration: safeRegistration(updated), message: 'Email updated. Request a new verification code.' });
});
r.get("/registrations/me", authenticate("draft"), async (req, res) => {
  const s = await getOwn(req);
  const challenge = await Challenge.findOne({ registrationId: s._id, purpose: 'register' }).sort({ createdAt: -1 });
  res.json({ registration: safeRegistration(s), resendAvailableAt: challenge?.resendAvailableAt, expiresAt: challenge?.expiresAt });
});
r.post(
  "/registrations/photo",
  authenticate("draft"),
  uploadLimit,
  photoUpload,
  async (req, res) => {
    const s = await getOwn(req);
    if (
      !["DRAFT", "OTP_VERIFIED", "PAYMENT_PENDING", "PAYMENT_REJECTED"].includes(
        s.status,
      )
    )
      return res
        .status(403)
        .json({ error: "Photographs cannot be changed at this application stage." });
    const metadata = await validateUpload(req.file, 'photos');
    const photo = await uploadMedia(req.file.buffer, metadata);
    const prior = s.photo;
    // Compare the record version too: a slow request cannot overwrite newer state.
    const updated = await Registration.findOneAndUpdate({ _id: s._id, __v: s.__v, status: s.status,
      'photo.publicId': prior?.publicId || null },
      { $set: { photo, photoPath: '' }, $inc: { __v: 1 } }, { new: true });
    if (!updated) {
      await deleteMedia(photo);
      return res.status(409).json({ error: 'Registration changed. Reload and retry.' });
    }
    // On an ambiguous DB failure the journal reconciles references before deletion.
    await deleteMedia(prior);
    res.json({ message: "Student photograph uploaded.", photoUploaded: true });
  },
);
r.post(
  "/registrations/manual",
  authenticate("draft"),
  uploadLimit,
  receiptUpload,
  async (req, res) => {
    const data = parse(manualSchema, req.body);
    const s = await getOwn(req);
    const settings = await publicSettings();
    if (settings.paymentMode !== "manual")
      return res
        .status(400)
        .json({ error: "Manual payment mode is disabled." });
    if (
      !s.verifiedAt ||
      !["OTP_VERIFIED", "PAYMENT_REJECTED"].includes(s.status)
    )
      return res
        .status(409)
        .json({
          error:
            "Mobile must be verified and registration must be eligible for payment.",
        });
    assertAuthorization(s);
    if (!s.photo?.publicId)
      return res
        .status(400)
        .json({
          error: "Student passport-size photograph is required before payment.",
        });
    if (!settings.upiId)
      return res.status(503).json({ error: "School UPI ID not configured." });
    const metadata = await validateUpload(req.file, 'receipts');
    const receipt = await uploadMedia(req.file.buffer, metadata);
    let pay;
    try {
      pay = await Payment.create({
        registrationId: s._id,
        mode: "manual",
        amount: settings.fee,
        utr: data.utr.toUpperCase(),
        receipt,
        status: "UNDER_REVIEW",
      });
      const updated = await Registration.findOneAndUpdate(
        { _id: s._id, $or: [{ status: "OTP_VERIFIED", verificationExpiresAt: { $gt: new Date() } }, { status: "PAYMENT_REJECTED" }] },
        {
          $set: {
            paymentId: pay._id,
            paymentMode: "manual",
            termsAcceptedAt: new Date(),
            status: "PAYMENT_UNDER_VERIFICATION",
          },
        },
        { new: true },
      );
      if (!updated) {
        await Payment.deleteOne({ _id: pay._id });
        await deleteMedia(receipt);
        return res
          .status(409)
          .json({ error: "Registration was updated in another session." });
      }
      res
        .status(201)
        .json({
          message:
            "Receipt submitted. Payment is awaiting actual bank verification by the school.",
          registration: safeRegistration(updated),
        });
    } catch (e) {
      // Resolve an uncertain database result before removing its receipt.
      if (pay) {
        const linked = await Registration.exists({ _id: s._id, paymentId: pay._id });
        if (!linked) { await Payment.deleteOne({ _id: pay._id }); await deleteMedia(receipt); }
      }
      // If create failed ambiguously, the journal will check actual references.

      if (e.code === 11000)
        return res
          .status(409)
          .json({
            error: "This transaction reference has already been submitted.",
          });
      throw e;
    }
  },
);
const rzAuth = () => {
  requireConfigured(process.env.RAZORPAY_KEY_ID, "RAZORPAY_KEY_ID");
  requireConfigured(process.env.RAZORPAY_KEY_SECRET, "RAZORPAY_KEY_SECRET");
  return (
    "Basic " +
    Buffer.from(
      `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`,
    ).toString("base64")
  );
};
async function rzFetch(route, init = {}) {
  const response = await fetch("https://api.razorpay.com/v1/" + route, {
    ...init,
    headers: {
      Authorization: rzAuth(),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw Object.assign(new Error("Payment provider rejected the request."), {
      status: 502,
    });
  return response.json();
}
r.post(
  "/registrations/razorpay/order",
  authenticate("draft"),
  async (req, res) => {
    const s = await getOwn(req),
      settings = await publicSettings();
    if (settings.paymentMode !== "razorpay")
      return res
        .status(400)
        .json({ error: "Online gateway mode is disabled." });
    if (
      !s.verifiedAt ||
      !["OTP_VERIFIED", "PAYMENT_PENDING"].includes(s.status)
    )
      return res.status(409).json({ error: "Verify mobile before payment." });
    assertAuthorization(s);
    if (!s.photo?.publicId)
      return res
        .status(400)
        .json({
          error: "Student passport-size photograph is required before payment.",
        });
    if (req.body?.termsAccepted !== true)
      return res
        .status(400)
        .json({ error: "Accept the terms before payment." });
    const prior = await Payment.findOne({
      registrationId: s._id,
      mode: "razorpay",
      status: "PENDING",
    }).sort({ createdAt: -1 });
    if (prior && Date.now() - prior.createdAt.getTime() < 15 * 60 * 1000)
      return res.json({
        orderId: prior.providerOrderId,
        key: process.env.RAZORPAY_KEY_ID,
        amount: prior.amount * 100,
        currency: "INR",
      });
    const order = await rzFetch("orders", {
      method: "POST",
      body: JSON.stringify({
        amount: settings.fee * 100,
        currency: "INR",
        receipt: String(s._id),
        notes: { event: "SHREE 2026 OLYMPIAD" },
      }),
    });
    const pay = await Payment.create({
      registrationId: s._id,
      mode: "razorpay",
      amount: settings.fee,
      providerOrderId: order.id,
      status: "PENDING",
    });
    s.paymentId = pay._id;
    s.paymentMode = "razorpay";
    s.status = "PAYMENT_PENDING";
    s.termsAcceptedAt = new Date();
    await s.save();
    res.json({
      orderId: order.id,
      key: process.env.RAZORPAY_KEY_ID,
      amount: settings.fee * 100,
      currency: "INR",
    });
  },
);
export async function captureRazorpay(orderId, paymentId) {
  const pay = await Payment.findOne({
    providerOrderId: orderId,
    mode: "razorpay",
  });
  if (!pay) throw notFound();
  if (pay.status === "PAID") {
    if (pay.providerPaymentId !== paymentId) throw Object.assign(new Error("Different payment already recorded."), { status: 409 });
    const s = await Registration.findById(pay.registrationId);
    return s.status === "CONFIRMED"
      ? s
      : confirmRegistration(s._id, "razorpay-recovery");
  }
  const provider = await rzFetch(`payments/${encodeURIComponent(paymentId)}`);
  if (
    provider.order_id !== orderId ||
    provider.status !== "captured" ||
    provider.amount !== pay.amount * 100 ||
    provider.currency !== "INR"
  )
    throw Object.assign(
      new Error("Provider payment is not captured or does not match."),
      { status: 400 },
    );
  const updated = await Payment.findOneAndUpdate(
    { _id: pay._id, status: "PENDING" },
    {
      $set: {
        status: "PAID",
        providerPaymentId: paymentId,
        verifiedAt: new Date(),
      },
    },
    { new: true },
  );
  if (!updated) {
    const existing = await Payment.findById(pay._id);
    if (existing?.providerPaymentId !== paymentId)
      throw Object.assign(new Error("Different payment already recorded."), {
        status: 409,
      });
  }
  return confirmRegistration(pay.registrationId, "razorpay");
}
r.post(
  "/registrations/razorpay/verify",
  authenticate("draft"),
  async (req, res) => {
    const { orderId, paymentId, signature } = req.body || {};
    if (![orderId, paymentId, signature].every((s) => typeof s === "string"))
      return res
        .status(400)
        .json({ error: "Missing provider signature fields." });
    const payment = await Payment.findOne({
      registrationId: req.viewer.sub,
      providerOrderId: orderId,
      mode: "razorpay",
    });
    if (!payment)
      return res
        .status(404)
        .json({ error: "Payment order not found for this student." });
    const expected = crypto
      .createHmac(
        "sha256",
        requireConfigured(
          process.env.RAZORPAY_KEY_SECRET,
          "RAZORPAY_KEY_SECRET",
        ),
      )
      .update(`${orderId}|${paymentId}`)
      .digest("hex");
    const a = Buffer.from(expected),
      b = Buffer.from(signature);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b))
      return res.status(400).json({ error: "Invalid payment signature." });
    const confirmed = await captureRazorpay(orderId, paymentId);
    res.json({
      message: "Payment confirmed by provider.",
      registration: safeRegistration(confirmed),
    });
  },
);
r.post("/status/request", async (req, res) => {
  const data = parse(lookupSchema, req.body);
  const s = await Registration.findOne({
    [data.registrationNumber.startsWith("APP-")
      ? "applicationRef"
      : "registrationNumber"]: data.registrationNumber,
    guardianPhone: data.phone,
  });
  if (!s)
    return res
      .status(404)
      .json({ error: "No matching registration. Check number and mobile." });
  const result = await sendOtp(s, "lookup");
  res.json({
    lookupToken: issueToken(
      { sub: String(s._id), scope: "lookup-pending" },
      "10m",
    ),
    ...result,
  });
});
r.post("/status/verify", authenticate("lookup-pending"), async (req, res) => {
  const { otp } = parse(otpSchema, req.body);
  const s = await getOwn(req);
  const verified = await verifyOtp(s, "lookup", otp);
  res.json({
    accessToken: issueToken({ sub: String(s._id), scope: "student" }, "30m"),
    registration: safeRegistration(verified),
  });
});
r.get("/status/me", authenticate("student"), async (req, res) => {
  const s = await getOwn(req);
  res.json({ registration: safeRegistration(s) });
});
async function downloadApplicationReceipt(req, res) {
  const s = await getOwn(req);
  if (['DRAFT', 'OTP_VERIFIED'].includes(s.status))
    return res.status(403).json({ error: "Submit your application before downloading its receipt." });
  const payment = s.paymentId ? await Payment.findOne({ _id: s.paymentId, registrationId: s._id }) : null;
  await applicationReceiptPdf(res, s, payment);
}
r.get("/registrations/application-receipt", authenticate("draft"), downloadApplicationReceipt);
r.get("/application-receipt", authenticate("student"), downloadApplicationReceipt);
r.get("/registrations/admit-card", authenticate("draft"), async (req, res) => {
  const s = await getOwn(req);
  if (s.status !== "CONFIRMED")
    return res.status(403).json({ error: "Payment confirmation required." });
  await admitPdf(res, s, await publicSettings());
});
r.get("/admit-card", authenticate("student"), async (req, res) => {
  const s = await getOwn(req);
  if (s.status !== "CONFIRMED")
    return res
      .status(403)
      .json({ error: "Admit card available only after payment confirmation." });
  await admitPdf(res, s, await publicSettings());
});
r.get("/verify/:token", async (req, res) => {
  const s = await Registration.findOne({
    admitToken: req.params.token,
    status: "CONFIRMED",
  });
  if (!s) return res.status(404).json({ valid: false });
  res.json({
    valid: true,
    registrationNumber: s.registrationNumber,
    studentName: s.studentName,
    studentClass: s.studentClass,
    room: s.room,
    seat: s.seat,
    checkedIn: !!s.checkInAt,
  });
});
export const webhook = async (req, res) => {
  const secret = requireConfigured(
    process.env.RAZORPAY_WEBHOOK_SECRET,
    "RAZORPAY_WEBHOOK_SECRET",
  );
  const sig = req.headers["x-razorpay-signature"];
  if (typeof sig !== "string") return res.status(400).send("Missing signature");
  const calc = crypto
    .createHmac("sha256", secret)
    .update(req.body)
    .digest("hex");
  const a = Buffer.from(calc),
    b = Buffer.from(sig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b))
    return res.status(400).send("Invalid signature");
  const event = JSON.parse(req.body.toString());
  if (event.event === "payment.captured") {
    const payment = event.payload?.payment?.entity;
    if (payment?.order_id && payment.id)
      await captureRazorpay(payment.order_id, payment.id);
  }
  res.json({ ok: true });
};
export { safeRegistration, publicSettings };
export default r;
