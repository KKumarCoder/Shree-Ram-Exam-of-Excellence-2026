import test, { beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import cookieParser from 'cookie-parser';
import nodemailer from 'nodemailer';
import { once } from 'node:events';
import crypto from 'node:crypto';
import {
  Registration,
  Payment,
  Challenge,
  Audit,
  Settings,
  ReminderLog,
  OtpBucket,
  OtpLock,
} from '../../src/models/index.js';
import publicRoutes from '../../src/routes/public.js';
import adminRoutes from '../../src/routes/admin.js';
import { errorHandler } from '../../src/middleware/errors.js';
import { issueToken } from '../../src/middleware/auth.js';
import {
  sendRegistrationReminder,
  processReminderQueue,
  sendManualReminder,
  markRemindersCompleted,
  checkReminderEligibility,
  getReminderIntervals,
  calculateNextAttemptDate,
} from '../../src/services/reminderScheduler.js';
import {
  generateRecoveryToken,
  hashRecoveryToken,
  buildResumeUrl,
} from '../../src/services/recoveryToken.js';
import { buildReminderEmail } from '../../src/services/reminderEmail.js';

const uri =
  process.env.OTP_TEST_MONGODB_URI ||
  'mongodb://127.0.0.1:27017/shree_otp_test';

process.env.JWT_SECRET = 'test-only-secret-longer-than-32-characters';
process.env.OTP_PEPPER = 'test-only-pepper-longer-than-32-characters';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';
process.env.REMINDERS_ENABLED = 'false';
process.env.DISABLE_RATE_LIMITS_FOR_TESTS = 'true';
Object.assign(process.env, {
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: '587',
  SMTP_USER: 'test@example.com',
  SMTP_PASS: 'test-secret',
  SMTP_FROM: 'test@example.com',
});

let server, base;
const originalTransport = nodemailer.createTransport;
let deliveredEmails = [];
let latestOtpCode = "";

const mockTransport = () => ({
  sendMail: async (msg) => {
    deliveredEmails.push(msg);
    const match = String(msg.text || "").match(/\b\d{6}\b/);
    if (match) latestOtpCode = match[0];
    return {
      messageId: `mock-msg-${crypto.randomUUID()}`,
      accepted: [msg.to],
      rejected: [],
    };
  },
  close: () => {},
});

const mockDeliver = async (msg) => {
  deliveredEmails.push(msg);
  const match = String(msg.text || "").match(/\b\d{6}\b/);
  if (match) latestOtpCode = match[0];
  return {
    messageId: `mock-msg-${crypto.randomUUID()}`,
    accepted: [msg.to],
    rejected: [],
  };
};

test.before(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
  }
  nodemailer.createTransport = mockTransport;

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/admin', adminRoutes);
  app.use(publicRoutes);
  app.use(errorHandler);

  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  nodemailer.createTransport = originalTransport;
  if (server) {
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    await new Promise((r) => server.close(r));
  }
  try {
    await mongoose.disconnect();
  } catch (_) {}
});

beforeEach(async () => {
  deliveredEmails = [];
  await Promise.all([
    Registration.deleteMany({}),
    Payment.deleteMany({}),
    Challenge.deleteMany({}),
    Audit.deleteMany({}),
    ReminderLog.deleteMany({}),
    Settings.deleteMany({}),
    OtpBucket.deleteMany({}),
    OtpLock.deleteMany({}),
  ]);

  await Settings.create({
    _id: 'primary',
    eventName: 'SHREE 2027 Olympiad',
    fee: 149,
    registrationOpen: true,
    upiId: 'school@upi',
    payeeName: 'Shree Ram Public School',
    contactPhone: '8199991081',
    contactEmail: 'srpskanhra@gmail.com',
    remindersEnabled: false,
    reminderIntervals: [2, 24, 72],
  });
});

