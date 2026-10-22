import {
  listAttendance,
  exportAttendance,
  updateAttendance,
} from "../services/attendance.js";
import {
  recordFilters,
  registrationQuery,
  listPayments,
  getAdminDashboardMetrics,
  getDuplicateGroupsReport,
  getStudentDetailWithHistory,
  supersedeDuplicateRegistration,
  registrationStatuses,
  paymentStatuses,
} from "../services/adminRecords.js";
import { generateStudentIdentityHash } from "../utils/identity.js";
import { exportAdminRecords } from "../services/adminExport.js";
import { portalSchema } from "../utils/portalContent.js";
import express from "express";
import { withOtpLock } from "../services/otpSecurity.js";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { downloadMedia, studentPhoto } from "../services/media.js";
import {
  Admin,
  Registration,
  Payment,
  Settings,
  Audit,
  ReminderLog,
  Challenge,
} from "../models/index.js";
import { issueToken, authenticate, adminRoles } from "../middleware/auth.js";
import { safeRegistration, publicSettings } from "./public.js";
import { confirmRegistration } from "../services/confirm.js";
import { admitPdf } from "../services/pdf.js";
import { parse, safeCsv } from "../utils/validation.js";
import {
  sendManualReminder,
  areRemindersEnabled,
  getReminderIntervals,
} from "../services/reminderScheduler.js";
import { generateCertificatePdfStream } from "../services/certificatePdf.js";
import { sendCertificateEmail } from "../services/certificateEmail.js";
import { processEligibleCertificates } from "../services/certificateWorker.js";
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
  res.json(await getAdminDashboardMetrics());
});
r.get("/duplicates", verifier, async (req, res) => {
  res.json(await getDuplicateGroupsReport());
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
    return res
      .status(404)
      .json({ error: "Receipt not found or awaiting storage migration." });
  const buffer = await downloadMedia(p.receipt);
  res.set("Cache-Control", "private, no-store");
  res.set(
    "Content-Disposition",
    `attachment; filename="receipt-${p._id}.${p.receipt.format}"`,
  );
  res.type(p.receipt.contentType).send(buffer);
});
// Both review decisions share one lease so approval and rejection cannot race.
r.use(
  ["/payments/:id/approve", "/payments/:id/reject"],
  verifier,
  (req, res, next) => {
    withOtpLock(
      `payment-review:${req.params.id}`,
      () =>
        new Promise((resolve) => {
          res.once("finish", resolve);
          res.once("close", resolve);
          next();
        }),
    ).catch(next);
  },
);
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
  if (
    p.status === "PAID" &&
    registration &&
    String(registration.paymentId) === String(p._id)
  ) {
    const recovered = await confirmRegistration(
      p.registrationId,
      String(req.admin._id),
    );
    return res.json({
      message: "Payment approved and admit card issued.",
      registration: safeRegistration(recovered),
    });
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
  const existing = await Payment.findOne({
    _id: req.params.id,
    mode: "manual",
  });
  const registration =
    existing && (await Registration.findById(existing.registrationId));
  if (
    !existing ||
    !registration ||
    String(registration.paymentId) !== String(existing._id) ||
    !["PAYMENT_UNDER_VERIFICATION", "PAYMENT_REJECTED"].includes(
      registration.status,
    ) ||
    !["UNDER_REVIEW", "REJECTED"].includes(existing.status)
  )
    return res.status(409).json({
      error:
        "Payment already reviewed or registration/payment status mismatch.",
    });
  const p = await Payment.findOneAndUpdate(
    {
      _id: req.params.id,
      mode: "manual",
      status: { $in: ["UNDER_REVIEW", "REJECTED"] },
    },
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
    {
      $set: {
        status: "PAYMENT_REJECTED",
        applicationStatus: "rejected",
        paymentStatus: "rejected",
      },
      $push: {
        statusHistory: {
          from: "PAYMENT_UNDER_VERIFICATION",
          to: "PAYMENT_REJECTED",
          axis: "legacy",
          changedAt: new Date(),
          reason: note,
          actor: String(req.admin._id),
        },
      },
    },
  );
  if (existing.status !== "REJECTED")
    await Audit.create({
      actor: String(req.admin._id),
      action: "PAYMENT_REJECTED",
      registrationId: p.registrationId,
      details: { note },
    });
  res.json({
    message: "Payment rejected; parent can resubmit a correct receipt.",
  });
});

