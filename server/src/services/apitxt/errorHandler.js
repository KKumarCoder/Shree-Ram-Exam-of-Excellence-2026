/**
 * APITxT Error Handler & Sanitizer
 * Ensures no private student data, API keys, auth headers, or OTP secrets
 * are leaked into console logs or error responses.
 */

const SENSITIVE_KEYS = [
  'authkey',
  'authorization',
  'api_key',
  'apikey',
  'otp',
  'code',
  'password',
  'secret',
  'token',
];

/**
 * Recursively sanitizes objects to remove sensitive tokens and secrets.
 */
export function sanitizeData(data) {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeData(item));
  }
  const safe = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.some((s) => lowerKey.includes(s))) {
      safe[key] = '***REDACTED***';
    } else if (typeof value === 'object' && value !== null) {
      safe[key] = sanitizeData(value);
    } else {
      safe[key] = value;
    }
  }
  return safe;
}

/**
 * Standardizes APITxT error message for safe administrative display.
 */
export function formatApiError(error) {
  if (!error) return 'Unknown APITxT error';
  if (error.response) {
    const status = error.response.status;
    const data = error.response.data;
    const msg =
      data?.message ||
      data?.error ||
      data?.status_message ||
      `HTTP error ${status}`;
    return `APITxT [${status}]: ${msg}`;
  }
  if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
    return 'APITxT request timed out (15s exceeded)';
  }
  return error.message || 'APITxT network error';
}

/**
 * Safe logging helper
 */
export function logSafeError(prefix, error) {
  const sanitizedMsg = formatApiError(error);
  console.error(`[APITXT] ${prefix}:`, sanitizedMsg);
}