test('1. Reminder intervals calculate default 2h, 24h, 72h correctly', async () => {
  const intervals = getReminderIntervals();
  assert.deepEqual(intervals, [2, 24, 72]);

  const baseDate = new Date('2026-10-14T10:00:00.000Z');
  const attempt1Date = calculateNextAttemptDate(0, baseDate, intervals);
  const attempt2Date = calculateNextAttemptDate(1, baseDate, intervals);
  const attempt3Date = calculateNextAttemptDate(2, baseDate, intervals);

  assert.equal(attempt1Date.toISOString(), '2026-10-14T12:00:00.000Z'); // +2h
  assert.equal(attempt2Date.toISOString(), '2026-10-15T10:00:00.000Z'); // +24h
  assert.equal(attempt3Date.toISOString(), '2026-10-17T10:00:00.000Z'); // +72h
});

test('2. Eligibility check correctly admits incomplete drafts and rejects completed/paid applications', async () => {
  const incompleteDraft = {
    email: 'parent@example.com',
    applicationStatus: 'draft',
    status: 'DRAFT',
    paymentStatus: 'not_submitted',
    reminderCount: 0,
    reminderOptOut: false,
  };
  assert.equal(checkReminderEligibility(incompleteDraft).eligible, true);

  const awaitingProof = {
    ...incompleteDraft,
    status: 'OTP_VERIFIED',
    applicationStatus: 'awaiting_payment_proof',
  };
  assert.equal(checkReminderEligibility(awaitingProof).eligible, true);

  const confirmed = {
    ...incompleteDraft,
    status: 'CONFIRMED',
    applicationStatus: 'approved',
    paymentStatus: 'verified',
  };
  assert.equal(checkReminderEligibility(confirmed).eligible, false);

  const optedOut = {
    ...incompleteDraft,
    reminderOptOut: true,
  };
  assert.equal(checkReminderEligibility(optedOut).eligible, false);

  const maxSent = {
    ...incompleteDraft,
    reminderCount: 3,
  };
  assert.equal(checkReminderEligibility(maxSent).eligible, false);

  const underReviewPayment = { status: 'UNDER_REVIEW' };
  assert.equal(checkReminderEligibility(incompleteDraft, underReviewPayment).eligible, false);
});

test('3. Recovery token generation stores only SHA-256 hash server-side and sets 7-day expiry', async () => {
  const { rawToken, tokenHash, expiresAt } = generateRecoveryToken(7);

  assert.equal(rawToken.length, 64);
  assert.equal(tokenHash.length, 64);
  assert.equal(hashRecoveryToken(rawToken), tokenHash);

  const expectedExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000;
  assert.ok(Math.abs(expiresAt.getTime() - expectedExpiry) < 5000);

  const resumeUrl = buildResumeUrl(rawToken);
  assert.ok(resumeUrl.includes(`/register?recoveryToken=${rawToken}`));
  assert.ok(!resumeUrl.includes(tokenHash));
});

test('4. Automated reminder sends email, updates reminderCount, and logs delivery audit', async () => {
  const reg = await Registration.create({
    studentName: 'Aarav Sharma',
    dob: '2015-05-10',
    studentClass: '6',
    currentSchool: 'Delhi Public School',
    guardianName: 'Rajesh Sharma',
    guardianPhone: '9876543210',
    email: 'rajesh.sharma@example.com',
    address: 'Near Main Market',
    city: 'Badhra',
    district: 'Charkhi Dadri',
    state: 'HARYANA',
    pincode: '127308',
    consent: true,
    applicationRef: 'APP-TESTREM01',
    status: 'DRAFT',
    applicationStatus: 'draft',
    reminderCount: 0,
    reminderStatus: 'PENDING',
  });

  const result = await sendRegistrationReminder(reg, {
    triggerType: 'AUTOMATIC',
    deliver: mockDeliver,
  });

  assert.equal(result.success, true);
  assert.equal(deliveredEmails.length, 1);
  assert.equal(deliveredEmails[0].to, 'rajesh.sharma@example.com');
  assert.ok(deliveredEmails[0].subject.includes('Aarav Sharma'));
  assert.ok(deliveredEmails[0].html.includes('Continue My Application'));
  assert.ok(
    deliveredEmails[0].html.includes(
      'If you have already made the payment through UPI, please do not pay again.'
    )
  );

  const updated = await Registration.findById(reg._id);
  assert.equal(updated.reminderCount, 1);
  assert.equal(updated.reminderStatus, 'PENDING');
  assert.ok(updated.recoveryTokenHash);
  assert.ok(updated.reminderNextAttemptAt > new Date());

  const logs = await ReminderLog.find({ registrationId: reg._id });
  assert.equal(logs.length, 1);
  assert.equal(logs[0].attemptNumber, 1);
  assert.equal(logs[0].status, 'SENT');
  assert.equal(logs[0].triggerType, 'AUTOMATIC');
});

