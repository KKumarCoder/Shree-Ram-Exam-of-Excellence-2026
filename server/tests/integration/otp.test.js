import 'express-async-errors';
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import cookieParser from 'cookie-parser';
import { v2 as cloudinary } from 'cloudinary';
import { Writable } from 'node:stream';
import { PDFDocument } from 'pdf-lib';
import QRCode from 'qrcode';
import { sweepMedia } from '../../src/services/media.js';
import adminRoutes from '../../src/routes/admin.js';
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import { notifyConfirmed, processNotificationQueue } from '../../src/services/notifications.js';
import { once } from 'node:events';
import { Admin, Registration, Challenge, OtpBucket, OtpLock, Settings, Payment, Counter, Audit, Notification, MediaAsset } from '../../src/models/index.js';
import { createOtpService } from '../../src/services/registrationOTP.js';
import { limit, persistentLimiter } from '../../src/services/otpSecurity.js';
import { issueToken } from '../../src/middleware/auth.js';
import { confirmRegistration } from '../../src/services/confirm.js';
import routes from '../../src/routes/public.js';
import { errorHandler } from '../../src/middleware/errors.js';
const uri = process.env.OTP_TEST_MONGODB_URI;
if (!uri || !/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\/shree_otp_test(?:\?|$)/.test(uri)) throw new Error('Set OTP_TEST_MONGODB_URI to a local shree_otp_test database; application databases are forbidden.');
Object.assign(process.env, { CLOUDINARY_CLOUD_NAME: 'test-cloud', CLOUDINARY_API_KEY: '12345', CLOUDINARY_API_SECRET: 'test-secret' });
process.env.OTP_PEPPER = 'test-only-pepper'.repeat(4);
process.env.JWT_SECRET = 'test-only-jwt'.repeat(4);
Object.assign(process.env, {SMTP_HOST:'smtp.example.com',SMTP_PORT:'587',SMTP_USER:'test@example.com',SMTP_PASS:'test-secret',SMTP_FROM:'test@example.com'});
process.env.BREVO_SMS_SENDER = 'Shree';
let code, calls, failure, server, base, originalTransport, sentMessages, smtpFailure;
let originalUpload, originalDestroy, originalFetch;
let storedMedia = new Map(), cloudFailure = false, cleanupFailure = false;
const wrongCode = () => code === "000000" ? "111111" : "000000";
const messageId = '1511882900176220';
const provider = {
  async sendOTP(phone, value) { calls++; code = value; if (failure) throw failure; return { messageId }; },
};
const service = createOtpService(provider);
const good = {studentName:'Test Student',dob:'2013-02-12',studentClass:'7',currentSchool:'Test School',guardianName:'Test Guardian',guardianPhone:'9876543210',email:'student@example.com',address:'Test Road',city:'Kanhra',district:'Dadri',state:'Haryana',pincode:'127306',purpose:'',consent:true};
const draft = (extra={}) => Registration.create({ ...good, applicationRef: `APP-${crypto.randomBytes(5).toString('hex').toUpperCase()}`, ...extra });
async function request(route, token, body, method='POST') {
  const response = await fetch(base + route, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type':'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: response.headers.get('content-type')?.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer()) };
}
before(async () => {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 });
  await Promise.all(Object.values(mongoose.models).map(m => m.init()));
  originalUpload = cloudinary.uploader.upload_stream;
  originalDestroy = cloudinary.uploader.destroy;
  originalFetch = globalThis.fetch;
  cloudinary.uploader.upload_stream = (options, callback) => {
    const chunks = [];
    return new Writable({ write(chunk, enc, done) { chunks.push(chunk); done(); }, final(done) {
      if (cloudFailure) callback(new Error('provider secret must not leak'));
      else {
        assert.equal(options.type, 'authenticated'); assert.equal(options.overwrite, false);
        const buffer = Buffer.concat(chunks); storedMedia.set(options.public_id, buffer);
        callback(null, { public_id: options.public_id, bytes: buffer.length });
      }
      done();
    } });
  };
  cloudinary.uploader.destroy = async id => {
    if (cleanupFailure) throw new Error('provider unavailable');
    const existed = storedMedia.delete(id); return { result: existed ? 'ok' : 'not found' };
  };
  globalThis.fetch = async (input, init) => {
    const url = new URL(input);
    if (url.hostname === 'api.cloudinary.com') {
      assert.equal(url.searchParams.get('type'), 'authenticated');
      const body = storedMedia.get(url.searchParams.get('public_id'));
      return new Response(body || 'missing', { status: body ? 200 : 404 });
    }
    return originalFetch(input, init);
  };
  originalTransport = nodemailer.createTransport;
  nodemailer.createTransport = () => ({async sendMail(message) {
    if (smtpFailure) throw new Error('private SMTP failure');
    sentMessages.push(message);
    if (message.subject.includes('verification code')) code = message.text.match(/\b[0-9]{6}\b/)[0];
    return {messageId,accepted:[message.to],rejected:[]};
  },close() {}});
  const app = express(); app.use(express.json()); app.use(cookieParser()); app.use('/admin',adminRoutes); app.use('/limited', persistentLimiter('test-ip', 2, 900), (req,res) => res.json({ ok:true })); app.use(routes);
  app.use(errorHandler);
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); if (originalTransport) nodemailer.createTransport = originalTransport; cloudinary.uploader.upload_stream = originalUpload; cloudinary.uploader.destroy = originalDestroy; globalThis.fetch = originalFetch; await mongoose.disconnect(); });
beforeEach(async () => {
  await Promise.all([Admin,Registration,Challenge,OtpBucket,OtpLock,Settings,Payment,Counter,Audit,Notification,MediaAsset].map(m => m.deleteMany({})));
  storedMedia.clear(); cloudFailure = false; cleanupFailure = false;
  code = undefined; calls = 0; failure = null; sentMessages = []; smtpFailure = false;
});
test('requests OTP without storing or returning a code', async () => {
  const s = await draft(); const result = await service.sendOtp(s,'register');
  assert.match(result.message,/OTP sent/); assert.equal(result.otp,undefined);
  const c = await Challenge.findOne(); assert.equal(c.recipient,'student@example.com'); assert.equal(c.providerVerificationReference,messageId); assert.equal(c.toObject().otp,undefined);
});
test('incorrect code remains unverified', async () => {
  const s = await draft(); await service.sendOtp(s,'register'); await assert.rejects(service.verifyOtp(s,'register',wrongCode()),/Incorrect/);
  assert.equal((await Registration.findById(s._id)).status,'DRAFT');
});
test('approval consumes challenge and binds authorization to draft', async () => {
  const s = await draft(); await service.sendOtp(s,'register');
  const result=await service.verifyOtp(s,'register',code); assert.equal(result.status,'OTP_VERIFIED'); assert.ok(result.verificationExpiresAt > new Date()); assert.ok((await Challenge.findOne()).consumedAt);
  await assert.rejects(service.verifyOtp(s,'register',code));
});
test('expired challenge never reaches provider', async () => {
  const s=await draft(); await service.sendOtp(s,'register'); await Challenge.updateMany({},{$set:{expiresAt:new Date(0)}}); calls=0;
  await assert.rejects(service.verifyOtp(s,'register',code),/expired/); assert.equal(calls,0);
});
test('attempt limit survives resend', async () => {
  const s=await draft(); await service.sendOtp(s,'register');
  for(let i=0;i<5;i++) await assert.rejects(service.verifyOtp(s,'register',wrongCode()));
  await Challenge.updateMany({},{$set:{resendAvailableAt:new Date(0)}}); await service.sendOtp(s,'register'); calls=0;
  await assert.rejects(service.verifyOtp(s,'register',code)); assert.equal(calls,0);
});
test('resend cooldown and simultaneous sends allow only one provider request', async () => {
  const s=await draft(); const results=await Promise.allSettled([service.sendOtp(s,'register'),service.sendOtp(s,'register')]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1); assert.equal(calls,1); await assert.rejects(service.sendOtp(s,'register'),e=>e.status===429);
});
test('atomic persistent rate limiting bounds concurrent requests', async () => {
  const results=await Promise.allSettled(Array.from({length:12},()=>limit('same-phone',3,3600)));
  assert.equal(results.filter(x=>x.status==='fulfilled').length,3);
});
test('per-IP limiter rejects excess HTTP requests', async () => {
  assert.equal((await request('/limited')).status,200); assert.equal((await request('/limited')).status,200); assert.equal((await request('/limited')).status,429);
});
test('provider failure retains cooldown and never approves draft', async () => {
  const s=await draft(); failure=Object.assign(new Error('SMS unavailable'),{status:502});
  await assert.rejects(service.sendOtp(s,'register')); assert.equal((await Registration.findById(s._id)).status,'DRAFT');
  failure=null; await assert.rejects(service.sendOtp(s,'register'),e=>e.status===429);
});
test('concurrent duplicate verification approves once', async () => {
  const s=await draft(); await service.sendOtp(s,'register');  calls=0;
  const results=await Promise.allSettled([service.verifyOtp(s,'register',code),service.verifyOtp(s,'register',code)]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1); assert.equal(calls,0);
});
test('verification cannot authorize another draft or purpose', async () => {
  const a=await draft(),b=await draft(); await service.sendOtp(a,'register');
  await assert.rejects(service.verifyOtp(b,'register',code)); await assert.rejects(service.verifyOtp(a,'lookup',code));
  await Challenge.updateMany({},{$set:{resendAvailableAt:new Date(0)}}); await assert.rejects(service.sendOtp(b,'register'),/another application/);
});
test('changed email invalidates previous pending challenge', async () => {
  const s=await draft(); await service.sendOtp(s,'register');
  await Registration.updateOne({_id:s._id},{$set:{email:'updated@example.com'}});
  await assert.rejects(service.verifyOtp(s,'register',code),/changed/);
});
test('expired draft is rejected before provider call', async () => {
  const s=await draft({draftExpiresAt:new Date(0)}); await assert.rejects(service.sendOtp(s,'register'),e=>e.status===410); assert.equal(calls,0);
});
test('existing registration API validates inputs and requires authentication', async () => {
  await Settings.create({_id:'primary',registrationOpen:true});
  assert.equal((await request('/registrations/start',null,{...good,consent:false})).status,400);
  const result=await request('/registrations/start',null,good); assert.equal(result.status,201); assert.equal(result.data.registration.status,'DRAFT');
  assert.equal((await request('/registrations/otp/send',null,{})).status,401);
});
test('HTTP OTP workflow uses SMTP delivery and local verification and supports mobile edit after approval', async () => {
  const s=await draft(),token=issueToken({sub:String(s._id),scope:'draft'});
  assert.equal((await request('/registrations/otp/send',token,{})).status,200);
  assert.equal((await request('/registrations/otp/verify',token,{otp:code})).status,200);
  const edit=await request('/registrations/mobile',token,{guardianPhone:'9876543211'},'PATCH'); assert.equal(edit.status,200); assert.equal(edit.data.registration.verified,false);
  assert.equal((await request('/registrations/otp/verify',token,{otp:code})).status,400);
});
test('expired authorization resets draft and blocks payment', async () => {
  const s=await draft({status:'OTP_VERIFIED',verifiedAt:new Date(),verifiedEmail:good.email,verificationExpiresAt:new Date(0)}),token=issueToken({sub:String(s._id),scope:'draft'});
  const result=await request('/registrations/me',token,null,'GET'); assert.equal(result.data.registration.status,'DRAFT');
  assert.equal((await request('/registrations/manual',token,{utr:'123456789012',termsAccepted:true})).status,409);
});
test('duplicate concurrent finalization assigns one existing-format registration number', async () => {
  const s=await draft({status:'PAYMENT_UNDER_VERIFICATION',verifiedAt:new Date()});
  const results=await Promise.allSettled([confirmRegistration(s._id,'test'),confirmRegistration(s._id,'test')]);
  assert.ok(results.some(x=>x.status==='fulfilled')); const final=await Registration.findById(s._id);
  assert.equal(final.registrationNumber,'SHREE26-000001'); assert.equal((await Counter.findById('SHREE26')).seq,1);
  assert.equal((await confirmRegistration(s._id,'test')).registrationNumber,final.registrationNumber);
});
test('admit card requires confirmed payment; confirmed PDF still downloads', async () => {
  const s=await draft(),token=issueToken({sub:String(s._id),scope:'draft'});
  assert.equal((await request('/registrations/admit-card',token,null,'GET')).status,403);
  await Registration.updateOne({_id:s._id},{$set:{status:'CONFIRMED',registrationNumber:'SHREE26-000001',admitToken:'test-admit-token'}});
  const result=await request('/registrations/admit-card',token,null,'GET'); assert.equal(result.status,200); assert.equal(result.data.subarray(0,5).toString(),'%PDF-');
});

