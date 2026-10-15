import crypto from 'node:crypto';
import { Registration, Payment, Settings, ReminderLog } from '../models/index.js';
import { sendMail } from './email.js';
import { buildReminderEmail } from './reminderEmail.js';
import {
  generateRecoveryToken,
  buildResumeUrl,
  buildOptOutUrl,
} from './recoveryToken.js';

/**
 * Returns configurable reminder intervals in hours.
 * Defaults to [2, 24, 72] hours.
 * @param {Object} [settings]
 * @returns {number[]}
 */
export function getReminderIntervals(settings) {
  if (process.env.REMINDER_INTERVALS_HOURS) {
    const parsed = process.env.REMINDER_INTERVALS_HOURS.split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (parsed.length >= 3) return parsed.slice(0, 3);
  }

  const i1 = Number(process.env.REMINDER_INTERVAL_1_HOURS);
  const i2 = Number(process.env.REMINDER_INTERVAL_2_HOURS);
  const i3 = Number(process.env.REMINDER_INTERVAL_3_HOURS);
  if (Number.isFinite(i1) && Number.isFinite(i2) && Number.isFinite(i3) && i1 > 0 && i2 > 0 && i3 > 0) {
    return [i1, i2, i3];
  }

  if (Array.isArray(settings?.reminderIntervals) && settings.reminderIntervals.length >= 3) {
    return settings.reminderIntervals.slice(0, 3);
  }

  return [2, 24, 72];
}

/**
 * Checks whether automated background reminders are globally enabled.
 * Default is FALSE to ensure no bulk automated email is dispatched without admin approval.
 * @param {Object} [settings]
 * @returns {boolean}
 */
export function areRemindersEnabled(settings) {
  if (process.env.REMINDERS_ENABLED !== undefined) {
    return /^(true|1|yes)$/i.test(process.env.REMINDERS_ENABLED);
  }
  return !!settings?.remindersEnabled;
}

/**
 * Calculates the next attempt date for a given reminder count (0-indexed).
 * @param {number} attemptIndex - 0 for first reminder, 1 for second, 2 for third.
 * @param {Date} [baseDate] - Reference date (defaults to now).
 * @param {number[]} [intervals] - [2, 24, 72]
 * @returns {Date}
 */
export function calculateNextAttemptDate(attemptIndex, baseDate = new Date(), intervals = [2, 24, 72]) {
  const hours = intervals[attemptIndex] ?? intervals[intervals.length - 1];
  return new Date(baseDate.getTime() + hours * 3600 * 1000);
}

/**
 * Checks if a registration document is currently eligible for an incomplete registration reminder.
 * @param {Object} registration
 * @param {Object} [payment]
 * @returns {{ eligible: boolean, reason: string }}
 */
export function checkReminderEligibility(registration, payment = null) {
  if (!registration) return { eligible: false, reason: 'Registration not found' };
  if (registration.reminderOptOut) return { eligible: false, reason: 'Recipient opted out' };
  if (registration.reminderCount >= 3) return { eligible: false, reason: 'Max 3 reminders already sent' };

  // Terminal or approved statuses
  if (['approved', 'rejected', 'cancelled', 'superseded'].includes(registration.applicationStatus)) {
    return { eligible: false, reason: `Application status is ${registration.applicationStatus}` };
  }
  if (['CONFIRMED', 'CANCELLED', 'PAYMENT_REJECTED'].includes(registration.status)) {
    return { eligible: false, reason: `Status is ${registration.status}` };
  }

  // Submitted payment proof or verified payment
  if (['submitted', 'approved'].includes(registration.applicationStatus)) {
    return { eligible: false, reason: 'Application proof already submitted' };
  }
  if (['under_review', 'verified'].includes(registration.paymentStatus)) {
    return { eligible: false, reason: `Payment status is ${registration.paymentStatus}` };
  }
  if (registration.status === 'PAYMENT_UNDER_VERIFICATION') {
    return { eligible: false, reason: 'Payment is under verification' };
  }

  if (payment && ['PAID', 'UNDER_REVIEW'].includes(payment.status)) {
    return { eligible: false, reason: `Payment record status is ${payment.status}` };
  }

  if (!registration.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registration.email)) {
    return { eligible: false, reason: 'No valid recipient email address' };
  }

  return { eligible: true, reason: 'Eligible' };
}

