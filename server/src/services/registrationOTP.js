import { Challenge, Registration } from '../models/index.js';
import * as twilioProvider from './twilioOTP.js';
import { assertDraft, limit, otpError, setting, withOtpLock } from './otpSecurity.js';

// Dependency injection is used by automated tests only; production always uses Twilio.
export function createOtpService(provider = twilioProvider) {
  async function sendOtp(registration, purpose) {
    const phone = twilioProvider.normalizeIndianMobile(registration.guardianPhone);
    return withOtpLock(`phone:${phone}`, async () => {
      const fresh = await Registration.findById(registration._id);
      assertDraft(fresh);
      if (fresh.guardianPhone !== registration.guardianPhone) throw otpError('Mobile changed. Reload and retry.', 409);
      if (purpose === 'register' && fresh.status !== 'DRAFT') throw otpError('Mobile already verified.', 409);
      const prior = await Challenge.findOne({ phone }).sort({ createdAt: -1 });
      if (prior?.resendAvailableAt > new Date()) throw otpError(`Wait ${Math.ceil((prior.resendAvailableAt - Date.now()) / 1000)} seconds before requesting another code.`, 429);
      // Twilio reuses a token/SID until expiry. Never transfer that active session to another draft or purpose.
      if (prior?.expiresAt > new Date() && prior.verificationStatus === 'pending' &&
          (String(prior.registrationId) !== String(fresh._id) || prior.purpose !== purpose))
        throw otpError('This mobile has an active verification in another application. Complete it or wait for its session to expire.', 409);
      await limit('send-global', setting('OTP_GLOBAL_HOURLY_LIMIT', 100), 3600);
      await limit(`send-phone:${phone}`, setting('OTP_MOBILE_HOURLY_LIMIT', 5), 3600);
      await limit(`send-draft:${fresh._id}`, setting('OTP_DRAFT_HOURLY_LIMIT', 5), 3600);
      const cooldown = setting('OTP_RESEND_COOLDOWN_SECONDS', 45, 30, 300);
      const now = new Date();
      // Persist cooldown even on an uncertain provider timeout: retries also cost money.
      await Challenge.updateMany({ phone, verificationStatus: 'pending' }, { $set: { verificationStatus: 'superseded' } });
      const challenge = await Challenge.create({
        phone, registrationId: fresh._id, purpose, provider: 'twilio',
        lastSentAt: now, resendAvailableAt: new Date(+now + cooldown * 1000),
        expiresAt: prior?.verificationStatus === 'pending' && prior.expiresAt > now ? prior.expiresAt : new Date(+now + setting('OTP_CHALLENGE_TTL_SECONDS', 600) * 1000),
        attempts: prior?.expiresAt > now ? prior.attempts : 0,
      });
      const result = await provider.sendOTP(phone);
      await Challenge.updateOne({ _id: challenge._id, verificationStatus: 'pending' }, { $set: { providerVerificationReference: result.sid } });
      return { message: 'SMS verification requested. This does not guarantee delivery.', cooldownSeconds: cooldown,
        resendAvailableAt: challenge.resendAvailableAt, expiresAt: challenge.expiresAt };
    });
  }
  async function verifyOtp(registration, purpose, otp) {
    if (typeof otp !== 'string' || !/^\d{6}$/.test(otp)) throw otpError('Enter a six-digit OTP.');
    const phone = twilioProvider.normalizeIndianMobile(registration.guardianPhone);
    return withOtpLock(`phone:${phone}`, async () => {
      const fresh = await Registration.findById(registration._id);
      assertDraft(fresh);
      if (fresh.guardianPhone !== registration.guardianPhone) throw otpError('Mobile changed. Request a new code.', 409);
      if (purpose === 'register' && fresh.status !== 'DRAFT') throw otpError('Verification already completed.', 409);
      const challenge = await Challenge.findOneAndUpdate({ registrationId: fresh._id, purpose, phone,
        verificationStatus: 'pending', consumedAt: null, expiresAt: { $gt: new Date() },
        providerVerificationReference: { $ne: '' }, attempts: { $lt: setting('OTP_MAX_VERIFICATION_ATTEMPTS', 5, 1, 10) },
      }, { $inc: { attempts: 1 } }, { new: true, sort: { createdAt: -1 } });
      if (!challenge) throw otpError('Code expired, already used, or attempt limit reached. Request a new code.', 400);
      await limit(`verify-phone:${phone}`, 20, 3600);
      const result = await provider.verifyOTP(phone, otp, challenge.providerVerificationReference);
      if (result.status !== 'approved') throw otpError(result.status === 'expired' ? 'Code expired. Request a new code.' : 'Incorrect verification code.');
      const now = new Date();
      const consumed = await Challenge.findOneAndUpdate({ _id: challenge._id, verificationStatus: 'pending', consumedAt: null, expiresAt: { $gt: now } },
        { $set: { verificationStatus: 'approved', verifiedAt: now, consumedAt: now } }, { new: true });
      if (!consumed) throw otpError('Verification no longer available. Request a new code.', 409);
      if (purpose === 'register') {
        const updated = await Registration.findOneAndUpdate({ _id: fresh._id, guardianPhone: fresh.guardianPhone, status: 'DRAFT' },
          { $set: { status: 'OTP_VERIFIED', verifiedAt: now, verificationExpiresAt: new Date(+now + setting('OTP_AUTHORIZATION_TTL_SECONDS', 1800) * 1000) } }, { new: true });
        if (!updated) throw otpError('Registration changed. Request a new code.', 409);
        return updated;
      }
      return fresh;
    });
  }
  return { sendOtp, verifyOtp };
}
export const { sendOtp, verifyOtp } = createOtpService();
