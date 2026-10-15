import "express-async-errors";
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import { once } from "node:events";
import {
  Admin,
  Registration,
  Payment,
  Challenge,
  ReminderLog,
  Audit,
} from "../../src/models/index.js";
import routes from "../../src/routes/admin.js";
import { issueToken } from "../../src/middleware/auth.js";
import { errorHandler } from "../../src/middleware/errors.js";

const source = process.env.OTP_TEST_MONGODB_URI;
if (
  !source ||
  !/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\/shree_otp_test(?:\?|$)/.test(
    source
  )
) {
  throw new Error("Use isolated local test MongoDB.");
}

process.env.JWT_SECRET = "crud-only-test-secret-key-crud-only-secret".repeat(2);
let server, base, adminToken;

async function call(path, method = "GET", body, token = adminToken) {
  return fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Cookie: `olympiad_admin=${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

const mockStudent = (overrides = {}) => ({
  studentName: "ARAV SHARMA",
  studentClass: "5",
  dob: "2014-05-10",
  currentSchool: "DELHI PUBLIC SCHOOL",
  guardianName: "ROHIT SHARMA",
  guardianPhone: "9876543210",
  email: "rohit@test.invalid",
  address: "123 MAIN STREET",
  city: "PANIPAT",
  district: "PANIPAT",
  state: "HARYANA",
  pincode: "132103",
  consent: true,
  applicationRef: `APP-${Date.now().toString(16).toUpperCase()}-${Math.floor(Math.random() * 1000)}`,
  status: "PAYMENT_UNDER_VERIFICATION",
  ...overrides,
});

before(async () => {
  await mongoose.connect(
    source.replace("/shree_otp_test", "/shree_admin_crud_test"),
    { serverSelectionTimeoutMS: 3000 }
  );
  await Promise.all(
    [Admin, Registration, Payment, Challenge, ReminderLog, Audit].map((m) =>
      m.init()
    )
  );
  await Admin.deleteMany({});
  const admin = await Admin.create({
    email: "superadmin@test.invalid",
    role: "SUPER_ADMIN",
    passwordHash: "unused",
  });
  adminToken = issueToken({ sub: String(admin._id), scope: "admin" });

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/admin", routes);
  app.use(errorHandler);
  server = app.listen(0);
  await once(server, "listening");
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server?.close();
  await mongoose.disconnect();
});

beforeEach(async () => {
  await Registration.deleteMany({});
  await Payment.deleteMany({});
  await Challenge.deleteMany({});
  await ReminderLog.deleteMany({});
  await Audit.deleteMany({});
});

test("Admin can edit a payment record (UTR, amount, review note)", async () => {
  const reg = await Registration.create(mockStudent());

  const payment = await Payment.create({
    registrationId: reg._id,
    mode: "manual",
    amount: 149,
    utr: "123456789012",
    status: "UNDER_REVIEW",
  });

  const res = await call(`/admin/payments/${payment._id}`, "PATCH", {
    utr: "999888777666",
    amount: 200,
    reviewNote: "Corrected UTR per screenshot",
  });

  assert.equal(res.status, 200);
  const updated = await Payment.findById(payment._id);
  assert.equal(updated.utr, "999888777666");
  assert.equal(updated.amount, 200);
  assert.equal(updated.reviewNote, "Corrected UTR per screenshot");

  const audit = await Audit.findOne({ action: "PAYMENT_ADMIN_UPDATED" });
  assert.ok(audit);
  assert.equal(String(audit.details.paymentId), String(payment._id));
});

test("Admin editing payment to PAID confirms the linked student", async () => {
  const reg = await Registration.create(
    mockStudent({
      studentName: "PRIYA VERMA",
      studentClass: "6",
      email: "ajay@test.invalid",
    })
  );

  const payment = await Payment.create({
    registrationId: reg._id,
    mode: "manual",
    amount: 149,
    utr: "555444333222",
    status: "UNDER_REVIEW",
  });

  const res = await call(`/admin/payments/${payment._id}`, "PATCH", {
    status: "PAID",
  });

  assert.equal(res.status, 200);
  const updatedReg = await Registration.findById(reg._id);
  assert.equal(updatedReg.status, "CONFIRMED");
  assert.ok(updatedReg.registrationNumber);
});

test("Admin can delete a payment record without deleting the student", async () => {
  const reg = await Registration.create(
    mockStudent({
      studentName: "KAVITA SINGH",
      studentClass: "4",
      email: "suresh@test.invalid",
    })
  );

  const payment = await Payment.create({
    registrationId: reg._id,
    mode: "manual",
    amount: 149,
    utr: "777888999000",
    status: "UNDER_REVIEW",
  });
  reg.paymentId = payment._id;
  await reg.save();

  const res = await call(`/admin/payments/${payment._id}`, "DELETE");
  assert.equal(res.status, 200);

  const foundPayment = await Payment.findById(payment._id);
  assert.equal(foundPayment, null);

  const foundReg = await Registration.findById(reg._id);
  assert.ok(foundReg);
  assert.ok(!foundReg.paymentId);
  assert.equal(foundReg.applicationStatus, "awaiting_payment_proof");

  const audit = await Audit.findOne({ action: "PAYMENT_ADMIN_DELETED" });
  assert.ok(audit);
});

test("Admin can update registration fields and identity hash updates", async () => {
  const reg = await Registration.create(
    mockStudent({
      studentName: "MOHIT GUPTA",
      studentClass: "7",
      email: "ramesh@test.invalid",
      status: "DRAFT",
    })
  );

  const originalHash = reg.studentIdentityHash;

  const res = await call(`/admin/registrations/${reg._id}`, "PATCH", {
    studentName: "MOHIT KUMAR GUPTA",
    studentClass: "8",
    city: "KARNAL",
    status: "PAYMENT_PENDING",
  });

  assert.equal(res.status, 200);
  const updated = await Registration.findById(reg._id);
  assert.equal(updated.studentName, "MOHIT KUMAR GUPTA");
  assert.equal(updated.studentClass, "8");
  assert.equal(updated.city, "KARNAL");
  assert.equal(updated.status, "PAYMENT_PENDING");
  assert.notEqual(updated.studentIdentityHash, originalHash);

  const audit = await Audit.findOne({ action: "REGISTRATION_ADMIN_UPDATED" });
  assert.ok(audit);
});

test("Admin can delete a registration with cascade cleanup of challenges, payments, and logs", async () => {
  const reg = await Registration.create(
    mockStudent({
      studentName: "TEST DELETE STUDENT",
      studentClass: "3",
      email: "testguardian@test.invalid",
      status: "DRAFT",
    })
  );

  const payment = await Payment.create({
    registrationId: reg._id,
    mode: "manual",
    amount: 149,
    utr: "112233445566",
    status: "UNDER_REVIEW",
  });

  const challenge = await Challenge.create({
    registrationId: reg._id,
    purpose: "register",
    provider: "smtp",
    contactValue: "testguardian@test.invalid",
    codeHash: "hash12345678901234567890123456789012",
    expiresAt: new Date(Date.now() + 600000),
    lastSentAt: new Date(),
    resendAvailableAt: new Date(),
  });

  const reminder = await ReminderLog.create({
    registrationId: reg._id,
    attemptNumber: 1,
    triggerType: "MANUAL",
    recipientEmail: "testguardian@test.invalid",
    status: "SENT",
  });

  const res = await call(`/admin/registrations/${reg._id}`, "DELETE", {
    reason: "Duplicate test entry requested by parent",
  });

  assert.equal(res.status, 200);
  assert.equal(await Registration.findById(reg._id), null);
  assert.equal(await Payment.findById(payment._id), null);
  assert.equal(await Challenge.findById(challenge._id), null);
  assert.equal(await ReminderLog.findById(reminder._id), null);

  const audit = await Audit.findOne({ action: "REGISTRATION_ADMIN_DELETED" });
  assert.ok(audit);
  assert.equal(audit.details.reason, "Duplicate test entry requested by parent");
});
