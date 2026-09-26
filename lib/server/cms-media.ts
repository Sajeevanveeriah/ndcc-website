import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
import sharp from 'sharp';

export const STAGING_BUCKET = 'cms-media-staging';
export const MEDIA_BUCKET = 'cms-media';
export const MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']);
export const mediaLimit = (type: string) => (type === 'application/pdf' ? 10 : 4) * 1024 * 1024;
export type UploadTicket = { path: string; owner: string; size: number; type: string; expires: number };

export function signUploadTicket(ticket: UploadTicket, secret: string) {
  const payload = Buffer.from(JSON.stringify(ticket)).toString('base64url');
  const signature = createHmac('sha256', secret).update(`cms-media-v1:${payload}`).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyUploadTicket(value: unknown, owner: string, secret: string, now = Date.now()): UploadTicket | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const [payload, signature, extra] = value.split('.');
    if (extra || !payload || !signature) return null;
    const expected = createHmac('sha256', secret).update(`cms-media-v1:${payload}`).digest();
    const received = Buffer.from(signature, 'base64url');
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
    const ticket = JSON.parse(Buffer.from(payload, 'base64url').toString()) as UploadTicket;
    if (ticket.owner !== owner || !ticket.path.startsWith(`${owner}/`) || ticket.path.includes('..') ||
      !Number.isFinite(ticket.expires) || ticket.expires <= now || !MEDIA_TYPES.has(ticket.type) ||
      !Number.isInteger(ticket.size) || ticket.size <= 0 || ticket.size > mediaLimit(ticket.type)) return null;
    return ticket;
  } catch { return null; }
}

/** Decode before publication. Re-encoding strips metadata and bounds pixels. */
export async function validateMedia(bytes: Buffer, type: string) {
  if (!MEDIA_TYPES.has(type) || !bytes.length || bytes.length > mediaLimit(type)) throw new Error('Invalid file type or size.');
  let content = bytes;
  let contentType = type;
  let extension = 'pdf';
  let width: number | null = null;
  let height: number | null = null;
  if (type === 'application/pdf') {
    if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-' || !bytes.subarray(-2048).includes(Buffer.from('%%EOF'))) {
      throw new Error('File is not a complete PDF document.');
    }
  } else {
    const decoder = sharp(bytes, { animated: true, limitInputPixels: 40_000_000, failOn: 'warning' });
    const metadata = await decoder.metadata();
    const expected = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[type];
    if (metadata.format !== expected) throw new Error('The image contents do not match its file type.');
    content = await decoder.rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
    contentType = 'image/webp';
    extension = 'webp';
    const output = await sharp(content, { animated: true }).metadata();
    width = output.width ?? null;
    height = output.pageHeight ?? output.height ?? null;
  }
  const hash = createHash('sha256').update(content).digest('hex');
  return { content, contentType, width, height, path: `${hash.slice(0, 2)}/${hash}.${extension}` };
}