// Admin Payment Update (UTR, Amount, Status, Note)
r.patch("/payments/:id", verifier, async (req, res) => {
  const p = await Payment.findById(req.params.id);
  if (!p) return res.status(404).json({ error: "Payment not found." });

  const body = req.body || {};

  if (body.utr !== undefined) {
    const rawUtr = String(body.utr).trim().toUpperCase();
    if (!/^[A-Z0-9]{8,22}$/.test(rawUtr)) {
      return res.status(400).json({ error: "Enter a valid 8-22 character alphanumeric UTR/Reference number." });
    }
    const conflict = await Payment.findOne({
      _id: { $ne: p._id },
      utr: rawUtr,
      status: "PAID",
    });
    if (conflict) {
      return res.status(409).json({ error: `UTR ${rawUtr} is already used in an approved transaction.` });
    }
    p.utr = rawUtr;
  }

  if (body.amount !== undefined) {
    const amt = Number(body.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ error: "Amount must be a positive number." });
    }
    p.amount = amt;
  }

  if (body.reviewNote !== undefined) {
    p.reviewNote = String(body.reviewNote).trim().slice(0, 500);
  }

  if (body.status !== undefined && body.status !== p.status) {
    const newStatus = String(body.status).toUpperCase();
    if (!paymentStatuses.includes(newStatus)) {
      return res.status(400).json({ error: "Invalid payment status. Must be UNDER_REVIEW, PAID, or REJECTED." });
    }
    p.status = newStatus;
    p.reviewedBy = req.admin._id;

    const registration = await Registration.findById(p.registrationId);

    if (newStatus === "PAID") {
      p.verifiedAt = new Date();
      await p.save();
      if (registration) {
        await confirmRegistration(registration._id, String(req.admin._id));
      }
    } else if (newStatus === "REJECTED") {
      p.verifiedAt = null;
      await p.save();
      if (registration) {
        registration.status = "PAYMENT_REJECTED";
        registration.paymentStatus = "rejected";
        registration.statusHistory.push({
          from: registration.status,
          to: "PAYMENT_REJECTED",
          axis: "legacy",
          changedAt: new Date(),
          reason: body.reviewNote || "Payment marked rejected by administrator",
          actor: req.admin?.email || "admin",
        });
        await registration.save();
      }
    } else if (newStatus === "UNDER_REVIEW") {
      p.verifiedAt = null;
      await p.save();
      if (registration) {
        registration.status = "PAYMENT_UNDER_VERIFICATION";
        registration.paymentStatus = "under_review";
        registration.applicationStatus = "submitted";
        await registration.save();
      }
    }
  } else {
    await p.save();
  }

  await Audit.create({
    actor: req.admin?.email || String(req.admin._id),
    action: "PAYMENT_ADMIN_UPDATED",
    details: {
      paymentId: p._id,
      registrationId: p.registrationId,
      changes: body,
    },
  });

  res.json({
    message: "Payment updated successfully.",
    payment: p,
  });
});

