/**
 * APITxT Centralized WhatsApp Template Registry
 * Defines all 9 system templates, metadata, variable definitions,
 * and parameter resolution functions.
 */

export const TEMPLATES = {
  OTP: {
    key: 'OTP',
    envVar: 'APITXT_OTP_TEMPLATE',
    defaultName: 'shree_otp_verification',
    category: 'AUTHENTICATION',
    language: 'hi',
    description: 'WhatsApp 6-digit OTP verification for student registration and login.',
    hasMedia: false,
    hasAuthButton: true,
    variableLabels: ['OTP Code'],
  },
  PAYMENT_RECEIVED: {
    key: 'PAYMENT_RECEIVED',
    envVar: 'APITXT_PAYMENT_RECEIVED_TEMPLATE',
    defaultName: 'shree_payment_received',
    category: 'UTILITY',
    language: 'en_US',
    description: 'Sent when online payment is completed and verified.',
    hasMedia: false,
    hasAuthButton: false,
    variableLabels: ['Parent Name', 'Student Name', 'Registration ID', 'Amount (₹)'],
  },
  PAYMENT_VERIFIED: {
    key: 'PAYMENT_VERIFIED',
    envVar: 'APITXT_PAYMENT_VERIFIED_TEMPLATE',
    defaultName: 'shree_payment_verified',
    category: 'UTILITY',
    language: 'hi',
    description: 'Sent when payment is verified and registration number is assigned.',
    hasMedia: false,
    hasAuthButton: false,
    variableLabels: ['Student Name', 'Registration Number', 'Class', 'Amount (₹)', 'UTR / Transaction ID'],
  },
  ADMIT_CARD: {
    key: 'ADMIT_CARD',
    envVar: 'APITXT_ADMIT_CARD_TEMPLATE',
    defaultName: 'shree_olympiad_admit_card',
    category: 'UTILITY',
    language: 'hi',
    description: 'Official Admit Card PDF delivery with student details and registration ID.',
    hasMedia: true,
    mediaType: 'DOCUMENT',
    hasAuthButton: false,
    variableLabels: ['Parent Name', 'Student Name', 'Class', 'Registration ID'],
  },
  EXAM_REMINDER: {
    key: 'EXAM_REMINDER',
    envVar: 'APITXT_EXAM_REMINDER_TEMPLATE',
    defaultName: 'shree_exam_reminder',
    category: 'UTILITY',
    language: 'hi',
    description: 'Automated or manual exam reminder sent to confirmed students.',
    hasMedia: false,
    hasAuthButton: false,
    variableLabels: ['Student Name', 'Exam Date', 'Reporting Time', 'Venue', 'Registration Number'],
  },
  PAYMENT_REMINDER: {
    key: 'PAYMENT_REMINDER',
    envVar: 'APITXT_PAYMENT_REMINDER_TEMPLATE',
    defaultName: 'payment_reminder_template',
    category: 'MARKETING',
    language: 'hi',
    description: 'Payment and registration completion reminder with status resume link.',
    hasMedia: false,
    hasAuthButton: false,
    variableLabels: ['Parent Name', 'Student Name', 'Class', 'Application Reference'],
  },
  PARTICIPATION_CERTIFICATE: {
    key: 'PARTICIPATION_CERTIFICATE',
    envVar: 'APITXT_CERTIFICATE_TEMPLATE',
    defaultName: 'shree_olympiad_cert_2027_pdf',
    category: 'UTILITY',
    language: 'en_US',
    description: 'Official Participation Certificate PDF delivery attached directly in WhatsApp.',
    hasMedia: true,
    mediaType: 'DOCUMENT',
    hasAuthButton: false,
    variableLabels: ['Parent Name', 'Student Name', 'Class', 'Registration ID'],
  },
  TOPPER_CERTIFICATE: {
    key: 'TOPPER_CERTIFICATE',
    envVar: 'APITXT_TOPPER_TEMPLATE',
    defaultName: 'shree_topper_certificate',
    category: 'UTILITY',
    language: 'hi',
    description: 'Merit / Topper Award Certificate PDF delivery for top performers.',
    hasMedia: true,
    mediaType: 'DOCUMENT',
    hasAuthButton: false,
    variableLabels: ['Student Name', 'Class', 'Registration Number', 'Award Position', 'Certificate Number'],
  },
};