/**
 * Sends a reminder email to a single registration with atomic leasing and delivery tracking.
 * @param {Object} registrationDoc
 * @param {Object} options
 * @param {string} [options.triggerType='AUTOMATIC'] - 'AUTOMATIC' or 'MANUAL'
 * @param {string} [options.actor='system'] - Admin email or 'system'
 * @param {Function} [options.deliver=sendMail] - Email delivery function (injectable for tests)
 * @returns {Promise<{ success: boolean, reason?: string, messageId?: string }>}
 */
export async function sendRegistrationReminder(
  registrationDoc,
  { triggerType = 'AUTOMATIC', actor = 'system', deliver = sendMail } = {}
) {
  const regId = registrationDoc._id;
  const lease = crypto.randomUUID();
  const leaseExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 minute worker lease

  // Atomic CAS claim: only one worker can process this registration
  const claimed = await Registration.findOneAndUpdate(
    {
      _id: regId,
      reminderCount: { $lt: 3 },
      reminderOptOut: { $ne: true },
      applicationStatus: { $in: ['draft', 'awaiting_payment_proof'] },
      status: { $in: ['DRAFT', 'OTP_VERIFIED', 'PAYMENT_PENDING'] },
      $or: [
        { reminderLease: null },
        { reminderLeaseExpiresAt: { $lt: new Date() } },
        { reminderStatus: { $in: ['PENDING', 'IDLE', 'SENDING'] } },
      ],
    },
    {
      $set: {
        reminderStatus: 'SENDING',
        reminderLease: lease,
        reminderLeaseExpiresAt: leaseExpires,
      },
    },
    { new: true }
  );

  if (!claimed) {
    const current = await Registration.findById(regId);
    if (current) {
      const eligibility = checkReminderEligibility(current);
      if (!eligibility.eligible) {
        await markRemindersCompleted(regId);
        await ReminderLog.create({
          registrationId: current._id,
          attemptNumber: current.reminderCount + 1,
          channel: 'email',
          recipientEmail: current.email,
          status: 'SKIPPED',
          errorDetail: eligibility.reason,
          triggerType,
          triggeredBy: actor,
        });
        return { success: false, reason: eligibility.reason };
      }
    }
    return { success: false, reason: 'Could not acquire worker lease or already completed' };
  }

  const claimQuery = { _id: claimed._id, reminderLease: lease };

  try {
    // 1. Fresh pre-send re-check: verify payment has not been submitted in the meantime
    const [existingPayment, settings] = await Promise.all([
      Payment.findOne({
        registrationId: claimed._id,
        status: { $in: ['PAID', 'UNDER_REVIEW'] },
      }),
      Settings.findById('primary'),
    ]);

    const eligibility = checkReminderEligibility(claimed, existingPayment);
    if (!eligibility.eligible) {
      // Ineligible now (e.g. parent submitted or paid)
      const nextStatus = ['approved', 'submitted'].includes(claimed.applicationStatus) ||
        existingPayment?.status === 'PAID'
        ? 'COMPLETED'
        : claimed.reminderOptOut
          ? 'OPT_OUT'
          : 'COMPLETED';

      await Registration.updateOne(claimQuery, {
        $set: { reminderStatus: nextStatus, reminderNextAttemptAt: null },
        $unset: { reminderLease: 1, reminderLeaseExpiresAt: 1 },
      });

      await ReminderLog.create({
        registrationId: claimed._id,
        attemptNumber: claimed.reminderCount + 1,
        channel: 'email',
        recipientEmail: claimed.email,
        status: 'SKIPPED',
        errorDetail: eligibility.reason,
        triggerType,
        triggeredBy: actor,
      });

      return { success: false, reason: eligibility.reason };
    }

    // 2. Generate secure single-use recovery token (stores hash in DB, sends raw token in URL)
    const { rawToken, tokenHash, expiresAt } = generateRecoveryToken();
    const resumeUrl = buildResumeUrl(rawToken);
    const optOutUrl = buildOptOutUrl(rawToken);

    // Update recovery token hash on registration
    await Registration.updateOne(claimQuery, {
      $set: {
        recoveryTokenHash: tokenHash,
        recoveryTokenExpiresAt: expiresAt,
      },
    });

    // 3. Render professional HTML email
    const attemptNumber = claimed.reminderCount + 1;
    const emailPayload = buildReminderEmail({
      registration: claimed,
      settings: settings || {},
      resumeUrl,
      optOutUrl,
      attemptNumber,
    });

    // 4. Send email through established provider
    const sendResult = await deliver({
      to: claimed.email,
      subject: emailPayload.subject,
      html: emailPayload.html,
      text: emailPayload.text,
    });

    const providerMessageId = sendResult?.messageId || sendResult?.providerId || '';

    // 5. Success state transition & schedule next reminder if attemptNumber < 3
    const intervals = getReminderIntervals(settings);
    const newCount = attemptNumber;
    const isFinal = newCount >= 3;
    const nextAttemptAt = isFinal ? null : calculateNextAttemptDate(newCount, new Date(), intervals);
    const nextStatus = isFinal ? 'COMPLETED' : 'PENDING';

    await Registration.updateOne(claimQuery, {
      $set: {
        reminderCount: newCount,
        reminderStatus: nextStatus,
        reminderNextAttemptAt: nextAttemptAt,
        reminderLastSentAt: new Date(),
      },
      $unset: {
        reminderLease: 1,
        reminderLeaseExpiresAt: 1,
      },
    });

    // 6. Record audit delivery log
    await ReminderLog.create({
      registrationId: claimed._id,
      attemptNumber,
      channel: 'email',
      recipientEmail: claimed.email,
      status: 'SENT',
      providerMessageId,
      triggerType,
      triggeredBy: actor,
      sentAt: new Date(),
    });

    return { success: true, messageId: providerMessageId };
  } catch (err) {
    // 7. Transient failure handling with exponential backoff
    const failureCount = (claimed.reminderCount || 0) + 1;
    const backoffMs = Math.min(3600000, 60000 * 2 ** Math.min(failureCount, 6)); // 2m, 4m, 8m... up to 1hr
    const retryAt = new Date(Date.now() + backoffMs);

    await Registration.updateOne(claimQuery, {
      $set: {
        reminderStatus: 'PENDING',
        reminderNextAttemptAt: retryAt,
      },
      $unset: {
        reminderLease: 1,
        reminderLeaseExpiresAt: 1,
      },
    });

    await ReminderLog.create({
      registrationId: claimed._id,
      attemptNumber: claimed.reminderCount + 1,
      channel: 'email',
      recipientEmail: claimed.email,
      status: 'FAILED',
      errorDetail: err.message || 'Email delivery failed',
      triggerType,
      triggeredBy: actor,
      sentAt: new Date(),
    });

    return { success: false, reason: err.message };
  }
}

