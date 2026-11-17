import { WhatsAppMessage } from '../../models/index.js';
import { logSafeError } from './errorHandler.js';

/**
 * Normalizes webhook delivery status to standard schema enum:
 * 'SENT', 'DELIVERED', 'READ', 'FAILED'
 */
function normalizeStatus(rawStatus) {
  if (!rawStatus) return null;
  const s = String(rawStatus).toLowerCase().trim();
  if (s.includes('read') || s.includes('seen') || s === 'blue_tick') return 'READ';
  if (s.includes('deliver') || s === 'double_tick') return 'DELIVERED';
  if (s.includes('fail') || s.includes('error') || s.includes('reject') || s.includes('undeliver'))
    return 'FAILED';
  if (s.includes('sent') || s === 'single_tick') return 'SENT';
  return null;
}

/**
 * Handles incoming APITxT delivery report webhook payload.
 *
 * Supported payload shapes:
 * 1) { request_id: "...", status: "delivered", timestamp: "..." }
 * 2) { msgId: "...", status: "read", mobile: "91..." }
 * 3) Array of status events: [ { request_id: "...", status: "..." }, ... ]
 */
export async function processApitxtWebhook(body) {
  if (!body) return { processed: 0, status: 'empty_body' };

  const events = Array.isArray(body) ? body : [body];
  let updatedCount = 0;

  for (const event of events) {
    try {
      const requestId =
        event.request_id ||
        event.requestId ||
        event.msgId ||
        event.msg_id ||
        event.message_id ||
        event.id;

      const rawStatus = event.status || event.delivery_status || event.event;
      const targetStatus = normalizeStatus(rawStatus);

      if (!targetStatus) continue;

      let msg = null;

      if (requestId) {
        msg = await WhatsAppMessage.findOne({
          $or: [
            { providerRequestId: String(requestId) },
            { providerMessageId: String(requestId) },
          ],
        });
      }

      // If not matched by requestId, attempt matching by mobile within recent 24h
      if (!msg && event.mobile) {
        const phone = String(event.mobile).replace(/\D/g, '');
        const normPhone = phone.length === 10 ? `91${phone}` : phone;
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        msg = await WhatsAppMessage.findOne({
          recipientPhone: normPhone,
          createdAt: { $gte: oneDayAgo },
        }).sort({ createdAt: -1 });
      }

      if (!msg) {
        continue;
      }

      const now = new Date(event.timestamp || Date.now());

      // Status transition hierarchy: PENDING -> SENT -> DELIVERED -> READ
      // (Do not downgrade from READ to DELIVERED)
      if (targetStatus === 'READ') {
        msg.status = 'READ';
        msg.readAt = now;
        if (!msg.deliveredAt) msg.deliveredAt = now;
      } else if (targetStatus === 'DELIVERED') {
        if (msg.status !== 'READ') {
          msg.status = 'DELIVERED';
          msg.deliveredAt = now;
        }
      } else if (targetStatus === 'FAILED') {
        msg.status = 'FAILED';
        msg.failedAt = now;
        msg.errorCode = String(event.error_code || event.code || 'WEBHOOK_FAILURE');
        msg.errorMessage = String(event.reason || event.error || event.message || 'Delivery failed');
      } else if (targetStatus === 'SENT') {
        if (msg.status === 'PENDING') {
          msg.status = 'SENT';
          msg.sentAt = now;
        }
      }

      await msg.save();
      updatedCount++;
    } catch (err) {
      logSafeError('Error processing webhook event', err);
    }
  }

  return { processed: updatedCount, totalEvents: events.length };
}

