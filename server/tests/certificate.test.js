import test from "node:test";
import assert from "node:assert/strict";
import {
  formatCertificateNumber,
  generateCertificatePdfBuffer,
} from "../src/services/certificatePdf.js";
import { buildCertificateEmailHtml } from "../src/services/certificateEmail.js";
import { getCertificateDelayHours } from "../src/services/certificateWorker.js";

test("formatCertificateNumber formats certificate ID correctly", () => {
  const s1 = { registrationNumber: "SHREE27-001234" };
  assert.equal(formatCertificateNumber(s1), "CERT-2027-27-001234");

  const s2 = { certificateNumber: "CERT-2027-CUSTOM-99" };
  assert.equal(formatCertificateNumber(s2), "CERT-2027-CUSTOM-99");

  const s3 = { applicationRef: "APP-9876543210" };
  assert.equal(formatCertificateNumber(s3), "CERT-2027-543210");
});

test("getCertificateDelayHours defaults to 4 hours", () => {
  const orig = process.env.CERTIFICATE_HOURS_DELAY;
  delete process.env.CERTIFICATE_HOURS_DELAY;
  try {
    assert.equal(getCertificateDelayHours(), 4);
  } finally {
    if (orig !== undefined) process.env.CERTIFICATE_HOURS_DELAY = orig;
  }
});

test("generateCertificatePdfBuffer produces a valid PDF buffer matching template", async () => {
  const mockStudent = {
    studentName: "AARAV SHARMA",
    studentClass: "10",
    registrationNumber: "SHREE27-000101",
    applicationRef: "APP-1234567890",
  };

  const buffer = await generateCertificatePdfBuffer(mockStudent, {});
  assert.ok(Buffer.isBuffer(buffer), "Expected a Buffer");
  assert.ok(buffer.length > 50000, "Certificate PDF buffer should contain image data");
  assert.equal(
    buffer.subarray(0, 4).toString(),
    "%PDF",
    "Buffer must start with PDF header %PDF",
  );
});

test("buildCertificateEmailHtml includes student name, roll number and congratulations", () => {
  const mockStudent = {
    studentName: "Pooja Verma",
    studentClass: "11",
    course: "PCM",
    registrationNumber: "SHREE27-000202",
  };

  const html = buildCertificateEmailHtml({
    student: mockStudent,
    certId: "CERT-2027-000202",
    settings: { contactPhone: "8199991081" },
  });

  assert.ok(html.includes("Pooja Verma"));
  assert.ok(html.includes("CERT-2027-000202"));
  assert.ok(html.includes("12 January 2027"));
  assert.ok(html.includes("PCM"));
  assert.ok(html.includes("Certificate of Participation"));
});
