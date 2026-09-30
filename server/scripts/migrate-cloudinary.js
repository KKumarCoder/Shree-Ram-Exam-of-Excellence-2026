import 'dotenv/config';
import mongoose from 'mongoose';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Registration, Payment } from '../src/models/index.js';
import { uploadMedia, downloadMedia, configureCloudinary } from '../src/services/media.js';
import { validateUpload } from '../src/utils/uploads.js';

// Run with the backend stopped. Default is a read-only inventory.
const apply = process.argv.includes('--apply');
const root = fileURLToPath(new URL('../private-uploads/', import.meta.url));
let failed = 0;
try {
  configureCloudinary();
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  for (const [Model, legacy, field, kind] of [[Registration, 'photoPath', 'photo', 'photos'], [Payment, 'receiptPath', 'receipt', 'receipts']]) {
    const query = { [legacy]: { $type: 'string', $ne: '' } };
    console.log(`${kind}: ${await Model.countDocuments(query)} legacy record(s); mode=${apply ? 'migrate' : 'inventory'}`);
    if (!apply) continue;
    for await (const record of Model.find(query).cursor()) {
      let stage = 'read local source';
      try {
        // Never read an arbitrary path taken from a database record.
        const source = await fs.realpath(record[legacy]);
        const realRoot = await fs.realpath(root);
        if (path.dirname(source) !== realRoot) throw new Error('Unexpected legacy path');
        const extension = path.extname(source).toLowerCase();
        const mimetype = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.pdf': 'application/pdf' }[extension];
        if ((await fs.stat(source)).size > (kind === 'photos' ? 5 : 3) * 1024 * 1024) throw new Error('File too large');
        const buffer = await fs.readFile(source);
        stage = 'validate source';
        const metadata = await validateUpload({ buffer, mimetype }, kind);
        stage = 'upload';
        const asset = record[field]?.publicId ? record[field] : await uploadMedia(buffer, metadata);
        stage = 'verify download';
        await downloadMedia(asset); // Verify retrieval before switching the database reference.
        stage = 'update reference';
        const updated = await Model.updateOne({ _id: record._id, [legacy]: record[legacy] },
          { $set: { [field]: asset, [legacy]: '' } });
        if (!updated.modifiedCount) throw new Error('Record changed during migration');
        console.log(`${kind}: migrated one record`);
        // Original files are retained as migration backups; runtime never reads them.
      } catch (error) {
        failed++; console.error(`${kind}: migration failed at ${stage} for record ${record._id} (${['ENOENT','EACCES'].includes(error.code) ? error.code : Number(error.status) || 'unavailable'}); original retained`);
      }
    }
  }
} catch {
  failed++; console.error('Migration could not run. Check database/Cloudinary configuration and connectivity.');
} finally { await mongoose.disconnect(); }
if (failed) process.exitCode = 1;
