import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIndianMobile, providerError, verifyOTP, validateTwilioEnvironment, getClient, checkVerifyService } from '../src/services/twilioOTP.js';
import { assertAuthorization, assertDraft, setting } from '../src/services/otpSecurity.js';
test('startup distinguishes service configuration failures and sanitizes provider errors', async (t) => {
  const keys = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'];
  const prior = keys.map(key => process.env[key]);
  process.env.TWILIO_ACCOUNT_SID = 'AC' + '1'.repeat(32);
  process.env.TWILIO_AUTH_TOKEN = '2'.repeat(32);
  try {
    let service = { friendlyName: 'Other school', codeLength: 6 };
    let failure;
    t.mock.getter(getClient().verify.v2, 'services', () => () => ({ fetch: async () => {
      if (failure) throw failure;
      return service;
    } }));
    await assert.rejects(checkVerifyService(), /points to a different service/);
    service = { friendlyName: 'Shree Ram Public School', codeLength: 4 };
    await assert.rejects(checkVerifyService(), /six-digit codes/);
    service.codeLength = 6;
    assert.deepEqual(await checkVerifyService(), service);
    for (const [status, expected] of [[401, /authentication failed/], [403, /authentication failed/], [404, /not found/], [500, /Cannot reach/]]) {
      failure = { status, message: 'secret credential and request data' };
      await assert.rejects(checkVerifyService(), error => {
        assert.match(error.message, expected);
        assert.ok(!error.message.includes('secret'));
        assert.equal(error.status, 503);
        return true;
      });
    }
  } finally {
    keys.forEach((key, i) => { if (prior[i] === undefined) delete process.env[key]; else process.env[key] = prior[i]; });
  }
});
test('normalizes supported Indian mobile formats', () => {
  for (const value of ['9876543210', '+919876543210', '00919876543210', '+91 98765 43210']) assert.equal(normalizeIndianMobile(value), '+919876543210');
});
test('rejects invalid or unsupported mobile formats', () => {
  for (const value of ['', null, '123', '5876543210', '+19876543210', '919876543210', '9876543210x']) assert.throws(() => normalizeIndianMobile(value));
});
test('OTP format validation occurs before provider request', async () => {
  for (const code of ['', '12345', '1234567', '12a456', 123456]) await assert.rejects(verifyOTP('9876543210', code), /six-digit/);
});
test('provider errors never disclose raw error or credentials', () => {
  for (const status of [401,403,429,500,404]) {
    const mapped = providerError({ status, message: 'secret credential', request: { code: '123456' } });
    assert.ok(!mapped.message.includes('secret')); assert.ok(!mapped.message.includes('123456'));
    assert.equal(mapped.status, status === 429 ? 429 : status === 404 ? 400 : 502);
  }
});
test('expired draft and mobile authorization are rejected', () => {
  assert.throws(() => assertDraft({ status: 'DRAFT', draftExpiresAt: new Date(0) }), /expired/);
  assert.throws(() => assertAuthorization({ status: 'OTP_VERIFIED', verifiedAt: new Date(), verificationExpiresAt: new Date(0) }), /expired/);
});
test('confirmed registration is unaffected by draft expiry', () => {
  assert.doesNotThrow(() => assertDraft({ status: 'CONFIRMED', draftExpiresAt: new Date(0) }));
});
test('configuration rejects missing credentials and unsafe cooldown', () => {
  const prior = process.env.TWILIO_ACCOUNT_SID;
  process.env.TWILIO_ACCOUNT_SID = 'placeholder';
  assert.throws(validateTwilioEnvironment, /TWILIO_ACCOUNT_SID/);
  if (prior === undefined) delete process.env.TWILIO_ACCOUNT_SID; else process.env.TWILIO_ACCOUNT_SID = prior;
  process.env.TEST_OTP_VALUE = '-1';
  assert.throws(() => setting('TEST_OTP_VALUE', 45, 30, 300));
  delete process.env.TEST_OTP_VALUE;
});