test('5. Reminders stop strictly after maximum 3 attempts', async () => {
  const reg = await Registration.create({
    studentName: 'Simran Kaur',
    dob: '2014-04-12',
    studentClass: '7',
    currentSchool: 'Model School',
    guardianName: 'Harpreet Singh',
    guardianPhone: '9812345678',
    email: 'harpreet@example.com',
    address: 'VPO Kanhra',
    city: 'Kanhra',
    district: 'Charkhi Dadri',
    state: 'HARYANA',
    pincode: '127306',
    consent: true,
    applicationRef: 'APP-MAXTHREE0',
    status: 'DRAFT',
    applicationStatus: 'draft',
    reminderCount: 2, // 2 already sent
    reminderStatus: 'PENDING',
  });

  const result = await sendRegistrationReminder(reg, {
    triggerType: 'AUTOMATIC',
    deliver: mockDeliver,
  });

  assert.equal(result.success, true);
  const updated = await Registration.findById(reg._id);
  assert.equal(updated.reminderCount, 3);
  assert.equal(updated.reminderStatus, 'COMPLETED');
  assert.equal(updated.reminderNextAttemptAt, null);

  // Attempting 4th reminder is rejected by eligibility check
  const fourthAttempt = await sendRegistrationReminder(updated, {
    triggerType: 'AUTOMATIC',
    deliver: mockDeliver,
  });
  assert.equal(fourthAttempt.success, false);
});

test('6. Pre-send re-check aborts if parent submitted payment evidence while queued', async () => {
  const reg = await Registration.create({
    studentName: 'Mohit Verma',
    dob: '2013-08-20',
    studentClass: '8',
    currentSchool: 'Bright Minds Academy',
    guardianName: 'Suresh Verma',
    guardianPhone: '9123456789',
    email: 'suresh@example.com',
    address: 'Station Road',
    city: 'Charkhi Dadri',
    district: 'Charkhi Dadri',
    state: 'HARYANA',
    pincode: '127306',
    consent: true,
    applicationRef: 'APP-PRECHECK1',
    status: 'DRAFT',
    applicationStatus: 'draft',
    reminderCount: 0,
    reminderStatus: 'PENDING',
  });

  // Parent submits payment right before worker fires
  await Payment.create({
    registrationId: reg._id,
    mode: 'manual',
    amount: 149,
    utr: 'UTR999888777666',
    status: 'UNDER_REVIEW',
  });
  reg.applicationStatus = 'submitted';
  reg.paymentStatus = 'under_review';
  reg.status = 'PAYMENT_UNDER_VERIFICATION';
  await reg.save();

  const result = await sendRegistrationReminder(reg, {
    triggerType: 'AUTOMATIC',
    deliver: mockDeliver,
  });

  assert.equal(result.success, false);
  assert.equal(deliveredEmails.length, 0);

  const updated = await Registration.findById(reg._id);
  assert.equal(updated.reminderStatus, 'COMPLETED');
  assert.equal(updated.reminderNextAttemptAt, null);

  const logs = await ReminderLog.find({ registrationId: reg._id });
  assert.equal(logs.length, 1);
  assert.equal(logs[0].status, 'SKIPPED');
});