test('simultaneous start submissions reuse the same draft with an idempotency key', async () => {
  await Settings.create({_id:'primary',registrationOpen:true});
  const key=crypto.randomUUID();
  const send=body=>fetch(base+'/registrations/start',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(body)});
  const responses=await Promise.all([send(good),send(good)]);
  assert.ok(responses.every(r=>r.status===201));
  const results=await Promise.all(responses.map(r=>r.json())); assert.equal(results[0].registration.id,results[1].registration.id);
  assert.equal(await Registration.countDocuments(),1);
  assert.equal((await send({...good,studentName:'Different Student'})).status,409);
});

test('per-email hourly limit spans distinct drafts', async () => {
  const a=await draft(), b=await draft();
  for(let i=0;i<5;i++) await limit('send-email:student@example.com',5,3600);
  await assert.rejects(service.sendOtp(a,'register'),e=>e.status===429);
  await assert.rejects(service.sendOtp(b,'register'),e=>e.status===429);
  assert.equal(calls,0);
});

test('expired local challenge does not grant authorization', async () => {
  const s=await draft(); await service.sendOtp(s,'register'); await Challenge.updateMany({}, { $set: { expiresAt: new Date(0) } });
  await assert.rejects(service.verifyOtp(s,'register',code),/expired/);
  assert.equal((await Registration.findById(s._id)).verifiedAt,null);
});

