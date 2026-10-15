import crypto from 'node:crypto';

/**
 * Normalizes a student's name by trimming, collapsing multiple spaces,
 * and converting to uppercase Unicode.
 */
export function normalizeStudentName(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

/**
 * Normalizes Indian mobile number to 10 digits.
 */
export function normalizePhone(phone) {
  if (!phone || typeof phone !== 'string') return '';
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

/**
 * Generates a deterministic SHA-256 hash for student identity.
 * Components: event ID, guardian phone, normalized student name, DOB, and student class.
 * This guarantees:
 * - Siblings have distinct hashes (differ in name or DOB or class).
 * - Twins have distinct hashes (differ in student name).
 * - Duplicate submissions for the exact same child produce an identical hash.
 */
export function generateStudentIdentityHash({
  examId = 'SHREE27',
  guardianPhone,
  studentName,
  dob,
  studentClass,
}) {
  const normName = normalizeStudentName(studentName);
  const normPhone = normalizePhone(guardianPhone);
  const normDob = String(dob || '').trim();
  const normClass = String(studentClass || '').trim();

  const payload = `${examId}|${normPhone}|${normName}|${normDob}|${normClass}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Normalizes UTR transaction reference:
 * - Trims whitespace
 * - Converts to uppercase
 * - Strips all non-alphanumeric characters (e.g. dashes, spaces)
 */
export function normalizeUtr(utr) {
  if (!utr || typeof utr !== 'string') return '';
  return utr.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}
