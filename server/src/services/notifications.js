import { randomUUID } from 'node:crypto';
import { Registration, Notification, Settings, Payment } from '../models/index.js';
import { sendMail, normalizeEmail } from './email.js';
import { pdfBuffer } from './pdfBuffer.js';
import { admitPdf, applicationReceiptPdf } from './pdf.js';
export { sendOtp, verifyOtp } from './registrationOTP.js';
export async function confirmationMessage(registration, payment, settings) {
  const to = normalizeEmail(registration.email);
  if (registration.status !== 'CONFIRMED' || !registration.admitToken || payment?.status !== 'PAID') throw new Error('Paid confirmation required');
  const [admit, receipt] = await Promise.all([
    pdfBuffer(admitPdf, registration, settings), pdfBuffer(applicationReceiptPdf, registration, payment),
  ]);
  return {to, subject:`SHREE Olympiad: Admit card and receipt - ${registration.registrationNumber}`,
    text:`Dear ${registration.studentName},\n\nYour payment of INR ${Number(payment.amount).toFixed(2)} has been approved. Your registration number is ${registration.registrationNumber}.\n\nYour admit card and application/payment receipt are attached. Please print your admit card and follow the examination instructions.\n\nSHREE Olympiad`,
    attachments:[{filename:`${registration.registrationNumber}-admit-card.pdf`,content:admit,contentType:'application/pdf'},
      {filename:`${registration.registrationNumber}-receipt.pdf`,content:receipt,contentType:'application/pdf'}]};
}
// A durable job lives on the registration, written atomically with CONFIRMED.
// Leases prevent parallel workers from sending the same job simultaneously.
export async function notifyConfirmed(registration, deliver = sendMail) {
  const lease = randomUUID(), now = new Date();
  const claimed = await Registration.findOneAndUpdate({_id:registration._id, status:'CONFIRMED',
    notificationStatus:{$in:['PENDING','FAILED','SENDING']}, notificationNextAttemptAt:{$lte:now}},
    {$set:{notificationStatus:'SENDING',notificationLease:lease,notificationNextAttemptAt:new Date(+now+300000)},$inc:{notificationAttempts:1}}, {new:true});
  if (!claimed) return false;
  const claim = {_id:claimed._id,notificationLease:lease};
  try {
    const [payment, settings] = await Promise.all([
      Payment.findOne({_id:claimed.paymentId,registrationId:claimed._id,status:'PAID'}), Settings.findById('primary'),
    ]);
    if (!settings) throw new Error('Exam settings missing');
    await deliver(await confirmationMessage(claimed,payment,settings));
    await Registration.updateOne(claim,{$set:{notificationStatus:'SENT'},$unset:{notificationLease:1,notificationNextAttemptAt:1}});
  } catch {
    await Registration.updateOne(claim,{$set:{notificationStatus:'FAILED',notificationNextAttemptAt:new Date(Date.now()+Math.min(3600000,60000*2**Math.min(claimed.notificationAttempts-1,6)))},$unset:{notificationLease:1}});
    await Notification.create({registrationId:claimed._id,channel:'email',status:'FAILED',detail:'Confirmation email failed; automatic retry scheduled.'});
    return false;
  }
  await Notification.create({registrationId:claimed._id,channel:'email',status:'SENT'});
  return true;
}
export async function processNotificationQueue() {
  const jobs = await Registration.find({status:'CONFIRMED',notificationStatus:{$in:['PENDING','FAILED','SENDING']},notificationNextAttemptAt:{$lte:new Date()}}).select('_id').limit(10);
  for (const job of jobs) await notifyConfirmed(job);
}
export function startNotificationWorker() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await processNotificationQueue(); } catch { console.error('Email queue processing failed; will retry.'); }
    finally { running = false; }
  };
  const timer = setInterval(tick,15000); timer.unref(); void tick();
  return () => clearInterval(timer);
}
