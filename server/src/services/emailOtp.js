import crypto from "node:crypto";
import { EmailOtpChallenge } from "../models/index.js";
import { normalizeEmail, sendOTP, maskEmail } from "./email.js";
import { generateOtp, otpHashSecret } from "./otpCode.js";
import { limit, withOtpLock, otpDevMode, otpError } from "./otpSecurity.js";
import { issueToken } from "../middleware/auth.js";

function hashEmailCode(code, salt) {
  const secret = otpHashSecret();
  return crypto.createHmac("sha256", secret).update(`${salt}:${code}`).digest("hex");
}

export async function sendEmailOtp(email) {
  const recipient = normalizeEmail(email);
  return withOtpLock(`email-otp:${recipient}`, async () => {
    const now = new Date();
    const prior = await EmailOtpChallenge.findOne({ recipient }).sort({ createdAt: -1 });
    if (prior && prior.resendAvailableAt > now) {
      const waitSec = Math.ceil((prior.resendAvailableAt - now) / 1000);
      throw otpError(`Please wait ${waitSec} seconds before requesting another code.`, 429);
    }

    await limit("send-global", 100, 3600);
    await limit(`send-email:${recipient}`, 5, 3600);

    const cooldownSeconds = 45;
    const ttlSeconds = 600; // 10 minutes
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
    const resendAvailableAt = new Date(now.getTime() + cooldownSeconds * 1000);

    // Invalidate pending previous challenges
    await EmailOtpChallenge.updateMany(
      { recipient, verified: false },
      { $set: { expiresAt: now } }
    );

    const code = generateOtp();
    const salt = crypto.randomBytes(16).toString("hex");
    const codeHash = hashEmailCode(code, salt);

    await EmailOtpChallenge.create({
      recipient,
      codeHash,
      salt,
      attempts: 0,
      expiresAt,
      resendAvailableAt,
      verified: false,
    });

    await sendOTP(recipient, code, ttlSeconds);

    return {
      success: true,
      message: otpDevMode()
        ? `Development OTP created. Check server console.`
        : `OTP sent to ${maskEmail(recipient)}. Check your inbox and spam folder.`,
      cooldownSeconds,
      resendAvailableAt,
    };
  });
}

export async function verifyEmailOtp(email, code) {
  const recipient = normalizeEmail(email);
  if (!code || typeof code !== "string" || !/^\d{6}$/.test(code.trim())) {
    throw otpError("Please enter a valid 6-digit OTP code.", 400);
  }

  const cleanCode = code.trim();

  return withOtpLock(`email-otp:${recipient}`, async () => {
    const now = new Date();
    const challenge = await EmailOtpChallenge.findOne({
      recipient,
      verified: false,
      expiresAt: { $gt: now },
    })
      .select("+codeHash")
      .sort({ createdAt: -1 });

    if (!challenge) {
      throw otpError("OTP has expired or is invalid. Please request a new code.", 400);
    }

    if (challenge.attempts >= 5) {
      throw otpError("Too many incorrect attempts. Please request a new OTP.", 429);
    }

    const expectedHash = hashEmailCode(cleanCode, challenge.salt);
    const isMatch = crypto.timingSafeEqual(
      Buffer.from(challenge.codeHash, "hex"),
      Buffer.from(expectedHash, "hex")
    );

    if (!isMatch) {
      challenge.attempts += 1;
      await challenge.save();
      const remaining = 5 - challenge.attempts;
      throw otpError(
        remaining > 0
          ? `Incorrect OTP. ${remaining} attempts remaining.`
          : "Too many incorrect attempts. Please request a new OTP.",
        400
      );
    }

    challenge.verified = true;
    challenge.verifiedAt = now;
    challenge.codeHash = "";
    await challenge.save();

    const verificationToken = issueToken(
      { sub: recipient, scope: "email-verified" },
      "2h"
    );

    return {
      success: true,
      message: "Email address verified successfully.",
      email: recipient,
      verificationToken,
    };
  });
}
