import { randomInt, createHmac, timingSafeEqual } from 'node:crypto';

export const generateOtp = () => String(randomInt(0, 1000000)).padStart(6, '0');

export function otpHashSecret() {
  const secret = process.env.OTP_HASH_SECRET || process.env.OTP_PEPPER;
  if (!secret || secret.length < 32 || /^(REPLACE|YOUR_|placeholder)/i.test(secret))
    throw new Error('Missing/too short OTP_HASH_SECRET (legacy OTP_PEPPER is also supported)');
  return secret;
}

// Bind the digest to a single challenge, recipient, registration and purpose.
export function hashOtp(challenge, code) {
  const pepper = otpHashSecret();
  return createHmac('sha256', pepper)
    .update(JSON.stringify([String(challenge._id), String(challenge.registrationId),
      challenge.purpose, challenge.recipient || challenge.phone, code]))
    .digest('hex');
}

export function matchesOtp(challenge, code) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code) ||
      !/^[a-f0-9]{64}$/.test(challenge.codeHash || '')) return false;
  return timingSafeEqual(Buffer.from(challenge.codeHash, 'hex'), Buffer.from(hashOtp(challenge, code), 'hex'));
}
