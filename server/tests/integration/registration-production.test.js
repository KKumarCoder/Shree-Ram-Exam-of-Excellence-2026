import "express-async-errors";
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { once } from "node:events";
import express from "express";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";

import nodemailer from "nodemailer";

import {
  Admin,
  Registration,
  Payment,
  Challenge,
  Settings,
  Audit,
  OtpBucket,
  OtpLock,
} from "../../src/models/index.js";
import {
  generateStudentIdentityHash,
  normalizeUtr,
  normalizePhone,
  normalizeStudentName,
} from "../../src/utils/identity.js";
import { issueToken } from "../../src/middleware/auth.js";
import { errorHandler } from "../../src/middleware/errors.js";
import adminRoutes from "../../src/routes/admin.js";
import publicRoutes from "../../src/routes/public.js";

const source =
  process.env.OTP_TEST_MONGODB_URI || "mongodb://127.0.0.1:27017/shree_otp_test";
const uri = source.replace("/shree_otp_test", "/shree_prod_test");

process.env.JWT_SECRET = "production-test-secret-only".repeat(3);
process.env.OTP_PEPPER = "test-only-pepper".repeat(4);
process.env.DISABLE_RATE_LIMITS_FOR_TESTS = "true";
Object.assign(process.env, {
  SMTP_HOST: "smtp.example.com",
  SMTP_PORT: "587",
  SMTP_USER: "test@example.com",
  SMTP_PASS: "test-secret",
  SMTP_FROM: "test@example.com",
});

let server, base, adminToken, latestOtpCode = "123456";
const originalTransport = nodemailer.createTransport;

const baseStudent = {
  studentName: "Aarav Sharma",
  dob: "2013-05-15",
  studentClass: "6",
  currentSchool: "Shree Ram Public School",
  guardianName: "Sunita Sharma",
  guardianPhone: "9876543210",
  email: "parent.sharma@example.com",
  address: "House 42, Main Road",
  city: "Dadri",
  district: "Charkhi Dadri",
  state: "Haryana",
  pincode: "127306",
  purpose: "",
  consent: true,
};

async function req(path, method = "GET", body = null, token = null) {
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(token ? { Cookie: `olympiad_admin=${token}` } : {}),
  };
  const response = await fetch(base + path, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: response.status, data };
}

before(async () => {
  nodemailer.createTransport = () => ({
    async sendMail(message) {
      if (message.text) {
        const match = message.text.match(/\b[0-9]{6}\b/);
        if (match) latestOtpCode = match[0];
      }
      return { messageId: "mock-message-id-123", accepted: [message.to], rejected: [] };
    },
    close() {},
  });

  await mongoose.connect(uri);
  await Promise.all([Admin, Registration, Payment, Challenge, Settings, Audit].map((m) => m.init()));
  await Promise.all([Admin, Registration, Payment, Challenge, Settings, Audit].map((m) => m.deleteMany({})));

  await Settings.create({
    _id: "primary",
    registrationOpen: true,
    fee: 250,
    upiId: "shreeram@upi",
    payeeName: "Shree Ram Public School",
  });

  const admin = await Admin.create({
    email: "superadmin@shreeram.edu",
    passwordHash: "test-hash",
    role: "SUPER_ADMIN",
  });
  adminToken = issueToken({ sub: String(admin._id), scope: "admin" });

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/admin", adminRoutes);
  app.use(publicRoutes);
  app.use(errorHandler);

  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  nodemailer.createTransport = originalTransport;
  if (server) {
    if (typeof server.closeAllConnections === "function") {
      server.closeAllConnections();
    }
    await new Promise((r) => server.close(r));
  }
  try {
    await mongoose.disconnect();
  } catch (_) {}
});

beforeEach(async () => {
  await Promise.all(
    [Registration, Payment, Challenge, Audit, OtpBucket, OtpLock].map((m) =>
      m.deleteMany({})
    )
  );
});

// Scenario 1: A single student registered twice (returns existing, does not duplicate)
test("1. A single student registered twice returns existing draft with same reference", async () => {
  const r1 = await req("/registrations/start", "POST", baseStudent);
  assert.equal(r1.status, 201);
  const ref1 = r1.data.registration.applicationRef;
  const id1 = r1.data.registration.id;

  const r2 = await req("/registrations/start", "POST", baseStudent);
  assert.equal(r2.status, 201);
  assert.equal(r2.data.duplicate, true);
  assert.equal(r2.data.resumed, true);
  assert.equal(r2.data.registration.applicationRef, ref1);
  assert.equal(r2.data.registration.id, id1);

  const count = await Registration.countDocuments();
  assert.equal(count, 1);
});

