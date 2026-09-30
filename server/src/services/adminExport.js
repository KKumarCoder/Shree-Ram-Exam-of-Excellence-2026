import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { Registration, Payment } from '../models/index.js';
import { recordFilters, registrationQuery, paymentPipeline } from './adminRecords.js';
import { safeCsv } from '../utils/validation.js';

const dateText = value => value ? new Date(value).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : '';
export function reportData(records, payments) {
  const columns = payments
    ? ['Student', 'Class', 'Reference', 'Mobile', 'Amount (INR)', 'UTR', 'Status', 'Submitted', 'Review note']
    : ['Student', 'Class', 'Reference', 'Mobile', 'Email', 'Status', 'Submitted', 'School', 'Room', 'Seat'];
  const rows = records.map(r => payments
    ? [r.registrationId?.studentName, r.registrationId?.studentClass, r.registrationId?.registrationNumber || r.registrationId?.applicationRef, r.registrationId?.guardianPhone, r.amount, r.utr, r.status, dateText(r.createdAt), r.reviewNote]
    : [r.studentName, r.studentClass, r.registrationNumber || r.applicationRef, r.guardianPhone, r.email, r.status, dateText(r.createdAt), r.currentSchool, r.room, r.seat]);
  return { columns, rows: rows.map(row => row.map(value => value ?? '')) };
}
export async function excelReport(columns, rows, title) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Shree Ram Public School';
  const sheet = workbook.addWorksheet(title, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = columns.map(header => ({ header, width: header === 'Class' ? 9 : header === 'Student' || header === 'Email' || header === 'Review note' ? 30 : 24 }));
  rows.forEach(row => sheet.addRow(row)); // Plain string cells; user values are never Excel formulas.
  sheet.getRow(1).height = 26;
  sheet.getRow(1).eachCell(cell => { cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF103B54' } }; });
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, rows.length + 1), column: columns.length } };
  sheet.eachRow((row, index) => {
    row.alignment = { vertical: 'top', wrapText: true };
    if (index > 1 && index % 2 === 0) row.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F5FA' } }; });
  });
  return workbook.xlsx.writeBuffer();
}
export function pdfReport(columns, rows, title, summary) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A3', layout: 'landscape', margin: 32 });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    const width = doc.page.width - 64, colWidth = width / columns.length;
    let y, page = 0;
    const header = () => {
      page++;
      doc.font('Helvetica-Bold').fontSize(19).fillColor('#103B54').text(title, 32, 28);
      doc.font('Helvetica').fontSize(9).fillColor('#52687d').text(`${rows.length} records | ${summary}`, 32, 56, { width, height: 30 });
      doc.text(`Page ${page}`, 32, doc.page.height - 25, { width, align: 'right', lineBreak: false });
      y = 96;
      doc.rect(32, y, width, 30).fill('#103B54');
      columns.forEach((column, i) => doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff').text(column, 38 + i * colWidth, y + 9, { width: colWidth - 12, lineBreak: false }));
      y += 30;
    };
    header();
    rows.forEach((row, index) => {
      doc.font('Helvetica').fontSize(9);
      const cells = row.map(value => String(value).replaceAll('_', ' '));
      const height = Math.max(34, ...cells.map(value => doc.heightOfString(value, { width: colWidth - 12 }) + 16));
      if (y + height > doc.page.height - 40) { doc.addPage(); header(); }
      doc.rect(32, y, width, height).fill(index % 2 ? '#f0f5fa' : '#ffffff');
      cells.forEach((value, i) => doc.font('Helvetica').fontSize(9).fillColor('#18354b').text(value, 38 + i * colWidth, y + 8, { width: colWidth - 12 }));
      y += height;
    });
    if (!rows.length) doc.font('Helvetica').fontSize(12).fillColor('#52687d').text('No records match these filters.', 38, y + 20);
    doc.end();
  });
}
export async function exportAdminRecords(req, res) {
  const { kind, format } = req.params;
  if (!['payments', 'registrations'].includes(kind) || !['xlsx', 'pdf', 'csv'].includes(format)) return res.status(400).json({ error: 'Choose a valid report format.' });
  const payments = kind === 'payments', filters = recordFilters(req.query, payments);
  const records = payments
    ? await Payment.aggregate([...paymentPipeline(filters), { $limit: 10001 }])
    : await Registration.find(registrationQuery(filters)).sort({ createdAt: -1, _id: -1 }).limit(10001).lean();
  if (records.length > 10000) return res.status(422).json({ error: 'This export exceeds 10,000 records. Narrow the date or status filters and try again.' });
  const { columns, rows } = reportData(records, payments);
  const title = payments ? 'Payment review' : 'Student registrations';
  const summary = [filters.status || 'All statuses', filters.studentClass ? `Class ${filters.studentClass}` : 'All classes', `${req.query.from || 'Start'} to ${req.query.to || 'Today'} (IST)`, req.query.search ? `Search: ${String(req.query.search).slice(0, 100)}` : ''].filter(Boolean).join(' | ');
  const body = format === 'xlsx' ? await excelReport(columns, rows, title)
    : format === 'pdf' ? await pdfReport(columns, rows, title, summary)
    : '\uFEFF' + [columns, ...rows].map(row => row.map(safeCsv).join(',')).join('\r\n');
  res.set('Cache-Control', 'private, no-store').attachment(`shree-${kind}.${format}`)
    .type(format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : format === 'pdf' ? 'application/pdf' : 'text/csv').send(body);
}
