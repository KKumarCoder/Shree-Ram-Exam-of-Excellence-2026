import crypto from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import { MediaAsset, Registration, Payment } from '../models/index.js';
import { validPhoto } from '../utils/uploads.js';

const unavailable = () => Object.assign(new Error('File service is temporarily unavailable. Please retry shortly.'), { status: 503 });
export function configureCloudinary() {
  for (const key of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']) {
    if (!process.env[key]?.trim() || /^your_|^REPLACE_/i.test(process.env[key])) throw new Error(`Configure ${key} in server/.env`);
  }
  cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET, secure: true });
  return cloudinary;
}

export async function uploadMedia(buffer, { kind, format, contentType }) {
  const sdk = configureCloudinary();
  const asset = { publicId: `shree-olympiad/${kind}/${crypto.randomUUID()}${format === 'pdf' ? '.pdf' : ''}`,
    resourceType: format === 'pdf' ? 'raw' : 'image', type: 'authenticated', format, contentType, bytes: buffer.length };
  // Keep the intention even on timeout: the provider may finish after our request fails.
  await MediaAsset.create({ asset, sweepAt: new Date(Date.now() + 3600000) });
  try {
    const result = await new Promise((resolve, reject) => {
      const stream = sdk.uploader.upload_stream({ public_id: asset.publicId, resource_type: asset.resourceType,
        type: asset.type, overwrite: false, timeout: 20000,
        ...(kind === 'photos' ? { transformation: [{ width: 1200, height: 1200, crop: 'limit' }], format } : {}),
      }, (error, value) => error ? reject(error) : resolve(value));
      stream.on('error', reject);
      stream.end(buffer);
    });
    asset.bytes = result.bytes;
    await MediaAsset.updateOne({ 'asset.publicId': asset.publicId }, { $set: { asset } });
    return asset;
  } catch {
    throw unavailable();
  }
}

export async function deleteMedia(asset) {
  if (!asset?.publicId) return;
  try {
    const result = await configureCloudinary().uploader.destroy(asset.publicId, {
      resource_type: asset.resourceType, type: asset.type, invalidate: true, timeout: 10000,
    });
    if (!['ok', 'not found'].includes(result.result)) throw unavailable();
    await MediaAsset.deleteOne({ 'asset.publicId': asset.publicId });
  } catch {
    // The persisted journal lets the worker retry without breaking a successful registration.
    console.warn(JSON.stringify({ event: 'media_cleanup_deferred' }));
  }
}

export async function downloadMedia(asset) {
  if (!asset?.publicId) throw Object.assign(new Error('File not found.'), { status: 404 });
  try {
    const sdk = configureCloudinary();
    const url = sdk.utils.private_download_url(asset.publicId, asset.resourceType === 'raw' ? '' : asset.format, {
      resource_type: asset.resourceType, type: 'authenticated', expires_at: Math.floor(Date.now() / 1000) + 60,
    });
    const response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'error' });
    if (!response.ok || !response.body) throw unavailable();
    const maxBytes = 5 * 1024 * 1024;
    if (Number(response.headers.get('content-length')) > maxBytes) {
      await response.body.cancel(); throw unavailable();
    }
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > maxBytes) throw unavailable();
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch { throw unavailable(); }
}

export async function studentPhoto(student) {
  if (!student.photo?.publicId) {
    if (student.photoPath) throw Object.assign(new Error('Student photo needs storage migration. Please contact the school.'), { status: 503 });
    return null;
  }
  const buffer = await downloadMedia(student.photo);
  if (!validPhoto(buffer)) throw unavailable();
  return buffer;
}

export async function sweepMedia() {
  const now = new Date();
  for (let i = 0; i < 100; i++) {
    // Atomic lease: workers on multiple instances can safely share this journal.
    const row = await MediaAsset.findOneAndUpdate({ sweepAt: { $lte: now } },
      { $set: { sweepAt: new Date(Date.now() + 86400000) } }, { new: true, sort: { sweepAt: 1 } }).lean();
    if (!row) break;
    const [photo, receipt] = await Promise.all([
      Registration.exists({ 'photo.publicId': row.asset.publicId }),
      Payment.exists({ 'receipt.publicId': row.asset.publicId }),
    ]);
    if (!photo && !receipt) await deleteMedia(row.asset);
  }
}
export function startMediaWorker() {
  let busy = false;
  const run = async () => {
    if (busy) return;
    busy = true;
    try { await sweepMedia(); } catch { console.warn(JSON.stringify({ event: 'media_sweep_failed' })); }
    finally { busy = false; }
  };
  void run();
  const timer = setInterval(run, 60000); timer.unref();
  return timer;
}
