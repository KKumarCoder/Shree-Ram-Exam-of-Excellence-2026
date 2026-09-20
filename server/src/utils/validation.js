import { z } from 'zod';
const cleaned = (max=120) => z.string().trim().min(1).max(max);
export const phone = z.string().trim().regex(/^[6-9][0-9]{9}$/,'Enter a valid 10-digit Indian mobile number');
export const startSchema = z.object({studentName:cleaned(),dob:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),studentClass:z.string().regex(/^(?:[1-9]|1[0-2])$/),currentSchool:cleaned(),guardianName:cleaned(),guardianPhone:phone,email:z.union([z.literal(''),z.string().email().max(150)]).default(''),address:cleaned(300),city:cleaned(),district:cleaned(),state:cleaned(),pincode:z.string().regex(/^[1-9][0-9]{5}$/),purpose:z.string().trim().max(500).default(''),consent:z.literal(true)}).strict();
export const otpSchema = z.object({otp:z.string().regex(/^\d{6}$/)});
export const manualSchema = z.object({utr:z.string().trim().regex(/^[a-zA-Z0-9\-]{8,40}$/),termsAccepted:z.union([z.literal('true'),z.literal(true)])});
export const lookupSchema = z.object({registrationNumber:z.string().regex(/^(?:SHREE26-[0-9]{6}|APP-[A-F0-9]{10})$/),phone});
export function parse(schema, value){const result=schema.safeParse(value);if(!result.success){const detail=result.error.issues.map(x=>`${x.path.join('.')||'input'}: ${x.message}`).join('; ');const err=new Error(detail);err.status=400;throw err;}return result.data;}
export function safeCsv(value){const s=String(value??'').replace(/"/g,'""');return `"${/^[\s]*[=+\-@]/.test(s)?"'"+s:s}"`;}
export function requireConfigured(value,name){if(!value){const e=new Error(`${name} is not configured.`);e.status=503;throw e;}return value;}
