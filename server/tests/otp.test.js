import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIndianMobile } from '../src/utils/mobile.js';
import { providerError, sendOTP, validateBrevoEnvironment } from '../src/services/brevoOTP.js';
import { assertAuthorization, assertDraft, setting } from '../src/services/otpSecurity.js';
test('normalizes supported Indian mobile formats', () => {
  for (const value of ['9876543210', '+919876543210', '00919876543210', '919876543210', '+91 98765 43210']) assert.equal(normalizeIndianMobile(value), '+919876543210');
});
test('rejects invalid or unsupported mobile formats', () => {
  for (const value of ['', null, '123', '5876543210', '+19876543210', '9876543210x']) assert.throws(() => normalizeIndianMobile(value));
});
test('OTP format validation occurs before provider request', async () => {
  for (const code of ['', '12345', '1234567', '12a456', 123456]) await assert.rejects(sendOTP('9876543210', code, 600), /six-digit/);
});
test('provider errors never disclose raw error or credentials', () => {
  for (const status of [401,403,429,500,404]) {
    const mapped = providerError({ status, message: 'secret credential', request: { code: '123456' } });
    assert.ok(!mapped.message.includes('secret')); assert.ok(!mapped.message.includes('123456'));
    assert.equal(mapped.status, status === 429 ? 429 : 502);
  }
});
test('expired draft and mobile authorization are rejected', () => {
  assert.throws(() => assertDraft({ status: 'DRAFT', draftExpiresAt: new Date(0) }), /expired/);
  assert.throws(() => assertAuthorization({ status: 'OTP_VERIFIED', email:'test@example.com', verifiedEmail:'test@example.com', verifiedAt: new Date(), verificationExpiresAt: new Date(0) }), /expired/);
});
test('confirmed registration is unaffected by draft expiry', () => {
  assert.doesNotThrow(() => assertDraft({ status: 'CONFIRMED', draftExpiresAt: new Date(0) }));
});
test('configuration rejects missing credentials and unsafe cooldown', () => {
  const prior = process.env.BREVO_API_KEY;
  process.env.BREVO_API_KEY = 'placeholder';
  assert.throws(validateBrevoEnvironment, /BREVO_API_KEY/);
  if (prior === undefined) delete process.env.BREVO_API_KEY; else process.env.BREVO_API_KEY = prior;
  process.env.TEST_OTP_VALUE = '-1';
  assert.throws(() => setting('TEST_OTP_VALUE', 45, 30, 300));
  delete process.env.TEST_OTP_VALUE;
});

test('Brevo delivery sends transactional payload and sanitizes failures', async (t) => {
  const keys = ['BREVO_API_KEY', 'BREVO_SMS_SENDER', 'BREVO_SMS_TEMPLATE_ID'];
  const previous = keys.map(key => process.env[key]);
  process.env.BREVO_API_KEY = 'test-secret';
  process.env.BREVO_SMS_SENDER = 'Shree';
  delete process.env.BREVO_SMS_TEMPLATE_ID;
  let response = new Response(JSON.stringify({ messageId: 12345 }), { status: 201 });
  let request;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    request = { url, ...options, body: JSON.parse(options.body) };
    return response;
  });
  try {
    assert.deepEqual(await sendOTP('9876543210', '012345', 600), { messageId: '12345' });
    assert.equal(request.url, 'https://api.brevo.com/v3/transactionalSMS/send');
    assert.equal(request.headers['api-key'], 'test-secret');
    assert.equal(request.body.recipient, '+919876543210');
    assert.equal(request.body.type, 'transactional');
    assert.match(request.body.content, /012345/);
    assert.ok(request.signal instanceof AbortSignal);
    process.env.BREVO_SMS_TEMPLATE_ID = '12';
    response = new Response(JSON.stringify({ messageId: 12346 }), { status: 201 });
    await sendOTP('9876543210', '012345', 600);
    assert.equal(request.body.templateId, 12);
    assert.deepEqual(request.body.params, { OTP: '012345', MINUTES: 10 });
    assert.equal(request.body.content, undefined);
    for (const status of [400, 401, 402, 403, 404, 429, 500, 503]) {
      response = new Response('secret code and provider details', { status });
      await assert.rejects(sendOTP('9876543210', '012345', 600), error =>
        error.status === (status === 429 ? 429 : 502) && !/secret|012345/.test(error.message));
    }
    response = new Response('{}', { status: 201 });
    await assert.rejects(sendOTP('9876543210', '012345', 600), { status: 502 });
    t.mock.method(globalThis, 'fetch', async () => { throw new Error('secret network error'); });
    await assert.rejects(sendOTP('9876543210', '012345', 600), { status: 502 });
  } finally {
    keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; });
  }
});