// Admin Payment Delete
r.delete("/payments/:id", verifier, async (req, res) => {
  const p = await Payment.findById(req.params.id);
  if (!p) return res.status(404).json({ error: "Payment not found." });

  const registrationId = p.registrationId;
  const utr = p.utr;

  if (registrationId) {
    const reg = await Registration.findById(registrationId);
    if (reg && String(reg.paymentId) === String(p._id)) {
      reg.paymentId = undefined;
      if (reg.status !== "CONFIRMED") {
        reg.status = "OTP_VERIFIED";
        reg.paymentStatus = "not_submitted";
        reg.applicationStatus = "awaiting_payment_proof";
      }
      reg.statusHistory.push({
        from: reg.status,
        to: reg.status,
        axis: "legacy",
        changedAt: new Date(),
        reason: `Payment record ${utr || p._id} deleted by administrator`,
        actor: req.admin?.email || "admin",
      });
      await reg.save();
    }
  }

  await Payment.deleteOne({ _id: p._id });

  await Audit.create({
    actor: req.admin?.email || String(req.admin._id),
    action: "PAYMENT_ADMIN_DELETED",
    details: {
      deletedPaymentId: p._id,
      registrationId,
      utr,
      reason: req.body?.reason || "Deleted by administrator",
    },
  });

  res.json({
    message: `Payment record ${utr ? `(UTR: ${utr})` : ""} deleted successfully.`,
    id: String(p._id),
  });
});

r.get("/registrations/:id/history", async (req, res) => {
  const detail = await getStudentDetailWithHistory(req.params.id);
  if (!detail) return res.status(404).json({ error: "Registration not found." });
  res.json(detail);
});

