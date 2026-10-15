import 'dotenv/config';
import mongoose from 'mongoose';

async function audit() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const collections = await db.listCollections().toArray();
  console.log('Collections in database:');
  for (const c of collections) {
    const count = await db.collection(c.name).countDocuments();
    console.log(` - ${c.name}: ${count} documents`);
  }

  const regColl = db.collection('registrations');
  const payColl = db.collection('payments');

  const regStatuses = await regColl.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray();
  console.log('\nRegistration status breakdown:', JSON.stringify(regStatuses, null, 2));

  const payStatuses = await payColl.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray();
  console.log('\nPayment status breakdown:', JSON.stringify(payStatuses, null, 2));

  // Check existing indexes
  const regIndexes = await regColl.indexes();
  console.log('\nRegistration indexes:');
  for (const idx of regIndexes) {
    console.log(` - ${idx.name}: key=${JSON.stringify(idx.key)}, unique=${!!idx.unique}, sparse=${!!idx.sparse}`);
  }

  const payIndexes = await payColl.indexes();
  console.log('\nPayment indexes:');
  for (const idx of payIndexes) {
    console.log(` - ${idx.name}: key=${JSON.stringify(idx.key)}, unique=${!!idx.unique}, sparse=${!!idx.sparse}`);
  }

  // Check suspected duplicate registrations:
  // Same normalized studentName, dob, studentClass, guardianPhone
  const duplicateCandidates = await regColl.aggregate([
    {
      $project: {
        normName: { $toUpper: { $trim: { input: '$studentName' } } },
        dob: 1,
        studentClass: 1,
        guardianPhone: 1,
        applicationRef: 1,
        registrationNumber: 1,
        status: 1,
        paymentId: 1,
        createdAt: 1
      }
    },
    {
      $group: {
        _id: {
          normName: '$normName',
          dob: '$dob',
          studentClass: '$studentClass',
          guardianPhone: '$guardianPhone'
        },
        count: { $sum: 1 },
        records: {
          $push: {
            id: '$_id',
            ref: '$applicationRef',
            regNo: '$registrationNumber',
            status: '$status',
            hasPayment: { $ne: ['$paymentId', null] },
            createdAt: '$createdAt'
          }
        }
      }
    },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray();

  console.log(`\nSuspected duplicate student identity groups (same name, DOB, class, phone): ${duplicateCandidates.length}`);
  if (duplicateCandidates.length > 0) {
    console.log('Sample duplicates:', JSON.stringify(duplicateCandidates.slice(0, 5), null, 2));
  }

  // Same guardianPhone across different students (parent registering multiple kids)
  const multiStudents = await regColl.aggregate([
    {
      $project: {
        normName: { $toUpper: { $trim: { input: '$studentName' } } },
        studentClass: 1,
        guardianPhone: 1,
        applicationRef: 1,
        status: 1
      }
    },
    {
      $group: {
        _id: '$guardianPhone',
        uniqueStudentNames: { $addToSet: '$normName' },
        totalApplications: { $sum: 1 },
        apps: { $push: { name: '$normName', class: '$studentClass', ref: '$applicationRef', status: '$status' } }
      }
    },
    { $match: { totalApplications: { $gt: 1 } } },
    { $sort: { totalApplications: -1 } }
  ]).toArray();

  const multiKids = multiStudents.filter(m => m.uniqueStudentNames.length > 1);
  console.log(`\nParents with multiple distinct students: ${multiKids.length}`);
  if (multiKids.length > 0) {
    console.log('Sample multi-student families:', JSON.stringify(multiKids.slice(0, 3), null, 2));
  }

  // Duplicate UTR check
  const duplicateUtrs = await payColl.aggregate([
    { $match: { utr: { $exists: true, $nin: ['', null] } } },
    {
      $group: {
        _id: { $toUpper: { $trim: { input: '$utr' } } },
        count: { $sum: 1 },
        payments: { $push: { id: '$_id', status: '$status', regId: '$registrationId', createdAt: '$createdAt' } }
      }
    },
    { $match: { count: { $gt: 1 } } }
  ]).toArray();

  console.log(`\nDuplicate UTR values in payments: ${duplicateUtrs.length}`);
  if (duplicateUtrs.length > 0) {
    console.log('Sample duplicate UTRs:', JSON.stringify(duplicateUtrs, null, 2));
  }

  // Check null or empty UTR payments
  const emptyUtrCount = await payColl.countDocuments({
    $or: [{ utr: { $exists: false } }, { utr: null }, { utr: '' }]
  });
  console.log(`\nPayments with empty/missing UTR: ${emptyUtrCount}`);

  await mongoose.disconnect();
}

audit().catch(e => {
  console.error('Audit failed:', e);
  process.exit(1);
});
