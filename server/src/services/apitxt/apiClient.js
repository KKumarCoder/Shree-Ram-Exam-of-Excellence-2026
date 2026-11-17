import axios from 'axios';
import { logSafeError } from './errorHandler.js';

/**
 * Normalizes Indian phone numbers into APITxT WhatsApp format: 91XXXXXXXXXX
 * APITxT expects country code without leading '+' or '0'.
 */
export function formatWhatsAppPhone(phone) {
  if (!phone || typeof phone !== 'string') return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  if (digits.length > 10) return digits.slice(-12);
  return digits;
}

/**
 * Resolves the full URL for APITxT sendWA endpoint.
 */
function getSendWAUrl() {
  const configured = (process.env.APITXT_BASE_URL || 'https://apitxt.com').trim();
  if (configured.endsWith('/api/sendWA')) {
    return configured;
  }
  const base = configured.replace(/\/+$/, '');
  return `${base}/api/sendWA`;
}

/**
 * Resolves project_ref_id for a template, checking template-specific env vars first,
 * then falling back to default APITXT_PROJECT_REF_ID.
 */
export function getProjectRefIdForTemplate(templateName) {
  if (!templateName) return process.env.APITXT_PROJECT_REF_ID || '';
  const clean = String(templateName).trim();
  const specific =
    process.env[`APITXT_PROJECT_REF_ID_${clean}`] ||
    process.env[`APITXT_PROJECT_REF_ID_${clean.toLowerCase()}`];
  if (specific) return specific.trim();
  if (process.env.APITXT_PROJECT_REF_ID && process.env.APITXT_PROJECT_REF_ID.trim()) {
    return process.env.APITXT_PROJECT_REF_ID.trim();
  }
  return (
    process.env.APITXT_PROJECT_REF_ID_shree_olympiad_admit_card ||
    process.env.APITXT_PROJECT_REF_ID_shree_olympiad_certificate ||
    ''
  ).trim();
}

/**
 * Resolves template_ref_id / template_id if configured in environment.
 */
export function getTemplateRefIdForTemplate(templateName) {
  if (!templateName) return '';
  const clean = String(templateName).trim();
  const specific =
    process.env[`APITXT_TEMPLATE_REF_ID_${clean}`] ||
    process.env[`APITXT_TEMPLATE_REF_ID_${clean.toLowerCase()}`];
  return specific ? specific.trim() : '';
}

/**
 * Checks whether APITxT is enabled and configured in server environment.
 */
export function isApitxtConfigured() {
  const enabled = process.env.APITXT_ENABLED !== 'false';
  const hasAuth = !!process.env.APITXT_AUTH_KEY;
  return enabled && hasAuth;
}

/**
 * Low-level APITxT WhatsApp post request.
 *
 * Official APITxT payload schema:
 * {
 *   authkey: "...",
 *   template_name: "...",
 *   project_ref_id: "...",
 *   mobiles: "919999999999",
 *   body_params: ["param1", "param2"],
 *   header_params: ["param"], // or media_url for documents
 *   media_url: "https://...",
 *   filename: "doc.pdf",
 *   button_params: ["code"]
 * }
 */
export async function sendWhatsAppMessage({
  templateName,
  mobile,
  bodyParams = [],
  headerParams = [],
  buttonParams = [],
  mediaUrl = '',
  filename = '',
  language = '',
}) {
  if (!isApitxtConfigured()) {
    return {
      success: false,
      skipped: true,
      error: 'APITxT service is disabled or APITXT_AUTH_KEY is not configured.',
    };
  }

  const normalizedMobile = formatWhatsAppPhone(mobile);
  if (!normalizedMobile || normalizedMobile.length < 11) {
    return {
      success: false,
      error: `Invalid recipient phone number: ${mobile}`,
    };
  }

  const endpoint = getSendWAUrl();
  const payload = {
    authkey: process.env.APITXT_AUTH_KEY,
    template_name: templateName,
    mobiles: normalizedMobile,
    body_params: bodyParams.map((p) => String(p ?? '')),
  };

  const projectRefId = getProjectRefIdForTemplate(templateName);
  if (projectRefId) {
    payload.project_ref_id = projectRefId;
  }

  const templateRefId = getTemplateRefIdForTemplate(templateName);
  if (templateRefId) {
    payload.template_id = templateRefId;
    payload.template_ref_id = templateRefId;
  }

  if (language) {
    payload.language = language;
  }

  // Header parameters per APITxT Developer Hub specification
  if (headerParams && headerParams.length > 0) {
    payload.header_params = headerParams.map((p) => String(p ?? ''));
    if (!mediaUrl && !payload.header_text && typeof headerParams[0] === 'string') {
      payload.header_text = headerParams[0];
    }
  }

  if (buttonParams && buttonParams.length > 0) {
    payload.button_params = buttonParams.map((p) => String(p ?? ''));
    if (typeof buttonParams[0] === 'string') {
      payload.url_button_0 = buttonParams[0];
    }
  }

  // Document/Media parameters per APITxT Developer Hub specification
  if (mediaUrl) {
    payload.media_url = mediaUrl;
    payload.header_document_url = mediaUrl;
  }

  if (filename) {
    payload.filename = filename;
    payload.header_document_filename = filename;
  }

  const headers = {
    'Content-Type': 'application/json',
  };

  if (process.env.APITXT_API_KEY && process.env.APITXT_API_KEY.trim()) {
    headers.Authorization = `Bearer ${process.env.APITXT_API_KEY.trim()}`;
  }

  try {
    const response = await axios.post(endpoint, payload, {
      headers,
      timeout: 15000, // 15 seconds safe timeout
    });

    const data = response.data || {};
    // APITxT returns status: 200 or status: "success" or { status: 1, message: "success", request_id: "..." }
    const hasFailedStatus =
      data.status === 400 ||
      data.status === '400' ||
      data.status === 'failed' ||
      data.message === 'failed' ||
      (typeof data.failed === 'number' && data.failed > 0);

    const isSuccess =
      response.status === 200 &&
      !hasFailedStatus &&
      (data.status === 200 ||
        data.status === 'success' ||
        data.status === 1 ||
        data.status === '1' ||
        data.message === 'success' ||
        (typeof data.sent === 'number' && data.sent > 0));

    const requestId =
      data.request_id ||
      data.requestId ||
      data.msgId ||
      data.message_id ||
      `REQ-${Date.now()}`;

    const failureDetail =
      Array.isArray(data.details) && data.details.find((d) => d.status === 'Failed' || d.error);
    const failureError =
      failureDetail?.error || data.message || data.error || 'APITxT rejected request';

    return {
      success: isSuccess,
      requestId,
      providerMessageId: data.msgId || data.message_id || requestId,
      rawResponse: data,
      error: isSuccess ? null : failureError,
    };
  } catch (error) {
    logSafeError(`SendWA failed for template ${templateName}`, error);
    return {
      success: false,
      error: error.response?.data?.message || error.message || 'APITxT HTTP send error',
      rawResponse: error.response?.data || null,
    };
  }
}

