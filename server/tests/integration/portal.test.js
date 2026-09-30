import 'express-async-errors';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import express from 'express';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import {Settings,Admin,Audit} from '../../src/models/index.js';
import adminRoutes from '../../src/routes/admin.js';
import publicRoutes from '../../src/routes/public.js';
import {issueToken} from '../../src/middleware/auth.js';
const source=process.env.OTP_TEST_MONGODB_URI;
if(!source||!/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\/shree_otp_test(?:\?|$)/.test(source))throw new Error('Portal integration requires the isolated local OTP_TEST_MONGODB_URI test instance.');
const uri=source.replace('/shree_otp_test','/shree_portal_test');
process.env.JWT_SECRET='portal-test-secret-only'.repeat(3);
let server,base;
before(async()=>{
 await mongoose.connect(uri);await Promise.all([Admin,Settings,Audit].map(m=>m.init()));
 await Promise.all([Admin,Settings,Audit].map(m=>m.deleteMany({})));
 const app=express();app.use(express.json());app.use(cookieParser());app.use('/admin',adminRoutes);app.use(publicRoutes);app.use((err,req,res,next)=>res.status(err.status||500).json({error:err.message}));server=app.listen(0,'127.0.0.1');await once(server,'listening');base=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{if(server)await new Promise(r=>server.close(r));await mongoose.disconnect();});
async function request(path,body,token){const response=await fetch(base+path,{method:body?'PUT':'GET',headers:{'Content-Type':'application/json',...(token?{Cookie:`olympiad_admin=${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()};}
async function token(role){const admin=await Admin.create({email:`${role.toLowerCase()}@test.invalid`,passwordHash:'unused',role});return issueToken({sub:String(admin._id),scope:'admin'},'1h');}
test('portal publication is role protected, preserves payment settings, and hides drafts publicly',async()=>{
 const body={eventName:'SHREE 2026 OLYMPIAD',portal:{notices:[{title:'Private draft',description:'not for public'},{title:'Official update',isPublished:true}],resources:[{title:'Draft syllabus',category:'syllabus',studentClass:'7',fileUrl:'/draft.pdf'}]}};
 assert.equal((await request('/admin/portal',body)).status,401);
 const examiner=await token('EXAM_COORDINATOR');assert.equal((await request('/admin/portal',body,examiner)).status,403);
 const admin=await token('ADMIN');await Settings.create({_id:'primary',fee:149,registrationOpen:false,upiId:'test@upi',payeeName:'Test School'});
 assert.equal((await request('/admin/portal',body,admin)).status,200);
 const persisted=await Settings.findById('primary');assert.equal(persisted.fee,149);assert.equal(persisted.upiId,'test@upi');assert.equal(persisted.portal.notices.length,2);
 const publicData=await request('/settings');assert.equal(publicData.status,200);assert.equal(publicData.data.portal.notices.length,1);assert.equal(publicData.data.portal.notices[0].title,'Official update');assert.equal(publicData.data.portal.resources.length,0);assert.equal(publicData.data._id,undefined);assert.equal(publicData.data.eligibleClasses.length,12);
 assert.equal((await Audit.countDocuments({action:'PUBLIC_CONTENT_UPDATED'})),1);
 const raw=await request('/admin/settings',undefined,admin);assert.equal(raw.data.portal.notices.length,2);
 const invalid=await request('/admin/portal',{eventName:'test',portal:{announcement:{enabled:true,link:'javascript:alert(1)'}}},admin);assert.equal(invalid.status,400);assert.equal((await Settings.findById('primary')).eventName,body.eventName);
});