// Admin Registration Update
r.patch("/registrations/:id", writable, async (req, res) => {
  const reg = await Registration.findById(req.params.id);
  if (!reg) return res.status(404).json({ error: "Registration not found." });

  const body = req.body || {};
  const before = {
    studentName: reg.studentName,
    studentClass: reg.studentClass,
    status: reg.status,
    guardianPhone: reg.guardianPhone,
    email: reg.email,
  };

  if (body.studentName !== undefined) {
    const name = String(body.studentName).trim().toUpperCase();
    if (!name || name.length < 2)
      return res.status(400).json({ error: "Student name must be at least 2 characters." });
    reg.studentName = name;
  }
  if (body.studentClass !== undefined) {
    const cls = String(body.studentClass).trim();
    if (!/^(?:[2-9]|1[01])$/.test(cls))
      return res.status(400).json({ error: "Class must be between 2 and 11." });
    reg.studentClass = cls;
    if (cls !== "11") {
      reg.course = "";
    }
  }
  if (body.course !== undefined) {
    const crs = String(body.course).trim().toUpperCase();
    if (reg.studentClass === "11") {
      if (crs && !["PCM", "PCB", "ARTS", "COMMERCE"].includes(crs))
        return res.status(400).json({ error: "Course must be PCM, PCB, ARTS, or COMMERCE." });
      reg.course = crs;
    } else {
      reg.course = "";
    }
  }
  if (body.dob !== undefined) {
    const dob = String(body.dob).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob))
      return res.status(400).json({ error: "Date of birth must be YYYY-MM-DD." });
    reg.dob = dob;
  }
  if (body.guardianName !== undefined) {
    reg.guardianName = String(body.guardianName).trim().toUpperCase();
  }
  if (body.guardianPhone !== undefined) {
    const phone = String(body.guardianPhone).replace(/\D/g, "");
    if (phone.length < 10)
      return res.status(400).json({ error: "Valid 10-digit mobile number required." });
    reg.guardianPhone = phone.slice(-10);
  }
  if (body.email !== undefined) {
    const email = String(body.email).trim().toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ error: "Valid email address required." });
    reg.email = email;
  }
  if (body.currentSchool !== undefined) {
    reg.currentSchool = String(body.currentSchool).trim().toUpperCase();
  }
  if (body.address !== undefined) reg.address = String(body.address).trim().toUpperCase();
  if (body.city !== undefined) reg.city = String(body.city).trim().toUpperCase();
  if (body.district !== undefined) reg.district = String(body.district).trim().toUpperCase();
  if (body.state !== undefined) reg.state = String(body.state).trim().toUpperCase();
  if (body.pincode !== undefined) reg.pincode = String(body.pincode).trim();

  // Registration number manual override / update
  if (body.registrationNumber !== undefined) {
    const regNum = String(body.registrationNumber).trim().toUpperCase();
    if (regNum) {
      const exists = await Registration.findOne({
        _id: { $ne: reg._id },
        registrationNumber: regNum,
      });
      if (exists) {
        return res
          .status(409)
          .json({ error: `Registration number ${regNum} already assigned to another student.` });
      }
      reg.registrationNumber = regNum;
    } else {
      reg.registrationNumber = undefined;
    }
  }

  // Status update
  if (body.status !== undefined && body.status !== reg.status) {
    const newStatus = String(body.status).toUpperCase();
    if (!registrationStatuses.includes(newStatus)) {
      return res.status(400).json({ error: "Invalid registration status." });
    }
    const oldStatus = reg.status;
    reg.status = newStatus;
    reg.statusHistory.push({
      from: oldStatus,
      to: newStatus,
      axis: "legacy",
      changedAt: new Date(),
      reason: body.statusReason || "Status updated manually by administrator",
      actor: req.admin?.email || "admin",
    });

    if (newStatus === "CONFIRMED") {
      reg.applicationStatus = "approved";
      reg.paymentStatus = "verified";
      reg.approvedAt = reg.approvedAt || new Date();
    } else if (newStatus === "PAYMENT_UNDER_VERIFICATION") {
      reg.applicationStatus = "submitted";
      reg.paymentStatus = "under_review";
    } else if (newStatus === "PAYMENT_REJECTED") {
      reg.paymentStatus = "rejected";
    } else if (["OTP_VERIFIED", "PAYMENT_PENDING"].includes(newStatus)) {
      reg.applicationStatus = "awaiting_payment_proof";
      const now = new Date();
      reg.draftExpiresAt = new Date(now.getTime() + 10800000);
      reg.verificationExpiresAt = new Date(now.getTime() + 10800000);
      if (!reg.verifiedAt) reg.verifiedAt = now;
      if (!reg.verifiedEmail && reg.email) reg.verifiedEmail = reg.email;
    } else if (newStatus === "DRAFT") {
      reg.applicationStatus = "draft";
    } else if (newStatus === "CANCELLED") {
      reg.applicationStatus = "superseded";
    }
  }

  // Recalculate identity hash
  reg.studentIdentityHash = generateStudentIdentityHash({
    guardianPhone: reg.guardianPhone,
    studentName: reg.studentName,
    dob: reg.dob,
    studentClass: reg.studentClass,
  });

  await reg.save();

  await Audit.create({
    actor: req.admin?.email || String(req.admin._id),
    action: "REGISTRATION_ADMIN_UPDATED",
    registrationId: reg._id,
    details: {
      applicationRef: reg.applicationRef,
      studentName: reg.studentName,
      before,
      updatedFields: Object.keys(body),
    },
  });

  res.json({
    message: "Registration updated successfully.",
    registration: safeRegistration(reg),
  });
});

// Admin Registration Delete
r.delete("/registrations/:id", writable, async (req, res) => {
  const reg = await Registration.findById(req.params.id);
  if (!reg) return res.status(404).json({ error: "Registration not found." });

  const ref = reg.applicationRef;
  const name = reg.studentName;
  const id = reg._id;

  // Cleanup payments, challenges, reminder logs
  await Payment.deleteMany({ registrationId: id });
  await Challenge.deleteMany({ registrationId: id });
  await ReminderLog.deleteMany({ registrationId: id });

  await Registration.deleteOne({ _id: id });

  await Audit.create({
    actor: req.admin?.email || String(req.admin._id),
    action: "REGISTRATION_ADMIN_DELETED",
    details: {
      deletedRegistrationId: id,
      applicationRef: ref,
      studentName: name,
      reason: req.body?.reason || "Deleted by administrator",
    },
  });

  res.json({
    message: `Registration for ${name} (${ref}) deleted successfully.`,
    id: String(id),
  });
});