/**
 * Manually triggers a reminder for a registration initiated by an administrator.
 * Bypasses global pause killswitch, but respects student eligibility and updates audit logs.
 * @param {string|ObjectId} registrationId
 * @param {Object} admin
 * @param {Function} [deliver]
 * @returns {Promise<{ success: boolean, reason?: string, messageId?: string }>}
 */
export async function sendManualReminder(registrationId, admin, deliver = sendMail) {
  const registration = await Registration.findById(registrationId);
  if (!registration) {
    throw Object.assign(new Error('Registration not found.'), { status: 404 });
  }

  const eligibility = checkReminderEligibility(registration);
  if (!eligibility.eligible && registration.reminderCount >= 3) {
    // If admin explicitly forces a manual reminder past 3, allow resetting count to 2 so 1 more can be sent
    registration.reminderCount = 2;
    await registration.save();
  } else if (!eligibility.eligible) {
    throw Object.assign(new Error(`Cannot send reminder: ${eligibility.reason}`), { status: 400 });
  }

  return sendRegistrationReminder(registration, {
    triggerType: 'MANUAL',
    actor: admin?.email || 'admin',
    deliver,
  });
}

/**
 * Processes due incomplete registrations in the queue.
 * @param {number} [limit=10]
 * @param {Function} [deliver=sendMail]
 * @returns {Promise<{ processed: number, successes: number, failures: number }>}
 */