/**
 * Returns the configured template name, checking process.env first.
 */
export function getTemplateName(templateKey) {
  const t = TEMPLATES[templateKey];
  if (!t) return templateKey;
  if (t.envVar && process.env[t.envVar]) {
    return process.env[t.envVar].trim();
  }
  return t.defaultName;
}

/**
 * Returns the configured language for a template, defaulting to the template spec or 'hi'.
 */
export function getTemplateLanguage(keyOrName) {
  if (!keyOrName) return process.env.APITXT_DEFAULT_LANGUAGE || 'hi';
  const entry = Object.values(TEMPLATES).find(
    (t) =>
      t.key === keyOrName ||
      t.defaultName === keyOrName ||
      getTemplateName(t.key) === keyOrName,
  );
  if (entry) return entry.language || 'hi';
  return process.env.APITXT_DEFAULT_LANGUAGE || 'hi';
}

/**
 * Returns full registry details for the Admin Dashboard.
 */
export function getAllTemplatesConfig() {
  return Object.values(TEMPLATES).map((t) => ({
    key: t.key,
    name: getTemplateName(t.key),
    defaultName: t.defaultName,
    envVar: t.envVar,
    category: t.category,
    language: t.language || process.env.APITXT_DEFAULT_LANGUAGE || 'hi',
    description: t.description,
    hasMedia: !!t.hasMedia,
    hasAuthButton: !!t.hasAuthButton,
    variableLabels: t.variableLabels,
  }));
}

/**
 * Parameter resolver for OTP Template.
 */
export function resolveOtpParams({ otp }) {
  const code = String(otp || '').trim();
  return {
    templateName: getTemplateName('OTP'),
    bodyParams: [code],
    buttonParams: [code], // For authentication copy-code or dynamic button
  };
}

/**
 * Parameter resolver for Payment Received Template (shree_payment_received).
 * Approved Meta Parameters (en_US):
 * {{1}} = Dear {{1}} Ji (Parent / Guardian Name)
 * {{2}} = Student Name: {{2}}
 * {{3}} = Registration ID: {{3}}
 * {{4}} = Amount: {{4}}
 */
export function resolvePaymentReceivedParams(registration, payment) {
  const parentName = registration.guardianName || 'Guardian';
  const studentName = registration.studentName || 'Student';
  const regId = registration.registrationNumber || registration.applicationRef || 'N/A';
  const amount = `₹${Number(payment?.amount || 149).toFixed(2)}`;
  return {
    templateName: getTemplateName('PAYMENT_RECEIVED'),
    bodyParams: [parentName, studentName, regId, amount],
    language: getTemplateLanguage('PAYMENT_RECEIVED'),
  };
}

/**
 * Parameter resolver for Payment Verified Template.
 */
export function resolvePaymentVerifiedParams(registration, payment) {
  const studentName = registration.studentName || 'Student';
  const regNo = registration.registrationNumber || registration.applicationRef || 'N/A';
  const studentClass = `Class ${registration.studentClass || ''}`.trim();
  const amount = `₹${Number(payment?.amount || 149).toFixed(2)}`;
  const utr = payment?.utr || payment?.providerPaymentId || 'VERIFIED';
  return {
    templateName: getTemplateName('PAYMENT_VERIFIED'),
    bodyParams: [studentName, regNo, studentClass, amount, utr],
    language: getTemplateLanguage('PAYMENT_VERIFIED'),
  };
}

/**
 * Parameter resolver for Admit Card Template (shree_olympiad_admit_card).
 * Approved Meta Parameters:
 * {{1}} = Guardian / Parent Name
 * {{2}} = Student Name
 * {{3}} = Class
 * {{4}} = Registration ID
 */