test('7. POST /registrations/recovery/validate generates OTP challenge and never exposes sensitive data', async () => {
  const { rawToken, tokenHash, expiresAt } = generateRecoveryToken(7);

  const reg = await Registration.create({
    studentName: 'Vikram Singh',
    dob: '2012-02-14',
    studentClass: '9',
    currentSchool: 'Public School',
    guardianName: 'Kailash Singh',
    guardianPhone: '9876501234',
    email: 'kailash.singh@example.com',
    address: 'Secret Full Residential Address',
    city: 'Dadri',
    district: 'Charkhi Dadri',
    state: 'HARYANA',
    pincode: '127306',
    consent: true,
    applicationRef: 'APP-RECOV001',
    status: 'DRAFT',
    applicationStatus: 'draft',
    recoveryTokenHash: tokenHash,
    recoveryTokenExpiresAt: expiresAt,
  });

  const res = await fetch(`${base}/registrations/recovery/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recoveryToken: rawToken }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();

  assert.equal(data.success, true);
  assert.equal(data.maskedEmail, 'k***@example.com');
  assert.equal(data.applicationRef, 'APP-RECOV001');
  assert.ok(data.lookupToken);

  // CRITICAL: Sensitive fields must NOT be returned before OTP verification
  assert.equal(data.guardianPhone, undefined);
  assert.equal(data.address, undefined);
  assert.equal(data.dob, undefined);
  assert.equal(data.studentName, undefined);

  // Email OTP challenge must have been created and sent
  const challenge = await Challenge.findOne({ registrationId: reg._id });
  assert.ok(challenge);
  assert.equal(challenge.purpose, 'lookup');
});

test('8. POST /registrations/recovery/verify authenticates OTP, invalidates single-use token, and restores draft', async () => {
  const { rawToken, tokenHash, expiresAt } = generateRecoveryToken(7);

  const reg = await Registration.create({
    studentName: 'Pooja Rani',
    dob: '2016-11-20',
    studentClass: '5',
    currentSchool: 'Arya Senior Secondary',
    guardianName: 'Om Prakash',
    guardianPhone: '9416001122',
    email: 'om.prakash@example.com',
    address: 'Main Street',
    city: 'Badhra',
    district: 'Charkhi Dadri',
    state: 'HARYANA',
    pincode: '127308',
    consent: true,
    applicationRef: 'APP-VERIFY01',
    status: 'DRAFT',
    applicationStatus: 'draft',
    recoveryTokenHash: tokenHash,
    recoveryTokenExpiresAt: expiresAt,
  });

  // Validate to initiate OTP
  const valRes = await fetch(`${base}/registrations/recovery/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recoveryToken: rawToken }),
  });
  const { lookupToken } = await valRes.json();

  // Verify recovery OTP
  const resVerify = await fetch(`${base}/registrations/recovery/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${lookupToken}`,
    },
    body: JSON.stringify({ otp: latestOtpCode }),
  });
  assert.equal(resVerify.status, 200);
  const dataVerify = await resVerify.json();
  assert.equal(dataVerify.success, true);
  assert.ok(dataVerify.token);
  assert.equal(dataVerify.registration.applicationRef, 'APP-VERIFY01');
  assert.equal(dataVerify.registration.studentName, 'Pooja Rani');

  // Verify recovery token was invalidated in database (single-use)
  const afterVerify = await Registration.findById(reg._id);
  assert.equal(afterVerify.recoveryTokenHash, null);
  assert.equal(afterVerify.recoveryTokenExpiresAt, null);

  // Replay attempt with same lookup token must be rejected
  const replayRes = await fetch(`${base}/registrations/recovery/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${lookupToken}`,
    },
    body: JSON.stringify({ otp: latestOtpCode }),
  });
  assert.equal(replayRes.status, 403);
});

test('9. Expired or invalid recovery tokens are rejected with safe actionable status', async () => {
  // 1. Non-existent token
  const resInvalid = await fetch(`${base}/registrations/recovery/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recoveryToken: '0123456789abcdef'.repeat(4) }),
  });
  assert.equal(resInvalid.status, 404);
  const dataInvalid = await resInvalid.json();
  assert.equal(dataInvalid.expired, true);

  // 2. Expired token
  const { rawToken, tokenHash } = generateRecoveryToken(-1); // Expired yesterday
  await Registration.create({
    studentName: 'Expired Token Student',
    dob: '2015-01-01',
    studentClass: '5',
    currentSchool: 'School',
    guardianName: 'Guardian',
    guardianPhone: '9876543211',
    email: 'expired@example.com',
    address: 'Address',
    city: 'City',
    district: 'District',
    state: 'HARYANA',
    pincode: '127306',
    consent: true,
    applicationRef: 'APP-EXPIRED1',
    status: 'DRAFT',
    recoveryTokenHash: tokenHash,
    recoveryTokenExpiresAt: new Date(Date.now() - 86400000),
  });

  const resExpired = await fetch(`${base}/registrations/recovery/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recoveryToken: rawToken }),
  });
  assert.equal(resExpired.status, 410);
  const dataExpired = await resExpired.json();
  assert.equal(dataExpired.expired, true);
});

