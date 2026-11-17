/**
 * APITxT Document Service
 * Resolves public PDF URLs for Admit Cards and Certificates
 * that Meta WhatsApp and APITxT can download and attach directly to WhatsApp messages.
 */

import { v2 as cloudinary } from 'cloudinary';
import { generateAdmitCardPdfBuffer } from '../admitPdf.js';
import { generateCertificatePdfBuffer } from '../certificatePdf.js';

export function getPublicBaseUrl() {
  const configured =
    process.env.PUBLIC_APP_URL ||
    process.env.BASE_URL ||
    process.env.APP_URL ||
    process.env.PUBLIC_BASE_URL ||
    'https://shreeolympiad.srpskanhra.com';
  // Meta WhatsApp cannot resolve localhost URLs. Always use public HTTPS domain.
  if (configured.includes('localhost') || configured.includes('127.0.0.1')) {
    return 'https://shreeolympiad.srpskanhra.com';
  }
  return configured.replace(/\/+$/, '');
}

/**
 * Returns the public direct PDF download/stream URL for an Admit Card.
 */
export function getAdmitCardPdfUrl(admitToken) {
  if (!admitToken) return '';
  const base = getPublicBaseUrl();
  return `${base}/api/docs/admit-card/${encodeURIComponent(admitToken)}.pdf`;
}

/**
 * Returns the public direct PDF download/stream URL for a Certificate.
 */
export function getCertificatePdfUrl(tokenOrRegNo) {
  if (!tokenOrRegNo) return '';
  const base = getPublicBaseUrl();
  return `${base}/api/docs/certificate/${encodeURIComponent(tokenOrRegNo)}.pdf`;
}

/**
 * Generates and uploads the Admit Card PDF to Cloudinary CDN for instant,
 * 100% reliable document delivery to Meta WhatsApp.
 */
export async function getOrUploadAdmitCardPdfUrl(registration, settings) {
  if (!registration) return '';

  // Return cached Cloudinary URL if available
  if (registration.admitCardPdfUrl && registration.admitCardPdfUrl.startsWith('https://res.cloudinary.com')) {
    return registration.admitCardPdfUrl;
  }

  try {
    const hasCloudinary =
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET;

    if (hasCloudinary) {
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
        secure: true,
      });

      const buffer = await generateAdmitCardPdfBuffer(registration, settings || {});
      const regId = registration.registrationNumber || registration.applicationRef || String(registration._id);
      const publicId = `shree-olympiad/admit-cards/${regId}.pdf`;

      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            public_id: publicId,
            resource_type: 'raw',
            type: 'upload',
            overwrite: true,
            timeout: 20000,
          },
          (err, res) => (err ? reject(err) : resolve(res)),
        );
        stream.end(buffer);
      });

      if (uploadResult?.secure_url) {
        registration.admitCardPdfUrl = uploadResult.secure_url;
        if (typeof registration.save === 'function') {
          registration.save().catch(() => {});
        }
        return uploadResult.secure_url;
      }
    }
  } catch (err) {
    console.error('[DocumentService] Cloudinary admit card upload error, falling back to public URL:', err.message);
  }

  return getAdmitCardPdfUrl(registration.admitToken || registration.registrationNumber);
}

/**
 * Generates and uploads the Certificate PDF to Cloudinary CDN for Meta WhatsApp delivery.
 */
export async function getOrUploadCertificatePdfUrl(registration, settings) {
  if (!registration) return '';

  if (registration.certificatePdfUrl && registration.certificatePdfUrl.startsWith('https://res.cloudinary.com')) {
    return registration.certificatePdfUrl;
  }

  try {
    const hasCloudinary =
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET;

    if (hasCloudinary) {
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
        secure: true,
      });

      const buffer = await generateCertificatePdfBuffer(registration, settings || {});
      const certId = registration.certificateNumber || registration.registrationNumber || String(registration._id);
      const publicId = `shree-olympiad/certificates/${certId}.pdf`;

      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            public_id: publicId,
            resource_type: 'raw',
            type: 'upload',
            overwrite: true,
            timeout: 20000,
          },
          (err, res) => (err ? reject(err) : resolve(res)),
        );
        stream.end(buffer);
      });

      if (uploadResult?.secure_url) {
        registration.certificatePdfUrl = uploadResult.secure_url;
        if (typeof registration.save === 'function') {
          registration.save().catch(() => {});
        }
        return uploadResult.secure_url;
      }
    }
  } catch (err) {
    console.error('[DocumentService] Cloudinary certificate upload error, falling back to public URL:', err.message);
  }

  const token = registration.admitToken || registration.registrationNumber;
  return getCertificatePdfUrl(token);
}

