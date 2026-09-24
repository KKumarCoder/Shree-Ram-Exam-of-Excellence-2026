import crypto from 'node:crypto';
import { OtpBucket, OtpLock } from '../models/index.js';
export const otpError = (message, status = 400) => Object.assign(new Error(message), { status });
export function setting(name, fallback, min = 1, max = 86400) {
  const n = Number(process.env[name] || fallback);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`Invalid ${name}`);
  return n;
}
export const privateKey = value => crypto.createHmac('sha256', process.env.OTP_PEPPER).update(value).digest('hex');
// Fixed windows use MongoDB's unique _id and atomic increments across all workers.
export async function limit(key, maximum, seconds) {
  const window = Math.floor(Date.now() / (seconds * 1000));
  const _id = privateKey(`${key}:${window}`);
  let bucket;
  try {
    bucket = await OtpBucket.findOneAndUpdate({ _id }, {
      $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((window + 2) * seconds * 1000) },
    }, { upsert: true, new: true });
  } catch (e) {
    if (e.code !== 11000) throw e;
    bucket = await OtpBucket.findOneAndUpdate({ _id }, { $inc: { count: 1 } }, { new: true });
  }
  if (!bucket || bucket.count > maximum) {
    console.warn(JSON.stringify({ event: 'otp_rate_limit', key: _id.slice(0, 12) }));
    throw otpError('Too many requests. Please try again later.', 429);
  }
}
export const persistentLimiter = (key, maximum, seconds) => async (req, res, next) => {
  try { await limit(`${key}:${req.ip}`, maximum, seconds); next(); } catch (e) { next(e); }
};
// Bounded provider timeout is 12s. Lease lasts 60s; callbacks must still use CAS.
export async function withOtpLock(key, fn) {
  const _id = privateKey(key), owner = crypto.randomUUID();
  try {
    const locked = await OtpLock.findOneAndUpdate({ _id, expiresAt: { $lte: new Date() } }, {
      $set: { owner, expiresAt: new Date(Date.now() + 60000) },
    }, { upsert: true, new: true });
    if (!locked) throw otpError('Another request is processing. Please retry shortly.', 409);
  } catch (e) {
    if (e.code === 11000) throw otpError('Another request is processing. Please retry shortly.', 409);
    throw e;
  }
  try { return await fn(); } finally { await OtpLock.deleteOne({ _id, owner }); }
}
export function assertDraft(s) {
  const expires = s.draftExpiresAt || new Date(new Date(s.createdAt).getTime() + 10800000);
  if (['DRAFT', 'OTP_VERIFIED'].includes(s.status) && expires <= new Date())
    throw otpError('Registration session expired. Start a new application.', 410);
}
export function assertAuthorization(s) {
  if (!s.verifiedAt || (s.status === 'OTP_VERIFIED' && (!s.verificationExpiresAt || s.verificationExpiresAt <= new Date())))
    throw otpError('Mobile verification expired. Verify your number again before payment.', 403);
}
