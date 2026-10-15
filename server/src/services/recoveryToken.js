import crypto from 'node:crypto';

/**
 * Resolves the verified production frontend URL from configuration.
 * Never uses unverified hardcoded routes.
 * @returns {string}
 */
export function getClientBaseUrl() {
  const origin = process.env.CLIENT_ORIGIN || process.env.FRONTEND_URL || process.env.CLIENT_URL;
  if (origin && !/^(YOUR_|placeholder)/i.test(origin)) {
    return origin.replace(/\/+$/, '');
  }
  return 'http://localhost:5173';
}

/**
 * Hashes an opaque raw token using SHA-256.
 * The server stores only this hash, never the raw token.
 * @param {string} rawToken
 * @returns {string}
 */
export function hashRecoveryToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return '';
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Generates an opaque, cryptographically secure recovery token.
 * Returns raw token for email transmission, SHA-256 hash for DB storage, and expiry Date.
 * @param {number} [expiryDays]
 * @returns {{ rawToken: string, tokenHash: string, expiresAt: Date }}
 */
export function generateRecoveryToken(expiryDays) {
  const days = Number(expiryDays || process.env.RECOVERY_TOKEN_EXPIRY_DAYS || 7);
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashRecoveryToken(rawToken);
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return { rawToken, tokenHash, expiresAt };
}

/**
 * Generates the full resume link using the client origin.
 * @param {string} rawToken
 * @returns {string}
 */
export function buildResumeUrl(rawToken) {
  return `${getClientBaseUrl()}/register?recoveryToken=${encodeURIComponent(rawToken)}`;
}

/**
 * Generates the opt-out URL for reminder unsubscription.
 * @param {string} rawToken
 * @returns {string}
 */
export function buildOptOutUrl(rawToken) {
  return `${getClientBaseUrl()}/register?optOutToken=${encodeURIComponent(rawToken)}`;
}