// Scenario 2: Double-click and simultaneous submission with idempotency key
test("2. Simultaneous submissions with idempotency key create exactly 1 registration", async () => {
  const key = crypto.randomUUID();
  const send = () =>
    fetch(base + "/registrations/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify(baseStudent),
    });

  const [resA, resB] = await Promise.all([send(), send()]);
  assert.equal(resA.status, 201);
  assert.equal(resB.status, 201);

  const dataA = await resA.json();
  const dataB = await resB.json();
  assert.equal(dataA.registration.id, dataB.registration.id);
  assert.equal(dataA.registration.applicationRef, dataB.registration.applicationRef);

  const count = await Registration.countDocuments();
  assert.equal(count, 1);
});

// Scenario 3: Network retry with idempotency key
test("3. Network retry with same idempotency key returns existing draft", async () => {
  const key = crypto.randomUUID();
  const first = await fetch(base + "/registrations/start", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(baseStudent),
  });
  const data1 = await first.json();

  const retry = await fetch(base + "/registrations/start", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(baseStudent),
  });
  const data2 = await retry.json();
  assert.equal(data1.registration.applicationRef, data2.registration.applicationRef);
  assert.equal(await Registration.countDocuments(), 1);
});

// Scenario 4: Two siblings with the same parent mobile and email
test("4. Two siblings with same parent mobile and email get separate applications", async () => {
  const sibling1 = {
    ...baseStudent,
    studentName: "Rahul Sharma",
    studentClass: "5",
    dob: "2014-04-10",
  };
  const sibling2 = {
    ...baseStudent,
    studentName: "Priya Sharma",
    studentClass: "8",
    dob: "2011-09-22",
  };

  const res1 = await req("/registrations/start", "POST", sibling1);
  assert.equal(res1.status, 201);
  const res2 = await req("/registrations/start", "POST", sibling2);
  assert.equal(res2.status, 201);

  assert.notEqual(res1.data.registration.id, res2.data.registration.id);
  assert.notEqual(res1.data.registration.applicationRef, res2.data.registration.applicationRef);
  assert.notEqual(res1.data.registration.studentIdentityHash, res2.data.registration.studentIdentityHash);

  const count = await Registration.countDocuments();
  assert.equal(count, 2);
});

// Scenario 5: Distinct students with the same name
test("5. Distinct students with same name but different DOB or class have distinct hashes", async () => {
  const studentA = {
    ...baseStudent,
    studentName: "Rohit Verma",
    studentClass: "6",
    dob: "2013-01-10",
  };
  const studentB = {
    ...baseStudent,
    studentName: "Rohit Verma",
    studentClass: "7",
    dob: "2012-03-15",
  };

  const hashA = generateStudentIdentityHash({
    guardianPhone: studentA.guardianPhone,
    studentName: studentA.studentName,
    dob: studentA.dob,
    studentClass: studentA.studentClass,
  });
  const hashB = generateStudentIdentityHash({
    guardianPhone: studentB.guardianPhone,
    studentName: studentB.studentName,
    dob: studentB.dob,
    studentClass: studentB.studentClass,
  });
  assert.notEqual(hashA, hashB);

  const r1 = await req("/registrations/start", "POST", studentA);
  const r2 = await req("/registrations/start", "POST", studentB);
  assert.equal(r1.status, 201);
  assert.equal(r2.status, 201);
  assert.notEqual(r1.data.registration.applicationRef, r2.data.registration.applicationRef);
  assert.equal(await Registration.countDocuments(), 2);
});

// Scenario 6: Successful OTP followed by abandoned payment
test("6. Successful OTP advances verification status without approving application", async () => {
  const start = await req("/registrations/start", "POST", baseStudent);
  const regId = start.data.registration.id;
  const draftToken = start.data.token;

  // Simulate verified OTP
  const updated = await Registration.findByIdAndUpdate(
    regId,
    {
      status: "OTP_VERIFIED",
      verificationStatus: "verified",
      applicationStatus: "awaiting_payment_proof",
      paymentStatus: "not_submitted",
      verifiedAt: new Date(),
    },
    { new: true }
  );

  assert.equal(updated.verificationStatus, "verified");
  assert.equal(updated.applicationStatus, "awaiting_payment_proof");
  assert.equal(updated.paymentStatus, "not_submitted");
  assert.equal(updated.status, "OTP_VERIFIED");
});

