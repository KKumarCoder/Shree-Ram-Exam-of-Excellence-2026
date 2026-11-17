import express from 'express';
import {
  WhatsAppMessage,
  WhatsAppOtpChallenge,
  Registration,
  Settings,
  Audit,
} from '../models/index.js';
import {
  getAllTemplatesConfig,
  getTemplateName,
  sendAdmitCardWhatsApp,
  sendCertificateWhatsApp,
  sendPaymentReceived,
  retryWhatsAppMessage,
  sendWhatsAppMessage,
  formatWhatsAppPhone,
  isApitxtConfigured,
  dispatchAndLogWhatsApp,
} from '../services/apitxt/index.js';
import { adminRoles } from '../middleware/auth.js';
import axios from 'axios';

const router = express.Router();
const adminOnly = adminRoles('SUPER_ADMIN', 'ADMIN');

/**
 * 1. OVERVIEW & METRICS
 * GET /api/admin/whatsapp/overview
 */
router.get('/overview', async (req, res) => {
  const [
    totalMessages,
    sentCount,
    deliveredCount,
    readCount,
    failedCount,
    pendingCount,
    otpCount,
    admitCardCount,
    certCount,
    totalOtpChallenges,
    verifiedOtpChallenges,
    recentMessages,
  ] = await Promise.all([
    WhatsAppMessage.countDocuments(),
    WhatsAppMessage.countDocuments({ status: { $in: ['SENT', 'DELIVERED', 'READ'] } }),
    WhatsAppMessage.countDocuments({ status: { $in: ['DELIVERED', 'READ'] } }),
    WhatsAppMessage.countDocuments({ status: 'READ' }),
    WhatsAppMessage.countDocuments({ status: 'FAILED' }),
    WhatsAppMessage.countDocuments({ status: 'PENDING' }),
    WhatsAppMessage.countDocuments({ messageType: { $in: ['otp', 'sms_otp'] } }),
    WhatsAppMessage.countDocuments({ messageType: 'admit_card' }),
    WhatsAppMessage.countDocuments({ messageType: 'certificate' }),
    WhatsAppOtpChallenge.countDocuments(),
    WhatsAppOtpChallenge.countDocuments({ verified: true }),
    WhatsAppMessage.find().sort({ createdAt: -1 }).limit(10).lean(),
  ]);

  const deliveryRate =
    sentCount > 0 ? Number(((deliveredCount / sentCount) * 100).toFixed(1)) : 0;
  const readRate =
    deliveredCount > 0 ? Number(((readCount / deliveredCount) * 100).toFixed(1)) : 0;
  const otpSuccessRate =
    totalOtpChallenges > 0
      ? Number(((verifiedOtpChallenges / totalOtpChallenges) * 100).toFixed(1))
      : 0;

  res.json({
    configured: isApitxtConfigured(),
    provider: 'APITxT WhatsApp Business API Gateway',
    metrics: {
      totalMessages,
      sentCount,
      deliveredCount,
      readCount,
      failedCount,
      pendingCount,
      otpCount,
      admitCardCount,
      certCount,
      deliveryRate,
      readRate,
      totalOtpChallenges,
      verifiedOtpChallenges,
      otpSuccessRate,
    },
    recentMessages,
  });
});

/**
 * 2. TEMPLATE SETTINGS & REGISTRY
 * GET /api/admin/whatsapp/templates
 */
router.get('/templates', async (req, res) => {
  const templates = getAllTemplatesConfig();
  res.json({
    templates,
    defaultLanguage: process.env.APITXT_DEFAULT_LANGUAGE || 'hi',
    baseUrl: process.env.APITXT_BASE_URL || 'https://apitxt.com',
  });
});

/**
 * 3. TEST SEND TEMPLATE
 * POST /api/admin/whatsapp/templates/test
 */
router.post('/templates/test', adminOnly, async (req, res) => {
  const { templateKey, mobile, params = [] } = req.body || {};
  if (!mobile) {
    return res.status(400).json({ error: 'Test recipient mobile number is required.' });
  }

  const templateName = getTemplateName(templateKey) || templateKey;
  const normPhone = formatWhatsAppPhone(mobile);

  const result = await sendWhatsAppMessage({
    templateName,
    mobile: normPhone,
    bodyParams: params,
  });

  if (!result.success) {
    return res.status(400).json({
      error: result.error || 'Failed to send test WhatsApp message',
      rawResponse: result.rawResponse,
    });
  }

  await Audit.create({
    actor: String(req.admin._id),
    action: 'WHATSAPP_TEST_SENT',
    details: { templateName, mobile: normPhone },
  });

  res.json({
    success: true,
    message: `Test message sent to ${normPhone} successfully.`,
    requestId: result.requestId,
  });
});

/**
 * 4. MESSAGE HISTORY & SEARCH
 * GET /api/admin/whatsapp/messages
 */
