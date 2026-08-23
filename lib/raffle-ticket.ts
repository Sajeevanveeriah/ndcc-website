import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const REF_PATTERN = /^NDCCRAF-26\d{4}$/;

function esc(value: string) {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch] || ch));
}

export async function renderRaffleTicket(reference: string): Promise<Buffer> {
  if (!REF_PATTERN.test(reference)) throw new Error('Invalid raffle ticket reference.');
  const logo = await fs.readFile(path.join(process.cwd(), 'public/images/logo.jpg'));
  const logoUri = `data:image/jpeg;base64,${logo.toString('base64')}`;
  const ref = esc(reference);
  const svg = `<svg width="1800" height="600" viewBox="0 0 1800 600" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="m" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#4a0000"/><stop offset="1" stop-color="#870d22"/></linearGradient></defs>
    <rect width="1800" height="600" rx="28" fill="#fffdf8"/><rect width="1800" height="600" rx="28" fill="none" stroke="#630819" stroke-width="28"/>
    <path d="M0 430 L450 540 L900 450 L1350 540 L1800 430 V600 H0Z" fill="url(#m)"/><path d="M0 405 L450 515 L900 425 L1350 515 L1800 405" fill="none" stroke="#df9917" stroke-width="12"/>
    <image href="${logoUri}" x="55" y="55" width="330" height="330" preserveAspectRatio="xMidYMid meet"/>
    <text x="1040" y="92" text-anchor="middle" font-family="Arial,sans-serif" font-size="54" font-weight="700" fill="#4a0000">NEWCOMB AND DISTRICT CRICKET CLUB</text>
    <text x="1040" y="205" text-anchor="middle" font-family="Arial,sans-serif" font-size="92" font-weight="900" fill="#690719">DINOS TRAILER RAFFLE</text>
    <rect x="520" y="252" width="1040" height="154" rx="18" fill="#fff" stroke="#690719" stroke-width="8"/>
    <text x="1040" y="302" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" font-weight="700" fill="#2778aa">TICKET REFERENCE</text>
    <text x="1040" y="375" text-anchor="middle" font-family="Arial,sans-serif" font-size="72" font-weight="900" fill="#690719">${ref}</text>
    <text x="1040" y="500" text-anchor="middle" font-family="Arial,sans-serif" font-size="48" font-weight="900" fill="#ffffff">$5.00 AUD</text>
    <text x="1040" y="552" text-anchor="middle" font-family="Arial,sans-serif" font-size="32" font-weight="700" fill="#ffffff">DRAWN 19 DECEMBER 2026 AT THE CHRISTMAS PARTY</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}
