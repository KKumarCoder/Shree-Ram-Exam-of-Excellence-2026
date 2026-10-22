import { sendMail, normalizeEmail } from "./email.js";
import { generateCertificatePdfBuffer, formatCertificateNumber } from "./certificatePdf.js";
import { Registration, Audit, Settings } from "../models/index.js";

function escapeHtml(unsafe) {
  if (unsafe == null) return "";
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Builds the HTML content for the Certificate email
 */
export function buildCertificateEmailHtml({ student, certId, settings }) {
  const studentName = escapeHtml(student.studentName);
  const studentClass = escapeHtml(student.studentClass);
  const streamInfo = student.studentClass === "11" && student.course ? ` (${escapeHtml(student.course)})` : "";
  const rollNumber = escapeHtml(student.registrationNumber || student.applicationRef || "2027");
  const schoolPhone = escapeHtml(settings?.contactPhone || "8199991081");
  const schoolEmail = escapeHtml(settings?.contactEmail || "srpskanhra@gmail.com");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Certificate of Participation - SHREE Olympiad 2027</title>
  <style type="text/css">
    body { margin: 0; padding: 0; background-color: #F1F5F9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1E293B; }
    .email-wrapper { width: 100%; background-color: #F1F5F9; padding: 32px 12px; }
    .email-container { max-width: 600px; margin: 0 auto; background: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08); border: 1px solid #E2E8F0; }
    .email-header { background: linear-gradient(135deg, #052742 0%, #0E4B66 100%); padding: 32px 24px; text-align: center; color: #FFFFFF; }
    .email-header h1 { margin: 0 0 6px; font-size: 24px; font-weight: 800; letter-spacing: 0.02em; color: #F8FAFC; }
    .email-header p { margin: 0; font-size: 13px; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.1em; }
    .badge-pill { display: inline-block; background: #C59B27; color: #FFFFFF; font-size: 12px; font-weight: 700; padding: 4px 14px; border-radius: 20px; margin-top: 14px; letter-spacing: 0.04em; }
    .email-body { padding: 32px 28px; line-height: 1.65; }
    .greeting { font-size: 18px; font-weight: 700; color: #052742; margin-bottom: 14px; }
    .summary-card { background: #F8FAFC; border: 1.5px solid #E2E8F0; border-radius: 12px; padding: 18px 20px; margin: 24px 0; }
    .summary-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #EEF2F6; font-size: 14px; }
    .summary-row:last-child { border-bottom: none; }
    .summary-label { color: #64748B; font-weight: 500; }
    .summary-val { color: #0F172A; font-weight: 700; text-align: right; }
    .highlight-box { background: #EFF6FF; border-left: 4px solid #0284C7; padding: 14px 18px; border-radius: 6px; margin: 20px 0; font-size: 14px; color: #0C4A6E; }
    .email-footer { background: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 22px 24px; text-align: center; font-size: 12px; color: #64748B; }
    .email-footer a { color: #0284C7; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="email-container">
      <div class="email-header">
        <h1>SHREE RAM PUBLIC SCHOOL</h1>
        <p>SHREE Olympiad 2027</p>
        <div class="badge-pill">🎓 Official Participation Certificate</div>
      </div>

      <div class="email-body">
        <div class="greeting">Dear ${studentName},</div>
        <p>Heartiest congratulations on participating in the <strong>SHREE Olympiad 2027</strong> held on <strong>12 January 2027</strong>!</p>
        <p>We deeply appreciate your curiosity, dedication, and enthusiasm for learning. Your official <strong>Certificate of Participation</strong> has been generated and is attached to this email as a PDF document.</p>

        <div class="summary-card">
          <div class="summary-row">
            <span class="summary-label">Student Name:</span>
            <span class="summary-val">${studentName}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Class:</span>
            <span class="summary-val">Class ${studentClass}${streamInfo}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Roll / Reg Number:</span>
            <span class="summary-val">${rollNumber}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Certificate ID:</span>
            <span class="summary-val" style="color: #0284C7; font-family: monospace;">${escapeHtml(certId)}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Exam Date:</span>
            <span class="summary-val">12 January 2027</span>
          </div>
        </div>

        <div class="highlight-box">
          📎 <strong>Certificate Attached:</strong> Please find your high-resolution Certificate of Participation attached below. You can save or print it for your academic portfolio.
        </div>

        <p style="margin-top: 24px;">We wish you tremendous success in all your future academic endeavors. Keep shining and learning!</p>

        <p style="margin-top: 28px; margin-bottom: 0; color: #475569; font-size: 14px;">
          Warm regards,<br>
          <strong>Principal &amp; Olympiad Coordinator</strong><br>
          Shree Ram Public School, Kanhra-Badhra
        </p>
      </div>

      <div class="email-footer">
        <p style="margin: 0 0 6px;">Shree Ram Public School, Kanhra-Badhra, Charkhi Dadri, Haryana 127306</p>
        <p style="margin: 0;">Helpdesk: <a href="tel:${schoolPhone}">${schoolPhone}</a> | Email: <a href="mailto:${schoolEmail}">${schoolEmail}</a></p>
        <p style="margin: 10px 0 0; font-size: 11px; color: #94A3B8;">Portal: <a href="https://shreeolympiad.srpskanhra.com">shreeolympiad.srpskanhra.com</a></p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Generates the Certificate PDF and sends it via email to the student
 */
export async function sendCertificateEmail(student, customSettings = null) {
  const recipient = normalizeEmail(student.verifiedEmail || student.email);
  if (!recipient) {
    throw new Error(`Student ${student.studentName} has no valid email address.`);
  }

  const settings = customSettings || (await Settings.findById("primary")) || {};
  const certId = formatCertificateNumber(student);

  // 1. Generate PDF Buffer
  const pdfBuffer = await generateCertificatePdfBuffer(student, settings);

  // 2. Build Safe Filename
  const safeName = (student.studentName || "Student").replace(/[^a-zA-Z0-9]/g, "_");
  const filename = `Certificate_${safeName}_${student.registrationNumber || certId}.pdf`;

  // 3. Dispatch Email with Attachment
  const html = buildCertificateEmailHtml({ student, certId, settings });
  const text = `Congratulations ${student.studentName}!\n\nYour Certificate of Participation for the SHREE Olympiad 2027 held on 12 January 2027 has been issued.\n\nCertificate ID: ${certId}\nClass: ${student.studentClass}\nRoll No: ${student.registrationNumber || student.applicationRef}\n\nPlease find your official certificate attached as a PDF.\n\nShree Ram Public School, Kanhra-Badhra`;

  const subject = `🎓 Congratulations ${student.studentName}! Your SHREE Olympiad 2027 Certificate of Participation`;

  const emailResult = await sendMail({
    to: recipient,
    subject,
    html,
    text,
    attachments: [
      {
        filename,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });

  // 4. Update Student Record in Database
  await Registration.findByIdAndUpdate(student._id, {
    $set: {
      certificateNumber: certId,
      certificateIssuedAt: new Date(),
      certificateStatus: "SENT",
      certificateSentTo: recipient,
      certificateError: "",
    },
  });

  // 5. Log Audit
  await Audit.create({
    actor: "system",
    action: "CERTIFICATE_DISPATCHED",
    registrationId: student._id,
    details: {
      recipient,
      certId,
      messageId: emailResult?.messageId,
    },
  }).catch(() => {});

  return {
    success: true,
    certId,
    recipient,
    messageId: emailResult?.messageId,
  };
}