export function resolveAdmitCardParams(registration, settingsOrMediaUrl, maybeMediaUrl) {
  const mediaUrl = typeof settingsOrMediaUrl === 'string' ? settingsOrMediaUrl : maybeMediaUrl;
  const parentName = registration.guardianName || 'अभिभावक';
  const studentName = registration.studentName || 'Student';
  const studentClass = registration.studentClass
    ? (String(registration.studentClass).toLowerCase().startsWith('class')
        ? registration.studentClass
        : `Class ${registration.studentClass}`)
    : 'N/A';
  const regNo = registration.registrationNumber || registration.applicationRef || 'N/A';
  return {
    templateName: getTemplateName('ADMIT_CARD'),
    bodyParams: [parentName, studentName, studentClass, regNo],
    mediaUrl,
    filename: `${regNo}-admit-card.pdf`,
    language: getTemplateLanguage('ADMIT_CARD'),
  };
}

/**
 * Parameter resolver for Exam Reminder Template.
 */
export function resolveExamReminderParams(registration, settings) {
  const studentName = registration.studentName || 'Student';
  const examDate = settings?.examDate || '12 January 2027';
  const reportingTime = settings?.reportingTime || '09:30 AM';
  const venue = settings?.venue || 'Shree Ram Public School, Kanhra-Badhra Road';
  const regNo = registration.registrationNumber || registration.applicationRef || 'N/A';
  return {
    templateName: getTemplateName('EXAM_REMINDER'),
    bodyParams: [studentName, examDate, reportingTime, venue, regNo],
    language: getTemplateLanguage('EXAM_REMINDER'),
  };
}

/**
 * Parameter resolver for Payment Reminder Template.
 * {{1}} = Guardian / Parent Name
 * {{2}} = Student Name
 * {{3}} = Class
 * {{4}} = Application Reference ID
 */
export function resolvePaymentReminderParams(registration, settings) {
  const parentName = registration.guardianName || 'अभिभावक';
  const studentName = registration.studentName || 'Student';
  const rawClass = String(registration.studentClass || '').trim();
  const studentClass = rawClass.replace(/^class\s*/i, '').trim() || 'N/A';
  const appRef = registration.applicationRef || registration.registrationNumber || 'N/A';
  return {
    templateName: getTemplateName('PAYMENT_REMINDER'),
    bodyParams: [parentName, studentName, studentClass, appRef],
    language: getTemplateLanguage('PAYMENT_REMINDER'),
  };
}

/**
 * Parameter resolver for Certificate Template (shree_olympiad_certificate).
 * Approved Meta Parameters:
 * {{1}} = Guardian / Parent Name
 * {{2}} = Student Name
 * {{3}} = Class
 * {{4}} = Registration ID
 */
export function resolveCertificateParams(registration, mediaUrl, isTopper = false, position = 'Merit Position') {
  const parentName = registration.guardianName || 'Guardian';
  const studentName = registration.studentName || 'Student';
  // Send bare numeric class (e.g. '6') because template text already has "🎓 कक्षा: {{3}}"
  const rawClass = String(registration.studentClass || '').trim();
  const studentClass = rawClass.replace(/^class\s*/i, '').trim() || 'N/A';
  const regNo = registration.registrationNumber || registration.applicationRef || 'N/A';

  if (isTopper) {
    return {
      templateName: getTemplateName('TOPPER_CERTIFICATE'),
      bodyParams: [studentName, studentClass, regNo, position, registration.certificateNumber || `CERT-${regNo}`],
      buttonParams: [regNo],
      mediaUrl,
      filename: `${regNo}-Merit-Certificate.pdf`,
      language: getTemplateLanguage('TOPPER_CERTIFICATE'),
    };
  }

  return {
    templateName: getTemplateName('PARTICIPATION_CERTIFICATE'),
    bodyParams: [parentName, studentName, studentClass, regNo],
    buttonParams: [],
    mediaUrl,
    filename: `${regNo}-Certificate.pdf`,
    language: getTemplateLanguage('PARTICIPATION_CERTIFICATE'),
  };
}



