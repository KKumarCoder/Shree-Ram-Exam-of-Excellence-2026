import { normalizeIndianMobile } from "../utils/mobile.js";
import { randomUUID } from "node:crypto";
import { assertOtpEnabled, otpDevMode } from "./otpSecurity.js";

const smsApiUrl = () =>
  process.env.BREVO_SMS_API_URL ||
  "https://api.brevo.com/v3/transactionalSMS/send";

function validateApiKey() {
  if (
    !process.env.BREVO_API_KEY?.trim() ||
    /^(REPLACE|YOUR_|placeholder)/i.test(process.env.BREVO_API_KEY)
  )
    throw new Error("Missing or invalid BREVO_API_KEY");
  if (process.env.BREVO_API_KEY.startsWith("xsmtpsib-"))
    throw new Error(
      "BREVO_API_KEY must be an API key from API keys & MCP, not an SMTP key",
    );
}

export function validateBrevoEnvironment() {
  validateApiKey();
  // Prevent an accidental URL override from forwarding the API key elsewhere.
  if (smsApiUrl() !== "https://api.brevo.com/v3/transactionalSMS/send")
    throw new Error(
      "Invalid BREVO_SMS_API_URL; use the Brevo transactional SMS endpoint",
    );
  if (
    !/^(?:[a-zA-Z0-9]{1,11}|[0-9]{12,15})$/.test(
      process.env.BREVO_SMS_SENDER || "",
    )
  )
    throw new Error("Missing or invalid BREVO_SMS_SENDER");
  if (
    process.env.BREVO_SMS_TEMPLATE_ID &&
    !/^[1-9][0-9]*$/.test(process.env.BREVO_SMS_TEMPLATE_ID)
  )
    throw new Error("Invalid BREVO_SMS_TEMPLATE_ID");
}

// Read-only account authentication check. Never send a code or print account data.
export async function checkBrevoConnection() {
  validateApiKey();
  let response;
  try {
    response = await fetch("https://api.brevo.com/v3/account", {
      headers: {
        "api-key": process.env.BREVO_API_KEY,
        accept: "application/json",
      },
      redirect: "error",
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new Error("Cannot reach Brevo. Check network access and retry.");
  }
  if ([401, 403].includes(response.status))
    throw new Error(
      "Brevo API access rejected. Check the API key and authorized IP settings in Brevo.",
    );
  if (response.status === 429)
    throw new Error("Brevo rate limit reached. Retry later.");
  if (!response.ok) throw new Error("Brevo account check failed. Retry later.");
  await response.body?.cancel();
  return { authenticated: true };
}

export function providerError(error) {
  const limited = Number(error?.status) === 429;
  return Object.assign(
    new Error(
      limited
        ? "Too many verification requests. Please try again later."
        : "SMS verification is temporarily unavailable. Please try again later.",
    ),
    { status: limited ? 429 : 502 },
  );
}

export async function sendOTP(mobile, code, ttlSeconds) {
  assertOtpEnabled();
  const recipient = normalizeIndianMobile(mobile);
  if (typeof code !== "string" || !/^\d{6}$/.test(code))
    throw new Error("Enter a six-digit OTP.");
  if (otpDevMode()) {
    console.log(`[DEV OTP] +91 ******${recipient.slice(-4)} => ${code}`);
    return { messageId: `dev-${randomUUID()}` };
  }
  try {
    validateBrevoEnvironment();
  } catch {
    throw Object.assign(
      new Error(
        "SMS verification is not configured. Please contact the school.",
      ),
      { status: 503 },
    );
  }
  const minutes = Math.max(1, Math.ceil(ttlSeconds / 60));
  const templateId = process.env.BREVO_SMS_TEMPLATE_ID;
  const body = {
    sender: process.env.BREVO_SMS_SENDER,
    recipient,
    type: "transactional",
    tag: "shree-olympiad-otp",
    ...(templateId
      ? {
          templateId: Number(templateId),
          params: { OTP: code, MINUTES: minutes },
        }
      : {
          content: `Your Shree Olympiad 2027 verification OTP is ${code}. Valid for ${minutes} minutes. Do not share this OTP with anyone. - SRPS`,
        }),
  };
  try {
    const response = await fetch(smsApiUrl(), {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(12000),
      headers: {
        "api-key": process.env.BREVO_API_KEY,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw { status: response.status };
    const result = await response.json();
    if (
      !result.messageId ||
      !["number", "string"].includes(typeof result.messageId)
    )
      throw new Error("Missing message reference");
    return { messageId: String(result.messageId) };
  } catch (error) {
    // Never expose provider response bodies, API keys, recipient or code.
    throw providerError(error);
  }
}