const png = await QRCode.toBuffer('Synthetic student image');
async function upload(route, token, form) {
  const response = await fetch(base + route, { method:'POST', headers:{Authorization:`Bearer ${token}`},body:form });
  return { status:response.status, data:await response.json() };
}
const photoForm = () => { const form=new FormData();form.append('photo',new Blob([png],{type:'image/png'}),'student.png');return form; };
const fixturePdf = await PDFDocument.create(); fixturePdf.addPage();
const receiptPdf = await fixturePdf.save();
const receiptForm = () => { const form=new FormData();form.append('receipt',new Blob([receiptPdf],{type:'application/pdf'}),'receipt.pdf');form.append('utr','TESTUTR123456');form.append('termsAccepted','true');return form; };

test('complete registration: form with photo, OTP, receipt, school approval and admit PDF', async () => {
  await Settings.create({_id:'primary',registrationOpen:true,upiId:'school@test',payeeName:'Test School',paymentMode:'manual'});
  const start=await request('/registrations/start',null,good); assert.equal(start.status,201);
  const token=start.data.token;
  assert.equal((await upload('/registrations/photo',token,photoForm())).status,200);
  assert.equal((await request('/registrations/otp/send',token,{})).status,200);
   assert.equal((await request('/registrations/otp/verify',token,{otp:code})).status,200);
  const saved = await request('/registrations/me',token,null,'GET');
  assert.equal(saved.data.registration.photoUploaded,true);
  const submitted=await upload('/registrations/manual',token,receiptForm()); assert.equal(submitted.status,201);
  assert.equal(submitted.data.registration.status,'PAYMENT_UNDER_VERIFICATION');
  assert.equal(submitted.data.registration.registrationNumber,null);
  assert.equal((await request('/registrations/admit-card',token,null,'GET')).status,403);
  assert.equal((await upload('/registrations/manual',token,receiptForm())).status,409);
  assert.equal(await Payment.countDocuments(),1);
  assert.equal((await request('/registrations/mobile',token,{guardianPhone:'9876543211'},'PATCH')).status,409);
  const admin=await Admin.create({email:'test@example.com',passwordHash:'unused-test-only',role:'SUPER_ADMIN'});
  const payment=await Payment.findOne();
  const approval=await fetch(base+`/admin/payments/${payment._id}/approve`,{method:'POST',headers:{Cookie:`olympiad_admin=${issueToken({sub:String(admin._id),scope:'admin'})}`}});
  assert.equal(approval.status,200); const confirmed=await approval.json();
  assert.equal(confirmed.registration.registrationNumber,'SHREE26-000001');
  assert.equal(confirmed.registration.status,'CONFIRMED');
  assert.equal((await Registration.findById(start.data.registration.id)).notificationStatus, 'PENDING');
  await processNotificationQueue();
  assert.equal((await Registration.findById(start.data.registration.id)).notificationStatus, 'SENT');
  const mail = sentMessages.find(m => m.attachments);
  assert.equal(mail.to, good.email); assert.equal(mail.attachments.length, 2);
  for (const attachment of mail.attachments) assert.equal(attachment.content.subarray(0,5).toString(), '%PDF-');
  await confirmRegistration(start.data.registration.id, 'repeat');
  assert.equal(sentMessages.filter(m => m.attachments).length, 1);

  const pdf=await request('/registrations/admit-card',token,null,'GET'); assert.equal(pdf.status,200);assert.equal(pdf.data.subarray(0,5).toString(),'%PDF-');
});

