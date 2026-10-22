import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Primary template path in server/src/assets, fallback to client/public/images
const serverTemplatePath = path.resolve(__dirname, "../assets/certificate-template.png");
const clientTemplatePath = path.resolve(__dirname, "../../../client/public/images/certificate-template.png");

export function getCertificateTemplatePath() {
  if (fs.existsSync(serverTemplatePath)) return serverTemplatePath;
  if (fs.existsSync(clientTemplatePath)) return clientTemplatePath;
  throw new Error("Certificate template background image not found.");
}

export function formatCertificateNumber(student) {
  if (student.certificateNumber) return student.certificateNumber;
  const num = student.registrationNumber || student.applicationRef?.replace(/[^a-zA-Z0-9]/g, "").slice(-6) || "2027";
  return `CERT-2027-${num.replace(/^SHREE-?/, "")}`;
}

/**
 * Builds the PDFKit document instance with student details
 */
export function buildCertificateDoc(student, settings = {}) {
  const templatePath = getCertificateTemplatePath();
  const certId = formatCertificateNumber(student);

  // Exact 1024 x 724 A4 Landscape paper ratio
  const doc = new PDFDocument({
    size: [1024, 724],
    margin: 0,
    info: {
      Title: `SHREE Olympiad 2027 Certificate - ${student.studentName}`,
      Author: "Shree Ram Public School",
      Subject: "Certificate of Participation",
      Creator: "Shree Ram Olympiad Exam System",
    },
  });

  // 1. Draw Background Certificate Template
  doc.image(templatePath, 0, 0, { width: 1024, height: 724 });

  // 2. Student Full Name
  const rawName = String(student.studentName || "STUDENT").trim().toUpperCase();
  // Adjust font size for longer names so it fits gracefully above the golden divider
  let nameFontSize = 38;
  if (rawName.length > 30) {
    nameFontSize = 26;
  } else if (rawName.length > 22) {
    nameFontSize = 32;
  }

  doc
    .font("Times-Bold")
    .fontSize(nameFontSize)
    .fillColor("#0A3F55")
    .text(rawName, 0, 412, { width: 1024, align: "center" });

  // 3. Class & Stream display
  const streamInfo = student.studentClass === "11" && student.course ? ` - ${student.course}` : "";
  const classText = `Class: ${student.studentClass}th${streamInfo}`;
  const rollText = `Roll No: ${student.registrationNumber || student.applicationRef || "2027"}`;

  // 4. Verification & ID Detail line (centered just above the website url footer)
  const detailLine = `Certificate ID: ${certId}   |   ${classText}   |   ${rollText}   |   Exam Date: 12 Jan 2027`;

  doc
    .font("Helvetica")
    .fontSize(9.5)
    .fillColor("#64748B")
    .text(detailLine, 0, 664, { width: 1024, align: "center" });

  return { doc, certId };
}

/**
 * Streams the certificate PDF directly to an HTTP response
 */
export async function generateCertificatePdfStream(res, student, settings = {}, inline = false) {
  const { doc, certId } = buildCertificateDoc(student, settings);
  const filename = `Certificate_${(student.studentName || "Student").replace(/[^a-zA-Z0-9]/g, "_")}_${certId}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${filename}"`);
  res.setHeader("Cache-Control", "private, no-store");

  doc.pipe(res);
  doc.end();
}

/**
 * Generates the certificate as an in-memory Buffer (for email attachments)
 */
export async function generateCertificatePdfBuffer(student, settings = {}) {
  return new Promise((resolve, reject) => {
    try {
      const { doc } = buildCertificateDoc(student, settings);
      const chunks = [];

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err) => reject(err));

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
