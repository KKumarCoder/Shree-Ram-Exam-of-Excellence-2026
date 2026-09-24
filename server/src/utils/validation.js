import { z } from 'zod';
import { normalizeIndianMobile } from './mobile.js';
const cleaned = (max=120) => z.string().trim().min(1).max(max).transform(value => value.toUpperCase()).pipe(z.string().max(max));
export const phone = z.string().max(30).transform((value, ctx) => {
  try { return normalizeIndianMobile(value).slice(3); }
  catch { ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid Indian mobile number' }); return z.NEVER; }
});
const letters = /^[\p{L}\p{M} ]+$/u;
const location = /^[\p{L}\p{M} .'-]+$/u;
const readable = /^[\p{L}\p{M}\p{N} .,()'&/#:+-]+$/u;
const hasLetters = value => /\p{L}/u.test(value);
const name = cleaned().refine(value => letters.test(value) && value.replace(/ /g, '').length >= 2, 'Use at least two letters; only letters and spaces are allowed.');
const place = cleaned().refine(value => location.test(value) && hasLetters(value), 'Enter a place name using letters, spaces, dots, apostrophes or hyphens.');
export const startSchema = z.object({
  studentName: name,
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const date = new Date(value + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value && date <= new Date() && date.getUTCFullYear() >= 1995;
  }, 'Enter a real date of birth between 1995 and today.'),
  studentClass: z.string().regex(/^(?:[1-9]|1[0-2])$/, 'Select a class from 1 to 12.'),
  currentSchool: name,
  guardianName: name,
  guardianPhone: z.string().regex(/^[6-9][0-9]{9}$/, 'Enter a 10-digit mobile number starting with 6, 7, 8 or 9.'),
  email: z.string().trim().max(150).refine(value => value === '' || z.string().email().safeParse(value).success, 'Enter a valid email address, such as name@gmail.com.').default(''),
  address: cleaned(300).refine(value => readable.test(value) && hasLetters(value) && value.length >= 5, 'Enter a full address of at least 5 characters, including letters.'),
  city: name, district: name, state: place,
  pincode: z.string().regex(/^[1-9][0-9]{5}$/, 'Enter a six-digit PIN code that does not start with 0.'),
  purpose: z.string().trim().max(500).default('').transform(value => value.toUpperCase()).pipe(z.string().max(500)).refine(value => value === '' || (readable.test(value) && hasLetters(value)), 'Use words to describe your purpose of participation.'),
  consent: z.literal(true),
}).strict();
export const otpSchema = z.object({otp:z.string().regex(/^\d{6}$/)});
export const manualSchema = z.object({utr:z.string().trim().regex(/^[a-zA-Z0-9\-]{8,40}$/),termsAccepted:z.union([z.literal('true'),z.literal(true)])});
export const lookupSchema = z.object({registrationNumber:z.string().regex(/^(?:SHREE26-[0-9]{6}|APP-[A-F0-9]{10})$/),phone});
export function parse(schema, value){const result=schema.safeParse(value);if(!result.success){const detail=result.error.issues.map(x=>`${x.path.join('.')||'input'}: ${x.message}`).join('; ');const err=new Error(detail);err.status=400;throw err;}return result.data;}
export function safeCsv(value){const s=String(value??'').replace(/"/g,'""');return `"${/^[\s]*[=+\-@]/.test(s)?"'"+s:s}"`;}
export function requireConfigured(value,name){if(!value){const e=new Error(`${name} is not configured.`);e.status=503;throw e;}return value;}