r.post("/registrations/:id/supersede", writable, async (req, res) => {
  const { primaryId, reason } = req.body || {};
  if (!primaryId)
    return res.status(400).json({ error: "Primary registration ID is required." });
  const result = await supersedeDuplicateRegistration(
    req.params.id,
    primaryId,
    reason || "Marked as duplicate/superseded by administrator",
    String(req.admin._id),
  );
  await Audit.create({
    actor: String(req.admin._id),
    action: "REGISTRATION_SUPERSEDED",
    registrationId: result._id,
    details: { primaryId, reason },
  });
  res.json({
    message: "Registration marked as duplicate/superseded.",
    registration: safeRegistration(result),
  });
});

r.post("/registrations/:id/remind", verifier, async (req, res) => {
  try {
    const result = await sendManualReminder(req.params.id, req.admin);
    if (!result.success) {
      return res
        .status(400)
        .json({ error: result.reason || "Failed to send reminder." });
    }
    const updated = await Registration.findById(req.params.id);
    res.json({
      success: true,
      message: "Reminder email dispatched successfully.",
      messageId: result.messageId,
      registration: safeRegistration(updated),
    });
  } catch (err) {
    res
      .status(err.status || 500)
      .json({ error: err.message || "Failed to send reminder." });
  }
});

r.get("/registrations/:id/reminders", async (req, res) => {
  const logs = await ReminderLog.find({ registrationId: req.params.id }).sort({
    sentAt: -1,
  });
  res.json({ logs });
});

r.get("/settings/reminders", async (req, res) => {
  const settings = await Settings.findById("primary");
  const enabled = areRemindersEnabled(settings);
  const intervals = getReminderIntervals(settings);
  const [sentCount, failedCount, pendingCount] = await Promise.all([
    ReminderLog.countDocuments({ status: "SENT" }),
    ReminderLog.countDocuments({ status: "FAILED" }),
    Registration.countDocuments({
      status: { $in: ["DRAFT", "OTP_VERIFIED", "PAYMENT_PENDING"] },
      applicationStatus: { $in: ["draft", "awaiting_payment_proof"] },
      reminderOptOut: { $ne: true },
      reminderCount: { $lt: 3 },
    }),
  ]);
  res.json({
    enabled,
    intervals,
    sentCount,
    failedCount,
    pendingCount,
  });
});