test('Brevo account check is read-only and reports safe setup errors', async (t) => {
  const { checkBrevoConnection } = await import('../src/services/brevoOTP.js');
  const keys = ['BREVO_API_KEY', 'BREVO_SMS_SENDER', 'BREVO_SMS_TEMPLATE_ID'];
  const previous = keys.map(key => process.env[key]);
  process.env.BREVO_API_KEY = 'test-key';
  process.env.BREVO_SMS_SENDER = 'Shree';
  delete process.env.BREVO_SMS_TEMPLATE_ID;
  let status = 200;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.brevo.com/v3/account');
    assert.equal(options.body, undefined);
    assert.equal(options.method, undefined);
    return new Response('private account data', { status });
  });
  try {
    assert.deepEqual(await checkBrevoConnection(), { authenticated: true });
    for (status of [401, 403, 429, 500]) {
      await assert.rejects(checkBrevoConnection(), error => !error.message.includes('private'));
    }
    process.env.BREVO_API_KEY = 'xsmtpsib-test-key';
    assert.throws(validateBrevoEnvironment, /not an SMTP key/);
    process.env.BREVO_API_KEY = 'test-key';
    t.mock.method(globalThis, 'fetch', async () => { throw new Error('private network info'); });
    await assert.rejects(checkBrevoConnection(), /Cannot reach Brevo/);
  } finally {
    keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; });
  }
});

test('development delivery is explicit, masked, and never used in production', async (t) => {
  const keys = ['NODE_ENV', 'OTP_DEV_MODE', 'OTP_ENABLED', 'BREVO_API_KEY', 'BREVO_SMS_SENDER'];
  const prior = keys.map(key => process.env[key]);
  const logs = [];
  t.mock.method(console, 'log', line => logs.push(line));
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => { requests++; return new Response('{"messageId":123}', { status: 201 }); });
  try {
    process.env.NODE_ENV = 'development'; process.env.OTP_DEV_MODE = 'true'; process.env.OTP_ENABLED = 'true';
    delete process.env.BREVO_API_KEY; delete process.env.BREVO_SMS_SENDER;
    assert.match((await sendOTP('8199991081', '012345', 300)).messageId, /^dev-/);
    assert.equal(requests, 0); assert.deepEqual(logs, ['[DEV OTP] +91 ******1081 => 012345']);
    process.env.NODE_ENV = 'production';
    await assert.rejects(sendOTP('8199991081', '012345', 300), { status: 503 });
    process.env.BREVO_API_KEY = 'test-only'; process.env.BREVO_SMS_SENDER = 'SRPS';
    await sendOTP('8199991081', '012345', 300);
    assert.equal(requests, 1); assert.equal(logs.length, 1);
    process.env.OTP_ENABLED = 'false';
    await assert.rejects(sendOTP('8199991081', '012345', 300), { status: 503 });
    assert.equal(requests, 1);
  } finally {
    keys.forEach((key, i) => prior[i] === undefined ? delete process.env[key] : process.env[key] = prior[i]);
  }
});

test('requested configuration names override legacy settings safely', async () => {
  const { otpHashSecret } = await import('../src/services/otpCode.js');
  const { otpDevMode, otpEnabled } = await import('../src/services/otpSecurity.js');
  const values = { OTP_HASH_SECRET: 'new-test-secret'.repeat(3), OTP_PEPPER: 'legacy-test-secret'.repeat(3), OTP_RESEND_SECONDS: '60', OTP_RESEND_COOLDOWN_SECONDS: '45', OTP_EXPIRY_MINUTES: '5', OTP_CHALLENGE_TTL_SECONDS: '600', OTP_MAX_ATTEMPTS: '5', OTP_MAX_VERIFICATION_ATTEMPTS: '8', OTP_DEV_MODE: 'false', OTP_ENABLED: 'true' };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  try {
    assert.equal(otpHashSecret(), values.OTP_HASH_SECRET);
    assert.equal(setting('OTP_RESEND_COOLDOWN_SECONDS', 60), 60);
    assert.equal(setting('OTP_CHALLENGE_TTL_SECONDS', 300), 300);
    assert.equal(setting('OTP_MAX_VERIFICATION_ATTEMPTS', 5), 5);
    process.env.OTP_EXPIRY_MINUTES = '0';
    assert.throws(() => setting('OTP_CHALLENGE_TTL_SECONDS', 300));
    process.env.OTP_DEV_MODE = 'yes'; assert.throws(otpDevMode);
    process.env.OTP_ENABLED = 'yes'; assert.throws(otpEnabled);
  } finally {
    Object.entries(previous).forEach(([key, value]) => value === undefined ? delete process.env[key] : process.env[key] = value);
  }
});

test('missing sender and untrusted endpoint fail configuration validation', () => {
  const keys = ['BREVO_API_KEY', 'BREVO_SMS_SENDER', 'BREVO_SMS_API_URL'];
  const prior = keys.map(key => process.env[key]);
  try {
    process.env.BREVO_API_KEY = 'test-only'; delete process.env.BREVO_SMS_SENDER;
    assert.throws(validateBrevoEnvironment, /BREVO_SMS_SENDER/);
    process.env.BREVO_SMS_SENDER = 'SRPS'; process.env.BREVO_SMS_API_URL = 'https://example.com/send';
    assert.throws(validateBrevoEnvironment, /BREVO_SMS_API_URL/);
  } finally { keys.forEach((key, i) => prior[i] === undefined ? delete process.env[key] : process.env[key] = prior[i]); }
});
