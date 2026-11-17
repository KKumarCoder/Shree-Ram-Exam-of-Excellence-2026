import crypto from 'node:crypto';
import { WhatsAppOtpChallenge, WhatsAppMessage } from '../../models/index.js';
import { formatWhatsAppPhone, sendWhatsAppMessage, sendSmsOtp } from './apiClient.js';
import { getTemplateName } from './templateService.js';
import { logSafeError } from './errorHandler.js';

const OTP_PEPPER = process.env.OTP_PEPPER || process.env.JWT_SECRET || 'shree-olympiad-otp-pepper-2027';
const OTP_EXPIRY_SECONDS = Number(process.env.WHATSAPP_OTP_EXPIRY) || 300; // 5 minutes
const RESEND_COOLDOWN_SECONDS = Number(process.env.WHATSAPP_OTP_RESEND_COOLDOWN) || 60; // 60s
const MAX_ATTEMPTS = Number(process.env.WHATSAPP_OTP_MAX_ATTEMPTS) || 5;

/**
 * Computes timing-safe HMAC-SHA256 for the 6-digit OTP code.
 */
function hashOtp(code, salt) {
  return crypto
    .createHmac('sha256', OTP_PEPPER)
    .update(`${code}|${salt}`)
    .digest('hex');
}

/**
 * Generates cryptographically secure 6-digit OTP code.
 */
function generate6DigitCode() {
  return String(crypto.randomInt(100000, 1000000));
}

/**
 * Generates an opaque verification token after successful OTP verification.
 */
function generateVerificationToken() {
  return `wa_v_${crypto.randomBytes(24).toString('hex')}`;
}

/**
 * Initiates or resends WhatsApp OTP for a given mobile number.
 */
export async function sendWhatsAppOtp({ mobile, ipAddress = '' }) {
  const normPhone = formatWhatsAppPhone(mobile);
  if (!normPhone || normPhone.length < 11) {
    throw Object.assign(new Error('Invalid 10-digit Indian mobile number'), { status: 400 });
  }

  const now = new Date();

  // 1. Check rate limit: Maximum 3 OTP requests per 15 minutes
  const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);
  const recentCount = await WhatsAppOtpChallenge.countDocuments({
    mobile: normPhone,
    createdAt: { $gte: fifteenMinutesAgo },
  });
  if (recentCount >= 3) {
    throw Object.assign(
      new Error('Too many OTP requests. Please wait 15 minutes before trying again.'),
      { status: 429 },
    );
  }

  // 2. Check 60-second resend cooldown on existing active challenge
  const active = await WhatsAppOtpChallenge.findOne({
    mobile: normPhone,
    verified: false,
    expiresAt: { $gt: now },
  }).sort({ createdAt: -1 });

  if (active && active.resendAvailableAt > now) {
    const waitSeconds = Math.ceil((active.resendAvailableAt.getTime() - now.getTime()) / 1000);
    throw Object.assign(
      new Error(`Please wait ${waitSeconds} seconds before requesting a new OTP.`),
      { status: 429, waitSeconds },
    );
  }

  // 3. Invalidate all previous unverified challenges for this number
  await WhatsAppOtpChallenge.updateMany(
    { mobile: normPhone, verified: false },
    { $set: { expiresAt: now } },
  );

  // 4. Generate new OTP and cryptographic hash
  const rawOtp = generate6DigitCode();
  const salt = crypto.randomBytes(16).toString('hex');
  const codeHash = hashOtp(rawOtp, salt);

  const expiresAt = new Date(now.getTime() + OTP_EXPIRY_SECONDS * 1000);
  const resendAvailableAt = new Date(now.getTime() + RESEND_COOLDOWN_SECONDS * 1000);

  const challenge = await WhatsAppOtpChallenge.create({
    mobile: normPhone,
    codeHash,
    salt,
    attempts: 0,
    expiresAt,
    resendAvailableAt,
    verified: false,
    ipAddress,
  });

  // 5. Send OTP via APITxT (Instant verified WhatsApp/SMS delivery)
  const sendResult = await sendSmsOtp({
    mobile: normPhone,
    otp: rawOtp,
  });

  const channelUsed = sendResult.channel || 'whatsapp';
  const isWhatsApp = channelUsed === 'whatsapp';

  // Log in WhatsAppMessage collection for delivery auditing
  await WhatsAppMessage.create({
    recipientPhone: normPhone,
    templateName: isWhatsApp ? 'whatsapp_otp_verification' : 'sms_otp_verification',
    messageType: isWhatsApp ? 'otp' : 'sms_otp',
    providerName: isWhatsApp ? 'apitxt_whatsapp' : 'apitxt_sms',
    providerRequestId: sendResult.requestId || '',
    bodyParams: ['******'], // Masked in database for audit security
    buttonParams: [],
    status: sendResult.success ? 'SENT' : 'FAILED',
    sentAt: sendResult.success ? new Date() : null,
    failedAt: sendResult.success ? null : new Date(),
    errorCode: sendResult.success ? '' : 'OTP_SEND_FAILED',
    errorMessage: sendResult.success ? '' : (sendResult.error || 'Failed to dispatch OTP'),
  });

  if (!sendResult.success) {
    logSafeError('OTP send failed', sendResult.error);
    // Don't leak provider details, give clean user message
    throw Object.assign(
      new Error(`Unable to send OTP via ${isWhatsApp ? 'WhatsApp' : 'SMS'} right now. Please verify your phone number and retry.`),
      { status: 502 },
    );
  }

  challenge.providerRequestId = sendResult.requestId || '';
  await challenge.save();

  return {
    success: true,
    channel: channelUsed,
    message: isWhatsApp
      ? 'OTP has been sent to your WhatsApp number.'
      : 'OTP has been sent to your mobile number via SMS.',
    resendAvailableIn: RESEND_COOLDOWN_SECONDS,
    expiresIn: OTP_EXPIRY_SECONDS,
  };
}

