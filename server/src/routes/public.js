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
  emailSchema,
  otpSchema,
  manualSchema,
  lookupSchema,
  resumeRequestSchema,
  resumeSelectSchema,
  requireConfigured,
} from "../utils/validation.js";
import {
  generateStudentIdentityHash,
  normalizeUtr,
  normalizePhone,
} from "../utils/identity.js";
import { maskEmail } from "../services/email.js";
import { sendOtp, verifyOtp } from "../services/notifications.js";
import { confirmRegistration } from "../services/confirm.js";
import { admitPdf, applicationReceiptPdf } from "../services/pdf.js";
import { generateCertificatePdfStream } from "../services/certificatePdf.js";
import {
  assertDraft,
  assertAuthorization,
  otpDevMode,
  withOtpLock,
  limit,
} from "../services/otpSecurity.js";
import { Challenge } from "../models/index.js";
import { hashRecoveryToken } from "../services/recoveryToken.js";
import { markRemindersCompleted } from "../services/reminderScheduler.js";
import { sendEmailOtp, verifyEmailOtp } from "../services/emailOtp.js";
import {
  sendWhatsAppOtp,
  verifyWhatsAppOtp,
  processApitxtWebhook,
  sendPaymentReceived,
} from "../services/apitxt/index.js";
const r = express.Router();
// Serialize mutations of a draft across processes, including payment initiation.
r.use("/registrations", async (req, res, next) => {
  if (
    req.path === "/start" ||
    req.path.startsWith("/resume") ||
    req.path.startsWith("/recovery") ||
    req.path.startsWith("/email-otp") ||
    req.path.startsWith("/whatsapp") ||
    req.path.startsWith("/otp")
  )
    return next();
  return authenticate("draft")(req, res, () => {
    withOtpLock(
      `draft:${req.viewer.sub}`,
      () =>
        new Promise((resolve) => {
          res.once("finish", resolve);
          res.once("close", resolve);
          next();
        }),
    ).catch(next);
  });
});
const uploadLimit = async (req, res, next) => {
  try {
    await limit(`media:${req.viewer.sub}`, 20, 900);
    next();
  } catch (error) {
    next(error);
  }
};
const photoUpload = memoryUpload("photo", 5, ["image/jpeg", "image/png"]);
const receiptUpload = memoryUpload("receipt", 3, [
  "image/jpeg",
  "image/png",
  "application/pdf",
]);
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
  course: s.course || "",
  currentSchool: s.currentSchool,
  dob: s.dob,
  gender: s.gender || "MALE",
  address: s.address,
  city: s.city,
  district: s.district,
  state: s.state,
  pincode: s.pincode,
  purpose: s.purpose,
  registrationNumber: s.registrationNumber || null,
  applicationRef: s.applicationRef,
  status: s.status,
  verificationStatus:
    s.verificationStatus || (s.verifiedAt ? "verified" : "pending"),
  applicationStatus:
    s.applicationStatus ||
    (s.status === "CONFIRMED"
      ? "approved"
      : s.status === "PAYMENT_UNDER_VERIFICATION"
        ? "submitted"
        : s.status === "PAYMENT_REJECTED"
          ? "rejected"
          : ["OTP_VERIFIED", "PAYMENT_PENDING"].includes(s.status)
            ? "awaiting_payment_proof"
            : "draft"),
  paymentStatus:
    s.paymentStatus ||
    (s.status === "CONFIRMED"
      ? "verified"
      : s.status === "PAYMENT_UNDER_VERIFICATION"
        ? "under_review"
        : s.status === "PAYMENT_REJECTED"
          ? "rejected"
          : "not_submitted"),
  photoUploaded: !!s.photo?.publicId,
  paymentMode: s.paymentMode,
  verified: !!s.verifiedAt,
  guardianPhone: s.guardianPhone,
  verifiedMobile: s.verifiedMobile || (s.verifiedAt ? s.guardianPhone : ""),
  whatsappConsent: s.whatsappConsent ?? true,
  email: s.email,
  notificationStatus: s.notificationStatus,
  verificationExpiresAt: s.verificationExpiresAt,
  seat: s.seat,
  room: s.room,
  checkInAt: s.checkInAt,
  certificateNumber: s.certificateNumber || null,
  certificateIssuedAt: s.certificateIssuedAt || null,
  certificateStatus: s.certificateStatus || "NOT_ELIGIBLE",
  submittedAt: s.submittedAt || null,
  approvedAt: s.approvedAt || null,
  studentIdentityHash: s.studentIdentityHash || null,
  supersededBy: s.supersededBy || null,
  reminderCount: s.reminderCount || 0,
  reminderStatus: s.reminderStatus || "IDLE",
  reminderLastSentAt: s.reminderLastSentAt || null,
  reminderNextAttemptAt: s.reminderNextAttemptAt || null,
  reminderOptOut: !!s.reminderOptOut,
  paymentId: s.paymentId || null,
});
const getOwn = async (req) => {
  const s = await Registration.findById(req.viewer.sub);
  if (!s) throw notFound();
  assertDraft(s);
  // Auto-verify application drafts so OTP verification is not required
  if (
    s.status === "DRAFT" ||
    !s.verifiedAt ||
    (s.email && (!s.verifiedEmail || s.verifiedEmail !== s.email)) ||
    (s.guardianPhone && (!s.verifiedMobile || s.verifiedMobile !== s.guardianPhone))
  ) {
    const now = new Date();
    s.status = "OTP_VERIFIED";
    s.verifiedAt = now;
    if (s.email) s.verifiedEmail = s.email;
    if (s.guardianPhone) s.verifiedMobile = s.guardianPhone;
    s.verificationStatus = "verified";
    s.verificationExpiresAt = new Date(now.getTime() + 10800000);
    await s.save();
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
  const key = req.headers["idempotency-key"];
  if (key && (typeof key !== "string" || !/^[a-f0-9-]{36}$/i.test(key)))
    return res.status(400).json({ error: "Invalid application request key." });

  const studentIdentityHash = generateStudentIdentityHash({
    guardianPhone: data.guardianPhone,
    studentName: data.studentName,
    dob: data.dob,
    studentClass: data.studentClass,
  });

  // Check if this student already has an active or confirmed application
  const existing = await Registration.findOne({
    studentIdentityHash,
    status: { $ne: "CANCELLED" },
    applicationStatus: { $ne: "superseded" },
  }).sort({ createdAt: -1 });

  if (existing) {
    if (
      existing.status === "CONFIRMED" ||
      existing.applicationStatus === "approved"
    ) {
      return res.status(409).json({
        error: `This student (${existing.studentName}, Class ${existing.studentClass}) is already registered with registration number ${existing.registrationNumber}. Please use Check Status to view details or download the admit card.`,
        duplicate: true,
        confirmed: true,
        registrationNumber: existing.registrationNumber,
        applicationRef: existing.applicationRef,
      });
    }

    // Incomplete application: seamlessly restore draft without creating duplicate
    const now = new Date();
    const directExpiry = new Date(now.getTime() + 10800000);
    existing.draftExpiresAt = directExpiry;
    existing.status = "OTP_VERIFIED";
    existing.verifiedAt = now;
    existing.verifiedEmail = existing.email || "";
    existing.verifiedMobile = existing.guardianPhone || "";
    existing.verificationExpiresAt = directExpiry;
    existing.verificationStatus = "verified";
    await existing.save();

    return res.status(201).json({
      message:
        "An existing application was found for this student. Restoring your session.",
      duplicate: true,
      resumed: true,
      token: issueToken({ sub: String(existing._id), scope: "draft" }, "3h"),
      registration: safeRegistration(existing),
    });
  }

  const now = new Date();
  const directExpiry = new Date(now.getTime() + 10800000);
  const values = {
    ...data,
    course: data.studentClass === "11" ? data.course || "" : "",
    studentIdentityHash,
    status: "OTP_VERIFIED",
    verifiedAt: now,
    verifiedEmail: data.email,
    verificationStatus: "verified",
    verificationExpiresAt: directExpiry,
    applicationStatus: "awaiting_payment_proof",
    paymentStatus: "not_submitted",
    whatsappConsent: data.whatsappConsent ?? true,
    whatsappConsentAt: now,
    whatsappConsentSource: "web_registration",
    verifiedMobile: data.guardianPhone,
    statusHistory: [
      {
        from: "NONE",
        to: "OTP_VERIFIED",
        axis: "legacy",
        changedAt: now,
        reason: "Registration created - direct to payment",
        actor: "guardian",
      },
    ],
    draftExpiresAt: directExpiry,
    applicationRef: `APP-${crypto.randomBytes(5).toString("hex").toUpperCase()}`,
  };
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(data))
    .digest("hex");
  let s;
  if (key) {
    try {
      s = await Registration.findOneAndUpdate(
        { draftRequestKey: key },
        { $setOnInsert: { ...values, draftRequestHash: hash } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    } catch (e) {
      if (e.code !== 11000) throw e;
      s = await Registration.findOne({ draftRequestKey: key });
    }
    if (!s || s.draftRequestHash !== hash)
      return res.status(409).json({
        error:
          "This application request has already been used with different details.",
      });
    assertDraft(s);
    if (s && (s.status === "DRAFT" || !s.verifiedAt)) {
      s.status = "OTP_VERIFIED";
      s.verifiedAt = now;
      s.verifiedEmail = data.email || s.email || "";
      s.verifiedMobile = data.guardianPhone || s.guardianPhone || "";
      s.verificationStatus = "verified";
      s.verificationExpiresAt = directExpiry;
      await s.save();
    }
  } else {
    try {
      s = await Registration.create(values);
    } catch (e) {
      if (e.code === 11000) {
        // Handle concurrent race condition for duplicate identity or key
        const conflict = await Registration.findOne({
          studentIdentityHash,
          status: { $ne: "CANCELLED" },
        });
        if (conflict) {
          const now = new Date();
          const directExpiry = new Date(now.getTime() + 10800000);
          conflict.draftExpiresAt = directExpiry;
          conflict.status = "OTP_VERIFIED";
          conflict.verifiedAt = now;
          conflict.verifiedEmail = conflict.email;
          conflict.verificationExpiresAt = directExpiry;
          conflict.verificationStatus = "verified";
          await conflict.save();
          return res.status(200).json({
            message: "An existing application was found for this student. Restoring your session.",
            duplicate: true,
            resumed: true,
            token: issueToken({ sub: String(conflict._id), scope: "draft" }, "3h"),
            registration: safeRegistration(conflict),
          });
        }
      }
      throw e;
    }
  }
  res.status(201).json({
    token: issueToken({ sub: String(s._id), scope: "draft" }, "3h"),
    registration: safeRegistration(s),
  });
});

// Standalone Email OTP Verification (Inline registration form)
r.post("/registrations/email-otp/send", async (req, res, next) => {
  try {
    const { email } = req.body || {};
    const result = await sendEmailOtp(email);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

r.post("/registrations/email-otp/verify", async (req, res, next) => {
  try {
    const { email, otp } = req.body || {};
    const result = await verifyEmailOtp(email, otp);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// APITxT Text SMS OTP Verification (Primary Registration Workflow)
r.post(["/otp/send", "/whatsapp/otp/send"], async (req, res, next) => {
  try {
    const { mobile } = req.body || {};
    const result = await sendWhatsAppOtp({
      mobile,
      ipAddress: req.ip || req.headers["x-forwarded-for"] || "",
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

r.post(["/otp/verify", "/whatsapp/otp/verify"], async (req, res, next) => {
  try {
    const { mobile, otp } = req.body || {};
    const result = await verifyWhatsAppOtp({ mobile, otp });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// APITxT WhatsApp Delivery Reports Webhook
r.post("/whatsapp/apitxt/webhook", async (req, res, next) => {
  try {
    const result = await processApitxtWebhook(req.body);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// Direct Public PDF Streaming for Meta WhatsApp / APITxT Document Delivery
r.get(["/docs/admit-card/:token", "/docs/admit-card/:token.pdf"], async (req, res) => {
  const token = (req.params.token || "").replace(/\.pdf$/i, "").trim();
  const s = await Registration.findOne({
    status: "CONFIRMED",
    $or: [
      { admitToken: token },
      { registrationNumber: token },
      { applicationRef: token },
    ],
  });
  if (!s) {
    return res.status(404).send("Admit card document not found or registration not confirmed.");
  }
  await admitPdf(res, s, await publicSettings());
});

r.get(["/certificate", "/certificate/"], (req, res) => {
  return res.redirect(302, "/status");
});

r.get(
  [
    "/docs/certificate/:token",
    "/docs/certificate/:token.pdf",
    "/certificate/:token",
    "/certificate/:token.pdf",
  ],
  async (req, res) => {
  const token = (req.params.token || "").replace(/\.pdf$/i, "").trim();
  const s = await Registration.findOne({
    status: "CONFIRMED",
    $or: [
      { admitToken: token },
      { registrationNumber: token },
      { applicationRef: token },
      { certificateNumber: token },
    ],
  });
  if (!s) {
    return res.status(404).send("Certificate not found.");
  }
  await generateCertificatePdfStream(res, s, await publicSettings(), false);
});

r.post(
  ["/registrations/otp/send", "/registrations/otp/resend"],
  authenticate("draft"),
  async (req, res) => {
    const s = await getOwn(req);
    if (s.status !== "DRAFT")
      return res
        .status(400)
        .json({ error: "OTP verification is already complete." });
    if (s.guardianPhone) {
      const result = await sendWhatsAppOtp({
        mobile: s.guardianPhone,
        ipAddress: req.ip || req.headers["x-forwarded-for"] || "",
      });
      const cooldown = result.resendAvailableIn || 60;
      return res.json({
        message: result.message || "OTP sent to your WhatsApp number.",
        cooldownSeconds: cooldown,
        resendAvailableAt: new Date(Date.now() + cooldown * 1000).toISOString(),
      });
    }
    res.json(await sendOtp(s, "register"));
  },
);
r.post("/registrations/otp/verify", authenticate("draft"), async (req, res) => {
  const { otp } = parse(otpSchema, req.body);
  const s = await getOwn(req);
  if (s.status !== "DRAFT")
    return res.status(400).json({ error: "Already verified." });
  if (s.guardianPhone) {
    await verifyWhatsAppOtp({ mobile: s.guardianPhone, otp });
    const now = new Date();
    s.status = "OTP_VERIFIED";
    s.verificationStatus = "verified";
    s.applicationStatus = "awaiting_payment_proof";
    s.verifiedAt = now;
    s.verifiedMobile = s.guardianPhone;
    s.verificationExpiresAt = new Date(now.getTime() + 10800000);
    await s.save();
    return res.json({
      message: "Mobile number verified via WhatsApp.",
      registration: safeRegistration(s),
    });
  }
  const verified = await verifyOtp(s, "register", otp);
  res.json({
    message: "Verified successfully.",
    registration: safeRegistration(verified),
  });
});
r.patch("/registrations/mobile", authenticate("draft"), async (req, res) => {
  const mobile = parse(phone, req.body?.guardianPhone);
  const s = await getOwn(req);
  if (!["DRAFT", "OTP_VERIFIED"].includes(s.status))
    return res
      .status(409)
      .json({ error: "Mobile cannot change after payment submission." });
  const updated = await Registration.findOneAndUpdate(
    { _id: s._id, status: { $in: ["DRAFT", "OTP_VERIFIED"] } },
    {
      $set: {
        guardianPhone: mobile,
        status: "DRAFT",
        verifiedAt: null,
        verificationExpiresAt: null,
        verificationDevMode: false,
      },
    },
    { new: true },
  );
  await Challenge.updateMany(
    { registrationId: s._id, verificationStatus: "pending" },
    { $set: { verificationStatus: "superseded" } },
  );
  res.json({
    registration: safeRegistration(updated),
    message: "Mobile updated. Request a new verification code.",
  });
});
r.patch("/registrations/email", authenticate("draft"), async (req, res) => {
  const email = parse(emailSchema, req.body?.email);
  const s = await getOwn(req);
  if (!["DRAFT", "OTP_VERIFIED"].includes(s.status))
    return res
      .status(409)
      .json({
        error:
          "Email cannot change after payment submission. Contact the school.",
      });
  const updated = await Registration.findOneAndUpdate(
    { _id: s._id, status: { $in: ["DRAFT", "OTP_VERIFIED"] } },
    {
      $set: {
        email,
        verifiedEmail: "",
        status: "DRAFT",
        verifiedAt: null,
        verificationExpiresAt: null,
        verificationDevMode: false,
      },
    },
    { new: true },
  );
  if (!updated)
    return res
      .status(409)
      .json({ error: "Registration changed. Reload and retry." });
  await Challenge.updateMany(
    { registrationId: s._id, verificationStatus: "pending" },
    { $set: { verificationStatus: "superseded" } },
  );
  res.json({
    registration: safeRegistration(updated),
    message: "Email updated. Request a new verification code.",
  });
});
r.get("/registrations/me", authenticate("draft"), async (req, res) => {
  const s = await getOwn(req);
  const challenge = await Challenge.findOne({
    registrationId: s._id,
    purpose: "register",
  }).sort({ createdAt: -1 });
  res.json({
    registration: safeRegistration(s),
    resendAvailableAt: challenge?.resendAvailableAt,
    expiresAt: challenge?.expiresAt,
  });
});
r.post(
  "/registrations/photo",
  authenticate("draft"),
  uploadLimit,
  photoUpload,
  async (req, res) => {
    const s = await getOwn(req);
    if (
      ![
        "DRAFT",
        "OTP_VERIFIED",
        "PAYMENT_PENDING",
        "PAYMENT_REJECTED",
      ].includes(s.status)
    )
      return res
        .status(403)
        .json({
          error: "Photographs cannot be changed at this application stage.",
        });
    const metadata = await validateUpload(req.file, "photos");
    const photo = await uploadMedia(req.file.buffer, metadata);
    const prior = s.photo;
    // Compare the record version too: a slow request cannot overwrite newer state.
    const updated = await Registration.findOneAndUpdate(
      {
        _id: s._id,
        __v: s.__v,
        status: s.status,
        "photo.publicId": prior?.publicId || null,
      },
      { $set: { photo, photoPath: "" }, $inc: { __v: 1 } },
      { new: true },
    );
    if (!updated) {
      await deleteMedia(photo);
      return res
        .status(409)
        .json({ error: "Registration changed. Reload and retry." });
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
    if (settings.paymentMode !== "manual" && settings.paymentMode !== "both")
      return res
        .status(400)
        .json({ error: "Manual payment mode is disabled." });
    if (
      !s.verifiedAt ||
      !["OTP_VERIFIED", "PAYMENT_PENDING", "PAYMENT_REJECTED"].includes(s.status)
    )
      return res.status(409).json({
        error:
          "Mobile/Email must be verified and registration must be eligible for payment.",
      });
    assertAuthorization(s);
    if (!s.photo?.publicId)
      return res.status(400).json({
        error: "Student passport-size photograph is required before payment.",
      });
    if (!settings.upiId)
      return res.status(503).json({ error: "School UPI ID not configured." });
    const normalizedUtr = data.utr ? normalizeUtr(data.utr) : "";
    if (normalizedUtr) {
      if (normalizedUtr.length < 8 || normalizedUtr.length > 40)
        return res.status(400).json({
          error: "Enter a valid 8–40 character transaction UTR reference.",
        });
      const duplicatePayment = await Payment.findOne({
        utr: normalizedUtr,
        status: { $in: ["UNDER_REVIEW", "PAID"] },
        registrationId: { $ne: s._id },
      });
      if (duplicatePayment) {
        return res.status(409).json({
          error:
            "This transaction reference (UTR) has already been submitted for another registration. Please check your bank transaction.",
        });
      }
    }
    const metadata = await validateUpload(req.file, "receipts");
    const receipt = await uploadMedia(req.file.buffer, metadata);
    let pay;
    try {
      const paymentData = {
        registrationId: s._id,
        mode: "manual",
        amount: settings.fee,
        receipt,
        status: "UNDER_REVIEW",
      };
      if (normalizedUtr) {
        paymentData.utr = normalizedUtr;
      }
      pay = await Payment.create(paymentData);
      const now = new Date();
      const updated = await Registration.findOneAndUpdate(
        {
          _id: s._id,
          $or: [
            {
              status: "OTP_VERIFIED",
              verificationExpiresAt: { $gt: now },
            },
            { status: "PAYMENT_PENDING" },
            { status: "PAYMENT_REJECTED" },
          ],
        },
        {
          $set: {
            paymentId: pay._id,
            paymentMode: "manual",
            termsAcceptedAt: now,
            submittedAt: now,
            status: "PAYMENT_UNDER_VERIFICATION",
            applicationStatus: "submitted",
            paymentStatus: "under_review",
          },
          $push: {
            statusHistory: {
              from: s.status,
              to: "PAYMENT_UNDER_VERIFICATION",
              axis: "legacy",
              changedAt: now,
              reason: normalizedUtr
                ? `Payment receipt submitted with UTR ${normalizedUtr}`
                : "Payment receipt screenshot submitted",
              actor: "guardian",
            },
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
      await markRemindersCompleted(s._id);
      // Asynchronously dispatch WhatsApp payment received notification for manual offline proof
      sendPaymentReceived(updated, pay).catch((err) => {
        console.error("[APITXT] Async payment received notification failed:", err.message);
      });
      res.status(201).json({
        message:
          "Receipt submitted. Payment is awaiting actual bank verification by the school.",
        registration: safeRegistration(updated),
      });
    } catch (e) {
      // Resolve an uncertain database result before removing its receipt.
      if (pay) {
        const linked = await Registration.exists({
          _id: s._id,
          paymentId: pay._id,
        });
        if (!linked) {
          await Payment.deleteOne({ _id: pay._id });
          await deleteMedia(receipt);
        }
      }
      // If create failed ambiguously, the journal will check actual references.

      if (e.code === 11000)
        return res.status(409).json({
          error:
            "This transaction reference (UTR) has already been submitted for another registration. Please check your bank transaction.",
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
  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error("Razorpay API error:", response.status, errText);
    throw Object.assign(new Error("Payment provider rejected the request: " + (errText || response.statusText)), {
      status: 502,
    });
  }
  return response.json();
}
r.post(
  "/registrations/razorpay/order",
  authenticate("draft"),
  async (req, res) => {
    const s = await getOwn(req),
      settings = await publicSettings();
    if (settings.paymentMode !== "razorpay" && settings.paymentMode !== "both")
      return res
        .status(400)
        .json({ error: "Online gateway mode is disabled." });
    if (
      !s.verifiedAt ||
      !["OTP_VERIFIED", "PAYMENT_PENDING", "PAYMENT_REJECTED"].includes(s.status)
    )
      return res.status(409).json({ error: "Verify mobile/email before payment." });
    assertAuthorization(s);
    if (!s.photo?.publicId)
      return res.status(400).json({
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
      amount: settings.fee,
    }).sort({ createdAt: -1 });
    if (prior && Date.now() - prior.createdAt.getTime() < 15 * 60 * 1000) {
      if (s.status !== "PAYMENT_PENDING" || !s.paymentId) {
        s.paymentId = prior._id;
        s.paymentMode = "razorpay";
        s.status = "PAYMENT_PENDING";
        s.termsAcceptedAt = s.termsAcceptedAt || new Date();
        await s.save();
      }
      return res.json({
        orderId: prior.providerOrderId,
        key: process.env.RAZORPAY_KEY_ID,
        amount: prior.amount * 100,
        currency: "INR",
      });
    }
    const order = await rzFetch("orders", {
      method: "POST",
      body: JSON.stringify({
        amount: settings.fee * 100,
        currency: "INR",
        receipt: String(s._id),
        notes: { event: "SHREE 2027 OLYMPIAD" },
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
    if (pay.providerPaymentId !== paymentId)
      throw Object.assign(new Error("Different payment already recorded."), {
        status: 409,
      });
    if (!pay.utr) {
      pay.utr = paymentId;
      await pay.save();
    }
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
        utr: pay.utr || paymentId,
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
  const query = { guardianPhone: data.phone };
  if (data.registrationNumber && data.registrationNumber.trim()) {
    const regTrim = data.registrationNumber.trim().toUpperCase();
    query[regTrim.startsWith("APP-") ? "applicationRef" : "registrationNumber"] = regTrim;
  }
  const students = await Registration.find(query).sort({ createdAt: -1 });
  if (!students.length)
    return res
      .status(404)
      .json({ error: "No registration found with this mobile number. Please check your number." });

  const s = students[0];
  // Dispatches OTP directly to registered guardian WhatsApp mobile
  const otpResult = await sendWhatsAppOtp({
    mobile: data.phone,
    ipAddress: req.ip || req.headers["x-forwarded-for"] || "",
  });
  const cooldown = otpResult.resendAvailableIn || 60;
  const resendAvailableAt = new Date(Date.now() + cooldown * 1000).toISOString();

  res.json({
    lookupToken: issueToken(
      { sub: String(s._id), phone: data.phone, scope: "lookup-pending" },
      "15m",
    ),
    message: otpResult.message || "OTP has been sent to your WhatsApp number.",
    cooldownSeconds: cooldown,
    resendAvailableAt,
    expiresIn: otpResult.expiresIn || 300,
  });
});
r.post("/status/verify", authenticate("lookup-pending"), async (req, res) => {
  const { otp } = parse(otpSchema, req.body);
  const s = await getOwn(req);
  const mobile = req.user?.phone || s.guardianPhone;
  await verifyWhatsAppOtp({ mobile, otp });

  // Find all registrations associated with this guardian phone
  const allRegistrations = await Registration.find({ guardianPhone: mobile }).sort({ createdAt: -1 });
  const target = s || allRegistrations[0];

  // Issue student token for status viewing and admit card download
  const accessToken = issueToken({ sub: String(target._id), scope: "student" }, "30m");

  // Issue draft token so parent can seamlessly continue payment if not yet confirmed
  const draftToken = issueToken({ sub: String(target._id), scope: "draft" }, "3h");

  res.json({
    accessToken,
    draftToken,
    registration: safeRegistration(target),
    allRegistrations: allRegistrations.length > 1 ? allRegistrations.map(safeRegistration) : undefined,
  });
});
r.post("/status/switch/:id", authenticate("student"), async (req, res) => {
  const current = await getOwn(req);
  const next = await Registration.findOne({ _id: req.params.id, guardianPhone: current.guardianPhone });
  if (!next) return res.status(404).json({ error: "Student registration not found." });
  const accessToken = issueToken({ sub: String(next._id), scope: "student" }, "30m");
  const draftToken = issueToken({ sub: String(next._id), scope: "draft" }, "3h");
  res.json({ accessToken, draftToken, registration: safeRegistration(next) });
});
r.get("/status/me", authenticate("student"), async (req, res) => {
  const s = await getOwn(req);
  res.json({ registration: safeRegistration(s) });
});
r.post("/registrations/resume/request", async (req, res) => {
  const { identifier } = parse(resumeRequestSchema, req.body);
  const trimmed = identifier.trim();
  let query = {};
  if (/^APP-[A-F0-9]{10}$/i.test(trimmed)) {
    query = { applicationRef: trimmed.toUpperCase() };
  } else if (
    /^(?:SHREE26-[0-9]{6}|SHREE27-[1-9][0-9]{3,})$/i.test(trimmed)
  ) {
    query = { registrationNumber: trimmed.toUpperCase() };
  } else if (
    /^\d{10}$/.test(trimmed) ||
    /^(?:\+91|91)?[6-9]\d{9}$/.test(trimmed)
  ) {
    query = { guardianPhone: normalizePhone(trimmed) };
  } else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    query = { email: trimmed.toLowerCase() };
  } else {
    return res.status(400).json({
      error:
        "Enter a valid application reference (APP-...), mobile number, or email address.",
    });
  }

  const applications = await Registration.find({
    ...query,
    status: { $ne: "CANCELLED" },
    applicationStatus: { $ne: "superseded" },
  }).sort({ createdAt: -1 });

  if (!applications.length) {
    return res.status(404).json({
      error:
        "No applications found for these details. Please check your reference or contact number.",
    });
  }

  // Use primary application to send WhatsApp OTP
  const primary = applications[0];
  const otpResult = await sendWhatsAppOtp({
    mobile: primary.guardianPhone,
    ipAddress: req.ip || req.headers["x-forwarded-for"] || "",
  });
  const cooldown = otpResult.resendAvailableIn || 60;
  res.json({
    lookupToken: issueToken(
      {
        sub: String(primary._id),
        guardianPhone: primary.guardianPhone,
        email: primary.email,
        scope: "resume-pending",
      },
      "15m",
    ),
    applicationCount: applications.length,
    maskedPhone: primary.guardianPhone
      ? primary.guardianPhone.replace(/(\d{2})\d{4}(\d{4})/, "$1****$2")
      : "",
    maskedEmail: maskEmail(primary.email),
    message: otpResult.message || "OTP sent to your WhatsApp number.",
    cooldownSeconds: cooldown,
    resendAvailableAt: new Date(Date.now() + cooldown * 1000).toISOString(),
  });
});
r.post(
  "/registrations/resume/verify",
  authenticate("resume-pending"),
  async (req, res) => {
    const { otp } = parse(otpSchema, req.body);
    const primary = await Registration.findById(req.viewer.sub);
    if (!primary) throw notFound();
    await verifyWhatsAppOtp({ mobile: primary.guardianPhone, otp });

    const applications = await Registration.find({
      $or: [
        { guardianPhone: req.viewer.guardianPhone },
        ...(req.viewer.email ? [{ email: req.viewer.email }] : []),
      ],
      status: { $ne: "CANCELLED" },
      applicationStatus: { $ne: "superseded" },
    }).sort({ createdAt: -1 });

    const resumeToken = issueToken(
      {
        sub: String(primary._id),
        guardianPhone: req.viewer.guardianPhone,
        email: req.viewer.email,
        scope: "resume-authorized",
      },
      "45m",
    );

    res.json({
      resumeToken,
      applications: applications.map(safeRegistration),
      message:
        "Identity verified. You can now select and continue your application.",
    });
  },
);
r.post(
  "/registrations/resume/select",
  authenticate("resume-authorized"),
  async (req, res) => {
    const { registrationId } = parse(resumeSelectSchema, req.body);
    const authConditions = [{ guardianPhone: req.viewer.guardianPhone }];
    if (req.viewer.email) {
      authConditions.push({ email: req.viewer.email });
    }
    const target = await Registration.findOne({
      _id: registrationId,
      $or: authConditions,
      status: { $ne: "CANCELLED" },
    });

    if (!target) {
      return res.status(403).json({
        error: "You are not authorized to access this application.",
      });
    }

    // Extend draft window so parent can complete payment & photo upload
    const now = new Date();
    target.draftExpiresAt = new Date(now.getTime() + 10800000);
    if (["OTP_VERIFIED", "PAYMENT_PENDING"].includes(target.status)) {
      target.verificationExpiresAt = new Date(now.getTime() + 10800000);
    }
    await target.save();

    res.json({
      token: issueToken({ sub: String(target._id), scope: "draft" }, "3h"),
      registration: safeRegistration(target),
      message: "Application session restored. You can continue where you left off.",
    });
  },
);

r.post("/registrations/recovery/validate", async (req, res) => {
  const { recoveryToken } = req.body || {};
  if (!recoveryToken || typeof recoveryToken !== "string") {
    return res.status(400).json({ error: "Recovery token is required." });
  }

  const tokenHash = hashRecoveryToken(recoveryToken);
  const registration = await Registration.findOne({
    recoveryTokenHash: tokenHash,
    status: { $ne: "CANCELLED" },
    applicationStatus: { $ne: "superseded" },
  });

  if (!registration) {
    return res.status(404).json({
      expired: true,
      error:
        "This recovery link is invalid or has already been used. You can resume your application directly by entering your registered mobile number or application reference.",
    });
  }

  if (
    registration.recoveryTokenExpiresAt &&
    registration.recoveryTokenExpiresAt <= new Date()
  ) {
    return res.status(410).json({
      expired: true,
      error:
        "This recovery link has expired (links are valid for 7 days). You can resume your application by entering your registered mobile number or application reference.",
    });
  }

  if (
    registration.status === "CONFIRMED" ||
    registration.applicationStatus === "approved"
  ) {
    return res.status(400).json({
      alreadyConfirmed: true,
      registrationNumber: registration.registrationNumber,
      message: "This registration has already been verified and confirmed.",
    });
  }

  // Rate limit recovery requests per IP and per registration
  try {
    await limit(`recovery:${req.ip}`, 20, 900);
    await limit(`recovery-reg:${registration._id}`, 5, 900);
  } catch (limErr) {
    return res.status(429).json({ error: "Too many recovery attempts. Please try again shortly." });
  }

  // Trigger WhatsApp OTP send to the guardian mobile bound to this application
  const otpResult = await sendWhatsAppOtp({
    mobile: registration.guardianPhone,
    ipAddress: req.ip || req.headers["x-forwarded-for"] || "",
  });
  const cooldown = otpResult.resendAvailableIn || 60;

  const lookupToken = issueToken(
    {
      sub: String(registration._id),
      recoveryTokenHash: tokenHash,
      scope: "recovery-pending",
    },
    "15m",
  );

  res.json({
    success: true,
    maskedPhone: registration.guardianPhone
      ? registration.guardianPhone.replace(/(\d{2})\d{4}(\d{4})/, "$1****$2")
      : "",
    maskedEmail: maskEmail(registration.email),
    applicationRef: registration.applicationRef,
    studentClass: registration.studentClass,
    lookupToken,
    message: otpResult.message || "OTP sent to your WhatsApp number.",
    cooldownSeconds: cooldown,
    resendAvailableAt: new Date(Date.now() + cooldown * 1000).toISOString(),
  });
});

r.post(
  "/registrations/recovery/verify",
  authenticate("recovery-pending"),
  async (req, res) => {
    const { otp } = parse(otpSchema, req.body);
    const registration = await Registration.findById(req.viewer.sub);
    if (!registration) throw notFound();

    if (registration.recoveryTokenHash !== req.viewer.recoveryTokenHash) {
      return res.status(403).json({
        error: "Recovery token is invalid or has already been consumed.",
      });
    }

    await verifyWhatsAppOtp({ mobile: registration.guardianPhone, otp });

    // Single-use invalidation: invalidate recovery token immediately upon successful recovery
    registration.recoveryTokenHash = null;
    registration.recoveryTokenExpiresAt = null;

    // Extend draft window so parent can complete payment
    const now = new Date();
    registration.draftExpiresAt = new Date(now.getTime() + 10800000); // 3 hours
    if (!registration.verifiedAt || registration.status === "DRAFT") {
      registration.status = "OTP_VERIFIED";
      registration.verificationStatus = "verified";
      registration.applicationStatus = "awaiting_payment_proof";
      registration.verifiedMobile = registration.guardianPhone;
      if (registration.email) registration.verifiedEmail = registration.email;
      registration.verifiedAt = now;
    }
    registration.verificationExpiresAt = new Date(now.getTime() + 10800000);
    await registration.save();

    await Audit.create({
      actor: registration.guardianPhone || "guardian",
      action: "APPLICATION_RECOVERED_VIA_WHATSAPP_LINK",
      registrationId: registration._id,
      details: { applicationRef: registration.applicationRef },
    });

    const draftToken = issueToken(
      { sub: String(registration._id), scope: "draft" },
      "3h",
    );

    res.json({
      success: true,
      token: draftToken,
      registration: safeRegistration(registration),
      message: "Application recovered successfully.",
    });
  },
);

r.post("/registrations/recovery/opt-out", async (req, res) => {
  const { recoveryToken } = req.body || {};
  if (!recoveryToken || typeof recoveryToken !== "string") {
    return res.status(400).json({ error: "Recovery token is required." });
  }

  const tokenHash = hashRecoveryToken(recoveryToken);
  const updated = await Registration.findOneAndUpdate(
    { recoveryTokenHash: tokenHash },
    {
      $set: {
        reminderOptOut: true,
        reminderStatus: "OPT_OUT",
        reminderNextAttemptAt: null,
      },
      $unset: {
        reminderLease: 1,
        reminderLeaseExpiresAt: 1,
        recoveryTokenHash: 1,
        recoveryTokenExpiresAt: 1,
      },
    },
    { new: true },
  );

  if (!updated) {
    return res.status(404).json({
      error: "Invalid recovery link or already unsubscribed.",
    });
  }

  res.json({
    success: true,
    message: "You have successfully opted out of reminder emails for this registration.",
  });
});

async function downloadApplicationReceipt(req, res) {
  const s = await getOwn(req);
  if (["DRAFT", "OTP_VERIFIED"].includes(s.status))
    return res
      .status(403)
      .json({
        error: "Submit your application before downloading its receipt.",
      });
  const payment = s.paymentId
    ? await Payment.findOne({ _id: s.paymentId, registrationId: s._id })
    : null;
  await applicationReceiptPdf(res, s, payment);
}
r.get(
  "/registrations/application-receipt",
  authenticate("draft"),
  downloadApplicationReceipt,
);
r.get(
  "/application-receipt",
  authenticate("student"),
  downloadApplicationReceipt,
);
r.get("/registrations/admit-card", authenticate("draft"), async (req, res) => {
  const s = await getOwn(req);
  const eligible =
    s.status === "CONFIRMED"
      ? s.applicationStatus !== "rejected" &&
        s.applicationStatus !== "superseded" &&
        s.paymentStatus !== "rejected"
      : s.applicationStatus === "approved" && s.paymentStatus === "verified";
  if (!eligible)
    return res.status(403).json({
      error:
        "Admit card is only available after school payment verification and approval.",
    });
  await admitPdf(res, s, await publicSettings());
});
r.get("/admit-card", authenticate("student"), async (req, res) => {
  const s = await getOwn(req);
  const eligible =
    s.status === "CONFIRMED"
      ? s.applicationStatus !== "rejected" &&
        s.applicationStatus !== "superseded" &&
        s.paymentStatus !== "rejected"
      : s.applicationStatus === "approved" && s.paymentStatus === "verified";
  if (!eligible)
    return res.status(403).json({
      error:
        "Admit card available only after school payment verification and approval.",
    });
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
r.get("/certificate/download/:token", async (req, res) => {
  const raw = String(req.params.token || "").trim();
  const s = await Registration.findOne({
    status: "CONFIRMED",
    $or: [
      { admitToken: raw },
      { registrationNumber: raw },
      { applicationRef: raw },
      { certificateNumber: raw },
    ],
  });

  if (!s) {
    return res.status(404).json({ error: "No confirmed registration found for this ID." });
  }

  if (!s.checkInAt) {
    return res.status(403).json({
      error: "Participation certificates are issued only to students who attended the exam on 12 January 2027.",
    });
  }

  const inline = req.query.download !== "1";
  await generateCertificatePdfStream(res, s, await publicSettings(), inline);
});
r.get("/certificate", authenticate("student"), async (req, res) => {
  const s = await getOwn(req);
  if (!s || s.status !== "CONFIRMED") {
    return res.status(404).json({ error: "Registration not found." });
  }
  if (!s.checkInAt) {
    return res.status(403).json({
      error: "Certificate of Participation is issued after attending the exam on 12 January 2027.",
    });
  }
  const inline = req.query.download !== "1";
  await generateCertificatePdfStream(res, s, await publicSettings(), inline);
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