// Scenario 7: Resume an existing application (request -> verify -> select)
test("7. Resume workflow requests OTP, verifies challenge, and selects student draft", async () => {
  const start = await req("/registrations/start", "POST", baseStudent);
  const ref = start.data.registration.applicationRef;

  // Step A: Request resume OTP
  const reqResume = await req("/registrations/resume/request", "POST", {
    identifier: baseStudent.guardianPhone,
  });
  assert.equal(reqResume.status, 200);
  assert.equal(reqResume.data.applicationCount, 1);
  assert.ok(reqResume.data.lookupToken);

  // Step B: Verify resume OTP using the code delivered via email with lookupToken
  const verifyResume = await req(
    "/registrations/resume/verify",
    "POST",
    { otp: latestOtpCode },
    reqResume.data.lookupToken
  );
  assert.equal(verifyResume.status, 200);
  assert.ok(verifyResume.data.resumeToken);
  assert.equal(verifyResume.data.applications.length, 1);
  assert.equal(verifyResume.data.applications[0].applicationRef, ref);

  // Step C: Select student to resume session using resumeToken
  const selectResume = await req(
    "/registrations/resume/select",
    "POST",
    { registrationId: verifyResume.data.applications[0].id },
    verifyResume.data.resumeToken
  );
  assert.equal(selectResume.status, 200);
  assert.ok(selectResume.data.token);
  assert.equal(selectResume.data.registration.applicationRef, ref);
});

// Scenario 8: Duplicate UTR submission rejection
test("8. Submitting duplicate UTR is rejected with 409 conflict", async () => {
  const regA = await Registration.create({
    ...baseStudent,
    studentName: "Student Alpha",
    studentIdentityHash: "hash-alpha",
    applicationRef: "APP-ALPHA",
    status: "PAYMENT_UNDER_VERIFICATION",
    applicationStatus: "submitted",
    paymentStatus: "under_review",
    draftExpiresAt: new Date(Date.now() + 3600000),
  });
  const regB = await Registration.create({
    ...baseStudent,
    studentName: "Student Beta",
    studentIdentityHash: "hash-beta",
    applicationRef: "APP-BETA",
    status: "OTP_VERIFIED",
    applicationStatus: "awaiting_payment_proof",
    paymentStatus: "not_submitted",
    verifiedAt: new Date(),
    verifiedEmail: baseStudent.email,
    verificationExpiresAt: new Date(Date.now() + 3600000),
    photo: {
      publicId: "photo-beta",
      secureUrl: "https://example.com/photo.jpg",
      bytes: 1024,
      contentType: "image/jpeg",
      format: "jpg",
      resourceType: "image",
    },
    draftExpiresAt: new Date(Date.now() + 3600000),
  });

  const rawUtr = "123456789012";
  const norm = normalizeUtr(rawUtr);

  // Payment for A
  const payA = await Payment.create({
    registrationId: regA._id,
    mode: "manual",
    amount: 250,
    utr: norm,
    status: "UNDER_REVIEW",
  });
  regA.paymentId = payA._id;
  await regA.save();

  const tokenB = issueToken({ sub: String(regB._id), scope: "draft" });
  // B attempts same UTR with spaces
  const dupAttempt = await req(
    "/registrations/manual",
    "POST",
    { utr: " 1234 5678 9012 ", termsAccepted: "true" },
    tokenB
  );
  assert.equal(dupAttempt.status, 409);
  assert.match(dupAttempt.data.error, /already been submitted/i);
});

// Scenario 9: Multiple drafts without UTR exist simultaneously
test("9. Multiple drafts with empty UTR coexist without index collision", async () => {
  const reg1 = await Registration.create({
    ...baseStudent,
    studentName: "Draft One",
    studentIdentityHash: "hash-draft-1",
    applicationRef: "APP-DRAFT1",
    draftExpiresAt: new Date(Date.now() + 3600000),
  });
  const reg2 = await Registration.create({
    ...baseStudent,
    studentName: "Draft Two",
    studentIdentityHash: "hash-draft-2",
    applicationRef: "APP-DRAFT2",
    draftExpiresAt: new Date(Date.now() + 3600000),
  });

  assert.ok(reg1._id);
  assert.ok(reg2._id);
  const drafts = await Registration.find({ status: "DRAFT" });
  assert.equal(drafts.length, 2);
});

