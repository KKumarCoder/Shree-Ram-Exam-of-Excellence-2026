import { Registration, Counter, Audit, Payment } from '../models/index.js';
import { randomToken } from '../middleware/auth.js';
import { notifyConfirmed } from './notifications.js';
const conflict = () => Object.assign(new Error('Registration confirmation is processing or unavailable. Retry shortly.'), {status:409});
export async function confirmRegistration(registrationId, actor) {
  const before = await Registration.findById(registrationId);
  if (before?.status === 'CONFIRMED') return before;
  let claimQuery = {_id:registrationId,status:{$in:['PAYMENT_PENDING','PAYMENT_UNDER_VERIFICATION','PAYMENT_REJECTED']}};
  if (before?.status === 'CONFIRMING') {
    // Recover a stopped worker only after its claim expires and payment is recorded paid.
    if (before.updatedAt > new Date(Date.now()-120000) || !await Payment.exists({registrationId,status:'PAID'})) throw conflict();
    claimQuery = {_id:registrationId,status:'CONFIRMING',updatedAt:before.updatedAt};
  }
  const claimed = await Registration.findOneAndUpdate(claimQuery,{$set:{status:'CONFIRMING'}},{new:true});
  if (!claimed) {
    const existing=await Registration.findById(registrationId);
    if(existing?.status==='CONFIRMED')return existing;
    throw conflict();
  }
  const claim = {_id:registrationId,status:'CONFIRMING',updatedAt:claimed.updatedAt};
  try {
    const seq=await Counter.findOneAndUpdate({_id:'SHREE26'},{$inc:{seq:1}},{new:true,upsert:true,setDefaultsOnInsert:true});
    const confirmed=await Registration.findOneAndUpdate(claim,{$set:{registrationNumber:`SHREE26-${String(seq.seq).padStart(6,'0')}`,admitToken:randomToken(),status:'CONFIRMED'}},{new:true});
    if(!confirmed)throw conflict();
    await Audit.create({actor,action:'REGISTRATION_CONFIRMED',registrationId:confirmed._id,details:{registrationNumber:confirmed.registrationNumber}});
    notifyConfirmed(confirmed).catch(()=>console.error(JSON.stringify({event:'confirmation_notification_failed'})));
    return confirmed;
  } catch(error) {
    const fallback=before?.status==='CONFIRMING' ? (before.paymentMode==='manual'?'PAYMENT_UNDER_VERIFICATION':'PAYMENT_PENDING') : before?.status || 'PAYMENT_PENDING';
    await Registration.updateOne(claim,{$set:{status:fallback}});
    throw error;
  }
}