router.get('/messages', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 25));
  const skip = (page - 1) * limit;

  const query = {};
  if (req.query.status) {
    query.status = req.query.status.toUpperCase();
  }
  if (req.query.messageType) {
    query.messageType = req.query.messageType;
  }
  if (req.query.templateName) {
    query.templateName = req.query.templateName;
  }
  if (req.query.search) {
    const s = String(req.query.search).trim();
    query.$or = [
      { recipientPhone: { $regex: s, $options: 'i' } },
      { studentName: { $regex: s, $options: 'i' } },
      { registrationNumber: { $regex: s, $options: 'i' } },
      { providerRequestId: { $regex: s, $options: 'i' } },
    ];
  }

  const [total, messages] = await Promise.all([
    WhatsAppMessage.countDocuments(query),
    WhatsAppMessage.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
  ]);

  res.json({
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    messages,
  });
});

/**
 * 5. RETRY FAILED MESSAGE
 * POST /api/admin/whatsapp/messages/:id/retry
 */
router.post('/messages/:id/retry', adminOnly, async (req, res) => {
  try {
    const result = await retryWhatsAppMessage(req.params.id);
    await Audit.create({
      actor: String(req.admin._id),
      action: 'WHATSAPP_MESSAGE_RETRY',
      details: { messageId: req.params.id, success: result.success },
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * 6. OTP LOGS
 * GET /api/admin/whatsapp/otp-logs
 */
router.get('/otp-logs', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 25));
  const skip = (page - 1) * limit;

  const query = {};
  if (req.query.mobile) {
    query.mobile = { $regex: req.query.mobile.trim(), $options: 'i' };
  }
  if (req.query.verified === 'true') {
    query.verified = true;
  } else if (req.query.verified === 'false') {
    query.verified = false;
  }

  const [total, challenges] = await Promise.all([
    WhatsAppOtpChallenge.countDocuments(query),
    WhatsAppOtpChallenge.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  // Mask sensitive hash/token data for presentation
  const safeChallenges = challenges.map((c) => ({
    _id: c._id,
    mobile: c.mobile,
    attempts: c.attempts,
    verified: c.verified,
    verifiedAt: c.verifiedAt,
    expiresAt: c.expiresAt,
    providerRequestId: c.providerRequestId,
    ipAddress: c.ipAddress,
    createdAt: c.createdAt,
  }));

  res.json({
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    challenges: safeChallenges,
  });
});

/**
 * 7. SEND ADMIT CARD WHATSAPP
 * POST /api/admin/whatsapp/send-admit-card
 */
router.post('/send-admit-card', adminOnly, async (req, res) => {
  const { studentId } = req.body || {};
  if (!studentId) return res.status(400).json({ error: 'Student ID is required' });

  const student = await Registration.findById(studentId);
  if (!student) return res.status(404).json({ error: 'Student registration not found' });
  if (student.status !== 'CONFIRMED' || !student.admitToken) {
    return res.status(400).json({
      error: 'Admit card can only be sent to confirmed registrations with an active token.',
    });
  }

  const settings = await Settings.findById('primary').lean();
  const result = await sendAdmitCardWhatsApp(student, settings);

  await Audit.create({
    actor: String(req.admin._id),
    action: 'WHATSAPP_ADMIT_CARD_SENT',
    registrationId: student._id,
    details: { result },
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error || 'Failed to deliver Admit Card' });
  }

  res.json({
    success: true,
    message: `Admit Card PDF delivered to ${student.guardianPhone} via WhatsApp.`,
    requestId: result.requestId,
  });
});

/**
 * 8. SEND CERTIFICATE WHATSAPP
 * POST /api/admin/whatsapp/send-certificate
 */
router.post('/send-certificate', adminOnly, async (req, res) => {
  const { studentId, isTopper = false, position = 'Merit Position' } = req.body || {};
  if (!studentId) return res.status(400).json({ error: 'Student ID is required' });

  const student = await Registration.findById(studentId);
  if (!student) return res.status(404).json({ error: 'Student registration not found' });
  if (student.status !== 'CONFIRMED') {
    return res.status(400).json({ error: 'Certificate requires confirmed registration.' });
  }

  const settings = await Settings.findById('primary').lean();
  const result = await sendCertificateWhatsApp(student, settings, isTopper, position);

  await Audit.create({
    actor: String(req.admin._id),
    action: 'WHATSAPP_CERTIFICATE_SENT',
    registrationId: student._id,
    details: { isTopper, position, result },
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error || 'Failed to deliver Certificate' });
  }

  await Registration.findByIdAndUpdate(student._id, {
    $set: {
      certificateStatus: 'SENT',
      certificateIssuedAt: new Date(),
      certificateSentTo: student.guardianPhone,
      certificateError: '',
    },
  });

  res.json({
    success: true,
    message: `Certificate PDF delivered to ${student.guardianPhone} via WhatsApp.`,
    requestId: result.requestId,
  });
});

/**
 * 9. BULK CAMPAIGN DISPATCH
 * POST /api/admin/whatsapp/bulk-send
 */
router.post('/bulk-send', adminOnly, async (req, res) => {
  const {
    targetAudience, // 'all_confirmed', 'class_wise', 'selected_ids', 'attendance_present'
    studentClass,
    selectedIds = [],
    templateKey,
    campaignTitle = 'Bulk WhatsApp Campaign',
  } = req.body || {};

  if (!templateKey) {
    return res.status(400).json({ error: 'Template selection is required.' });
  }

  const templateName = getTemplateName(templateKey) || templateKey;

  // Build recipient filter query
  const query = { status: 'CONFIRMED' };
  if (targetAudience === 'class_wise' && studentClass) {
    query.studentClass = String(studentClass).trim();
  } else if (targetAudience === 'selected_ids' && Array.isArray(selectedIds) && selectedIds.length > 0) {
    query._id = { $in: selectedIds };
  } else if (targetAudience === 'attendance_present') {
    query.checkInAt = { $ne: null };
  }

  const recipients = await Registration.find(query).limit(500).lean();
  if (!recipients.length) {
    return res.status(400).json({ error: 'No recipients matched the selected criteria.' });
  }

  const campaignId = `CAMP-${Date.now()}`;
  const settings = await Settings.findById('primary').lean();

  let queuedCount = 0;
  let successCount = 0;
  let failCount = 0;

  // Asynchronously execute bulk sending with safe pacing (50ms gap)
  (async () => {
    for (const student of recipients) {
      if (!student.guardianPhone) continue;
      queuedCount++;

      try {
        let dispatchResult;
        if (templateKey === 'ADMIT_CARD') {
          dispatchResult = await sendAdmitCardWhatsApp(student, settings);
        } else if (templateKey === 'PARTICIPATION_CERTIFICATE' || templateKey === 'TOPPER_CERTIFICATE') {
          dispatchResult = await sendCertificateWhatsApp(student, settings, templateKey === 'TOPPER_CERTIFICATE');
        } else if (templateKey === 'PAYMENT_RECEIVED') {
          dispatchResult = await sendPaymentReceived(student, {
            amount: 149,
            providerPaymentId: student.paymentId || 'SUBMITTED',
          });
        } else {
          // Standard utility template dispatch
          const bodyParams = [
            student.guardianName || 'Parent',
            student.studentName,
            `Class ${student.studentClass}`,
            student.registrationNumber || student.applicationRef || 'N/A',
          ];
          dispatchResult = await dispatchAndLogWhatsApp({
            recipientPhone: student.guardianPhone,
            studentId: student._id,
            registrationId: student._id,
            registrationNumber: student.registrationNumber || student.applicationRef || '',
            studentName: student.studentName,
            studentClass: student.studentClass,
            templateName,
            messageType: 'bulk',
            campaignId,
            bodyParams,
            metadata: { campaignTitle, targetAudience },
          });
        }

        if (dispatchResult.success) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (e) {
        failCount++;
      }

      // Safe sleep 50ms between sends to avoid rate spikes
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    console.log(
      `[APITXT BULK] Campaign ${campaignId} completed: ${successCount} sent, ${failCount} failed of ${queuedCount} recipients.`,
    );
  })().catch((err) => console.error('[APITXT BULK] Error in campaign queue:', err));

  await Audit.create({
    actor: String(req.admin._id),
    action: 'WHATSAPP_BULK_INITIATED',
    details: { campaignId, campaignTitle, targetAudience, recipientCount: recipients.length },
  });

  res.json({
    success: true,
    campaignId,
    message: `Campaign initiated for ${recipients.length} recipients. Messages are processing in background.`,
    recipientCount: recipients.length,
  });
});

/**
 * 10. CONNECTION & CREDENTIAL DIAGNOSTICS
 * GET /api/admin/whatsapp/connection-test
 */
router.get('/connection-test', async (req, res) => {
  const configured = isApitxtConfigured();
  const authKey = process.env.APITXT_AUTH_KEY;
  const baseUrl = process.env.APITXT_BASE_URL || 'https://apitxt.com';
  const apiKeyPresent = !!process.env.APITXT_API_KEY;
  const projectRefId = process.env.APITXT_PROJECT_REF_ID || 'None';

  let pingSuccess = false;
  let pingMessage = '';

  try {
    const probe = await axios.get(baseUrl, { timeout: 5000 });
    pingSuccess = probe.status === 200 || probe.status === 301 || probe.status === 302;
    pingMessage = `Provider endpoint reached (${probe.status})`;
  } catch (e) {
    pingMessage = e.message || 'Endpoint ping failed';
  }

  res.json({
    configured,
    status: configured ? 'ACTIVE' : 'INCOMPLETE_CONFIGURATION',
    provider: 'APITxT',
    baseUrl,
    authKeyConfigured: !!authKey,
    authKeyPreview: authKey ? `${authKey.slice(0, 6)}...${authKey.slice(-4)}` : 'MISSING',
    apiKeyPresent,
    projectRefId,
    endpointReachability: {
      success: pingSuccess,
      message: pingMessage,
    },
    approvedTemplates: [
      'shree_otp_verification',
      'shree_payment_received',
      'shree_olympiad_admit_card',
      'shree_student_certificates_flow',
    ],
  });
});

export default router;

