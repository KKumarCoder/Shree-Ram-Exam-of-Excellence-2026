import { randomUUID } from 'node:crypto';
import { Registration, Notification, Settings, Payment } from '../models/index.js';
import {
  sendPaymentReceived,
  sendAdmitCardWhatsApp,
} from './apitxt/index.js';

export { sendOtp, verifyOtp } from './registrationOTP.js';

/**
 * Dispatches WhatsApp Payment Verification and Admit Card PDF notifications
 * via APITxT WhatsApp gateway.
 */
export async function notifyConfirmed(registration) {
  const lease = randomUUID();
  const now = new Date();

  const claimed = await Registration.findOneAndUpdate(
    {
      _id: registration._id,
      status: 'CONFIRMED',
      notificationStatus: { $in: ['PENDING', 'FAILED', 'SENDING'] },
      notificationNextAttemptAt: { $lte: now },
    },
    {
      $set: {
        notificationStatus: 'SENDING',
        notificationLease: lease,
        notificationNextAttemptAt: new Date(now.getTime() + 300000),
      },
      $inc: { notificationAttempts: 1 },
    },
    { new: true },
  );

  if (!claimed) return false;
  const claim = { _id: claimed._id, notificationLease: lease };

  try {
    const [payment, settings] = await Promise.all([
      claimed.paymentId
        ? Payment.findById(claimed.paymentId)
        : Payment.findOne({ registrationId: claimed._id }).sort({ createdAt: -1 }),
      Settings.findOneAndUpdate(
        { _id: 'primary' },
        { $setOnInsert: { _id: 'primary' } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ),
    ]);

    // 1. Send Payment Received WhatsApp Notification (shree_payment_received)
    try {
      await sendPaymentReceived(claimed, payment || { amount: settings?.fee || 149 });
    } catch (e) {
      console.warn('[Notifications] Payment received notification error:', e.message);
    }

    // Pacing delay (1.2 seconds) so messages arrive in clean chronological order on WhatsApp
    await new Promise((resolve) => setTimeout(resolve, 1200));

    // 2. Send Official Admit Card WhatsApp Notification with PDF Download Button (shree_olympiad_admit_card)
    if (claimed.admitToken) {
      try {
        await sendAdmitCardWhatsApp(claimed, settings);
      } catch (e) {
        console.warn('[Notifications] Admit card notification error:', e.message);
      }
    }

    await Registration.updateOne(claim, {
      $set: { notificationStatus: 'SENT' },
      $unset: { notificationLease: 1, notificationNextAttemptAt: 1 },
    });

    await Notification.create({
      registrationId: claimed._id,
      channel: 'whatsapp',
      status: 'SENT',
      detail: 'Payment confirmation and Admit Card sent via WhatsApp.',
    });

    return true;
  } catch (error) {
    const backoff = Math.min(
      3600000,
      60000 * 2 ** Math.min(claimed.notificationAttempts - 1, 6),
    );

    await Registration.updateOne(claim, {
      $set: {
        notificationStatus: 'FAILED',
        notificationNextAttemptAt: new Date(Date.now() + backoff),
      },
      $unset: { notificationLease: 1 },
    });

    await Notification.create({
      registrationId: claimed._id,
      channel: 'whatsapp',
      status: 'FAILED',
      detail: `WhatsApp confirmation failed: ${error.message}; automatic retry scheduled.`,
    });

    return false;
  }
}

export async function processNotificationQueue() {
  const jobs = await Registration.find({
    status: 'CONFIRMED',
    notificationStatus: { $in: ['PENDING', 'FAILED', 'SENDING'] },
    notificationNextAttemptAt: { $lte: new Date() },
  })
    .select('_id')
    .limit(10);

  for (const job of jobs) {
    await notifyConfirmed(job);
  }
}

export function startNotificationWorker() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await processNotificationQueue();
    } catch {
      console.error('WhatsApp notification queue processing failed; will retry.');
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, 15000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
