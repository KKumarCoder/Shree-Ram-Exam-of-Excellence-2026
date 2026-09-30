import PDFDocument from 'pdfkit';
import { PDFDocument as ParsedPdf } from 'pdf-lib';
import multer from 'multer';

export function memoryUpload(field, maxMB, allowed) {
  return multer({ storage: multer.memoryStorage(),
    limits: { fileSize: maxMB * 1024 * 1024, files: 1, fields: 4, parts: 5, fieldSize: 4096 },
    fileFilter(req, file, done) {
      if (!allowed.includes(file.mimetype)) return done(Object.assign(new Error('Unsupported file type. Use JPEG/PNG photos or JPEG/PNG/PDF receipts.'), { status: 400 }));
      done(null, true);
    },
  }).single(field);
}
export async function validateUpload(file, kind) {
  if (!file) throw Object.assign(new Error(kind === 'photos' ? 'Select a photograph.' : 'Payment receipt is required.'), { status: 400 });
  const { buffer, mimetype } = file;
  let format;
  if (mimetype === 'image/jpeg' && buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) format = 'jpg';
  if (mimetype === 'image/png' && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) format = 'png';
  if (format && validPhoto(buffer)) return { kind, format, contentType: mimetype };
  if (kind === 'receipts' && mimetype === 'application/pdf' && buffer.subarray(0, 5).toString() === '%PDF-') {
    try {
      const pdf = await ParsedPdf.load(buffer, { throwOnInvalidObject: true });
      if (!pdf.isEncrypted && pdf.getPageCount() > 0 && pdf.getPageCount() <= 20)
        return { kind, format: 'pdf', contentType: mimetype };
    } catch { /* Return a safe validation error, not PDF parser details. */ }
  }
  throw Object.assign(new Error(kind === 'photos' ? 'Use a valid JPEG or PNG photograph.' : 'Use a valid JPEG, PNG or unencrypted PDF receipt (maximum 20 pages).'), { status: 400 });
}
// Parse image structure before persisting it; cap decoded dimensions as well as bytes.
export function validPhoto(buffer) {
  try {
    const doc = new PDFDocument({ autoFirstPage: false });
    const image = doc.openImage(buffer);
    return Number.isInteger(image.width) && Number.isInteger(image.height) &&
      image.width > 0 && image.height > 0 && image.width * image.height <= 16000000;
  } catch { return false; }
}
