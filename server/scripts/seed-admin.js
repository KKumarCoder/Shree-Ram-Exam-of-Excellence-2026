import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import {Admin} from '../src/models/index.js';
const {MONGODB_URI,ADMIN_EMAIL,ADMIN_PASSWORD}=process.env;
if(!MONGODB_URI||!ADMIN_EMAIL||!ADMIN_PASSWORD||ADMIN_PASSWORD.length<12||ADMIN_PASSWORD.startsWith('REPLACE')){console.error('Set real MONGODB_URI, ADMIN_EMAIL and strong ADMIN_PASSWORD (12+ chars) in server/.env');process.exit(1);}
try{await mongoose.connect(MONGODB_URI);const passwordHash=await bcrypt.hash(ADMIN_PASSWORD,12);const admin=await Admin.findOneAndUpdate({email:ADMIN_EMAIL.toLowerCase()},{$set:{passwordHash,role:'SUPER_ADMIN',active:true}},{upsert:true,new:true});console.log(`Admin provisioned: ${admin.email}`);}catch(e){console.error(e.message);process.exitCode=1;}finally{await mongoose.disconnect();}
