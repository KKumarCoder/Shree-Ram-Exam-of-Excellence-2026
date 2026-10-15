import { Registration, Payment } from "../models/index.js";

export const registrationStatuses = [
  "DRAFT",
  "OTP_VERIFIED",
  "AWAITING_PAYMENT",
  "PAYMENT_PENDING",
  "PAYMENT_SUBMITTED",
  "PAYMENT_UNDER_VERIFICATION",
  "UNDER_REVIEW",
  "CONFIRMING",
  "CONFIRMED",
  "APPROVED",
  "PAYMENT_REJECTED",
  "CANCELLED",
];
export const paymentStatuses = ["UNDER_REVIEW", "PAID", "REJECTED"];
const invalid = (message) => Object.assign(new Error(message), { status: 400 });
export function recordFilters(query, payments = false) {
  const status = String(query.status || "");
  if (
    status &&
    !(payments ? paymentStatuses : registrationStatuses).includes(status)
  )
    throw invalid("Choose a valid status.");
  const studentClass = String(query.studentClass || "");
  if (studentClass && !/^(?:[2-9]|1[01])$/.test(studentClass))
    throw invalid("Choose a class from 2 to 11.");
  const course = String(query.course || "").trim().toUpperCase();
  if (course && !["PCM", "PCB", "ARTS", "COMMERCE"].includes(course))
    throw invalid("Choose a valid course/stream.");
  const date = {};
  for (const [field, op] of [
    ["from", "$gte"],
    ["to", "$lt"],
  ]) {
    if (!query[field]) continue;
    const value = String(query[field]);
    const day = new Date(`${value}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(+day) ||
      day.toISOString().slice(0, 10) !== value
    )
      throw invalid("Choose valid dates.");
    // Calendar filters use the school's India timezone, including the entire end date.
    date[op] = new Date(+day - 330 * 60000 + (field === "to" ? 86400000 : 0));
  }
  if (date.$gte && date.$lt && date.$gte >= date.$lt)
    throw invalid("End date must be on or after start date.");
  const page = Math.max(
    1,
    Math.min(100000, Math.floor(Number(query.page)) || 1),
  );
  const limit = [5, 10, 25, 50, 100].includes(Number(query.limit))
    ? Number(query.limit)
    : 5;
  return {
    status,
    studentClass,
    course,
    date,
    page,
    limit,
    search: String(query.search || "")
      .trim()
      .slice(0, 100)
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  };
}
export function registrationQuery(filters) {
  const { status, studentClass, course, date, search } = filters;
  const q = {};
  if (status) {
    if (status === "DRAFT") {
      q.$or = [{ status: "DRAFT" }, { applicationStatus: "draft" }];
    } else if (
      status === "AWAITING_PAYMENT" ||
      status === "OTP_VERIFIED" ||
      status === "PAYMENT_PENDING"
    ) {
      q.$or = [
        { status: { $in: ["OTP_VERIFIED", "PAYMENT_PENDING"] } },
        { applicationStatus: "awaiting_payment_proof" },
      ];
    } else if (status === "PAYMENT_SUBMITTED") {
      q.$or = [
        { status: "PAYMENT_UNDER_VERIFICATION" },
        { applicationStatus: "submitted" },
      ];
    } else if (
      status === "PAYMENT_UNDER_VERIFICATION" ||
      status === "UNDER_REVIEW"
    ) {
      q.$or = [
        { status: "PAYMENT_UNDER_VERIFICATION" },
        { paymentStatus: "under_review" },
      ];
    } else if (status === "CONFIRMED" || status === "APPROVED") {
      q.$or = [{ status: "CONFIRMED" }, { applicationStatus: "approved" }];
    } else if (status === "CANCELLED") {
      q.$or = [{ status: "CANCELLED" }, { applicationStatus: "superseded" }];
    } else {
      q.status = status;
    }
  }
  if (studentClass) q.studentClass = studentClass;
  if (course) q.course = course;
  if (Object.keys(date).length) q.createdAt = date;
  if (search)
    q.$or = [
      "studentName",
      "applicationRef",
      "registrationNumber",
      "guardianPhone",
      "email",
    ].map((field) => ({ [field]: { $regex: search, $options: "i" } }));
  return q;
}
export function paymentPipeline(filters) {
  const { status, date, search, studentClass } = filters;
  const q = { mode: "manual", status: status || { $in: paymentStatuses } };
  if (Object.keys(date).length) q.createdAt = date;
  const pipeline = [
    { $match: q },
    { $sort: { createdAt: -1, _id: -1 } },
    {
      $lookup: {
        from: Registration.collection.name,
        localField: "registrationId",
        foreignField: "_id",
        as: "student",
      },
    },
    { $unwind: { path: "$student", preserveNullAndEmptyArrays: true } },
  ];
  if (studentClass)
    pipeline.push({ $match: { "student.studentClass": studentClass } });
  if (search)
    pipeline.push({
      $match: {
        $or: [
          "utr",
          "student.studentName",
          "student.applicationRef",
          "student.registrationNumber",
          "student.guardianPhone",
          "student.email",
        ].map((field) => ({ [field]: { $regex: search, $options: "i" } })),
      },
    });
  pipeline.push({
    $project: {
      _id: 1,
      amount: 1,
      utr: 1,
      status: 1,
      createdAt: 1,
      verifiedAt: 1,
      reviewNote: 1,
      hasReceipt: { $ne: [{ $ifNull: ["$receipt.publicId", ""] }, ""] },
      registrationId: {
        _id: "$student._id",
        studentName: "$student.studentName",
        studentClass: "$student.studentClass",
        guardianPhone: "$student.guardianPhone",
        email: "$student.email",
        applicationRef: "$student.applicationRef",
        registrationNumber: "$student.registrationNumber",
        status: "$student.status",
      },
    },
  });
  return pipeline;
}
export async function listPayments(filters) {
  const [result] = await Payment.aggregate([
    ...paymentPipeline(filters),
    {
      $facet: {
        items: [
          { $skip: (filters.page - 1) * filters.limit },
          { $limit: filters.limit },
        ],
        count: [{ $count: "total" }],
      },
    },
  ]);
  const total = result.count[0]?.total || 0;
  return {
    items: result.items,
    total,
    page: filters.page,
    pages: Math.ceil(total / filters.limit),
    limit: filters.limit,
  };
}

export async function getAdminDashboardMetrics() {
  const [
    totalApplications,
    confirmed,
    incomplete,
    contactVerified,
    awaitingPaymentProof,
    paymentUnderReview,
  ] = await Promise.all([
    Registration.countDocuments({
      status: { $ne: "CANCELLED" },
      applicationStatus: { $ne: "superseded" },
    }),
    Registration.countDocuments({ status: "CONFIRMED" }),
    Registration.countDocuments({
      status: { $in: ["DRAFT", "OTP_VERIFIED", "PAYMENT_PENDING"] },
      applicationStatus: { $ne: "superseded" },
    }),
    Registration.countDocuments({
      $or: [
        { verificationStatus: "verified" },
        { verifiedAt: { $ne: null } },
      ],
      applicationStatus: { $ne: "superseded" },
    }),
    Registration.countDocuments({
      status: { $in: ["OTP_VERIFIED", "PAYMENT_PENDING"] },
      paymentId: null,
      applicationStatus: { $ne: "superseded" },
    }),
    Registration.countDocuments({
      status: "PAYMENT_UNDER_VERIFICATION",
      applicationStatus: { $ne: "superseded" },
    }),
  ]);

  const uniqueStudentAgg = await Registration.aggregate([
    {
      $match: {
        status: { $ne: "CANCELLED" },
        applicationStatus: { $ne: "superseded" },
      },
    },
    {
      $project: {
        identity: {
          $ifNull: [
            "$studentIdentityHash",
            {
              $concat: [
                { $toUpper: { $trim: { input: "$studentName" } } },
                "|",
                "$dob",
                "|",
                "$studentClass",
                "|",
                "$guardianPhone",
              ],
            },
          ],
        },
      },
    },
    { $group: { _id: "$identity" } },
    { $count: "count" },
  ]);
  const uniqueStudents = uniqueStudentAgg[0]?.count || 0;

  const duplicates = await getDuplicateGroupsReport();
  const suspectedDuplicatesCount = duplicates.length;

  const revenue = await Payment.aggregate([
    { $match: { status: "PAID" } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);

  const groups = await Registration.aggregate([
    {
      $match: {
        status: "CONFIRMED",
        applicationStatus: { $ne: "superseded" },
      },
    },
    { $group: { _id: "$studentClass", count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  const [
    remindersSent,
    reminderFailures,
    resumedApplications,
    settingsDoc,
    class11StreamsAgg,
  ] = await Promise.all([
    Registration.db
      .collection("reminderlogs")
      .countDocuments({ status: "SENT" }),
    Registration.db
      .collection("reminderlogs")
      .countDocuments({ status: "FAILED" }),
    Registration.db
      .collection("audits")
      .countDocuments({ action: "APPLICATION_RECOVERED_VIA_EMAIL_LINK" }),
    Registration.db.collection("settings").findOne({ _id: "primary" }),
    Registration.aggregate([
      {
        $match: {
          status: { $ne: "CANCELLED" },
          applicationStatus: { $ne: "superseded" },
          studentClass: "11",
        },
      },
      {
        $group: {
          _id: "$course",
          total: { $sum: 1 },
          confirmed: {
            $sum: { $cond: [{ $eq: ["$status", "CONFIRMED"] }, 1, 0] },
          },
        },
      },
    ]),
  ]);

  const class11Streams = {
    PCM: { total: 0, confirmed: 0 },
    PCB: { total: 0, confirmed: 0 },
    ARTS: { total: 0, confirmed: 0 },
    COMMERCE: { total: 0, confirmed: 0 },
  };
  for (const item of class11StreamsAgg) {
    if (item._id && class11Streams[item._id]) {
      class11Streams[item._id] = { total: item.total, confirmed: item.confirmed };
    }
  }

  const remindersEnabled =
    process.env.REMINDERS_ENABLED !== undefined
      ? /^(true|1|yes)$/i.test(process.env.REMINDERS_ENABLED)
      : !!settingsDoc?.remindersEnabled;

  return {
    total: totalApplications,
    totalApplications,
    uniqueStudents,
    confirmed,
    incomplete,
    contactVerified,
    awaitingPaymentProof,
    paymentSubmitted: confirmed + paymentUnderReview,
    review: paymentUnderReview,
    paymentUnderReview,
    suspectedDuplicatesCount,
    revenue: revenue[0]?.total || 0,
    classes: groups,
    class11Streams,
    remindersSent,
    reminderFailures,
    resumedApplications,
    remindersEnabled,
  };
}

export async function getDuplicateGroupsReport() {
  const groups = await Registration.aggregate([
    {
      $match: {
        status: { $ne: "CANCELLED" },
        applicationStatus: { $ne: "superseded" },
      },
    },
    {
      $project: {
        normName: { $toUpper: { $trim: { input: "$studentName" } } },
        dob: 1,
        studentClass: 1,
        guardianPhone: 1,
        guardianName: 1,
        email: 1,
        applicationRef: 1,
        registrationNumber: 1,
        status: 1,
        applicationStatus: 1,
        paymentStatus: 1,
        paymentId: 1,
        photoUploaded: { $ne: [{ $ifNull: ["$photo.publicId", ""] }, ""] },
        createdAt: 1,
        updatedAt: 1,
      },
    },
    {
      $group: {
        _id: {
          normName: "$normName",
          dob: "$dob",
          studentClass: "$studentClass",
          guardianPhone: "$guardianPhone",
        },
        count: { $sum: 1 },
        guardianName: { $first: "$guardianName" },
        email: { $first: "$email" },
        records: {
          $push: {
            id: "$_id",
            applicationRef: "$applicationRef",
            registrationNumber: "$registrationNumber",
            status: "$status",
            applicationStatus: "$applicationStatus",
            paymentStatus: "$paymentStatus",
            hasPayment: { $ne: ["$paymentId", null] },
            photoUploaded: "$photoUploaded",
            createdAt: "$createdAt",
            updatedAt: "$updatedAt",
          },
        },
      },
    },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1, "_id.normName": 1 } },
  ]);

  return groups.map((g) => ({
    studentName: g._id.normName,
    studentClass: g._id.studentClass,
    dob: g._id.dob,
    guardianPhone: g._id.guardianPhone,
    guardianName: g.guardianName,
    email: g.email,
    count: g.count,
    records: g.records,
  }));
}

export async function getStudentDetailWithHistory(registrationId) {
  const student = await Registration.findById(registrationId).lean();
  if (!student) return null;

  const [payment, auditLog, siblings, reminderLogs] = await Promise.all([
    student.paymentId ? Payment.findById(student.paymentId).lean() : null,
    Registration.db
      .collection("audits")
      .find({ registrationId: student._id })
      .sort({ createdAt: -1 })
      .toArray(),
    Registration.find({
      guardianPhone: student.guardianPhone,
      _id: { $ne: student._id },
    })
      .sort({ createdAt: -1 })
      .lean(),
    Registration.db
      .collection("reminderlogs")
      .find({ registrationId: student._id })
      .sort({ sentAt: -1 })
      .toArray(),
  ]);

  return {
    student,
    payment,
    auditLog,
    reminderLogs,
    siblings: siblings.map((s) => ({
      id: s._id,
      studentName: s.studentName,
      studentClass: s.studentClass,
      course: s.course || "",
      applicationRef: s.applicationRef,
      registrationNumber: s.registrationNumber,
      status: s.status,
      createdAt: s.createdAt,
    })),
  };
}

export async function supersedeDuplicateRegistration(
  duplicateId,
  primaryId,
  reason = "Marked as duplicate/superseded by administrator",
  actor = "admin"
) {
  const duplicate = await Registration.findById(duplicateId);
  if (!duplicate) throw Object.assign(new Error("Registration not found."), { status: 404 });

  if (duplicate.status === "CONFIRMED") {
    throw Object.assign(
      new Error("Cannot supersede a confirmed registration. Contact system coordinator."),
      { status: 409 }
    );
  }

  duplicate.status = "CANCELLED";
  duplicate.applicationStatus = "superseded";
  duplicate.supersededBy = primaryId;
  duplicate.supersededReason = reason;
  duplicate.statusHistory.push({
    from: duplicate.status,
    to: "CANCELLED",
    axis: "legacy",
    changedAt: new Date(),
    reason: `${reason} (Primary: ${primaryId})`,
    actor,
  });

  await duplicate.save();
  return duplicate;
}