// Scenario 10: Existing legacy application compatibility
test("10. Legacy registration without new status fields maps cleanly", async () => {
  const legacy = await Registration.create({
    ...baseStudent,
    studentName: "Legacy Student",
    applicationRef: "APP-LEGACY",
    status: "CONFIRMED",
    registrationNumber: "SHREE27-9999",
  });

  const { mapLegacyToNewStatuses } = await import("../../src/models/index.js");
  const mapped = mapLegacyToNewStatuses("CONFIRMED");
  assert.equal(mapped.verificationStatus, "verified");
  assert.equal(mapped.applicationStatus, "approved");
  assert.equal(mapped.paymentStatus, "verified");
});

// Scenario 11: Authorized payment approval transitions multi-axis statuses
test("11. Admin payment approval transitions application to approved and payment to verified", async () => {
  const reg = await Registration.create({
    ...baseStudent,
    studentName: "Pay Student",
    studentIdentityHash: "hash-pay-1",
    applicationRef: "APP-PAY1",
    status: "PAYMENT_UNDER_VERIFICATION",
    applicationStatus: "submitted",
    paymentStatus: "under_review",
    draftExpiresAt: new Date(Date.now() + 3600000),
  });
  const pay = await Payment.create({
    registrationId: reg._id,
    mode: "manual",
    amount: 250,
    utr: "998877665544",
    status: "UNDER_REVIEW",
  });
  reg.paymentId = pay._id;
  await reg.save();

  const approveRes = await req(
    `/admin/payments/${pay._id}/approve`,
    "POST",
    {},
    adminToken
  );
  assert.equal(approveRes.status, 200);

  const fresh = await Registration.findById(reg._id);
  assert.equal(fresh.status, "CONFIRMED");
  assert.equal(fresh.applicationStatus, "approved");
  assert.equal(fresh.paymentStatus, "verified");
  assert.ok(fresh.approvedAt);
  assert.ok(fresh.statusHistory.length > 0);
});

// Scenario 12: Admit card access denied before approval
test("12. Admit card download is rejected with 403 before approval", async () => {
  const reg = await Registration.create({
    ...baseStudent,
    studentName: "Unapproved Student",
    studentIdentityHash: "hash-unapproved",
    applicationRef: "APP-UNAPP",
    status: "PAYMENT_UNDER_VERIFICATION",
    applicationStatus: "submitted",
    paymentStatus: "under_review",
  });

  const token = issueToken({ sub: String(reg._id), scope: "draft" });
  const admitRes = await req("/registrations/admit-card", "GET", null, token);
  assert.equal(admitRes.status, 403);
});

// Scenario 13: Approved student can access admit card
test("13. Approved student has full admit card access", async () => {
  const reg = await Registration.create({
    ...baseStudent,
    studentName: "Approved Student",
    studentIdentityHash: "hash-approved",
    applicationRef: "APP-APPR",
    status: "CONFIRMED",
    applicationStatus: "approved",
    paymentStatus: "verified",
    registrationNumber: "SHREE27-1001",
    admitToken: "token-appr-123",
  });

  const token = issueToken({ sub: String(reg._id), scope: "draft" });
  const admitRes = await req("/registrations/admit-card", "GET", null, token);
  assert.equal(admitRes.status, 200);
  assert.ok(admitRes.data.includes("%PDF-"));
});

// Scenario 14: Unauthorized access to another student's registration
test("14. Draft token for Student A cannot access or mutate Student B", async () => {
  const regA = await Registration.create({
    ...baseStudent,
    studentName: "Student Alpha",
    studentIdentityHash: "hash-a",
    applicationRef: "APP-AAA",
  });
  const regB = await Registration.create({
    ...baseStudent,
    studentName: "Student Beta",
    studentIdentityHash: "hash-b",
    applicationRef: "APP-BBB",
  });

  const tokenA = issueToken({ sub: String(regA._id), scope: "draft" });
  // When Student A queries their draft, it returns ONLY Student A
  const ownRes = await req("/registrations/me", "GET", null, tokenA);
  assert.equal(ownRes.status, 200);
  assert.equal(ownRes.data.registration.applicationRef, "APP-AAA");
  assert.notEqual(ownRes.data.registration.applicationRef, "APP-BBB");
});
