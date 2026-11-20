import { toast } from "react-toastify";

/**
 * Normalizes toast messages into clean, concise, short alerts.
 * E.g.: "Payment success", "Registration confirmed", "WhatsApp verified", etc.
 */
export function formatShortToast(msg, type) {
  if (typeof msg !== "string") return "";
  let text = msg.trim();
  if (!text) return "";

  const lower = text.toLowerCase();

  // 1. Payment
  if (
    lower.includes("payment success") ||
    lower.includes("payment verified") ||
    lower.includes("payment received") ||
    lower.includes("registration has been confirmed")
  ) {
    return "Payment success";
  }
  if (
    lower.includes("payment failed") ||
    lower.includes("payment verification failed")
  ) {
    return "Payment failed";
  }
  if (lower.includes("payment window closed")) {
    return "Payment cancelled";
  }
  if (lower.includes("payment updated")) {
    return "Payment updated";
  }
  if (lower.includes("payment deleted")) {
    return "Payment deleted";
  }

  // 2. Registration & Application
  if (
    lower.includes("registration confirmed") ||
    lower.includes("registration approved")
  ) {
    return "Registration confirmed";
  }
  if (lower.includes("registration updated")) {
    return "Registration updated";
  }
  if (lower.includes("registration deleted")) {
    return "Registration deleted";
  }
  if (lower.includes("ready to register another sibling") || lower.includes("sibling registration")) {
    return "Ready for sibling";
  }
  if (lower.includes("application restored")) {
    return "Application restored";
  }
  if (
    lower.includes("no matching registration") ||
    lower.includes("no registration found")
  ) {
    return "No registration found";
  }
  if (
    lower.includes("failed to find application") ||
    lower.includes("application not found")
  ) {
    return "Application not found";
  }

  // 3. WhatsApp & OTP
  if (
    lower.includes("whatsapp mobile verified") ||
    lower.includes("whatsapp number verified") ||
    lower.includes("mobile verified")
  ) {
    return "WhatsApp verified";
  }
  if (
    lower.includes("whatsapp verification code sent") ||
    lower.includes("otp sent to your whatsapp") ||
    lower.includes("otp has been sent to your whatsapp") ||
    lower.includes("verification code sent") ||
    lower.includes("whatsapp otp sent")
  ) {
    return "WhatsApp OTP sent";
  }
  if (
    lower.includes("whatsapp reminder sent") ||
    lower.includes("whatsapp payment reminder dispatched")
  ) {
    return "WhatsApp reminder sent";
  }
  if (
    lower.includes("failed to send whatsapp reminder") ||
    lower.includes("whatsapp reminder failed")
  ) {
    return "WhatsApp reminder failed";
  }
  if (
    lower.includes("failed to send whatsapp otp") ||
    lower.includes("failed to send otp")
  ) {
    return "OTP send failed";
  }
  if (
    lower.includes("invalid whatsapp otp") ||
    lower.includes("incorrect verification code") ||
    lower.includes("invalid otp") ||
    lower.includes("please enter the 6-digit")
  ) {
    return "Invalid OTP";
  }
  if (
    lower.includes("message redelivered") ||
    lower.includes("test message sent") ||
    lower.includes("whatsapp sent")
  ) {
    return "WhatsApp sent";
  }
  if (
    lower.includes("failed to send test message") ||
    lower.includes("retry failed") ||
    lower.includes("whatsapp message failed") ||
    lower.includes("whatsapp failed")
  ) {
    return "WhatsApp failed";
  }

  // 4. Certificates & Admit Cards
  if (
    lower.includes("admit card whatsapp sent") ||
    (lower.includes("admit card") && lower.includes("sent"))
  ) {
    return "Admit card sent";
  }
  if (
    lower.includes("admit card pdf downloaded") ||
    lower.includes("admit card downloaded")
  ) {
    return "Admit card downloaded";
  }
  if (lower.includes("failed to download admit card")) {
    return "Download failed";
  }
  if (lower.includes("certificate sent")) {
    return "Certificate sent";
  }
  if (lower.includes("failed to send certificate")) {
    return "Certificate failed";
  }

  // 5. Settings, Admin & Content
  if (
    lower.includes("event settings saved") ||
    lower.includes("settings saved")
  ) {
    return "Settings saved";
  }
  if (
    lower.includes("public content saved") ||
    lower.includes("content saved")
  ) {
    return "Content saved";
  }
  if (
    lower.includes("attendance exported") ||
    lower.includes("downloaded successfully")
  ) {
    return "Export downloaded";
  }
  if (lower.includes("qr code is not a shree olympiad")) {
    return "Invalid admit card QR";
  }
  if (
    lower.includes("please upload a jpg or png") ||
    lower.includes("under 5 mb")
  ) {
    return "Invalid image (Max 5MB JPG/PNG)";
  }

  // 6. Generic phrase cleaner
  text = text
    .replace(/\s+successfully[\.!]*$/i, "")
    .replace(/^failed to\s+/i, "Failed: ")
    .replace(/^error:\s*/i, "")
    .replace(/\s*Please try again\.?/i, "")
    .replace(/\s*Please check (?:your )?(?:email|number|details) and try again\.?/i, "");

  if (text.includes(". ")) {
    text = text.split(". ")[0].trim();
  }

  if (text.length > 45) {
    text = text.slice(0, 42).trim() + "...";
  }

  return text;
}

function show(type, message) {
  if (typeof message !== "string" || !message.trim()) return;
  const shortText = formatShortToast(message, type);
  if (!shortText) return;

  return toast[type](shortText, {
    autoClose: 3500,
    role: type === "error" ? "alert" : "status",
  });
}

export const notify = {
  success: (message) => show("success", message),
  info: (message) => show("info", message),
  error: (message) => show("error", message),
};
