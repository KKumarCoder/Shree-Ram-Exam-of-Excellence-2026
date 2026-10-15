/**
 * SHREE 2027 Olympiad — Automated Registration Reminder Email Template
 * Professional, mobile-responsive HTML and plain-text email generator.
 * Adheres to Shree Ram Public School branding (Navy #062639, Gold #c59b27, White #ffffff).
 */

/**
 * Escapes unsafe characters for HTML to prevent injection vulnerabilities.
 * @param {string|number} unsafe
 * @returns {string}
 */
export function escapeHtml(unsafe) {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Builds the HTML and plain-text reminder email message.
 * @param {Object} params
 * @param {Object} params.registration - The Registration document.
 * @param {Object} params.settings - The school settings document.
 * @param {string} params.resumeUrl - The secure recovery URL with opaque token.
 * @param {string} [params.optOutUrl] - The optional opt-out URL.
 * @param {number} [params.attemptNumber=1] - 1, 2, or 3.
 * @returns {{ subject: string, html: string, text: string }}
 */
export function buildReminderEmail({
  registration,
  settings,
  resumeUrl,
  optOutUrl,
  attemptNumber = 1,
}) {
  const studentName = escapeHtml(registration.studentName);
  const studentClass = escapeHtml(registration.studentClass);
  const applicationRef = escapeHtml(registration.applicationRef);
  const schoolPhone = escapeHtml(settings?.contactPhone || '8199991081');
  const schoolEmail = escapeHtml(settings?.contactEmail || 'srpskanhra@gmail.com');
  const schoolVenue = escapeHtml(
    settings?.venue ||
      'Shree Ram Public School, Kanhra-Badhra Road, Charkhi Dadri, Haryana 127306'
  );
  const fee = escapeHtml(settings?.fee || 149);

  const subject = `Action Required: Complete SHREE 2027 Olympiad Registration for ${registration.studentName} [${registration.applicationRef}]`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapeHtml(subject)}</title>
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    body { margin: 0; padding: 0; width: 100% !important; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; }
    .email-wrapper { width: 100%; max-width: 620px; margin: 0 auto; background-color: #ffffff; }
    .header { background: linear-gradient(135deg, #062639 0%, #0d3b59 100%); padding: 32px 28px; text-align: center; border-bottom: 4px solid #c59b27; }
    .header-logo-text { color: #ffffff; font-size: 22px; font-weight: 800; letter-spacing: 0.5px; margin: 0 0 6px 0; text-transform: uppercase; }
    .header-sub { color: #dfb743; font-size: 13px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; margin: 0; }
    .content-body { padding: 32px 28px; line-height: 1.6; }
    .salutation { font-size: 18px; font-weight: 700; color: #062639; margin-bottom: 14px; }
    .intro-text { font-size: 15px; color: #334155; margin-bottom: 24px; line-height: 1.65; }
    .card { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 24px; }
    .card-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #64748b; margin-top: 0; margin-bottom: 12px; }
    .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #edf2f7; font-size: 14px; }
    .detail-label { color: #64748b; font-weight: 500; }
    .detail-value { color: #062639; font-weight: 700; text-align: right; }
    .status-badge { display: inline-block; background-color: #fef3c7; color: #92400e; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 700; border: 1px solid #fde68a; }
    .alert-box { background-color: #fffbeb; border-left: 4px solid #c59b27; padding: 16px; border-radius: 0 8px 8px 0; margin-bottom: 28px; }
    .alert-title { color: #92400e; font-size: 14px; font-weight: 700; margin: 0 0 6px 0; display: flex; align-items: center; }
    .alert-text { color: #78350f; font-size: 13px; line-height: 1.55; margin: 0; }
    .cta-container { text-align: center; margin: 32px 0; }
    .cta-btn { display: inline-block; background: linear-gradient(135deg, #062639 0%, #0a3a5c 100%); color: #ffffff !important; text-decoration: none; padding: 15px 36px; border-radius: 6px; font-size: 15px; font-weight: 700; letter-spacing: 0.5px; border: 1px solid #c59b27; box-shadow: 0 4px 12px rgba(6, 38, 57, 0.2); }
    .cta-btn:hover { background: #062639; }
    .cta-note { font-size: 12px; color: #64748b; margin-top: 10px; }
    .steps-list { margin: 20px 0 28px 0; padding-left: 20px; font-size: 14px; color: #334155; }
    .steps-list li { margin-bottom: 8px; }
    .footer { background-color: #062639; color: #94a3b8; padding: 28px 24px; text-align: center; font-size: 12px; line-height: 1.6; border-top: 3px solid #c59b27; }
    .footer-school { color: #ffffff; font-weight: 700; font-size: 13px; margin-bottom: 4px; }
    .footer a { color: #dfb743; text-decoration: none; }
    .footer-optout { margin-top: 18px; padding-top: 14px; border-top: 1px solid #1e3a50; font-size: 11px; color: #64748b; }
    @media only screen and (max-width: 600px) {
      .content-body { padding: 24px 16px; }
      .header { padding: 24px 16px; }
      .cta-btn { width: 85%; padding: 14px 20px; }
    }
  </style>
</head>
<body>
  <div style="background-color: #f1f5f9; padding: 20px 0;">
    <div class="email-wrapper">
      <!-- HEADER -->
      <div class="header">
        <div class="header-logo-text">SHREE RAM PUBLIC SCHOOL</div>
        <div class="header-sub">SHREE 2027 OLYMPIAD · EXAM OF EXCELLENCE</div>
      </div>

      <!-- BODY -->
      <div class="content-body">
        <div class="salutation">Dear Parent / Guardian,</div>
        
        <p class="intro-text">
          We noticed that the Olympiad registration for <strong>${studentName}</strong> (Class ${studentClass}) was started on our official portal but remains incomplete. To confirm your ward’s seat and enable admit card generation, please complete the pending payment verification.
        </p>

        <!-- APPLICATION SUMMARY CARD -->
        <table width="100%" cellpadding="0" cellspacing="0" class="card" style="border-collapse: collapse;">
          <tr>
            <td colspan="2" style="padding-bottom: 12px;">
              <span class="card-title">Registration Summary</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-size: 14px; border-bottom: 1px solid #edf2f7;">Student Name:</td>
            <td style="padding: 6px 0; color: #062639; font-size: 14px; font-weight: 700; text-align: right; border-bottom: 1px solid #edf2f7;">${studentName}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-size: 14px; border-bottom: 1px solid #edf2f7;">Class:</td>
            <td style="padding: 6px 0; color: #062639; font-size: 14px; font-weight: 700; text-align: right; border-bottom: 1px solid #edf2f7;">Class ${studentClass}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-size: 14px; border-bottom: 1px solid #edf2f7;">Application Reference:</td>
            <td style="padding: 6px 0; color: #062639; font-size: 14px; font-weight: 700; text-align: right; border-bottom: 1px solid #edf2f7; font-family: monospace;">${applicationRef}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-size: 14px; border-bottom: 1px solid #edf2f7;">Registration Fee:</td>
            <td style="padding: 6px 0; color: #062639; font-size: 14px; font-weight: 700; text-align: right; border-bottom: 1px solid #edf2f7;">₹${fee}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-size: 14px;">Status:</td>
            <td style="padding: 6px 0; text-align: right;">
              <span class="status-badge">Payment Proof Pending</span>
            </td>
          </tr>
        </table>

        <!-- CRITICAL UPI ADVISORY -->
        <div class="alert-box">
          <div class="alert-title">
            ⚠️ IMPORTANT PAYMENT NOTICE:
          </div>
          <p class="alert-text">
            <strong>If you have already made the payment through UPI, please do not pay again.</strong> Continue your existing application and submit your UTR number and payment receipt screenshot so our office can reconcile and verify your payment.
          </p>
        </div>

        <!-- PRIMARY CTA BUTTON -->
        <div class="cta-container">
          <a href="${escapeHtml(resumeUrl)}" class="cta-btn" target="_blank" rel="noopener noreferrer">
            Continue My Application &rarr;
          </a>
          <div class="cta-note">
            🔒 Secure single-use link · For security, a quick 6-digit OTP will be sent to your email to resume your exact application.
          </div>
        </div>

        <p style="font-size: 14px; color: #475569; margin-bottom: 6px; font-weight: 600;">Next Steps to Finalize Registration:</p>
        <ol class="steps-list">
          <li>Click the <strong>Continue My Application</strong> button above.</li>
          <li>Confirm the 6-digit verification code sent to your email.</li>
          <li>If not paid yet, scan the official school UPI QR code to pay ₹${fee}.</li>
          <li>Enter your 12-digit UPI Transaction ID (UTR) and upload your payment screenshot.</li>
          <li>Submit for school verification. Once verified, your official Admit Card will be unlocked.</li>
        </ol>

        <p style="font-size: 13px; color: #64748b; line-height: 1.6;">
          If you have questions or require assistance, our admissions desk is happy to help:<br>
          📞 Phone: <strong>${schoolPhone}</strong> &nbsp;|&nbsp; ✉️ Email: <strong><a href="mailto:${schoolEmail}" style="color: #062639;">${schoolEmail}</a></strong>
        </p>
      </div>

      <!-- FOOTER -->
      <div class="footer">
        <div class="footer-school">SHREE RAM PUBLIC SCHOOL</div>
        <div>${schoolVenue}</div>
        <div style="margin-top: 8px;">
          Official Website: <a href="https://srpskanhra.com" target="_blank">srpskanhra.com</a>
        </div>
        ${
          optOutUrl
            ? `<div class="footer-optout">
                Reminder ${attemptNumber} of 3. If you no longer wish to receive registration reminders, you may <a href="${escapeHtml(optOutUrl)}" style="color: #94a3b8; text-decoration: underline;">opt out here</a>.
              </div>`
            : `<div class="footer-optout">Reminder ${attemptNumber} of 3. Automatic reminders stop immediately once application is submitted.</div>`
        }
      </div>
    </div>
  </div>
</body>
</html>`;

  const text = `SHREE RAM PUBLIC SCHOOL — SHREE 2027 OLYMPIAD
==============================================================
ACTION REQUIRED: Complete Registration for ${registration.studentName}

Dear Parent / Guardian,

We noticed that the Olympiad registration for ${registration.studentName} (Class ${registration.studentClass}) was started on our official portal but remains incomplete.

APPLICATION DETAILS:
- Student Name: ${registration.studentName}
- Class: Class ${registration.studentClass}
- Application Reference: ${registration.applicationRef}
- Registration Fee: INR ${fee}
- Status: Payment Proof Pending

IMPORTANT PAYMENT NOTICE:
If you have already made the payment through UPI, please do not pay again. Continue your existing application and submit your UTR number and payment receipt.

CONTINUE YOUR APPLICATION:
Open this secure link in your browser:
${resumeUrl}

For security, you will be prompted to enter a 6-digit OTP sent to this email address to load your existing application.

SUPPORT ASSISTANCE:
Phone: ${settings?.contactPhone || '8199991081'}
Email: ${settings?.contactEmail || 'srpskanhra@gmail.com'}
Venue: ${settings?.venue || 'Shree Ram Public School, Kanhra-Badhra Road, Charkhi Dadri, Haryana 127306'}

${optOutUrl ? `To opt out of further reminder emails, visit: ${optOutUrl}\n` : ''}
Shree Ram Public School © 2027. All rights reserved.
`;

  return { subject, html, text };
}
