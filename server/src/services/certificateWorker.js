import { Registration } from "../models/index.js";
import { sendCertificateEmail } from "./certificateEmail.js";

let workerInterval = null;
let isProcessing = false;

/**
 * Returns the delay hours required after check-in before certificate is issued.
 * Defaults to 4 hours as requested by user.
 */
export function getCertificateDelayHours() {
  const envVal = Number(process.env.CERTIFICATE_HOURS_DELAY);
  if (Number.isFinite(envVal) && envVal >= 0) {
    return envVal;
  }
  return 4; // Default: exactly 4 hours
}

/**
 * Scans database for students who marked attendance at least 4 hours ago
 * and dispatches their official participation certificate via email.
 */
export async function processEligibleCertificates() {
  if (isProcessing) return { processed: 0, skipped: "already_processing" };
  isProcessing = true;

  try {
    const delayHours = getCertificateDelayHours();
    const cutoffDate = new Date(Date.now() - delayHours * 60 * 60 * 1000);

    // Find candidates who checked in on or before cutoff date, but haven't received certificate yet
    const eligibleCandidates = await Registration.find({
      status: "CONFIRMED",
      checkInAt: { $ne: null, $lte: cutoffDate },
      certificateIssuedAt: null,
      certificateStatus: { $nin: ["SENT", "PROCESSING"] },
    })
      .limit(15) // Safe batching to prevent SMTP rate spikes
      .exec();

    if (!eligibleCandidates.length) {
      return { processed: 0, message: "No candidates currently eligible." };
    }

    console.log(`[CERTIFICATE WORKER] Found ${eligibleCandidates.length} eligible candidates for certificate dispatch (Cutoff: ${cutoffDate.toISOString()})`);

    let successCount = 0;
    let failCount = 0;

    for (const student of eligibleCandidates) {
      try {
        // Mark as PROCESSING to avoid concurrent duplicate dispatch
        await Registration.findByIdAndUpdate(student._id, {
          $set: { certificateStatus: "PROCESSING" },
        });

        // Generate and send Certificate PDF via email
        await sendCertificateEmail(student);
        successCount++;
        console.log(`[CERTIFICATE WORKER] Successfully sent certificate to ${student.studentName} (${student.email})`);
      } catch (err) {
        failCount++;
        console.error(`[CERTIFICATE WORKER] Failed to send certificate to ${student.studentName}:`, err.message);
        await Registration.findByIdAndUpdate(student._id, {
          $set: {
            certificateStatus: "FAILED",
            certificateError: err.message || "Failed to dispatch certificate",
          },
        }).catch(() => {});
      }
    }

    return {
      processed: eligibleCandidates.length,
      successCount,
      failCount,
    };
  } catch (err) {
    console.error("[CERTIFICATE WORKER] Error during certificate processing run:", err);
    return { error: err.message };
  } finally {
    isProcessing = false;
  }
}

/**
 * Starts the automated certificate background worker
 */
export function startCertificateWorker(intervalMs = 5 * 60 * 1000) {
  if (workerInterval) return;

  console.log(`[CERTIFICATE WORKER] Starting automatic 4-hour post-attendance certificate worker (Interval: ${Math.round(intervalMs / 1000)}s)...`);

  // Run initial check after 10 seconds of startup
  setTimeout(() => {
    processEligibleCertificates().catch(() => {});
  }, 10000);

  // Periodic recurring check
  workerInterval = setInterval(() => {
    processEligibleCertificates().catch(() => {});
  }, intervalMs);

  return workerInterval;
}

export function stopCertificateWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    console.log("[CERTIFICATE WORKER] Stopped certificate background worker.");
  }
}
