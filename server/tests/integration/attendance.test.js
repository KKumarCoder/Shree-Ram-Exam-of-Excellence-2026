import "express-async-errors";
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import { once } from "node:events";
import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import { Admin, Registration, Audit } from "../../src/models/index.js";
import routes from "../../src/routes/admin.js";
import { issueToken } from "../../src/middleware/auth.js";
import { errorHandler } from "../../src/middleware/errors.js";
const source = process.env.OTP_TEST_MONGODB_URI;
if (
  !source ||
  !/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\/shree_otp_test(?:\?|$)/.test(
    source,
  )
)
  throw new Error("Use the isolated local test MongoDB.");
process.env.JWT_SECRET = "attendance-only-test-secret".repeat(3);
let server, base, adminToken, examinerToken, verifierToken;
const stamp = "2025-01-15T05:15:00.000Z";
async function call(path, method = "GET", body, token = adminToken) {
  return fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Cookie: `olympiad_admin=${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
before(async () => {
  await mongoose.connect(
    source.replace("/shree_otp_test", "/shree_attendance_test"),
    { serverSelectionTimeoutMS: 3000 },
  );
  await Promise.all([Admin, Registration, Audit].map((m) => m.init()));
  await Admin.deleteMany({});
  const tokens = [];
  for (const role of ["ADMIN", "EXAM_COORDINATOR", "PAYMENT_VERIFIER"]) {
    const admin = await Admin.create({
      email: `${role}@test.invalid`,
      role,
      passwordHash: "unused",
    });
    tokens.push(issueToken({ sub: String(admin._id), scope: "admin" }));
  }
  [adminToken, examinerToken, verifierToken] = tokens;
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(routes);
  app.use(errorHandler);
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
});
beforeEach(async () => {
  await Registration.deleteMany({});
  await Audit.deleteMany({});
  await Registration.insertMany(
    Array.from({ length: 8 }, (_, i) => ({
      studentName: `Student ${i}`,
      guardianName: "Guardian",
      studentClass: i < 4 ? "7" : "8",
      dob: "2013-01-01",
      currentSchool: "School",
      guardianPhone: "9876543210",
      address: "Address",
      city: "City",
      district: "District",
      state: "State",
      pincode: "127306",
      consent: true,
      applicationRef: `APP-TEST${i}`,
      registrationNumber: `SHREE26-00000${i}`,
      status: i === 7 ? "DRAFT" : "CONFIRMED",
      admitToken: `${i}`.repeat(48),
      checkInAt: i < 3 ? stamp : null,
    })),
  );
});
test("attendance defaults to five rows, paginates and applies combined filters", async () => {
  const first = await (await call("/attendance")).json();
  assert.equal(first.items.length, 5);
  assert.equal(first.total, 7);
  assert.equal(first.present, 3);
  assert.equal(first.notCheckedIn, 4);
  const second = await (await call("/attendance?page=2")).json();
  assert.equal(second.items.length, 2);
  assert.ok(second.items.every((s) => !first.items.some((f) => f.id === s.id)));
  const filtered = await (
    await call(
      "/attendance?studentClass=7&attendance=PRESENT&search=Student&from=2025-01-15&to=2025-01-15",
    )
  ).json();
  assert.equal(filtered.total, 3);
  assert.equal(
    (
      await (
        await call("/attendance?attendance=NOT_CHECKED_IN&studentClass=8")
      ).json()
    ).total,
    3,
  );
  assert.equal((await (await call("/attendance?search=.*")).json()).total, 0);
  assert.equal((await call("/attendance?attendance=invalid")).status, 400);
  assert.equal((await call("/attendance?from=2025-02-30")).status, 400);
});
test("attendance dates use IST boundaries", async () => {
  const s = await Registration.findOne({ studentName: "Student 3" });
  await Registration.updateOne(
    { _id: s._id },
    { $set: { checkInAt: new Date("2025-01-14T18:30:00Z") } },
  );
  assert.equal(
    (await (await call("/attendance?from=2025-01-15&to=2025-01-15")).json())
      .total,
    4,
  );
  assert.equal(
    (await (await call("/attendance?from=2025-01-14&to=2025-01-14")).json())
      .total,
    0,
  );
});
test("admins can edit/delete attendance without deleting registration; corrections are audited", async () => {
  const s = await Registration.findOne({ studentName: "Student 3" });
  const when = "2025-01-15T06:00:00Z";
  const body = {
    expectedCheckInAt: null,
    checkInAt: when,
    reason: "Manual register correction",
  };
  assert.equal((await call(`/attendance/${s._id}`, "PATCH", body)).status, 200);
  assert.equal((await call(`/attendance/${s._id}`, "PATCH", body)).status, 409);
  assert.equal(
    (
      await call(`/attendance/${s._id}`, "DELETE", {
        expectedCheckInAt: when,
        reason: "Accidental attendance",
      })
    ).status,
    200,
  );
  const stored = await Registration.findById(s._id);
  assert.equal(stored.checkInAt, null);
  assert.equal(stored.status, "CONFIRMED");
  assert.equal(await Registration.countDocuments(), 8);
  assert.equal(await Audit.countDocuments({ registrationId: s._id }), 2);
  assert.equal(
    (
      await call(`/attendance/${s._id}`, "PATCH", {
        ...body,
        checkInAt: "2099-01-01T00:00:00Z",
      })
    ).status,
    400,
  );
  assert.equal(
    (await call(`/attendance/${s._id}`, "PATCH", { ...body, reason: "" }))
      .status,
    400,
  );
});
test("role checks protect attendance reads, exports and mutations", async () => {
  const s = await Registration.findOne();
  assert.equal((await call("/attendance", "GET", null, null)).status, 401);
  assert.equal(
    (await call("/attendance", "GET", null, verifierToken)).status,
    403,
  );
  assert.equal(
    (await call("/attendance/export.xlsx", "GET", null, verifierToken)).status,
    403,
  );
  assert.equal(
    (await call("/attendance", "GET", null, examinerToken)).status,
    200,
  );
  assert.equal(
    (
      await call(
        `/attendance/${s._id}`,
        "DELETE",
        { expectedCheckInAt: stamp, reason: "Correcting entry" },
        examinerToken,
      )
    ).status,
    403,
  );
});
test("exports contain all matching pages, correct columns and valid PDF/Excel bytes", async () => {
  const response = await call("/attendance/export.xlsx?limit=5&page=2");
  assert.equal(response.status, 200);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(await response.arrayBuffer()));
  const sheet = book.worksheets[0];
  assert.equal(sheet.rowCount, 8);
  assert.equal(sheet.columnCount, 6);
  assert.equal(sheet.getRow(1).values.includes("Room"), false);
  const filtered = await call(
    "/attendance/export.xlsx?studentClass=7&attendance=PRESENT",
  );
  const subset = new ExcelJS.Workbook();
  await subset.xlsx.load(Buffer.from(await filtered.arrayBuffer()));
  assert.equal(subset.worksheets[0].rowCount, 4);
  const pdf = await call("/attendance/export.pdf");
  assert.equal(pdf.status, 200);
  const document = await PDFDocument.load(await pdf.arrayBuffer());
  assert.ok(document.getPageCount() > 0);
  assert.equal((await call("/attendance/export.zip")).status, 400);
});
test("QR check-in records the supplied token once and respects existing corrections", async () => {
  const s = await Registration.findOne({ studentName: "Student 3" });
  const first = await call(
    "/check-in",
    "POST",
    { token: s.admitToken },
    examinerToken,
  );
  assert.equal(first.status, 200);
  const firstResult = await first.json();
  assert.equal(firstResult.alreadyCheckedIn, false);
  assert.equal(firstResult.registration.studentName, s.studentName);
  const duplicate = await call(
    "/check-in",
    "POST",
    { token: s.admitToken },
    examinerToken,
  );
  assert.equal(duplicate.status, 200);
  const duplicateResult = await duplicate.json();
  assert.equal(duplicateResult.alreadyCheckedIn, true);
  assert.equal(duplicateResult.registration.studentName, s.studentName);
  assert.equal(
    (await call(`/check-in/${s._id}/photo`, "GET", null, null)).status,
    401,
  );
  assert.equal((await call(`/check-in/${s._id}/photo`)).status, 404);
  assert.ok((await Registration.findById(s._id)).checkInAt);
  assert.equal(
    (
      await call(`/attendance/${s._id}`, "PATCH", {
        expectedCheckInAt: null,
        checkInAt: stamp,
        reason: "Stale edit",
      })
    ).status,
    409,
  );
});
