import 'express-async-errors';
import test, { before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import cookieParser from 'cookie-parser';
import fs from 'node:fs/promises';
import path from 'node:path';
import adminRoutes from '../../src/routes/admin.js';
import crypto from 'node:crypto';
import { once } from 'node:events';
import { Admin, Registration, Challenge, OtpBucket, OtpLock, Settings, Payment, Counter, Audit } from '../../src/models/index.js';
import { createOtpService } from '../../src/services/registrationOTP.js';
import { limit, persistentLimiter } from '../../src/services/otpSecurity.js';
import { getClient } from '../../src/services/twilioOTP.js';
import { issueToken } from '../../src/middleware/auth.js';
import { confirmRegistration } from '../../src/services/confirm.js';
import routes from '../../src/routes/public.js';
const uri = process.env.OTP_TEST_MONGODB_URI;
if (!uri || !/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\/shree_otp_test(?:\?|$)/.test(uri)) throw new Error('Set OTP_TEST_MONGODB_URI to a local shree_otp_test database; application databases are forbidden.');
process.env.OTP_PEPPER = 'test-only-pepper'.repeat(4);
process.env.JWT_SECRET = 'test-only-jwt'.repeat(4);
process.env.TWILIO_ACCOUNT_SID = 'AC' + '1'.repeat(32);
process.env.TWILIO_AUTH_TOKEN = '2'.repeat(32);
process.env.TWILIO_VERIFY_SERVICE_SID = 'VA' + '3'.repeat(32);
let status, calls, failure, server, base, originalRequest;
const sid = 'VE' + '4'.repeat(32);
const provider = {
  async sendOTP() { calls++; if (failure) throw failure; return { sid, status: 'pending' }; },
  async verifyOTP(phone, otp, ref) { calls++; assert.equal(ref, sid); if (failure) throw failure; return { sid, status }; },
};
const service = createOtpService(provider);
const good = {studentName:'Test Student',dob:'2013-02-12',studentClass:'7',currentSchool:'Test School',guardianName:'Test Guardian',guardianPhone:'9876543210',email:'',address:'Test Road',city:'Kanhra',district:'Dadri',state:'Haryana',pincode:'127306',purpose:'',consent:true};
const draft = (extra={}) => Registration.create({ ...good, applicationRef: `APP-${crypto.randomBytes(5).toString('hex').toUpperCase()}`, ...extra });
async function request(route, token, body, method='POST') {
  const response = await fetch(base + route, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type':'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: response.headers.get('content-type')?.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer()) };
}
before(async () => {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 });
  await Promise.all(Object.values(mongoose.models).map(m => m.init()));
  originalRequest = getClient().httpClient.request;
  getClient().httpClient.request = async () => ({ statusCode: 200, body: JSON.stringify({ sid, status }) });
  const app = express(); app.use(express.json()); app.use(cookieParser()); app.use('/admin',adminRoutes); app.use('/limited', persistentLimiter('test-ip', 2, 900), (req,res) => res.json({ ok:true })); app.use(routes);
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); if (originalRequest) getClient().httpClient.request = originalRequest; await mongoose.disconnect(); });
beforeEach(async () => {
  await Promise.all([Admin,Registration,Challenge,OtpBucket,OtpLock,Settings,Payment,Counter,Audit].map(m => m.deleteMany({})));
  status = 'pending'; calls = 0; failure = null;
});
test('requests OTP without storing or returning a code', async () => {
  const s = await draft(); const result = await service.sendOtp(s,'register');
  assert.match(result.message,/requested/); assert.equal(result.otp,undefined);
  const c = await Challenge.findOne(); assert.equal(c.phone,'+919876543210'); assert.equal(c.providerVerificationReference,sid); assert.equal(c.toObject().otp,undefined);
});
test('incorrect code remains unverified', async () => {
  const s = await draft(); await service.sendOtp(s,'register'); await assert.rejects(service.verifyOtp(s,'register','123456'),/Incorrect/);
  assert.equal((await Registration.findById(s._id)).status,'DRAFT');
});
test('approval consumes challenge and binds authorization to draft', async () => {
  const s = await draft(); await service.sendOtp(s,'register'); status='approved';
  const result=await service.verifyOtp(s,'register','123456'); assert.equal(result.status,'OTP_VERIFIED'); assert.ok(result.verificationExpiresAt > new Date()); assert.ok((await Challenge.findOne()).consumedAt);
  await assert.rejects(service.verifyOtp(s,'register','123456'));
});
test('expired challenge never reaches provider', async () => {
  const s=await draft(); await service.sendOtp(s,'register'); await Challenge.updateMany({},{$set:{expiresAt:new Date(0)}}); calls=0;
  await assert.rejects(service.verifyOtp(s,'register','123456'),/expired/); assert.equal(calls,0);
});
test('attempt limit survives resend', async () => {
  const s=await draft(); await service.sendOtp(s,'register');
  for(let i=0;i<5;i++) await assert.rejects(service.verifyOtp(s,'register','123456'));
  await Challenge.updateMany({},{$set:{resendAvailableAt:new Date(0)}}); await service.sendOtp(s,'register'); calls=0;
  await assert.rejects(service.verifyOtp(s,'register','123456')); assert.equal(calls,0);
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
  const s=await draft(); await service.sendOtp(s,'register'); status='approved'; calls=0;
  const results=await Promise.allSettled([service.verifyOtp(s,'register','123456'),service.verifyOtp(s,'register','123456')]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1); assert.equal(calls,1);
});
test('verification cannot authorize another draft or purpose', async () => {
  const a=await draft(),b=await draft(); await service.sendOtp(a,'register'); status='approved';
  await assert.rejects(service.verifyOtp(b,'register','123456')); await assert.rejects(service.verifyOtp(a,'lookup','123456'));
  await Challenge.updateMany({},{$set:{resendAvailableAt:new Date(0)}}); await assert.rejects(service.sendOtp(b,'register'),/another application/);
});
test('changed phone invalidates previous pending challenge', async () => {
  const s=await draft(); await service.sendOtp(s,'register');
  await Registration.updateOne({_id:s._id},{$set:{guardianPhone:'9876543211'}}); status='approved';
  await assert.rejects(service.verifyOtp(s,'register','123456'),/changed/);
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
test('HTTP OTP workflow uses SDK and supports mobile edit after approval', async () => {
  const s=await draft(),token=issueToken({sub:String(s._id),scope:'draft'});
  assert.equal((await request('/registrations/otp/send',token,{})).status,200); status='approved';
  assert.equal((await request('/registrations/otp/verify',token,{otp:'123456'})).status,200);
  const edit=await request('/registrations/mobile',token,{guardianPhone:'9876543211'},'PATCH'); assert.equal(edit.status,200); assert.equal(edit.data.registration.verified,false);
  assert.equal((await request('/registrations/otp/verify',token,{otp:'123456'})).status,400);
});
test('expired authorization resets draft and blocks payment', async () => {
  const s=await draft({status:'OTP_VERIFIED',verifiedAt:new Date(),verificationExpiresAt:new Date(0)}),token=issueToken({sub:String(s._id),scope:'draft'});
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

test('per-mobile hourly limit spans distinct drafts', async () => {
  const a=await draft(), b=await draft();
  for(let i=0;i<5;i++) await limit('send-phone:+919876543210',5,3600);
  await assert.rejects(service.sendOtp(a,'register'),e=>e.status===429);
  await assert.rejects(service.sendOtp(b,'register'),e=>e.status===429);
  assert.equal(calls,0);
});

test('provider expired response does not grant authorization', async () => {
  const s=await draft(); await service.sendOtp(s,'register'); status='expired';
  await assert.rejects(service.verifyOtp(s,'register','123456'),/expired/);
  assert.equal((await Registration.findById(s._id)).verifiedAt,null);
});

// Only files belonging to records in the isolated test database are cleaned up.
afterEach(async () => {
  const registrations = await Registration.find().select('photoPath').lean();
  const payments = await Payment.find().select('receiptPath').lean();
  const files = [...registrations.map(s=>s.photoPath), ...payments.map(p=>p.receiptPath)].filter(Boolean);
  for (const file of files) if (path.dirname(file) === path.resolve('private-uploads')) await fs.unlink(file).catch(()=>{});
});

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
async function upload(route, token, form) {
  const response = await fetch(base + route, { method:'POST', headers:{Authorization:`Bearer ${token}`},body:form });
  return { status:response.status, data:await response.json() };
}
const photoForm = () => { const form=new FormData();form.append('photo',new Blob([png],{type:'image/png'}),'student.png');return form; };
const receiptForm = () => { const form=new FormData();form.append('receipt',new Blob(['%PDF-1.4 test receipt'],{type:'application/pdf'}),'receipt.pdf');form.append('utr','TESTUTR123456');form.append('termsAccepted','true');return form; };

test('complete registration: form, OTP, photo, receipt, school approval and admit PDF', async () => {
  await Settings.create({_id:'primary',registrationOpen:true,upiId:'school@test',payeeName:'Test School',paymentMode:'manual'});
  const start=await request('/registrations/start',null,good); assert.equal(start.status,201);
  const token=start.data.token;
  assert.equal((await upload('/registrations/photo',token,photoForm())).status,403);
  assert.equal((await request('/registrations/otp/send',token,{})).status,200);
  status='approved'; assert.equal((await request('/registrations/otp/verify',token,{otp:'123456'})).status,200);
  assert.equal((await upload('/registrations/manual',token,receiptForm())).status,400);
  assert.equal((await upload('/registrations/photo',token,photoForm())).status,200);
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
  const s=await draft({status:'OTP_VERIFIED',verifiedAt:new Date(),verificationExpiresAt:new Date(Date.now()+600000)});
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