export async function processReminderQueue(limit = 10, deliver = sendMail) {
  const settings = await Settings.findById('primary');
  if (!areRemindersEnabled(settings)) {
    // Reminders globally paused or disabled pending admin approval
    return { processed: 0, successes: 0, failures: 0, paused: true };
  }

  const now = new Date();

  // Find candidate registrations:
  // 1. reminderStatus is PENDING with reminderNextAttemptAt <= now
  // 2. Or reminderStatus is IDLE with draft created > interval 1 ago and reminderCount === 0
  const intervals = getReminderIntervals(settings);
  const initialThreshold = new Date(now.getTime() - intervals[0] * 3600 * 1000);

  const candidates = await Registration.find({
    status: { $in: ['DRAFT', 'OTP_VERIFIED', 'PAYMENT_PENDING'] },
    applicationStatus: { $in: ['draft', 'awaiting_payment_proof'] },
    paymentStatus: { $in: ['not_submitted', 'pending'] },
    reminderOptOut: { $ne: true },
    reminderCount: { $lt: 3 },
    $or: [
      {
        reminderStatus: 'PENDING',
        reminderNextAttemptAt: { $lte: now },
      },
      {
        reminderStatus: { $in: ['IDLE', '', null] },
        reminderCount: 0,
        createdAt: { $lte: initialThreshold },
      },
      {
        reminderStatus: 'SENDING',
        reminderLeaseExpiresAt: { $lt: now }, // Stale lease recovery
      },
    ],
  })
    .sort({ reminderNextAttemptAt: 1, createdAt: 1 })
    .limit(limit);

  let successes = 0;
  let failures = 0;

  for (const candidate of candidates) {
    const result = await sendRegistrationReminder(candidate, {
      triggerType: 'AUTOMATIC',
      actor: 'system',
      deliver,
    });
    if (result.success) successes++;
    else failures++;
  }

  return { processed: candidates.length, successes, failures };
}

/**
 * Marks reminders completed when an application successfully uploads payment proof or is confirmed.
 * @param {string|ObjectId} registrationId
 */
export async function markRemindersCompleted(registrationId) {
  try {
    await Registration.updateOne(
      { _id: registrationId },
      {
        $set: {
          reminderStatus: 'COMPLETED',
          reminderNextAttemptAt: null,
        },
        $unset: {
          reminderLease: 1,
          reminderLeaseExpiresAt: 1,
          recoveryTokenHash: 1,
          recoveryTokenExpiresAt: 1,
        },
      }
    );
  } catch (err) {
    console.error('Failed to mark reminders completed for registration:', registrationId, err);
  }
}

/**
 * Starts the background reminder scheduler worker.
 * Checks queue every 30 seconds.
 * @returns {Function} stopFunction
 */
export function startReminderWorker() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await processReminderQueue(10);
    } catch (err) {
      console.error('Reminder queue error; will retry next interval.', err);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, 30000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
