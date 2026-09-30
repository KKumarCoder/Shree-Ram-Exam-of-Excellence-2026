import nodemailer from 'nodemailer';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { otpDevMode, otpError, assertOtpEnabled } from './otpSecurity.js';
export const normalizeEmail = value => {
  const parsed = z.string().trim().toLowerCase().max(150).email().safeParse(value);
  if (!parsed.success) throw otpError('A valid email address is required. Please update your email or contact the school.');
  return parsed.data;
};
export const maskEmail = email => { const [name, domain] = email.split('@'); return `${name[0]}***@${domain}`; };
export function validateEmailEnvironment() {
  for (const key of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM']) {
    if (!process.env[key] || /^(YOUR_|REPLACE|placeholder)/i.test(process.env[key])) throw new Error(`${key} is not configured.`);
  }
  if (![465, 587].includes(Number(process.env.SMTP_PORT))) throw new Error('SMTP_PORT must be 465 or 587.');
}
export function createMailTransport() {
  validateEmailEnvironment();
  return nodemailer.createTransport({host:process.env.SMTP_HOST, port:Number(process.env.SMTP_PORT),
    secure:Number(process.env.SMTP_PORT) === 465, requireTLS:true,
    auth:{user:process.env.SMTP_USER, pass:process.env.SMTP_PASS},
    connectionTimeout:10000, greetingTimeout:10000, socketTimeout:15000});
}
export async function sendMail(message) {
  const transport = createMailTransport();
  let timer;
  try {
    const result = await Promise.race([
      transport.sendMail({...message, from:process.env.SMTP_FROM}),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('SMTP timeout')), 12000); }),
    ]);
    if (!result.accepted?.length || result.rejected?.length) throw new Error('Recipient rejected');
    return result;
  } finally { clearTimeout(timer); transport.close(); }
}
export async function sendOTP(email, code, seconds) {
  assertOtpEnabled();
  const to = normalizeEmail(email);
  if (!/^\d{6}$/.test(code)) throw otpError('Enter a six-digit OTP.');
  if (otpDevMode()) {
    console.log(`[DEV OTP] ${maskEmail(to)} => ${code}`);
    return {messageId:`dev-${randomUUID()}`};
  }
  try {
    const result = await sendMail({to, subject:'SHREE Olympiad verification code',
      text:`Your SHREE Olympiad verification code is ${code}. It expires in ${Math.max(1, Math.ceil(seconds / 60))} minutes. Never share this code. If you did not request it, ignore this email.`});
    return {messageId:result.messageId};
  } catch { throw otpError('Email could not be sent. Please try again shortly or contact the school.', 502); }
}