test('10. Parent opt-out via POST /registrations/recovery/opt-out stops future reminders', async () => {
  const { rawToken, tokenHash, expiresAt } = generateRecoveryToken(7);

  const reg = await Registration.create({
    studentName: 'Ananya Gupta',
    dob: '2015-09-09',
    studentClass: '6',
    currentSchool: 'KRM School',
    guardianName: 'Sunil Gupta',
    guardianPhone: '9899112233',
    email: 'sunil.gupta@example.com',
    address: 'Civil Lines',
    city: 'Charkhi Dadri',
    district: 'Charkhi Dadri',
    state: 'HARYANA',
    pincode: '127306',
    consent: true,
    applicationRef: 'APP-OPTOUT01',
    status: 'DRAFT',
    applicationStatus: 'draft',
    reminderCount: 1,
    reminderStatus: 'PENDING',
    recoveryTokenHash: tokenHash,
    recoveryTokenExpiresAt: expiresAt,
  });

  const res = await fetch(`${base}/registrations/recovery/opt-out`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recoveryToken: rawToken }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);

  const updated = await Registration.findById(reg._id);
  assert.equal(updated.reminderOptOut, true);
  assert.equal(updated.reminderStatus, 'OPT_OUT');
  assert.equal(updated.reminderNextAttemptAt, null);
  assert.equal(updated.recoveryTokenHash, null);
});

test('11. Sibling isolation: two siblings under same parent email have distinct recovery tokens and records', async () => {
  const { rawToken: tokenA, tokenHash: hashA } = generateRecoveryToken(7);
  const { rawToken: tokenB, tokenHash: hashB } = generateRecoveryToken(7);

  const siblingA = await Registration.create({
    studentName: 'Aman Kumar',
    dob: '2014-03-15',
    studentClass: '7',
    currentSchool: 'Public School',
    guardianName: 'Ramesh Kumar',
    guardianPhone: '9812000000',
    email: 'ramesh.kumar@example.com',
    address: 'Village Kanhra',
    city: 'Kanhra',
    district: 'Charkhi Dadri',
    state: 'HARYANA',
    pincode: '127306',
    consent: true,
    applicationRef: 'APP-SIBLING01',
    status: 'DRAFT',
    recoveryTokenHash: hashA,
  });

  const siblingB = await Registration.create({
    studentName: 'Neha Kumari',
    dob: '2016-08-22',
    studentClass: '5',
    currentSchool: 'Public School',
    guardianName: 'Ramesh Kumar',
    guardianPhone: '9812000000',
    email: 'ramesh.kumar@example.com',
    address: 'Village Kanhra',
    city: 'Kanhra',
    district: 'Charkhi Dadri',
    state: 'HARYANA',
    pincode: '127306',
    consent: true,
    applicationRef: 'APP-SIBLING02',
    status: 'DRAFT',
    recoveryTokenHash: hashB,
  });

  assert.notEqual(tokenA, tokenB);

  // Validate Sibling A recovery token
  const resA = await fetch(`${base}/registrations/recovery/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recoveryToken: tokenA }),
  });
  assert.equal(resA.status, 200);
  const dataA = await resA.json();
  assert.equal(dataA.applicationRef, 'APP-SIBLING01');
  assert.equal(dataA.studentClass, '7');

  // Verify OTP for Sibling A (consumes the pending challenge)
  const resVerifyA = await fetch(`${base}/registrations/recovery/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${dataA.lookupToken}`,
    },
    body: JSON.stringify({ otp: latestOtpCode }),
  });
  assert.equal(resVerifyA.status, 200);
  const dataVerifyA = await resVerifyA.json();
  assert.equal(dataVerifyA.registration.applicationRef, 'APP-SIBLING01');

  // Clear challenge cooldown for sibling B
  await Challenge.updateMany(
    { recipient: 'ramesh.kumar@example.com' },
    { $set: { resendAvailableAt: new Date(Date.now() - 1000) } }
  );

  // Validate Sibling B recovery token
  const resB = await fetch(`${base}/registrations/recovery/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recoveryToken: tokenB }),
  });
  assert.equal(resB.status, 200);
  const dataB = await resB.json();
  assert.equal(dataB.applicationRef, 'APP-SIBLING02');
  assert.equal(dataB.studentClass, '5');

  // Verify OTP for Sibling B
  const resVerifyB = await fetch(`${base}/registrations/recovery/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${dataB.lookupToken}`,
    },
    body: JSON.stringify({ otp: latestOtpCode }),
  });
  assert.equal(resVerifyB.status, 200);
  const dataVerifyB = await resVerifyB.json();
  assert.equal(dataVerifyB.registration.applicationRef, 'APP-SIBLING02');
});

