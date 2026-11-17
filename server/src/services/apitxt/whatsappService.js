import { WhatsAppMessage } from '../../models/index.js';
import { sendWhatsAppMessage, formatWhatsAppPhone, isApitxtConfigured } from './apiClient.js';
import { formatCertificateNumber } from '../certificatePdf.js';
import {
  getTemplateName,
  getTemplateLanguage,
  resolvePaymentReceivedParams,
  resolvePaymentVerifiedParams,
  resolveAdmitCardParams,
  resolveCertificateParams,
  resolveExamReminderParams,
} from './templateService.js';
import {
  getAdmitCardPdfUrl,
  getCertificatePdfUrl,
  getOrUploadAdmitCardPdfUrl,
  getOrUploadCertificatePdfUrl,
} from './documentService.js';
import { logSafeError } from './errorHandler.js';

/**
 * Low-level dispatch and logging to MongoDB WhatsAppMessage collection.
 */
export async function dispatchAndLogWhatsApp({
  recipientPhone,
  studentId = null,
  registrationId = null,
  registrationNumber = '',
  studentName = '',
  studentClass = '',
  templateName,
  language = '',
  messageType = 'custom',
  documentType = 'none',
  mediaUrl = '',
  filename = '',
  bodyParams = [],
  headerParams = [],
  buttonParams = [],
  campaignId = '',
  metadata = {},
}) {
  const normPhone = formatWhatsAppPhone(recipientPhone);
  const resolvedLang = language || getTemplateLanguage(templateName);

  // 1. Create durable record in MongoDB
  const record = await WhatsAppMessage.create({
    recipientPhone: normPhone,
    studentId,
    registrationId,
    registrationNumber,
    studentName,
    studentClass,
    templateName,
    language: resolvedLang,
    messageType,
    documentType,
    mediaUrl,
    filename,
    providerName: 'apitxt',
    campaignId,
    bodyParams,
    headerParams,
    buttonParams,
    status: 'PENDING',
    metadata,
  });

  // 2. Dispatch to APITxT
  const result = await sendWhatsAppMessage({
    templateName,
    mobile: normPhone,
    bodyParams,
    headerParams,
    buttonParams,
    mediaUrl,
    filename,
    language: resolvedLang,
  });

  // 3. Update record with outcome
  const now = new Date();
  if (result.success) {
    record.status = 'SENT';
    record.sentAt = now;
    record.providerRequestId = result.requestId;
    record.providerMessageId = result.providerMessageId || result.requestId;
    record.rawResponse = result.rawResponse;
    await record.save();
    return {
      success: true,
      messageId: record._id,
      requestId: result.requestId,
    };
  } else {
    record.status = 'FAILED';
    record.failedAt = now;
    record.errorCode = 'SEND_FAILED';
    record.errorMessage = result.error || 'APITxT dispatch failure';
    record.rawResponse = result.rawResponse;
    await record.save();
    return {
      success: false,
      messageId: record._id,
      error: record.errorMessage,
    };
  }
}

/**
 * Dispatch Payment Received Notification (Razorpay initiated)
 */
export async function sendPaymentReceived(registration, payment) {
  const phone = registration.guardianPhone;
  if (!phone) return { success: false, error: 'No phone number' };
  const { templateName, bodyParams, language } = resolvePaymentReceivedParams(registration, payment);

  return dispatchAndLogWhatsApp({
    recipientPhone: phone,
    studentId: registration._id,
    registrationId: registration._id,
    registrationNumber: registration.registrationNumber || registration.applicationRef || '',
    studentName: registration.studentName,
    studentClass: registration.studentClass,
    templateName,
    language,
    messageType: 'payment_received',
    documentType: 'none',
    bodyParams,
  });
}

/**
 * Dispatch Payment Verified & Admission Confirmation Notification
 */
export async function sendPaymentVerified(registration, payment) {
  const phone = registration.guardianPhone;
  if (!phone) return { success: false, error: 'No phone number' };
  const { templateName, bodyParams, language } = resolvePaymentVerifiedParams(registration, payment);

  return dispatchAndLogWhatsApp({
    recipientPhone: phone,
    studentId: registration._id,
    registrationId: registration._id,
    registrationNumber: registration.registrationNumber || '',
    studentName: registration.studentName,
    studentClass: registration.studentClass,
    templateName,
    language,
    messageType: 'payment_verified',
    documentType: 'none',
    bodyParams,
  });
}