/**
 * Sends normal text SMS OTP using APITxT /api/sendOTP (channel: 'SMS')
 * or /api/sendMsg (if custom DLT parameters are configured).
 */
export async function sendSmsOtp({ mobile, otp }) {
  if (!isApitxtConfigured()) {
    return {
      success: false,
      skipped: true,
      error: 'APITxT service is disabled or APITXT_AUTH_KEY is not configured.',
    };
  }

  const normalizedMobile = formatWhatsAppPhone(mobile);
  if (!normalizedMobile || normalizedMobile.length < 11) {
    return {
      success: false,
      error: `Invalid recipient phone number: ${mobile}`,
    };
  }

  const tenDigitMobile = normalizedMobile.slice(-10);

  // If custom DLT parameters are configured in .env, support custom DLT via /api/sendMsg
  if (process.env.APITXT_SMS_SENDER && process.env.APITXT_SMS_TEMPLATE_ID) {
    try {
      const sendMsgUrl = (process.env.APITXT_API_URL_SMS_OTP || 'https://apitxt.com/api/sendMsg').trim();
      const payload = {
        authkey: process.env.APITXT_AUTH_KEY,
        mobiles: tenDigitMobile,
        message: process.env.APITXT_SMS_MESSAGE_TEMPLATE
          ? process.env.APITXT_SMS_MESSAGE_TEMPLATE.replace('{#var#}', otp).replace('{otp}', otp)
          : `Your OTP for Shree Olympiad verification is ${otp}. Valid for 5 minutes.`,
        sender: process.env.APITXT_SMS_SENDER,
        route: process.env.APITXT_SMS_ROUTE || '4',
        template_id: process.env.APITXT_SMS_TEMPLATE_ID,
      };
      if (process.env.APITXT_SMS_PE_ID) {
        payload.pe_id = process.env.APITXT_SMS_PE_ID;
      }
      const resp = await axios.post(sendMsgUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
      });
      const data = resp.data || {};
      if (resp.status === 200 && (data.status === 200 || data.status === 'success' || data.request_id)) {
        return {
          success: true,
          requestId: data.request_id || `SMS-${Date.now()}`,
          rawResponse: data,
        };
      }
    } catch (err) {
      logSafeError('sendMsg custom DLT failed, falling back to sendOTP', err);
    }
  }

  // Primary APITxT OTP Endpoint: POST https://apitxt.com/api/sendOTP
  // Uses WhatsApp channel with country: "91" by default for 100% instant reliable delivery,
  // or falls back to SMS if APITXT_OTP_CHANNEL is explicitly set to "sms".
  try {
    const endpoint = 'https://apitxt.com/api/sendOTP';
    const otpChannel = (process.env.APITXT_OTP_CHANNEL || 'whatsapp').toLowerCase();
    const params = new URLSearchParams({
      authkey: process.env.APITXT_AUTH_KEY,
      mobile: normalizedMobile,
      otp: String(otp),
      channel: otpChannel,
      country: '91',
    });
    const response = await axios.post(endpoint, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000,
    });
    const data = response.data || {};
    const isSuccess =
      response.status === 200 &&
      (data.status === 'success' ||
        data.status === 200 ||
        (data.message && String(data.message).toLowerCase().includes('successfully')));

    const requestId =
      data.data?.request_id ||
      data.request_id ||
      `${otpChannel.toUpperCase()}-OTP-${Date.now()}`;

    return {
      success: isSuccess,
      requestId,
      channel: otpChannel,
      rawResponse: data,
      error: isSuccess ? null : (data.message || 'Failed to dispatch OTP'),
    };
  } catch (error) {
    logSafeError('sendOTP delivery error', error);
    return {
      success: false,
      error: error.response?.data?.message || error.message || 'APITxT OTP HTTP error',
      rawResponse: error.response?.data || null,
    };
  }
}