test('12. Administrator can trigger manual reminder and scheduler pause toggle works', async () => {
  const reg = await Registration.create({
    studentName: 'Gaurav Saini',
    dob: '2015-12-05',
    studentClass: '6',
    currentSchool: 'Govt Model School',
    guardianName: 'Mahesh Saini',
    guardianPhone: '9876543299',
    email: 'mahesh.saini@example.com',
    address: 'Ward 5',
    city: 'Badhra',
    district: 'Charkhi Dadri',
    state: 'HARYANA',
    pincode: '127308',
    consent: true,
    applicationRef: 'APP-MANUAL01',
    status: 'DRAFT',
    applicationStatus: 'draft',
    reminderCount: 0,
    reminderStatus: 'IDLE',
  });

  const admin = {
    _id: new mongoose.Types.ObjectId(),
    email: 'admin@srps.edu',
    role: 'ADMIN',
  };

  const manualResult = await sendManualReminder(reg._id, admin, mockDeliver);
  assert.equal(manualResult.success, true);

  const updated = await Registration.findById(reg._id);
  assert.equal(updated.reminderCount, 1);

  const logs = await ReminderLog.find({ registrationId: reg._id });
  assert.equal(logs.length, 1);
  assert.equal(logs[0].triggerType, 'MANUAL');
  assert.equal(logs[0].triggeredBy, 'admin@srps.edu');

  // Verify processReminderQueue does not send when remindersEnabled is false
  const queueResult = await processReminderQueue(10, mockDeliver);
  assert.equal(queueResult.paused, true);
  assert.equal(queueResult.processed, 0);
});

test('13. markRemindersCompleted terminates reminder workflow upon payment proof submission', async () => {
  const { tokenHash, expiresAt } = generateRecoveryToken(7);

  const reg = await Registration.create({
    studentName: 'Kavita Devi',
    dob: '2014-06-18',
    studentClass: '7',
    currentSchool: 'SD Senior Secondary',
    guardianName: 'Surender Singh',
    guardianPhone: '9416554433',
    email: 'surender@example.com',
    address: 'Main Chowk',
    city: 'Kanhra',
    district: 'Charkhi Dadri',
    state: 'HARYANA',
    pincode: '127306',
    consent: true,
    applicationRef: 'APP-MARKCOMP0',
    status: 'OTP_VERIFIED',
    applicationStatus: 'awaiting_payment_proof',
    reminderCount: 1,
    reminderStatus: 'PENDING',
    reminderNextAttemptAt: new Date(Date.now() + 3600000),
    recoveryTokenHash: tokenHash,
    recoveryTokenExpiresAt: expiresAt,
  });

  await markRemindersCompleted(reg._id);

  const updated = await Registration.findById(reg._id);
  assert.equal(updated.reminderStatus, 'COMPLETED');
  assert.equal(updated.reminderNextAttemptAt, null);
  assert.equal(updated.recoveryTokenHash, null);
  assert.equal(updated.recoveryTokenExpiresAt, null);
});
