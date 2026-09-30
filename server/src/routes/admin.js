import { listAttendance, exportAttendance, updateAttendance } from "../services/attendance.js";
import { recordFilters, registrationQuery, listPayments } from "../services/adminRecords.js";
import { exportAdminRecords } from "../services/adminExport.js";
import { portalSchema } from "../utils/portalContent.js";
import express from "express";
import { withOtpLock } from "../services/otpSecurity.js";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { downloadMedia } from "../services/media.js";
import {
  Admin,
  Registration,
  Payment,
  Settings,
  Audit,
} from "../models/index.js";
import { issueToken, authenticate, adminRoles } from "../middleware/auth.js";
import { safeRegistration, publicSettings } from "./public.js";
import { confirmRegistration } from "../services/confirm.js";
import { admitPdf } from "../services/pdf.js";
import { parse, safeCsv } from "../utils/validation.js";
const r = express.Router();
const writable = adminRoles("SUPER_ADMIN", "ADMIN");
const verifier = adminRoles("SUPER_ADMIN", "ADMIN", "PAYMENT_VERIFIER");
const examiner = adminRoles("SUPER_ADMIN", "ADMIN", "EXAM_COORDINATOR");
const cookieOpts = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  maxAge: 8 * 60 * 60 * 1000,
  path: "/api/admin",
};
r.post("/login", async (req, res) => {
  const parsed = z
    .object({ email: z.string().email(), password: z.string().min(1) })
    .safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Email and password required." });
  const admin = await Admin.findOne({
    email: parsed.data.email.toLowerCase(),
    active: true,
  });
  const valid =
    admin && (await bcrypt.compare(parsed.data.password, admin.passwordHash));
  if (!valid) return res.status(401).json({ error: "Invalid credentials." });
  const token = issueToken({ sub: String(admin._id), scope: "admin" }, "8h");
  res
    .cookie("olympiad_admin", token, cookieOpts)
    .json({ email: admin.email, role: admin.role });
});
r.post("/logout", (req, res) =>
  res
    .clearCookie("olympiad_admin", { ...cookieOpts, maxAge: undefined })
    .json({ ok: true }),
);
r.use(authenticate("admin"));
r.get("/me", (req, res) =>
  res.json({ email: req.admin.email, role: req.admin.role }),
);
r.get("/dashboard", async (req, res) => {
  const [total, confirmed, pending, review] = await Promise.all([
    Registration.countDocuments(),
    Registration.countDocuments({ status: "CONFIRMED" }),
    Registration.countDocuments({
      status: { $in: ["DRAFT", "OTP_VERIFIED", "PAYMENT_PENDING"] },
    }),
    Registration.countDocuments({ status: "PAYMENT_UNDER_VERIFICATION" }),
  ]);
  const revenue = await Payment.aggregate([
    { $match: { status: "PAID" } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  const groups = await Registration.aggregate([
    { $match: { status: "CONFIRMED" } },
    { $group: { _id: "$studentClass", count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  res.json({
    total,
    confirmed,
    pending,
    review,
    revenue: revenue[0]?.total || 0,
    classes: groups,
  });
});
r.get("/registrations", async (req, res) => {
  const filters = recordFilters(req.query);
  const { page, limit } = filters;
  const q = registrationQuery(filters);
  const [docs, total] = await Promise.all([
    Registration.find(q)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Registration.countDocuments(q),
  ]);
  res.json({
    items: docs.map((s) => ({
      ...safeRegistration(s),
      guardianPhone: s.guardianPhone,
      email: s.email,
      createdAt: s.createdAt,
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
    limit,
  });
});
r.get("/attendance", examiner, listAttendance);
r.get("/attendance/export.:format", examiner, exportAttendance);
r.patch("/attendance/:id", writable, updateAttendance);
r.delete("/attendance/:id", writable, updateAttendance);
r.get("/payments", async (req, res) => {
  res.json(await listPayments(recordFilters(req.query, true)));
});
r.get("/records/:kind/export.:format", exportAdminRecords);

r.get("/payments/:id/receipt", verifier, async (req, res) => {
  const p = await Payment.findById(req.params.id);
  if (!p?.receipt?.publicId)
    return res.status(404).json({ error: "Receipt not found or awaiting storage migration." });
  const buffer = await downloadMedia(p.receipt);
  res.set("Cache-Control", "private, no-store");
  res.set("Content-Disposition", `attachment; filename="receipt-${p._id}.${p.receipt.format}"`);
  res.type(p.receipt.contentType).send(buffer);
});
// Both review decisions share one lease so approval and rejection cannot race.
r.use(['/payments/:id/approve', '/payments/:id/reject'], verifier, (req, res, next) => {
  withOtpLock(`payment-review:${req.params.id}`, () => new Promise(resolve => {
    res.once('finish', resolve); res.once('close', resolve); next();
  })).catch(next);
});
r.post("/payments/:id/approve", verifier, async (req, res) => {
  const p = await Payment.findOne({
    _id: req.params.id,
    mode: "manual",
    status: { $in: ["UNDER_REVIEW", "PAID"] },
  });
  if (!p)
    return res
      .status(409)
      .json({ error: "Payment already reviewed or not found." });
  const registration = await Registration.findById(p.registrationId);
  if (p.status === "PAID" && registration && String(registration.paymentId) === String(p._id)) {
    const recovered = await confirmRegistration(p.registrationId, String(req.admin._id));
    return res.json({ message: "Payment approved and admit card issued.", registration: safeRegistration(recovered) });
  }
  if (
    registration?.status !== "PAYMENT_UNDER_VERIFICATION" ||
    String(registration.paymentId) !== String(p._id)
  )
    return res
      .status(409)
      .json({ error: "Registration/payment status mismatch." });
  p.status = "PAID";
  p.reviewedBy = req.admin._id;
  p.reviewNote = String(
    req.body?.note || "Bank/UPI transaction verified by school",
  ).slice(0, 500);
  p.verifiedAt = new Date();
  await p.save();
  const s = await confirmRegistration(p.registrationId, String(req.admin._id));
  res.json({
    message: "Payment approved and admit card issued.",
    registration: safeRegistration(s),
  });
});
r.post("/payments/:id/reject", verifier, async (req, res) => {
  const note = String(req.body?.note || "")
    .trim()
    .slice(0, 500);
  if (note.length < 5)
    return res.status(400).json({ error: "Enter a reason for rejection." });
  const existing = await Payment.findOne({ _id: req.params.id, mode: "manual" });
  const registration = existing && await Registration.findById(existing.registrationId);
  if (!existing || !registration || String(registration.paymentId) !== String(existing._id) ||
      !["PAYMENT_UNDER_VERIFICATION", "PAYMENT_REJECTED"].includes(registration.status) ||
      !["UNDER_REVIEW", "REJECTED"].includes(existing.status))
    return res.status(409).json({ error: "Payment already reviewed or registration/payment status mismatch." });
  const p = await Payment.findOneAndUpdate(
    { _id: req.params.id, mode: "manual", status: { $in: ["UNDER_REVIEW", "REJECTED"] } },
    {
      $set: { status: "REJECTED", reviewedBy: req.admin._id, reviewNote: note },
    },
    { new: true },
  );
  if (!p)
    return res
      .status(409)
      .json({ error: "Payment already reviewed or not found." });
  await Registration.updateOne(
    {
      _id: p.registrationId,
      paymentId: p._id,
      status: "PAYMENT_UNDER_VERIFICATION",
    },
    { $set: { status: "PAYMENT_REJECTED" } },
  );
  if (existing.status !== "REJECTED") await Audit.create({
    actor: String(req.admin._id),
    action: "PAYMENT_REJECTED",
    registrationId: p.registrationId,
    details: { note },
  });
  res.json({
    message: "Payment rejected; parent can resubmit a correct receipt.",
  });
});
r.get("/admit-card/:id", examiner, async (req, res) => {
  const student = await Registration.findById(req.params.id);
  if (student?.status !== "CONFIRMED")
    return res
      .status(403)
      .json({ error: "Only confirmed registrations have admit cards." });
  await admitPdf(res, student, await publicSettings());
});
r.post("/check-in", examiner, async (req, res) => {
  const { token } = parse(
    z.object({ token: z.string().min(20).max(100) }),
    req.body,
  );
  const s = await Registration.findOneAndUpdate(
    { admitToken: token, status: "CONFIRMED", checkInAt: null },
    { $set: { checkInAt: new Date() } },
    { new: true },
  );
  if (!s)
    return res
      .status(409)
      .json({ error: "Invalid, cancelled, or already checked-in admit card." });
  await Audit.create({
    actor: String(req.admin._id),
    action: "EXAM_CHECK_IN",
    registrationId: s._id,
  });
  res.json({ registration: safeRegistration(s) });
});
r.get("/settings", async (req, res) => res.json(await publicSettings()));
// Separate from payment settings so publishing content cannot alter payment configuration.
r.put("/portal", writable, async (req, res) => {
  const data = parse(z.object({eventName:z.string().trim().min(1).max(160),portal:portalSchema}).strict(), req.body);
  await publicSettings();
  const saved = await Settings.findByIdAndUpdate("primary", {$set:data}, {new:true,runValidators:true});
  await Audit.create({actor:String(req.admin._id),action:"PUBLIC_CONTENT_UPDATED",details:{}});
  res.json({eventName:saved.eventName,portal:saved.portal});
});
r.patch("/settings", writable, async (req, res) => {
  const schema = z
    .object({
      registrationOpen: z.boolean().optional(),
      fee: z.number().int().min(1).max(10000).optional(),
      examDate: z.string().max(80).optional(),
      reportingTime: z.string().max(80).optional(),
      examTime: z.string().max(80).optional(),
      venue: z.string().max(300).optional(),
      paymentMode: z.enum(["manual", "razorpay"]).optional(),
      upiId: z.string().max(100).optional(),
      payeeName: z.string().max(120).optional(),
      contactPhone: z.string().max(20).optional(),
      contactEmail: z.string().email().optional(),
      terms: z.string().min(20).max(6000).optional(),
      privacy: z.string().min(20).max(6000).optional(),
      refund: z.string().min(20).max(6000).optional(),
      instructions: z.array(z.string().max(250)).max(5).optional(),
    })
    .strict();
  const data = parse(schema, req.body);
  const current = await publicSettings();
  const effective = { ...current.toObject(), ...data };
  if (effective.registrationOpen) {
    const mode = effective.paymentMode;
    if (mode === "manual" && (!effective.upiId?.trim() || !effective.payeeName?.trim()))
      return res
        .status(400)
        .json({
          error:
            "Configure official UPI ID before opening manual registrations.",
        });
    if (
      mode === "razorpay" &&
      (!process.env.RAZORPAY_KEY_ID ||
        !process.env.RAZORPAY_KEY_SECRET ||
        !process.env.RAZORPAY_WEBHOOK_SECRET)
    )
      return res
        .status(400)
        .json({
          error:
            "Configure all Razorpay credentials before opening registrations.",
        });
    if (
      process.env.NODE_ENV === "production" &&
      process.env.OTP_DELIVERY === "dev"
    )
      return res
        .status(400)
        .json({ error: "Real OTP provider required in production." });
  }
  const s = await Settings.findOneAndUpdate(
    { _id: "primary" },
    { $set: data },
    { upsert: true, new: true, runValidators: true },
  );
  await Audit.create({
    actor: String(req.admin._id),
    action: "SETTINGS_UPDATED",
    details: { keys: Object.keys(data) },
  });
  res.json(s);
});
r.get("/export.csv", async (req, res) => {
  const docs = await Registration.find({ status: "CONFIRMED" })
    .sort({ registrationNumber: 1 })
    .lean();
  const headers = [
    "registrationNumber",
    "studentName",
    "studentClass",
    "guardianName",
    "guardianPhone",
    "currentSchool",
    "city",
    "district",
    "status",
    "room",
    "seat",
  ];
  const rows = [
    headers.map(safeCsv).join(","),
    ...docs.map((doc) => headers.map((k) => safeCsv(doc[k])).join(",")),
  ];
  res
    .type("text/csv")
    .set(
      "Content-Disposition",
      'attachment; filename="shree-2026-registrations.csv"',
    )
    .send("\uFEFF" + rows.join("\r\n"));
});
export default r;
