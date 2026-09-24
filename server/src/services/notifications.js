import nodemailer from "nodemailer";
import { Notification } from "../models/index.js";
import { requireConfigured } from "../utils/validation.js";
export async function sendSMS(phone, text, templateId = "") {
  if (
    process.env.OTP_DELIVERY === "dev" &&
    process.env.NODE_ENV !== "production"
  )
    return { dev: true };
  const url = requireConfigured(process.env.SMS_API_URL, "SMS_API_URL");
  const token = requireConfigured(process.env.SMS_API_TOKEN, "SMS_API_TOKEN");
  const header = process.env.SMS_AUTH_HEADER || "Authorization";
  const prefix = process.env.SMS_AUTH_PREFIX || "Bearer";
  // Adapt this JSON payload to the exact contract provided by your authorized SMS/WhatsApp vendor.
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [header]: `${prefix} ${token}`.trim(),
    },
    body: JSON.stringify({
      to: `91${phone}`,
      sender: process.env.SMS_SENDER || undefined,
      templateId: templateId || undefined,
      message: text,
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok)
    throw new Error("The messaging provider rejected the request.");
  return { sent: true };
}
export { sendOtp, verifyOtp } from "./registrationOTP.js";
export async function notifyConfirmed(registration) {
  const msg = `SHREE 2026 OLYMPIAD: Registration ${registration.registrationNumber} for ${registration.studentName} is confirmed. Download admit card from the official portal.`;
  if (registration.email && process.env.SMTP_HOST) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: registration.email,
        subject: "SHREE Olympiad registration confirmed",
        text: msg,
      });
      await Notification.create({
        registrationId: registration._id,
        channel: "email",
        status: "SENT",
      });
    } catch (e) {
      await Notification.create({
        registrationId: registration._id,
        channel: "email",
        status: "FAILED",
        detail: e.message.substring(0, 180),
      });
    }
  }
  // Confirmation SMS uses configured provider, not a WhatsApp template assumed to exist.
  if (process.env.SMS_API_URL && process.env.SMS_API_TOKEN) {
    try {
      await sendSMS(registration.guardianPhone, msg);
      await Notification.create({
        registrationId: registration._id,
        channel: "sms",
        status: "SENT",
      });
    } catch (e) {
      await Notification.create({
        registrationId: registration._id,
        channel: "sms",
        status: "FAILED",
        detail: e.message.substring(0, 180),
      });
    }
  }
}