/**
 * Dispatch Admit Card PDF WhatsApp Delivery
 */
export async function sendAdmitCardWhatsApp(registration, settings) {
  const phone = registration.guardianPhone;
  if (!phone) return { success: false, error: 'No phone number' };
  if (!registration.admitToken) {
    return { success: false, error: 'Student does not have an active admitToken' };
  }

  const mediaUrl = await getOrUploadAdmitCardPdfUrl(registration, settings);
  const { templateName, bodyParams, filename, language } = resolveAdmitCardParams(
    registration,
    settings,
    mediaUrl,
  );

  return dispatchAndLogWhatsApp({
    recipientPhone: phone,
    studentId: registration._id,
    registrationId: registration._id,
    registrationNumber: registration.registrationNumber || '',
    studentName: registration.studentName,
    studentClass: registration.studentClass,
    templateName,
    language,
    messageType: 'admit_card',
    documentType: 'admit_card',
    mediaUrl,
    filename,
    bodyParams,
    headerParams: [],
  });
}

/**
 * Dispatch Participation or Merit Certificate PDF WhatsApp Delivery
 */
export async function sendCertificateWhatsApp(
  registration,
  settings,
  isTopper = false,
  position = 'Merit Position',
) {
  const phone = registration.guardianPhone;
  if (!phone) return { success: false, error: 'No phone number' };

  if (!registration.certificateNumber) {
    registration.certificateNumber = formatCertificateNumber(registration);
    if (typeof registration.save === 'function') {
      await registration.save().catch(() => {});
    }
  }

  const mediaUrl = await getOrUploadCertificatePdfUrl(registration, settings);
  const { templateName, bodyParams, filename, language, buttonParams } = resolveCertificateParams(
    registration,
    mediaUrl,
    isTopper,
    position,
  );

  return dispatchAndLogWhatsApp({
    recipientPhone: phone,
    studentId: registration._id,
    registrationId: registration._id,
    registrationNumber: registration.registrationNumber || '',
    studentName: registration.studentName,
    studentClass: registration.studentClass,
    templateName,
    language,
    messageType: 'certificate',
    documentType: 'certificate',
    mediaUrl,
    filename,
    bodyParams,
    headerParams: [],
    buttonParams: buttonParams || [registration.registrationNumber || ''],
  });
}

/**
 * Dispatch Exam Reminder WhatsApp Notification
 */
export async function sendExamReminderWhatsApp(registration, settings) {
  const phone = registration.guardianPhone;
  if (!phone) return { success: false, error: 'No phone number' };
  const { templateName, bodyParams, language } = resolveExamReminderParams(registration, settings);

  return dispatchAndLogWhatsApp({
    recipientPhone: phone,
    studentId: registration._id,
    registrationId: registration._id,
    registrationNumber: registration.registrationNumber || registration.applicationRef || '',
    studentName: registration.studentName,
    studentClass: registration.studentClass,
    templateName,
    language,
    messageType: 'exam_reminder',
    documentType: 'none',
    bodyParams,
  });
}

/**
 * Retries a previously failed WhatsApp message.
 */
export async function retryWhatsAppMessage(messageId) {
  const msg = await WhatsAppMessage.findById(messageId);
  if (!msg) throw new Error('WhatsApp message record not found');

  msg.status = 'PENDING';
  msg.retryCount = (msg.retryCount || 0) + 1;
  await msg.save();

  const result = await sendWhatsAppMessage({
    templateName: msg.templateName,
    mobile: msg.recipientPhone,
    bodyParams: msg.bodyParams,
    headerParams: msg.headerParams,
    buttonParams: msg.buttonParams,
    mediaUrl: msg.mediaUrl,
    filename: msg.filename,
  });

  const now = new Date();
  if (result.success) {
    msg.status = 'SENT';
    msg.sentAt = now;
    msg.providerRequestId = result.requestId;
    msg.providerMessageId = result.providerMessageId || result.requestId;
    msg.rawResponse = result.rawResponse;
    msg.errorMessage = '';
    msg.errorCode = '';
    await msg.save();
    return { success: true, message: msg };
  } else {
    msg.status = 'FAILED';
    msg.failedAt = now;
    msg.errorCode = 'RETRY_FAILED';
    msg.errorMessage = result.error || 'Retry dispatch failed';
    msg.rawResponse = result.rawResponse;
    await msg.save();
    return { success: false, message: msg, error: msg.errorMessage };
  }
}