r.get("/reminders/logs", async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
  const [logs, total] = await Promise.all([
    ReminderLog.find()
      .populate("registrationId", "studentName studentClass applicationRef email guardianPhone")
      .sort({ sentAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    ReminderLog.countDocuments(),
  ]);
  res.json({ logs, total, page, pages: Math.ceil(total / limit) || 1 });
});

r.post("/settings/reminders/toggle", writable, async (req, res) => {
  const settings = await Settings.findById("primary");
  const current = areRemindersEnabled(settings);
  const nextVal =
    typeof req.body.enabled === "boolean" ? req.body.enabled : !current;

  settings.remindersEnabled = nextVal;
  await settings.save();

  await Audit.create({
    actor: String(req.admin._id),
    action: nextVal ? "REMINDERS_ACTIVATED" : "REMINDERS_PAUSED",
    details: { enabled: nextVal },
  });

  res.json({
    success: true,
    enabled: nextVal,
    message: nextVal
      ? "Automated registration reminders have been activated."
      : "Automated registration reminders have been paused.",
  });
});
r.get("/admit-card/:id", examiner, async (req, res) => {
  const student = await Registration.findById(req.params.id);
  const eligible =
    student?.status === "CONFIRMED" &&
    (student.applicationStatus ? student.applicationStatus === "approved" : true) &&
    (student.paymentStatus ? student.paymentStatus === "verified" : true);
  if (!eligible)
    return res
      .status(403)
      .json({ error: "Only approved registrations with verified payments have admit cards." });
  await admitPdf(res, student, await publicSettings());
});
r.get("/certificate/preview/:id", examiner, async (req, res) => {
  const student = await Registration.findById(req.params.id);
  if (!student) return res.status(404).json({ error: "Registration not found." });
  const inline = req.query.download !== "1";
  await generateCertificatePdfStream(res, student, await publicSettings(), inline);
});
r.post("/certificate/send/:id", examiner, async (req, res) => {
  const student = await Registration.findById(req.params.id);
  if (!student) return res.status(404).json({ error: "Registration not found." });
  if (student.status !== "CONFIRMED") {
    return res.status(400).json({ error: "Only confirmed registrations can receive certificates." });
  }

  if (!student.checkInAt) {
    student.checkInAt = new Date();
    await student.save();
  }

  const result = await sendCertificateEmail(student, await publicSettings());
  const updated = await Registration.findById(student._id);

  await Audit.create({
    actor: String(req.admin._id),
    action: "CERTIFICATE_MANUAL_DISPATCH",
    registrationId: student._id,
    details: { result },
  });

  res.json({
    message: `Certificate successfully sent to ${updated.certificateSentTo || student.email}.`,
    registration: safeRegistration(updated),
  });
});
r.post("/certificate/process-eligible", examiner, async (req, res) => {
  const result = await processEligibleCertificates();
  await Audit.create({
    actor: String(req.admin._id),
    action: "CERTIFICATE_BATCH_RUN",
    details: result,
  });
  res.json(result);
});
r.get("/check-in/:id/photo", examiner, async (req, res) => {
  const student = await Registration.findOne({
    _id: req.params.id,
    status: "CONFIRMED",
  });
  if (!student?.photo?.publicId)
    return res.status(404).json({ error: "Student photo is unavailable." });
  const buffer = await studentPhoto(student);
  res
    .set("Cache-Control", "private, no-store")
    .set("Content-Type", student.photo.contentType)
    .send(buffer);
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
  if (!s) {
    const existing = await Registration.findOne({
      admitToken: token,
      status: "CONFIRMED",
    });
    if (existing?.checkInAt)
      return res.json({
        registration: safeRegistration(existing),
        alreadyCheckedIn: true,
      });
    return res.status(404).json({ error: "Invalid or cancelled admit card." });
  }
  await Audit.create({
    actor: String(req.admin._id),
    action: "EXAM_CHECK_IN",
    registrationId: s._id,
  });
  res.json({ registration: safeRegistration(s), alreadyCheckedIn: false });
});
r.get("/settings", async (req, res) => res.json(await publicSettings()));
// Separate from payment settings so publishing content cannot alter payment configuration.
r.put("/portal", writable, async (req, res) => {
  const data = parse(
    z
      .object({
        eventName: z.string().trim().min(1).max(160),
        portal: portalSchema,
      })
      .strict(),
    req.body,
  );
  await publicSettings();
  const saved = await Settings.findByIdAndUpdate(
    "primary",
    { $set: data },
    { new: true, runValidators: true },
  );
  await Audit.create({
    actor: String(req.admin._id),
    action: "PUBLIC_CONTENT_UPDATED",
    details: {},
  });
  res.json({ eventName: saved.eventName, portal: saved.portal });
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
      paymentMode: z.enum(["manual", "razorpay", "both"]).optional(),
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
    if (
      (mode === "manual" || mode === "both") &&
      (!effective.upiId?.trim() || !effective.payeeName?.trim())
    )
      return res.status(400).json({
        error: "Configure official UPI ID before opening manual registrations.",
      });
    if (
      (mode === "razorpay" || mode === "both") &&
      (!process.env.RAZORPAY_KEY_ID ||
        !process.env.RAZORPAY_KEY_SECRET ||
        !process.env.RAZORPAY_WEBHOOK_SECRET)
    )
      return res.status(400).json({
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
      'attachment; filename="shree-2027-registrations.csv"',
    )
    .send("\uFEFF" + rows.join("\r\n"));
});
export default r;
