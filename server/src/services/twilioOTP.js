import twilio from "twilio";
import { requireConfigured } from "../utils/validation.js";

import { normalizeIndianMobile } from "../utils/mobile.js";

let client;
export function getClient() {
  if (!client) {
    client = twilio(
      requireConfigured(process.env.TWILIO_ACCOUNT_SID, "TWILIO_ACCOUNT_SID"),
      requireConfigured(process.env.TWILIO_AUTH_TOKEN, "TWILIO_AUTH_TOKEN"),
      { timeout: 12000, autoRetry: false },
    );
  }
  return client;
}

export function providerError(error) {
  if (Number(error?.status) === 404 || [60200, 60202].includes(Number(error?.code))) {
    return Object.assign(new Error("Verification expired or unavailable. Request a new code."), { status: 400 });
  }
  const status = Number(error?.status);
  const mapped = new Error(
    status === 429
      ? "Too many verification requests. Please try again later."
      : status === 401 || status === 403
        ? "SMS verification is temporarily unavailable."
        : "SMS verification could not be completed. Please try again later.",
  );
  mapped.status = status === 429 ? 429 : 502;
  return mapped;
}

export async function sendOTP(mobile) {
  const to = normalizeIndianMobile(mobile);
  try {
    const result = await getClient()
      .verify.v2.services(
        requireConfigured(
          process.env.TWILIO_VERIFY_SERVICE_SID,
          "TWILIO_VERIFY_SERVICE_SID",
        ),
      )
      .verifications.create({ to, channel: "sms" });
    if (result.status !== "pending") throw new Error("Verification not accepted");
    return { to, sid: result.sid, status: result.status };
  } catch (error) {
    throw providerError(error);
  }
}

export async function verifyOTP(mobile, code, verificationSid) {
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) throw Object.assign(new Error("Enter a six-digit OTP."), { status: 400 });
  const to = normalizeIndianMobile(mobile);
  try {
    const result = await getClient()
      .verify.v2.services(
        requireConfigured(
          process.env.TWILIO_VERIFY_SERVICE_SID,
          "TWILIO_VERIFY_SERVICE_SID",
        ),
      )
      .verificationChecks.create(verificationSid ? { verificationSid, code } : { to, code });
    return { sid: result.sid, status: result.status };
  } catch (error) {
    throw providerError(error);
  }
}

export { normalizeIndianMobile };

export function validateTwilioEnvironment() {
  for (const [key, pattern] of Object.entries({
    TWILIO_ACCOUNT_SID: /^AC[0-9a-fA-F]{32}$/,
    TWILIO_AUTH_TOKEN: /^[0-9a-fA-F]{32}$/,
    TWILIO_VERIFY_SERVICE_SID: /^VA[0-9a-fA-F]{32}$/,
  })) if (!pattern.test(process.env[key] || '')) throw new Error(`Missing or invalid ${key}`);
}
export async function checkVerifyService() {
  let service;
  try {
    service = await getClient().verify.v2.services(process.env.TWILIO_VERIFY_SERVICE_SID).fetch();
  } catch (error) {
    const status = Number(error?.status);
    const message = status === 401 || status === 403
      ? 'Twilio authentication failed. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and account access.'
      : status === 404
        ? 'Twilio Verify Service was not found. Check that TWILIO_VERIFY_SERVICE_SID belongs to the configured account.'
        : 'Cannot reach or fetch the Twilio Verify Service. Check network connectivity and Twilio availability, then retry.';
    throw Object.assign(new Error(message), { status: 503 });
  }
  if (service.friendlyName !== 'Shree Ram Public School')
    throw Object.assign(new Error('TWILIO_VERIFY_SERVICE_SID points to a different service. Set it to the SID of the "Shree Ram Public School" Verify Service in server/.env.'), { status: 503 });
  if (service.codeLength !== 6)
    throw Object.assign(new Error('The Shree Ram Public School Verify Service must use six-digit codes. Set its code length to 6 in Twilio.'), { status: 503 });
  return { friendlyName: service.friendlyName, codeLength: service.codeLength };
}