test('closed registrations and invalid calendar dates are blocked', async () => {
  assert.equal((await request('/registrations/start',null,good)).status,403);
  await Settings.updateOne({_id:'primary'},{$set:{registrationOpen:true}});
  for(const dob of ['2013-02-30','2099-01-01','1990-01-01']) assert.equal((await request('/registrations/start',null,{...good,dob})).status,400);
  assert.equal(await Registration.countDocuments(),0);
});

test('application receipt is private, requires submission and does not unlock admit card', async () => {
  const s = await draft();
  const token = issueToken({ sub: String(s._id), scope: 'draft' });
  const studentToken = issueToken({ sub: String(s._id), scope: 'student' });
  assert.equal((await request('/registrations/application-receipt', null, null, 'GET')).status, 401);
  assert.equal((await request('/application-receipt', token, null, 'GET')).status, 403);
  assert.equal((await request('/registrations/application-receipt', token, null, 'GET')).status, 403);
  await Registration.updateOne({ _id: s._id }, { $set: { status: 'PAYMENT_UNDER_VERIFICATION' } });
  for (const [route, auth] of [['/registrations/application-receipt', token], ['/application-receipt', studentToken]]) {
    const result = await request(route, auth, null, 'GET');
    assert.equal(result.status, 200);
    assert.equal(result.data.subarray(0, 5).toString(), '%PDF-');
  }
  assert.equal((await request('/registrations/admit-card', token, null, 'GET')).status, 403);
  const other = await draft();
  const otherToken = issueToken({ sub: String(other._id), scope: 'student' });
  assert.equal((await request(`/application-receipt?id=${s._id}`, otherToken, null, 'GET')).status, 403);
});

