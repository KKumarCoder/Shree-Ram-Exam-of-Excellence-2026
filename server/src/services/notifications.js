import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import { Challenge, Notification } from '../models/index.js';
import { requireConfigured } from '../utils/validation.js';
export const otpHash=(id,otp)=>crypto.createHmac('sha256',process.env.OTP_PEPPER).update(`${id}:${otp}`).digest('hex');
export async function sendSMS(phone,text,templateId=''){
 if(process.env.OTP_DELIVERY==='dev'&&process.env.NODE_ENV!=='production')return {dev:true};
 const url=requireConfigured(process.env.SMS_API_URL,'SMS_API_URL');const token=requireConfigured(process.env.SMS_API_TOKEN,'SMS_API_TOKEN');
 const header=process.env.SMS_AUTH_HEADER||'Authorization';const prefix=process.env.SMS_AUTH_PREFIX||'Bearer';
 // Adapt this JSON payload to the exact contract provided by your authorized SMS/WhatsApp vendor.
 const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',[header]:`${prefix} ${token}`.trim()},body:JSON.stringify({to:`91${phone}`,sender:process.env.SMS_SENDER||undefined,templateId:templateId||undefined,message:text}),signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw new Error('The messaging provider rejected the request.');return {sent:true};
}
export async function sendOtp(registration,purpose){
 const prior=await Challenge.findOne({registrationId:registration._id,purpose}).sort({lastSentAt:-1});
 if(prior?.lastSentAt && Date.now()-prior.lastSentAt.getTime()<60000){const err=new Error('Wait 60 seconds before requesting another OTP.');err.status=429;throw err;}
 const otp=String(crypto.randomInt(0,1000000)).padStart(6,'0');
 const challenge=new Challenge({phone:registration.guardianPhone,registrationId:registration._id,purpose,hash:'pending',lastSentAt:new Date(),expiresAt:new Date(Date.now()+5*60000)});
 challenge.hash=otpHash(challenge._id,otp);
 const text=`SHREE 2026 OLYMPIAD: Your verification code is ${otp}. Valid for 5 minutes. Do not share it.`;
 const result=await sendSMS(registration.guardianPhone,text,process.env.SMS_TEMPLATE_ID);
 await challenge.save();
 // Only local development can receive a test OTP; no production bypass.
 return result.dev?{message:'Development OTP generated.',devOtp:otp}:{message:'OTP sent to your registered mobile.'};
}
export async function verifyOtp(registration,purpose,otp){
 const challenge=await Challenge.findOne({registrationId:registration._id,purpose,verifiedAt:null,expiresAt:{$gt:new Date()}}).sort({lastSentAt:-1});
 if(!challenge){const e=new Error('OTP expired. Request a new code.');e.status=400;throw e;}
 if(challenge.attempts>=5){const e=new Error('Too many attempts. Request a new OTP.');e.status=429;throw e;}
 const expected=Buffer.from(challenge.hash,'hex'),actual=Buffer.from(otpHash(challenge._id,otp),'hex');
 const matches=expected.length===actual.length&&crypto.timingSafeEqual(expected,actual);
 if(!matches){challenge.attempts+=1;await challenge.save();const e=new Error('Incorrect OTP.');e.status=400;throw e;}
 challenge.verifiedAt=new Date();await challenge.save();return true;
}
export async function notifyConfirmed(registration){
 const msg=`SHREE 2026 OLYMPIAD: Registration ${registration.registrationNumber} for ${registration.studentName} is confirmed. Download admit card from the official portal.`;
 if(registration.email && process.env.SMTP_HOST){try{const transporter=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:Number(process.env.SMTP_PORT)===465,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});await transporter.sendMail({from:process.env.SMTP_FROM||process.env.SMTP_USER,to:registration.email,subject:'SHREE Olympiad registration confirmed',text:msg});await Notification.create({registrationId:registration._id,channel:'email',status:'SENT'});}catch(e){await Notification.create({registrationId:registration._id,channel:'email',status:'FAILED',detail:e.message.substring(0,180)});}}
 // Confirmation SMS uses configured provider, not a WhatsApp template assumed to exist.
 if(process.env.SMS_API_URL && process.env.SMS_API_TOKEN){try{await sendSMS(registration.guardianPhone,msg);await Notification.create({registrationId:registration._id,channel:'sms',status:'SENT'});}catch(e){await Notification.create({registrationId:registration._id,channel:'sms',status:'FAILED',detail:e.message.substring(0,180)});}}
}
