import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatWhatsAppPhone,
  sanitizeData,
  formatApiError,
  getAllTemplatesConfig,
  getTemplateName,
  resolveOtpParams,
  resolvePaymentReceivedParams,
  resolvePaymentVerifiedParams,
  resolveAdmitCardParams,
  resolveCertificateParams,
  resolvePaymentReminderParams,
} from '../src/services/apitxt/index.js';

test('formatWhatsAppPhone normalizes 10-digit Indian numbers to 91XXXXXXXXXX', () => {
  assert.equal(formatWhatsAppPhone('9812345678'), '919812345678');
  assert.equal(formatWhatsAppPhone('+919812345678'), '919812345678');
  assert.equal(formatWhatsAppPhone('919812345678'), '919812345678');
  assert.equal(formatWhatsAppPhone('09812345678'), '919812345678');
  assert.equal(formatWhatsAppPhone('9812-345-678'), '919812345678');
});

test('sanitizeData redacts auth keys, secrets, tokens and passwords', () => {
  const sensitive = {
    authkey: 'secret-key-123',
    apiKey: 'my-api-key',
    token: 'jwt.token.here',
    studentName: 'AARAV',
    guardianPhone: '9812345678',
    nested: {
      password: 'mypassword',
      otp: '654321',
      className: 'Class 5',
    },
  };
  const sanitized = sanitizeData(sensitive);
  assert.equal(sanitized.authkey, '***REDACTED***');
  assert.equal(sanitized.apiKey, '***REDACTED***');
  assert.equal(sanitized.token, '***REDACTED***');
  assert.equal(sanitized.studentName, 'AARAV');
  assert.equal(sanitized.guardianPhone, '9812345678');
  assert.equal(sanitized.nested.password, '***REDACTED***');
  assert.equal(sanitized.nested.otp, '***REDACTED***');
  assert.equal(sanitized.nested.className, 'Class 5');
});

test('getAllTemplatesConfig returns all approved system templates', () => {
  const configs = getAllTemplatesConfig();
  assert.equal(configs.length, 8);
  const keys = configs.map((c) => c.key);
  assert.ok(keys.includes('OTP'));
  assert.ok(keys.includes('PAYMENT_RECEIVED'));
  assert.ok(keys.includes('PAYMENT_VERIFIED'));
  assert.ok(keys.includes('ADMIT_CARD'));
  assert.ok(keys.includes('EXAM_REMINDER'));
  assert.ok(keys.includes('PAYMENT_REMINDER'));
  assert.ok(keys.includes('PARTICIPATION_CERTIFICATE'));
  assert.ok(keys.includes('TOPPER_CERTIFICATE'));
});

test('resolveOtpParams maps 6-digit code to body and button params', () => {
  const resolved = resolveOtpParams({ otp: '543210' });
  assert.equal(resolved.templateName, 'shree_otp_verification');
  assert.deepEqual(resolved.bodyParams, ['543210']);
  assert.deepEqual(resolved.buttonParams, ['543210']);
});

test('resolvePaymentReceivedParams maps guardian, student, regId and amount for shree_payment_received', () => {
  const reg = {
    guardianName: 'RAJESH KUMAR',
    studentName: 'AARAV KUMAR',
    applicationRef: 'APP-1A2B3C',
  };
  const payment = {
    amount: 149,
  };
  const resolved = resolvePaymentReceivedParams(reg, payment);
  assert.equal(resolved.templateName, 'shree_payment_received');
  assert.equal(resolved.language, 'en_US');
  assert.deepEqual(resolved.bodyParams, [
    'RAJESH KUMAR',
    'AARAV KUMAR',
    'APP-1A2B3C',
    '₹149.00',
  ]);
});

test('resolvePaymentVerifiedParams maps student, regNo, class, amount and UTR', () => {
  const reg = {
    studentName: 'AARAV KUMAR',
    studentClass: '5',
    registrationNumber: 'SHREE27-1001',
  };
  const payment = {
    amount: 149,
    utr: 'UTR987654321',
  };
  const resolved = resolvePaymentVerifiedParams(reg, payment);
  assert.equal(resolved.templateName, 'shree_payment_verified');
  assert.deepEqual(resolved.bodyParams, [
    'AARAV KUMAR',
    'SHREE27-1001',
    'Class 5',
    '₹149.00',
    'UTR987654321',
  ]);
});

test('resolveAdmitCardParams attaches PDF document header URL and maps approved Meta params', () => {
  const reg = {
    guardianName: 'RAJESH KUMAR',
    studentName: 'AARAV KUMAR',
    studentClass: '5',
    registrationNumber: 'SHREE27-1001',
  };
  const settings = {
    examDate: '12 January 2027',
    reportingTime: '09:30 AM',
    venue: 'Shree Ram Public School, Kanhra-Badhra Road',
  };
  const mediaUrl = 'https://shreeolympiad.srpskanhra.com/api/docs/admit-card/tok123.pdf';
  const resolved = resolveAdmitCardParams(reg, settings, mediaUrl);
  assert.equal(resolved.templateName, 'shree_olympiad_admit_card');
  assert.equal(resolved.mediaUrl, mediaUrl);
  assert.equal(resolved.filename, 'SHREE27-1001-admit-card.pdf');
  assert.equal(resolved.bodyParams.length, 4);
  assert.deepEqual(resolved.bodyParams, [
    'RAJESH KUMAR',
    'AARAV KUMAR',
    'Class 5',
    'SHREE27-1001',
  ]);
});

test('resolveCertificateParams attaches PDF document header URL and maps approved Meta params', () => {
  const reg = {
    guardianName: 'RAJESH KUMAR',
    studentName: 'AARAV KUMAR',
    studentClass: '5',
    registrationNumber: 'SHREE27-1001',
  };
  const mediaUrl = 'https://shreeolympiad.srpskanhra.com/api/docs/certificate/tok123.pdf';
  const resolved = resolveCertificateParams(reg, mediaUrl);
  assert.equal(resolved.templateName, getTemplateName('PARTICIPATION_CERTIFICATE'));
  assert.equal(resolved.language, 'en_US');
  assert.equal(resolved.mediaUrl, mediaUrl);
  assert.equal(resolved.filename, 'Certificate.pdf');
  assert.equal(resolved.bodyParams.length, 4);
  assert.deepEqual(resolved.bodyParams, [
    'RAJESH KUMAR',
    'AARAV KUMAR',
    '5',
    'SHREE27-1001',
  ]);
});

test('resolvePaymentReminderParams maps parent, student, class and appRef for payment_reminder_template', () => {
  const reg = {
    guardianName: 'MR DIWAN',
    studentName: 'DEEPAK',
    studentClass: 'Class 10',
    applicationRef: 'APP-3CB5BDA4D3',
  };
  const resolved = resolvePaymentReminderParams(reg);
  assert.equal(resolved.templateName, 'payment_reminder_template');
  assert.equal(resolved.language, 'hi');
  assert.deepEqual(resolved.bodyParams, [
    'MR DIWAN',
    'DEEPAK',
    '10',
    'APP-3CB5BDA4D3',
  ]);
});

test('sendSmsOtp validates mobile number before sending', async () => {
  const orig = process.env.APITXT_AUTH_KEY;
  process.env.APITXT_AUTH_KEY = 'mock_auth_key';
  try {
    const { sendSmsOtp } = await import('../src/services/apitxt/index.js');
    const invalid = await sendSmsOtp({ mobile: '123', otp: '123456' });
    assert.equal(invalid.success, false);
    assert.match(invalid.error, /Invalid recipient phone number/);
  } finally {
    process.env.APITXT_AUTH_KEY = orig;
  }
});


