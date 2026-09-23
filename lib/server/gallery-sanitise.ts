import sharp from 'sharp';
import { GALLERY_ALLOWED_MIME_TYPES, MAX_GALLERY_FILE_BYTES, MAX_GALLERY_IMAGE_DIMENSION } from '@/lib/gallery/shared';

const EXPECTED_FORMAT: Record<string, 'jpeg' | 'png' | 'webp'> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Re-encode a gallery original so no EXIF/XMP/IPTC metadata (GPS location,
 * device serials, timestamps) reaches the public bucket. Dimensions and format
 * are preserved so downloads stay full resolution; orientation is baked in and
 * the ICC colour profile is kept so colours do not shift.
 */
export async function sanitiseGalleryImage(bytes: Buffer, mimeType: string): Promise<Buffer> {
  const expected = EXPECTED_FORMAT[mimeType];
  if (!expected || !(mimeType in GALLERY_ALLOWED_MIME_TYPES)) throw new Error('Unsupported image type.');
  if (!bytes.length || bytes.length > MAX_GALLERY_FILE_BYTES) throw new Error('Image is empty or too large.');

  const decoder = sharp(bytes, { limitInputPixels: MAX_GALLERY_IMAGE_DIMENSION * 4000, failOn: 'error' });
  const metadata = await decoder.metadata();
  if (metadata.format !== expected) throw new Error('The image contents do not match its file type.');

  const pipeline = decoder.rotate().keepIccProfile();
  if (expected === 'jpeg') return pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  if (expected === 'png') return pipeline.png({ compressionLevel: 9 }).toBuffer();
  return pipeline.webp({ quality: 92 }).toBuffer();
}
