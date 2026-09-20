import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const logo = path.resolve(
  here,
  "../../../client/public/images/school-logo.png",
);
const principalSignature = path.resolve(
  here,
  "../../../client/public/images/principal-signature.png",
);
const C = {
  navy: "#08344d",
  teal: "#105670",
  gold: "#e9b34c",
  ink: "#17334e",
  pale: "#f3f9ff",
};
export async function admitPdf(res, student, settings) {
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: 0,
    info: { Title: `SHREE 2026 Admit Card ${student.registrationNumber}` },
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${student.registrationNumber}.pdf"`,
  );
  doc.pipe(res);
  const W = 841.89,
    H = 595.28;
  doc
    .roundedRect(12, 12, W - 24, H - 24, 8)
    .lineWidth(1.6)
    .stroke(C.navy);
  doc.rect(13, 13, W - 26, 140).fill(C.navy);
  doc.rect(13, 150, W - 26, 4).fill(C.gold);
  if (fs.existsSync(logo)) doc.image(logo, 30, 18, { fit: [110, 125] });
  doc
    .fillColor("#ffffff")
    .font("Times-Bold")
    .fontSize(30)
    .text("ADMIT CARD", 145, 23, { width: 570, align: "center" });
  doc.moveTo(280, 64).lineTo(680, 64).strokeColor(C.gold).lineWidth(1).stroke();
  doc
    .fontSize(19)
    .text("SHREE RAM PUBLIC SCHOOL", 145, 70, { width: 570, align: "center" });
  doc
    .font("Helvetica")
    .fontSize(9)
    .text("Kanhra-Badhra Road, Charkhi Dadri, Haryana 127306", 145, 102, {
      width: 570,
      align: "center",
    });
  doc.roundedRect(318, 121, 245, 22, 11).fill(C.gold);
  doc
    .fillColor(C.ink)
    .font("Helvetica-Bold")
    .fontSize(12)
    .text("SHREE 2026 OLYMPIAD", 325, 127, { width: 230, align: "center" });
  const field = (label, val, x, y, labelWidth = 108, valueWidth = 224) => {
    doc
      .fillColor(C.ink)
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(label, x, y, { width: labelWidth });
    doc.text(":", x + labelWidth, y, { width: 10 });
    doc
      .roundedRect(x + labelWidth + 12, y - 3, valueWidth, 20, 3)
      .lineWidth(0.55)
      .strokeColor("#b5c8d9")
      .stroke();
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(C.ink)
      .text(String(val ?? ""), x + labelWidth + 17, y + 2, {
        width: valueWidth - 9,
        height: 15,
        ellipsis: true,
      });
  };
  const left = 32,
    right = 430;
  field("Roll Number", student.seat || "To be assigned", left, 174, 104, 230);
  field("Registration No.", student.registrationNumber, left, 201, 104, 230);
  field("Student Name", student.studentName, left, 228, 104, 230);
  field("Guardian Name", student.guardianName, left, 255, 104, 230);
  field("Class", student.studentClass, left, 282, 104, 230);
  field("Date of Birth", student.dob, right, 174, 95, 128);
  field(
    "Mobile",
    `******${student.guardianPhone.slice(-4)}`,
    right,
    201,
    95,
    128,
  );
  field("Exam Room", student.room || "To be assigned", right, 228, 95, 128);
  const qr = await QRCode.toDataURL(
    `${process.env.PUBLIC_BASE_URL || "https://olympiad.srpskanhra.com"}/api/verify/${student.admitToken}`,
    { margin: 1, width: 300, errorCorrectionLevel: "M" },
  );
  doc
    .rect(673, 168, 69, 97)
    .dash(2, 2)
    .strokeColor("#b5c8d9")
    .stroke()
    .undash();
  if (student.photoPath && fs.existsSync(student.photoPath)) {
    try {
      doc.image(student.photoPath, 675, 170, {
        fit: [65, 93],
        align: "center",
        valign: "center",
      });
    } catch {
      doc
        .fontSize(7)
        .fillColor(C.ink)
        .text("Photograph unavailable", 675, 206, {
          width: 64,
          align: "center",
        });
    }
  } else
    doc
      .fontSize(7)
      .fillColor(C.ink)
      .text("Student photo", 677, 207, { width: 61, align: "center" });
  doc.image(Buffer.from(qr.split(",")[1], "base64"), 747, 171, {
    fit: [62, 62],
  });
  doc
    .font("Helvetica-Bold")
    .fontSize(6)
    .fillColor(C.navy)
    .text("SCAN TO VERIFY", 744, 236, { width: 69, align: "center" });
  doc.moveTo(680, 297).lineTo(807, 297).strokeColor(C.navy).stroke();
  doc
    .fontSize(7)
    .text("Candidate Signature", 680, 300, { width: 127, align: "center" });
  // Exam section deliberately follows personal section in the vertical flow.
  doc.rect(30, 322, 780, 24).fill(C.teal);
  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(11)
    .text("E X A M I N A T I O N    D E T A I L S", 40, 329);
  const rows = [
    ["Subject / Exam", "SHREE 2026 OLYMPIAD"],
    ["Exam Date", settings.examDate || "To be announced"],
    ["Reporting Time", settings.reportingTime || "To be announced"],
    ["Exam Time", settings.examTime || "To be announced"],
    ["Venue", settings.venue || "Shree Ram Public School"],
  ];
  rows.forEach(([lab, val], i) => {
    const y = 346 + i * 25;
    doc.rect(30, y, 210, 25).fill(i % 2 ? "#f9fcff" : C.pale);
    doc.rect(30, y, 780, 25).strokeColor("#b5c8d9").lineWidth(0.5).stroke();
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(C.ink)
      .text(lab, 39, y + 8, { width: 195 });
    doc
      .font("Helvetica")
      .text(val, 250, y + 8, { width: 545, height: 14, ellipsis: true });
  });
  const iy = 481;
  doc.roundedRect(30, iy, 510, 80, 7).fill("#fff9e9");
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(C.ink)
    .text("IMPORTANT INSTRUCTIONS", 40, iy + 5);
  const lines = (settings.instructions || []).slice(0, 4);
  lines.forEach((line, i) =>
    doc
      .font("Helvetica")
      .fontSize(7.4)
      .text(`${i + 1}. ${line}`, 42, iy + 20 + i * 13, {
        width: 485,
        height: 12,
        ellipsis: true,
      }),
  );
  if (fs.existsSync(principalSignature)) {
    doc.image(principalSignature, 666, 505, {
      fit: [130, 35],
      align: "center",
      valign: "center",
    });
  }
  doc.circle(590, 522, 29).dash(3, 3).strokeColor("#7990a4").stroke().undash();
  doc
    .fontSize(8)
    .fillColor(C.ink)
    .text("School\nSeal", 570, 511, { width: 40, align: "center" });
  doc.moveTo(665, 542).lineTo(800, 542).strokeColor(C.navy).stroke();
  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .text("Principal / Exam Coordinator", 658, 546, {
      width: 150,
      align: "center",
    });
  doc.end();
}
