import { Registration,Counter,Audit } from '../models/index.js';
import { randomToken } from '../middleware/auth.js';
import { notifyConfirmed } from './notifications.js';
export async function confirmRegistration(registrationId,actor){
 const claimed=await Registration.findOneAndUpdate({_id:registrationId,status:{$in:['PAYMENT_PENDING','PAYMENT_UNDER_VERIFICATION','PAYMENT_REJECTED']}},{$set:{status:'CONFIRMING'}},{new:true});
 if(!claimed){const existing=await Registration.findById(registrationId);if(existing?.status==='CONFIRMED')return existing;throw new Error('Registration is not eligible for confirmation.');}
 try{
  const seq=await Counter.findOneAndUpdate({_id:'SHREE26'},{$inc:{seq:1}},{new:true,upsert:true,setDefaultsOnInsert:true});
  claimed.registrationNumber=`SHREE26-${String(seq.seq).padStart(6,'0')}`;claimed.admitToken=randomToken();claimed.status='CONFIRMED';
  await claimed.save();
  await Audit.create({actor,action:'REGISTRATION_CONFIRMED',registrationId:claimed._id,details:{registrationNumber:claimed.registrationNumber}});
  // Notifications are best-effort. Do not reverse confirmed payments if provider fails.
  notifyConfirmed(claimed).catch(e=>console.error('Notification error:',e.message));return claimed;
 }catch(e){await Registration.updateOne({_id:registrationId,status:'CONFIRMING'},{$set:{status:'PAYMENT_PENDING'}});throw e;}
}