/**
 * Validates entered OTP code for a given mobile number.
 */
export async function verifyWhatsAppOtp({ mobile, otp }) {
  const normPhone = formatWhatsAppPhone(mobile);
  if (!normPhone) {
    throw Object.assign(new Error('Mobile number is required'), { status: 400 });
  }

  const cleanOtp = String(otp || '').replace(/\D/g, '').trim();
  if (cleanOtp.length !== 6) {
    throw Object.assign(new Error('Please enter a valid 6-digit OTP'), { status: 400 });
  }

  const now = new Date();

  // Find most recent unverified challenge that has not expired
  const challenge = await WhatsAppOtpChallenge.findOne({
    mobile: normPhone,
    verified: false,
    expiresAt: { $gt: now },
  }).select('+codeHash').sort({ createdAt: -1 });

  if (!challenge) {
    throw Object.assign(
      new Error('OTP has expired or no active OTP request found. Please request a new OTP.'),
      { status: 400 },
    );
  }

  // Check attempt limit
  if (challenge.attempts >= MAX_ATTEMPTS) {
    challenge.expiresAt = now; // Expire immediately
    await challenge.save();
    throw Object.assign(
      new Error('Maximum OTP verification attempts exceeded. Please request a new OTP.'),
      { status: 429 },
    );
  }

  // Increment attempts counter
  challenge.attempts += 1;

  // Compute expected hash and perform timing-safe comparison
  const expectedHash = hashOtp(cleanOtp, challenge.salt);
  const expectedBuf = Buffer.from(expectedHash, 'hex');
  const actualBuf = Buffer.from(challenge.codeHash, 'hex');

  const isMatch =
    expectedBuf.length === actualBuf.length &&
    crypto.timingSafeEqual(expectedBuf, actualBuf);

  if (!isMatch) {
    await challenge.save();
    const remaining = MAX_ATTEMPTS - challenge.attempts;
    throw Object.assign(
      new Error(
        `Incorrect OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
      ),
      { status: 400, remainingAttempts: remaining },
    );
  }

  // Success: Issue verification token and mark verified
  const verificationToken = generateVerificationToken();
  challenge.verified = true;
  challenge.verifiedAt = now;
  challenge.verificationToken = verificationToken;
  await challenge.save();

  return {
    success: true,
    verified: true,
    verificationToken,
    message: 'WhatsApp mobile number verified successfully.',
  };
}

/**
 * Validates a verification token during final registration submission.
 */
export async function assertMobileVerified(mobile, verificationToken) {
  const normPhone = formatWhatsAppPhone(mobile);
  if (!normPhone || !verificationToken) {
    return false;
  }

  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  const challenge = await WhatsAppOtpChallenge.findOne({
    mobile: normPhone,
    verificationToken,
    verified: true,
    verifiedAt: { $gte: thirtyMinutesAgo },
  });

  return !!challenge;
}

export const sendMobileOtp = sendWhatsAppOtp;
export const verifyMobileOtp = verifyWhatsAppOtp;

