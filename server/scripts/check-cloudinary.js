import 'dotenv/config';
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { PDFDocument } from 'pdf-lib';
import { configureCloudinary, downloadMedia } from '../src/services/media.js';

// Only synthetic files; no student data or credentials are printed.
const sdk = configureCloudinary();
let stage = 'credentials';
const pdf = await PDFDocument.create(); pdf.addPage().drawText('Cloudinary storage connectivity test');
const fixtures = [
  { format: 'png', contentType: 'image/png', resourceType: 'image', buffer: await QRCode.toBuffer('SHREE storage test') },
  { format: 'pdf', contentType: 'application/pdf', resourceType: 'raw', buffer: Buffer.from(await pdf.save()) },
];
try {
  await sdk.api.ping({ timeout: 15000 });
  console.log('Cloudinary credentials: verified');
  for (const fixture of fixtures) {
    const publicId = `shree-olympiad/connectivity-check/${crypto.randomUUID()}${fixture.format === 'pdf' ? '.pdf' : ''}`;
    try {
      stage = `${fixture.format} upload`;
      const result = await new Promise((resolve, reject) => {
        const stream = sdk.uploader.upload_stream({ public_id: publicId, resource_type: fixture.resourceType,
          type: 'authenticated', overwrite: false, timeout: 20000 }, (error, value) => error ? reject(error) : resolve(value));
        stream.on('error', reject); stream.end(fixture.buffer);
      });
      console.log(`${fixture.format.toUpperCase()}: uploaded`);
      stage = `${fixture.format} download`;
      const probeUrl = sdk.utils.private_download_url(publicId, fixture.resourceType === 'raw' ? '' : fixture.format, {
        resource_type: fixture.resourceType, type: 'authenticated', expires_at: Math.floor(Date.now()/1000)+60,
      });
      const probe = await fetch(probeUrl, {redirect:'manual',signal:AbortSignal.timeout(15000)});
      console.log(`${fixture.format.toUpperCase()}: download endpoint HTTP ${probe.status}`);
      await probe.body?.cancel();
      const downloaded = await downloadMedia({ ...fixture, publicId, type: 'authenticated' });
      if (!downloaded.equals(fixture.buffer)) throw new Error('Downloaded file differs');
      stage = `${fixture.format} privacy`;
      // Cloudinary may return a signed secure_url for authenticated uploads.
      const unsignedUrl = result.secure_url.replace(/\/s--[^/]+--\//, '/');
      const unsigned = await fetch(unsignedUrl, { signal: AbortSignal.timeout(15000) });
      await unsigned.body?.cancel();
      if (![401, 403, 404].includes(unsigned.status)) throw new Error('Unsigned file privacy check failed');
      console.log(`${fixture.format.toUpperCase()}: upload, protected download and unsigned access rejection verified`);
    } finally {
      const deleted = await sdk.uploader.destroy(publicId, { resource_type: fixture.resourceType, type: 'authenticated', invalidate: true, timeout: 15000 });
      if (!['ok', 'not found'].includes(deleted.result)) throw new Error('Test asset cleanup failed');
      console.log(`${fixture.format.toUpperCase()}: test asset cleaned up`);
    }
  }
} catch (error) {
  console.error(`Cloudinary check failed at ${stage} (HTTP ${Number(error.http_code) || 'unavailable'}). Check credentials, connectivity and account file-delivery settings.`);
  process.exitCode = 1;
}
