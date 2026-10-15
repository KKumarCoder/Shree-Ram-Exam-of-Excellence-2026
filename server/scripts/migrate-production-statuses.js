import 'dotenv/config';
import mongoose from 'mongoose';
import { Registration, Payment, mapLegacyToNewStatuses } from '../src/models/index.js';
import { generateStudentIdentityHash } from '../src/utils/identity.js';

/**
 * Non-destructive status and identity backfill script.
 * - Leaves all existing fields, applicationRefs, registration numbers, payments, and photos intact.
 * - Computes studentIdentityHash for all existing records.
 * - Populates verificationStatus, applicationStatus, paymentStatus, submittedAt, approvedAt based on current status.
 * - Records an initial entry in statusHistory for auditability.
 */
export async function runBackfill(dryRun = false) {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
  }

  const registrations = await Registration.find().lean();
  console.log(`Auditing ${registrations.length} registrations for non-destructive backfill...`);

  let updatedCount = 0;

  for (const doc of registrations) {
    const hash = generateStudentIdentityHash({
      examId: 'SHREE27',
      guardianPhone: doc.guardianPhone,
      studentName: doc.studentName,
      dob: doc.dob,
      studentClass: doc.studentClass,
    });

    const newStatuses = mapLegacyToNewStatuses(doc.status);

    const update = {
      $set: {
        studentIdentityHash: hash,
        verificationStatus: doc.verificationStatus || newStatuses.verificationStatus,
        applicationStatus: doc.applicationStatus || newStatuses.applicationStatus,
        paymentStatus: doc.paymentStatus || newStatuses.paymentStatus,
      },
    };

    if (doc.status === 'CONFIRMED' && !doc.approvedAt) {
      update.$set.approvedAt = doc.updatedAt || doc.createdAt;
      update.$set.submittedAt = doc.termsAcceptedAt || doc.createdAt;
    } else if (['PAYMENT_UNDER_VERIFICATION', 'PAYMENT_REJECTED'].includes(doc.status) && !doc.submittedAt) {
      update.$set.submittedAt = doc.termsAcceptedAt || doc.updatedAt || doc.createdAt;
    }

    if (!doc.statusHistory || doc.statusHistory.length === 0) {
      update.$push = {
        statusHistory: {
          from: 'INITIAL',
          to: doc.status,
          axis: 'legacy',
          changedAt: doc.createdAt,
          reason: 'Initial registration record backfill',
          actor: 'migration',
        },
      };
    }

    if (!dryRun) {
      await Registration.updateOne({ _id: doc._id }, update);
    }
    updatedCount++;
  }

  console.log(`${dryRun ? '[DRY RUN] Would update' : 'Successfully backfilled'} ${updatedCount} registrations.`);
  return updatedCount;
}

if (process.argv[1]?.endsWith('migrate-production-statuses.js')) {
  runBackfill(process.argv.includes('--dry-run'))
    .then(async () => {
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('Backfill error:', err);
      await mongoose.disconnect();
      process.exit(1);
    });
}