async function reviewerRequest(paymentId, action) {
  const admin = await Admin.findOne() || await Admin.create({email:'reviewer@example.com',passwordHash:'unused-test-only',role:'SUPER_ADMIN'});
  return fetch(base+`/admin/payments/${paymentId}/${action}`, {method:'POST',headers:{'Content-Type':'application/json',Cookie:`olympiad_admin=${issueToken({sub:String(admin._id),scope:'admin'})}`},body:JSON.stringify({note:'Verified test decision'})});
}
async function reviewFixture(paymentStatus='UNDER_REVIEW') {
  const s=await draft({status:'PAYMENT_UNDER_VERIFICATION',verifiedAt:new Date()});
  const p=await Payment.create({registrationId:s._id,mode:'manual',amount:149,status:paymentStatus,utr:crypto.randomUUID()});
  await Registration.updateOne({_id:s._id},{$set:{paymentId:p._id}});
  return {s,p};
}
test('concurrent approve and reject leave a consistent payment decision', async () => {
  const {s,p}=await reviewFixture();
  await Admin.create({email:'reviewer@example.com',passwordHash:'unused-test-only',role:'SUPER_ADMIN'});
  const results=await Promise.all([reviewerRequest(p._id,'approve'),reviewerRequest(p._id,'reject')]);
  assert.ok(results.some(r=>r.status===200));
  assert.ok(results.every(r=>[200,409].includes(r.status)));
  const pay=await Payment.findById(p._id), reg=await Registration.findById(s._id);
  assert.equal(reg.status,pay.status==='PAID'?'CONFIRMED':'PAYMENT_REJECTED');
});
test('paid manual approval recovers a previously interrupted confirmation and can retry safely', async () => {
  const {s,p}=await reviewFixture('PAID');
  assert.equal((await reviewerRequest(p._id,'approve')).status,200);
  const number=(await Registration.findById(s._id)).registrationNumber;
  assert.equal((await reviewerRequest(p._id,'approve')).status,200);
  assert.equal((await Registration.findById(s._id)).registrationNumber,number);
});
test('open registration settings cannot lose required payment configuration', async () => {
  await Settings.create({_id:'primary',registrationOpen:true,paymentMode:'manual',upiId:'school@test',payeeName:'School'});
  const admin=await Admin.create({email:'reviewer@example.com',passwordHash:'unused-test-only',role:'SUPER_ADMIN'});
  const response=await fetch(base+'/admin/settings',{method:'PATCH',headers:{'Content-Type':'application/json',Cookie:`olympiad_admin=${issueToken({sub:String(admin._id),scope:'admin'})}`},body:JSON.stringify({upiId:''})});
  assert.equal(response.status,400);
  assert.equal((await Settings.findById('primary')).upiId,'school@test');
});
test('photo upload rejects a file containing only a forged JPEG header', async () => {
  const s=await draft({status:'OTP_VERIFIED',verifiedAt:new Date(),verifiedEmail:good.email,verificationExpiresAt:new Date(Date.now()+600000)});
  const token=issueToken({sub:String(s._id),scope:'draft'});
  const form=new FormData();form.append('photo',new Blob([new Uint8Array([255,216,255,0])],{type:'image/jpeg'}),'fake.jpg');
  assert.equal((await upload('/registrations/photo',token,form)).status,400);
  assert.equal((await Registration.findById(s._id)).photoPath,'');
});

test('stale confirmation recovers after a stopped worker but only with a paid payment', async () => {
  const {s,p}=await reviewFixture('PAID');
  await Registration.updateOne({_id:s._id},{$set:{status:'CONFIRMING',updatedAt:new Date(Date.now()-180000)}},{timestamps:false});
  assert.equal((await reviewerRequest(p._id,'approve')).status,200);
  assert.equal((await Registration.findById(s._id)).status,'CONFIRMED');
  const unpaid=await draft({status:'CONFIRMING'});
  await Registration.updateOne({_id:unpaid._id},{$set:{updatedAt:new Date(Date.now()-180000)}},{timestamps:false});
  await assert.rejects(confirmRegistration(unpaid._id,'test'),e=>e.status===409);
});

test('resend supersedes the old code, preserves expiry and stores only a hidden digest', async () => {
  const s = await draft(); await service.sendOtp(s, 'register');
  const oldCode = code;
  const old = await Challenge.findOne().select('+codeHash');
  assert.match(old.codeHash, /^[a-f0-9]{64}$/);
  assert.notEqual(old.codeHash, code);
  assert.equal((await Challenge.findById(old._id)).codeHash, undefined);
  await Challenge.updateMany({}, { $set: { resendAvailableAt: new Date(0) } });
  await service.sendOtp(s, 'register');
  const latest = await Challenge.findOne({ verificationStatus: 'pending' });
  assert.equal(+latest.expiresAt, +old.expiresAt);
  assert.equal((await Challenge.findById(old._id)).verificationStatus, 'superseded');
  if (oldCode !== code) await assert.rejects(service.verifyOtp(s, 'register', oldCode), /Incorrect/);
  await service.verifyOtp(s, 'register', code);
  assert.equal((await Challenge.findById(latest._id).select('+codeHash')).codeHash, '');
});

test('legacy provider challenges cannot authorize a draft', async () => {
  const s = await draft(); await service.sendOtp(s, 'register');
  await Challenge.collection.updateMany({}, { $set: { provider: 'twilio' } });
  await assert.rejects(service.verifyOtp(s, 'register', code), /expired/);
});

test('status lookup requires its own email code and rejects replay', async () => {
  const s = await draft({ status: 'CONFIRMED', registrationNumber: 'SHREE26-000001', verifiedAt: new Date() });
  const sent = await request('/status/request', null, { registrationNumber: s.registrationNumber, phone: s.guardianPhone });
  assert.equal(sent.status, 200);
  const token = sent.data.lookupToken;
  assert.equal((await request('/status/verify', token, { otp: wrongCode() })).status, 400);
  const verified = await request('/status/verify', token, { otp: code });
  assert.equal(verified.status, 200);
  assert.ok(verified.data.accessToken);
  assert.equal((await request('/status/me', verified.data.accessToken, null, 'GET')).status, 200);
  assert.equal((await request('/status/verify', token, { otp: code })).status, 400);
});

