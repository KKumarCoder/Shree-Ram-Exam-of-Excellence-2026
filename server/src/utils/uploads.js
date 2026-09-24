import PDFDocument from 'pdfkit';
// Parse image structure before persisting it; cap decoded dimensions as well as bytes.
export function validPhoto(buffer) {
  try {
    const doc = new PDFDocument({ autoFirstPage: false });
    const image = doc.openImage(buffer);
    return Number.isInteger(image.width) && Number.isInteger(image.height) &&
      image.width > 0 && image.height > 0 && image.width * image.height <= 16000000;
  } catch { return false; }
}
