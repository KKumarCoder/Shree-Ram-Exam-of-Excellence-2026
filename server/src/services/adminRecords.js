import { Registration, Payment } from "../models/index.js";

export const registrationStatuses = [
  "DRAFT",
  "OTP_VERIFIED",
  "PAYMENT_PENDING",
  "PAYMENT_UNDER_VERIFICATION",
  "CONFIRMING",
  "CONFIRMED",
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
  const { status, studentClass, date, search } = filters;
  const q = {};
  if (status) q.status = status;
  if (studentClass) q.studentClass = studentClass;
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