test('normalization accepts all requested formats and rejects client verification flags', async () => {
  await Settings.create({_id:'primary',registrationOpen:true});
  for (const guardianPhone of ['8199991081', '+918199991081', '918199991081']) {
    const result = await request('/registrations/start', null, {...good, guardianPhone});
    assert.equal(result.status, 201);
    assert.equal(result.data.registration.guardianPhone, '8199991081');
    assert.equal(result.data.registration.verified, false);
  }
  assert.equal((await request('/registrations/start', null, {...good, mobileVerified: true})).status, 400);
  const s = await draft(), token = issueToken({sub:String(s._id), scope:'draft'});
  assert.equal((await request('/registrations/manual', token, {utr:'123456789012',termsAccepted:true,mobileVerified:true})).status, 409);
  assert.equal(await Payment.countDocuments(), 0);
});

test('five failed attempts return 429 and a new service instance cannot reset protection', async () => {
  const s = await draft(); await service.sendOtp(s, 'register');
  for (let i = 0; i < 4; i++) await assert.rejects(service.verifyOtp(s, 'register', wrongCode()), {status:400});
  await assert.rejects(service.verifyOtp(s, 'register', wrongCode()), {status:429});
  const restarted = createOtpService(provider);
  await assert.rejects(restarted.verifyOtp(s, 'register', code), {status:429});
  await assert.rejects(restarted.sendOtp(s, 'register'), {status:429});
  assert.equal((await Registration.findById(s._id)).verifiedAt, null);
});

test('persisted OTP can be verified after reconnecting to MongoDB', async () => {
  const s = await draft(); await service.sendOtp(s, 'register');
  await mongoose.disconnect(); await mongoose.connect(uri);
  const restarted = createOtpService(provider);
  assert.equal((await restarted.verifyOtp(s, 'register', code)).status, 'OTP_VERIFIED');
});

test('disabled OTP rejects send and verify without authorizing the application', async () => {
  const previous = process.env.OTP_ENABLED;
  try {
    const s = await draft(); await service.sendOtp(s, 'register');
    process.env.OTP_ENABLED = 'false';
    await assert.rejects(service.sendOtp(s, 'register'), {status:503});
    await assert.rejects(service.verifyOtp(s, 'register', code), {status:503});
    assert.equal((await Registration.findById(s._id)).verifiedAt, null);
  } finally { if (previous === undefined) delete process.env.OTP_ENABLED; else process.env.OTP_ENABLED = previous; }
});

test('development challenges and verified drafts cannot authorize production submissions', async () => {
  const previous = [process.env.NODE_ENV, process.env.OTP_DEV_MODE];
  try {
    process.env.NODE_ENV = 'development'; process.env.OTP_DEV_MODE = 'true';
    const s = await draft(); await service.sendOtp(s, 'register');
    process.env.NODE_ENV = 'production';
    await assert.rejects(service.verifyOtp(s, 'register', code));
    process.env.NODE_ENV = 'development';
    await service.verifyOtp(s, 'register', code);
    process.env.NODE_ENV = 'production';
    const token = issueToken({sub:String(s._id),scope:'draft'});
    const me = await request('/registrations/me', token, null, 'GET');
    assert.equal(me.data.registration.status, 'DRAFT');
    assert.equal(me.data.registration.verified, false);
    assert.equal((await request('/registrations/manual', token, {utr:'123456789012',termsAccepted:true})).status, 409);
  } finally {
    ['NODE_ENV','OTP_DEV_MODE'].forEach((key,i) => previous[i] === undefined ? delete process.env[key] : process.env[key] = previous[i]);
  }
});

test('unsupported service purpose is rejected before email or challenge creation', async () => {
  const s = await draft();
  await assert.rejects(service.sendOtp(s, 'admin'), {status:400});
  await assert.rejects(service.verifyOtp(s, 'admin', '123456'), {status:400});
  assert.equal(calls, 0); assert.equal(await Challenge.countDocuments(), 0);
});


test('email correction clears verification, invalidates old code and verifies new recipient', async () => {
  const s=await draft(), token=issueToken({sub:String(s._id),scope:'draft'});
  await request('/registrations/otp/send',token,{}); const oldCode=code;
  const edited=await request('/registrations/email',token,{email:' New.Email@Example.com '},'PATCH');
  assert.equal(edited.status,200); assert.equal(edited.data.registration.email,'new.email@example.com');
  assert.equal((await request('/registrations/otp/verify',token,{otp:oldCode})).status,400);
  assert.equal((await request('/registrations/otp/send',token,{})).status,200);
  assert.equal(sentMessages.at(-1).to,'new.email@example.com');
  assert.equal((await request('/registrations/otp/verify',token,{otp:code})).status,200);
  assert.equal((await Registration.findById(s._id)).verifiedEmail,'new.email@example.com');
  assert.equal((await request('/registrations/email',token,{email:'bad'},'PATCH')).status,400);
  await Registration.updateOne({_id:s._id},{$set:{status:'PAYMENT_UNDER_VERIFICATION'}});
  assert.equal((await request('/registrations/email',token,{email:'different@example.com'},'PATCH')).status,409);
});

