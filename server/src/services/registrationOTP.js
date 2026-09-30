import { Challenge, Registration } from '../models/index.js';
import * as emailProvider from './email.js';
import { normalizeEmail, maskEmail } from './email.js';
import { generateOtp, hashOtp, matchesOtp } from './otpCode.js';
import { assertDraft, assertOtpEnabled, otpDevMode, limit, otpError, setting, withOtpLock } from './otpSecurity.js';

function assertPurpose(purpose) {
  if (!['register', 'lookup'].includes(purpose)) throw otpError('Invalid verification purpose.');
}

// Dependency injection is used by automated tests only; production uses SMTP email delivery.
export function createOtpService(provider = emailProvider) {
  async function sendOtp(registration, purpose) {
    assertOtpEnabled();
    assertPurpose(purpose);
    const recipient = normalizeEmail(registration.email);
    return withOtpLock(`email:${recipient}`, async () => {
      const fresh = await Registration.findById(registration._id);
      assertDraft(fresh);
      if (fresh.email !== registration.email) throw otpError('Email changed. Reload and retry.', 409);
      if (purpose === 'register' && fresh.status !== 'DRAFT') throw otpError('Email already verified.', 409);
      const prior = await Challenge.findOne({ recipient }).sort({ createdAt: -1 });
      if (prior?.resendAvailableAt > new Date()) throw otpError(`Wait ${Math.ceil((prior.resendAvailableAt - Date.now()) / 1000)} seconds before requesting another code.`, 429);
      // Keep an active session bound to its draft and purpose.
      if (prior?.expiresAt > new Date() && prior.verificationStatus === 'pending' &&
          (String(prior.registrationId) !== String(fresh._id) || prior.purpose !== purpose))
        throw otpError('This email has an active verification in another application. Complete it or wait for its session to expire.', 409);
      await limit('send-global', setting('OTP_GLOBAL_HOURLY_LIMIT', 100), 3600);
      await limit(`send-email:${recipient}`, setting('OTP_EMAIL_HOURLY_LIMIT', 5), 3600);
      await limit(`send-draft:${fresh._id}`, setting('OTP_DRAFT_HOURLY_LIMIT', 5), 3600);
      const cooldown = setting('OTP_RESEND_COOLDOWN_SECONDS', 60, 30, 300);
      const now = new Date();
      // Persist cooldown even on an uncertain provider timeout: retries also cost money.
      await Challenge.updateMany({ recipient, verificationStatus: 'pending' }, { $set: { verificationStatus: 'superseded' } });
      const challenge = await Challenge.create({
        recipient, registrationId: fresh._id, purpose, provider: 'smtp', devMode: otpDevMode(),
        lastSentAt: now, resendAvailableAt: new Date(+now + cooldown * 1000),
        expiresAt: prior?.verificationStatus === 'pending' && prior.expiresAt > now ? prior.expiresAt : new Date(+now + setting('OTP_CHALLENGE_TTL_SECONDS', 300) * 1000),
        attempts: prior?.expiresAt > now ? prior.attempts : 0,
      });
      const code = generateOtp();
      const codeHash = hashOtp(challenge, code);
      // Store the digest before delivery. A reference is added only on successful acceptance.
      await Challenge.updateOne({ _id: challenge._id }, { $set: { codeHash } });
      const result = await provider.sendOTP(recipient, code, Math.max(1, Math.floor((challenge.expiresAt - Date.now()) / 1000)));
      await Challenge.updateOne({ _id: challenge._id, verificationStatus: 'pending' }, { $set: { providerVerificationReference: result.messageId, codeHash } });
      return { message: otpDevMode() ? 'Development OTP created. Check the local server console.' : `OTP sent to ${maskEmail(recipient)}. Check your inbox and spam folder.`, cooldownSeconds: cooldown,
        resendAvailableAt: challenge.resendAvailableAt, expiresAt: challenge.expiresAt };
    });
  }
  async function verifyOtp(registration, purpose, otp) {
    assertOtpEnabled();
    assertPurpose(purpose);
    if (typeof otp !== 'string' || !/^\d{6}$/.test(otp)) throw otpError('Enter a six-digit OTP.');
    const recipient = normalizeEmail(registration.email);
    return withOtpLock(`email:${recipient}`, async () => {
      const fresh = await Registration.findById(registration._id);
      assertDraft(fresh);
      if (fresh.email !== registration.email) throw otpError('Email changed. Request a new code.', 409);
      if (purpose === 'register' && fresh.status !== 'DRAFT') throw otpError('Verification already completed.', 409);
      const challenge = await Challenge.findOneAndUpdate({ registrationId: fresh._id, purpose, recipient,
        provider: 'smtp', verificationStatus: 'pending', consumedAt: null, expiresAt: { $gt: new Date() },
        ...(otpDevMode() ? {} : { devMode: { $ne: true } }),
        providerVerificationReference: { $ne: '' }, attempts: { $lt: setting('OTP_MAX_VERIFICATION_ATTEMPTS', 5, 1, 10) },
      }, { $inc: { attempts: 1 } }, { new: true, sort: { createdAt: -1 } }).select('+codeHash');
      if (!challenge) {
        const latest = await Challenge.findOne({ registrationId: fresh._id, purpose, recipient }).sort({ createdAt: -1 });
        if (latest?.expiresAt > new Date() && latest.verificationStatus === 'pending' &&
            latest.attempts >= setting('OTP_MAX_VERIFICATION_ATTEMPTS', 5, 1, 10))
          throw otpError('Too many incorrect attempts. Please wait for this OTP to expire and request a new OTP.', 429);
        throw otpError('OTP has expired or is no longer available. Please request a new OTP.', 400);
      }
      await limit(`verify-email:${recipient}`, 20, 3600);
      if (!matchesOtp(challenge, otp)) {
        if (challenge.attempts >= setting('OTP_MAX_VERIFICATION_ATTEMPTS', 5, 1, 10))
          throw otpError('Too many incorrect attempts. Please wait for this OTP to expire and request a new OTP.', 429);
        throw otpError('Incorrect OTP. Please check and try again.');
      }
      const now = new Date();
      const consumed = await Challenge.findOneAndUpdate({ _id: challenge._id, verificationStatus: 'pending', consumedAt: null, expiresAt: { $gt: now } },
        { $set: { verificationStatus: 'approved', verifiedAt: now, consumedAt: now, codeHash: '' } }, { new: true });
      if (!consumed) throw otpError('Verification no longer available. Request a new code.', 409);
      if (purpose === 'register') {
        const updated = await Registration.findOneAndUpdate({ _id: fresh._id, email: fresh.email, status: 'DRAFT' },
          { $set: { status: 'OTP_VERIFIED', verifiedAt: now, verifiedEmail: recipient, verificationDevMode: challenge.devMode, verificationExpiresAt: new Date(+now + setting('OTP_AUTHORIZATION_TTL_SECONDS', 1800) * 1000) } }, { new: true });
        if (!updated) throw otpError('Registration changed. Request a new code.', 409);
        return updated;
      }
      return fresh;
    });
  }
  return { sendOtp, verifyOtp };
}
export const { sendOtp, verifyOtp } = createOtpService();
