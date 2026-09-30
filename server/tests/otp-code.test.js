import test from 'node:test';
import assert from 'node:assert/strict';
import { generateOtp, hashOtp, matchesOtp } from '../src/services/otpCode.js';

test('OTP digests bind codes to their challenge and require the server secret', () => {
  const previous = process.env.OTP_PEPPER;
  process.env.OTP_PEPPER = 'test-only-secret'.repeat(4);
  try {
    const challenge = { _id: 'challenge-a', registrationId: 'draft-a', purpose: 'register', recipient: '+919876543210' };
    challenge.codeHash = hashOtp(challenge, '012345');
    assert.equal(matchesOtp(challenge, '012345'), true);
    for (const code of ['123456', '12345', 12345, null]) assert.equal(matchesOtp(challenge, code), false);
    for (const key of ['_id', 'registrationId', 'purpose', 'recipient']) {
      assert.equal(matchesOtp({ ...challenge, [key]: 'different' }, '012345'), false);
    }
    assert.equal(matchesOtp({ ...challenge, codeHash: '' }, '012345'), false);
    process.env.OTP_PEPPER = 'changed-secret'.repeat(4);
    assert.equal(matchesOtp(challenge, '012345'), false);
    delete process.env.OTP_PEPPER;
    assert.throws(() => hashOtp(challenge, '012345'), /OTP_PEPPER/);
  } finally {
    if (previous === undefined) delete process.env.OTP_PEPPER;
    else process.env.OTP_PEPPER = previous;
  }
});

test('generated OTPs are six numeric characters including leading zero support', () => {
  for (let i = 0; i < 100; i++) assert.match(generateOtp(), /^\d{6}$/);
});