test('email failure preserves approval and durable retry sends once across competing workers', async () => {
  await Settings.create({_id:'primary'});
  const s=await draft({status:'PAYMENT_UNDER_VERIFICATION',verifiedAt:new Date(),verifiedEmail:good.email});
  const p=await Payment.create({registrationId:s._id,mode:'manual',amount:149,status:'PAID'});
  await Registration.updateOne({_id:s._id},{$set:{paymentId:p._id}});
  smtpFailure=true;
  await confirmRegistration(s._id,'test');
  await processNotificationQueue();
  let reg=await Registration.findById(s._id);
  assert.equal(reg.status,'CONFIRMED'); assert.equal(reg.notificationStatus,'FAILED');
  assert.equal(reg.notificationAttempts,1); assert.ok(reg.notificationNextAttemptAt > new Date());
  await processNotificationQueue(); assert.equal((await Registration.findById(s._id)).notificationAttempts,1);
  smtpFailure=false;
  await Registration.updateOne({_id:s._id},{$set:{notificationNextAttemptAt:new Date(0)}});
  await Promise.all([notifyConfirmed(s),notifyConfirmed(s),processNotificationQueue()]);
  reg=await Registration.findById(s._id); assert.equal(reg.notificationStatus,'SENT');
  assert.equal(reg.notificationAttempts,2); assert.equal(sentMessages.filter(m=>m.attachments).length,1);
  await processNotificationQueue(); assert.equal(sentMessages.filter(m=>m.attachments).length,1);
});

test('queue recovers an expired worker lease and never mails historical confirmations', async () => {
  await Settings.create({_id:'primary'});
  const s=await draft({status:'CONFIRMED',registrationNumber:'SHREE26-000001',admitToken:'test-token',notificationStatus:'SENDING',notificationLease:'stopped-worker',notificationNextAttemptAt:new Date(0)});
  const p=await Payment.create({registrationId:s._id,mode:'manual',amount:149,status:'PAID'});
  await Registration.updateOne({_id:s._id},{$set:{paymentId:p._id}});
  await draft({status:'CONFIRMED',email:'historical@example.com'});
  await processNotificationQueue();
  assert.equal(sentMessages.length,1); assert.equal((await Registration.findById(s._id)).notificationStatus,'SENT');
});

test('Cloudinary photo replacement removes the old asset and leaves local paths empty', async () => {
  const s = await draft(); const token = issueToken({sub:String(s._id),scope:'draft'});
  assert.equal((await upload('/registrations/photo',token,photoForm())).status,200);
  const first = await Registration.findById(s._id);
  assert.ok(first.photo.publicId); assert.equal(first.photoPath,'');
  assert.equal((await upload('/registrations/photo',token,photoForm())).status,200);
  const second = await Registration.findById(s._id);
  assert.notEqual(first.photo.publicId,second.photo.publicId);
  assert.equal(storedMedia.has(first.photo.publicId),false);
  assert.equal(storedMedia.has(second.photo.publicId),true);
  const info = await request('/registrations/me',token,null,'GET');
  assert.equal(info.data.registration.photo,undefined);
});

test('failed Cloudinary upload preserves the previous photo and returns a safe retry error', async () => {
  const s = await draft(); const token = issueToken({sub:String(s._id),scope:'draft'});
  await upload('/registrations/photo',token,photoForm());
  const first = await Registration.findById(s._id);
  cloudFailure = true;
  const result = await upload('/registrations/photo',token,photoForm());
  assert.equal(result.status,503); assert.match(result.data.error,/retry/i); assert.doesNotMatch(result.data.error,/secret/);
  assert.equal((await Registration.findById(s._id)).photo.publicId,first.photo.publicId);
  assert.equal(storedMedia.has(first.photo.publicId),true);
});

test('cleanup journal retries unreferenced assets and preserves referenced assets', async () => {
  const s = await draft(); const token = issueToken({sub:String(s._id),scope:'draft'});
  await upload('/registrations/photo',token,photoForm());
  const first = await Registration.findById(s._id);
  cleanupFailure = true;
  assert.equal((await upload('/registrations/photo',token,photoForm())).status,200);
  assert.equal(storedMedia.has(first.photo.publicId),true);
  cleanupFailure = false;
  await MediaAsset.updateMany({},{$set:{sweepAt:new Date(0)}});
  await sweepMedia();
  assert.equal(storedMedia.has(first.photo.publicId),false);
  assert.equal(storedMedia.has((await Registration.findById(s._id)).photo.publicId),true);
});

