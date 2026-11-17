import { Registration, Counter, Audit, Payment } from "../models/index.js";
import { randomToken } from "../middleware/auth.js";
import { notifyConfirmed } from "./notifications.js";
const conflict = () =>
  Object.assign(
    new Error(
      "Registration confirmation is processing or unavailable. Retry shortly.",
    ),
    { status: 409 },
  );
export async function confirmRegistration(registrationId, actor) {
  const before = await Registration.findById(registrationId);
  if (before?.status === "CONFIRMED") return before;
  let claimQuery = {
    _id: registrationId,
    status: {
      $in: [
        "OTP_VERIFIED",
        "PAYMENT_PENDING",
        "PAYMENT_UNDER_VERIFICATION",
        "PAYMENT_REJECTED",
      ],
    },
  };
  if (before?.status === "CONFIRMING") {
    // Recover a stopped worker only after its claim expires and payment is recorded paid.
    if (
      before.updatedAt > new Date(Date.now() - 120000) ||
      !(await Payment.exists({ registrationId, status: "PAID" }))
    )
      throw conflict();
    claimQuery = {
      _id: registrationId,
      status: "CONFIRMING",
      updatedAt: before.updatedAt,
    };
  }
  const claimed = await Registration.findOneAndUpdate(
    claimQuery,
    { $set: { status: "CONFIRMING" } },
    { new: true },
  );
  if (!claimed) {
    const existing = await Registration.findById(registrationId);
    if (existing?.status === "CONFIRMED") return existing;
    throw conflict();
  }
  const claim = {
    _id: registrationId,
    status: "CONFIRMING",
    updatedAt: claimed.updatedAt,
  };
  try {
    const seq = await Counter.findOneAndUpdate(
      { _id: "SHREE27" },
      { $inc: { seq: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    const paidPayment = await Payment.findOne({
      registrationId,
      status: "PAID",
    }).sort({ createdAt: -1 });

    const confirmed = await Registration.findOneAndUpdate(
      claim,
      {
        $set: {
          registrationNumber: `SHREE27-${seq.seq + 999}`,
          admitToken: randomToken(),
          status: "CONFIRMED",
          applicationStatus: "approved",
          paymentStatus: "verified",
          approvedAt: new Date(),
          notificationStatus: "PENDING",
          notificationNextAttemptAt: new Date(),
          notificationAttempts: 0,
          reminderStatus: "COMPLETED",
          reminderNextAttemptAt: null,
          ...((!before?.paymentId || !before?.paymentMode) && paidPayment
            ? {
                paymentId: paidPayment._id,
                paymentMode: paidPayment.mode,
              }
            : {}),
        },
        $unset: {
          reminderLease: 1,
          reminderLeaseExpiresAt: 1,
          recoveryTokenHash: 1,
          recoveryTokenExpiresAt: 1,
        },
        $push: {
          statusHistory: {
            from: before?.status || "PAYMENT_UNDER_VERIFICATION",
            to: "CONFIRMED",
            axis: "legacy",
            changedAt: new Date(),
            reason: `Payment verified and admit card issued (${actor})`,
            actor,
          },
        },
      },
      { new: true },
    );
    if (!confirmed) throw conflict();
    await Audit.create({
      actor,
      action: "REGISTRATION_CONFIRMED",
      registrationId: confirmed._id,
      details: { registrationNumber: confirmed.registrationNumber },
    });
    // Trigger immediate background dispatch of the confirmation sequence:
    // 1. shree_payment_received -> 2. shree_olympiad_admit_card
    notifyConfirmed(confirmed).catch((err) => {
      console.warn("[Confirm] Async notifyConfirmed queued for worker:", err.message);
    });
    return confirmed;
  } catch (error) {
    const fallback =
      before?.status === "CONFIRMING"
        ? before.paymentMode === "manual"
          ? "PAYMENT_UNDER_VERIFICATION"
          : "PAYMENT_PENDING"
        : before?.status || "PAYMENT_PENDING";
    await Registration.updateOne(claim, { $set: { status: fallback } });
    throw error;
  }
}