test('payment receipts are stored remotely and downloads enforce admin roles', async () => {
  const s = await draft({ status:'OTP_VERIFIED', verifiedAt:new Date(), verifiedEmail:good.email, verificationExpiresAt:new Date(Date.now()+600000) });
  await Settings.create({_id:'primary',upiId:'school@test',payeeName:'Test School',paymentMode:'manual'});
  const token = issueToken({sub:String(s._id),scope:'draft'});
  await upload('/registrations/photo',token,photoForm());
  assert.equal((await upload('/registrations/manual',token,receiptForm())).status,201);
  const payment = await Payment.findOne(); assert.ok(payment.receipt.publicId); assert.equal(payment.receiptPath,'');
  const route = `/admin/payments/${payment._id}/receipt`;
  assert.equal((await fetch(base+route)).status,401);
  for (const [role,status] of [['EXAM_COORDINATOR',403],['PAYMENT_VERIFIER',200]]) {
    const admin = await Admin.create({email:`${role}@test.invalid`,passwordHash:'unused',role});
    const response = await fetch(base+route,{headers:{Cookie:`olympiad_admin=${issueToken({sub:String(admin._id),scope:'admin'})}`}});
    assert.equal(response.status,status);
    if (status===200) { assert.equal(response.headers.get('content-type'),'application/pdf'); assert.match(response.headers.get('cache-control'),/no-store/); assert.deepEqual(Buffer.from(await response.arrayBuffer()),Buffer.from(receiptPdf)); }
  }
});

test('invalid receipt images and PDFs are rejected before a cloud upload', async () => {
  const s = await draft({status:'OTP_VERIFIED',verifiedAt:new Date(),verifiedEmail:good.email,verificationExpiresAt:new Date(Date.now()+600000)});
  await Settings.create({_id:'primary',upiId:'school@test',paymentMode:'manual'});
  const token = issueToken({sub:String(s._id),scope:'draft'});
  await upload('/registrations/photo',token,photoForm());
  for(const [type,bytes] of [['application/pdf','%PDF-1.4 fake'],['image/png','fake image']]) {
    const form=receiptForm(); form.set('receipt',new Blob([bytes],{type}),'receipt');
    assert.equal((await upload('/registrations/manual',token,form)).status,400);
  }
  assert.equal(await Payment.countDocuments(),0); assert.equal(storedMedia.size,1);
});

test('duplicate UTR does not leave a second payment; orphan receipt is reconciled', async () => {
  const s = await draft({status:'OTP_VERIFIED',verifiedAt:new Date(),verifiedEmail:good.email,verificationExpiresAt:new Date(Date.now()+600000)});
  await Settings.create({_id:'primary',upiId:'school@test',paymentMode:'manual'});
  await Payment.create({registrationId:s._id,mode:'manual',amount:149,utr:'TESTUTR123456',status:'REJECTED'});
  const token = issueToken({sub:String(s._id),scope:'draft'});
  await upload('/registrations/photo',token,photoForm());
  assert.equal((await upload('/registrations/manual',token,receiptForm())).status,409);
  assert.equal(await Payment.countDocuments(),1);
  await MediaAsset.updateMany({},{$set:{sweepAt:new Date(0)}}); await sweepMedia();
  assert.equal(storedMedia.size,1);
  assert.equal((await Registration.findById(s._id)).status,'OTP_VERIFIED');
});

test('photo database failure preserves the prior asset and cleans the unreferenced upload later', async t => {
  const s = await draft(); const token = issueToken({sub:String(s._id),scope:'draft'});
  await upload('/registrations/photo',token,photoForm());
  const first = await Registration.findById(s._id);
  const original = Registration.findOneAndUpdate;
  const stub = t.mock.method(Registration,'findOneAndUpdate',function (query,update,...args) {
    if(update?.$set?.photo) throw new Error('simulated database write failure');
    return original.call(this,query,update,...args);
  });
  assert.equal((await upload('/registrations/photo',token,photoForm())).status,500);
  stub.mock.restore();
  assert.equal((await Registration.findById(s._id)).photo.publicId,first.photo.publicId);
  await MediaAsset.updateMany({},{$set:{sweepAt:new Date(0)}}); await sweepMedia();
  assert.deepEqual([...storedMedia.keys()],[first.photo.publicId]);
});

test('missing protected photo returns an error before starting a PDF response', async () => {
  const s = await draft(); const token = issueToken({sub:String(s._id),scope:'draft'});
  await upload('/registrations/photo',token,photoForm());
  await Registration.updateOne({_id:s._id},{$set:{status:'CONFIRMED',admitToken:'test-token',registrationNumber:'SHREE26-004321'}});
  storedMedia.clear();
  const response = await request('/registrations/admit-card',token,null,'GET');
  assert.equal(response.status,503); assert.match(response.data.error,/retry/i);
});

test('Multer rejects oversized photos and unexpected files before Cloudinary', async () => {
  const s = await draft(); const token = issueToken({sub:String(s._id),scope:'draft'});
  const huge = new FormData(); huge.append('photo',new Blob([Buffer.alloc(5*1024*1024+1)],{type:'image/png'}),'large.png');
  assert.equal((await upload('/registrations/photo',token,huge)).status,413);
  const wrong = new FormData(); wrong.append('unexpected',new Blob([png],{type:'image/png'}),'photo.png');
  assert.equal((await upload('/registrations/photo',token,wrong)).status,400);
  assert.equal(storedMedia.size,0); assert.equal(await MediaAsset.countDocuments(),0);
});
