import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getServerSharp } from './server-fonts.mjs';
import { escapeEmailHtml } from './email-html';
import { reverseRaffleTicketSvg } from './reverse-raffle-ticket';
import { parseRaffleReference, RAFFLE_FALLBACK_DISPLAY, REVERSE_RAFFLE_CAMPAIGN_CODE } from './raffle-constants';

// SVG text escaping. &#39; (shared helper) and the former &apos; are
// equivalent XML character references for an apostrophe.
function esc(value: string) {
  return escapeEmailHtml(value);
}

/**
 * Renders the emailed ticket image. `details` comes from the paid order's
 * raffle_campaigns record; the fallbacks in lib/raffle-constants.ts are only
 * used when it is absent. Pass `campaign` to also require the reference to
 * match that campaign's code and year_code.
 */
export async function renderRaffleTicket(
  reference: string,
  details?: { name: string; priceCents: number; drawLabel: string | null },
  campaign?: { code: string; year_code?: string | null },
): Promise<Buffer> {
  const parsed = parseRaffleReference(reference, campaign);
  if (!parsed) throw new Error('Invalid raffle ticket reference.');
  const fallback = RAFFLE_FALLBACK_DISPLAY[parsed.code];
  if (parsed.code === REVERSE_RAFFLE_CAMPAIGN_CODE) {
    const logo = await fs.readFile(path.join(process.cwd(), 'public/images/reverse-raffle-logo.png'));
    const svg = reverseRaffleTicketSvg(reference, `data:image/png;base64,${logo.toString('base64')}`, false, details?.priceCents ?? fallback.priceCents);
    const sharp = await getServerSharp();
    return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  }
  const logo = await fs.readFile(path.join(process.cwd(), 'public/images/logo.jpg'));
  const logoUri = `data:image/jpeg;base64,${logo.toString('base64')}`;
  const ref = esc(reference);
  const title = esc((details?.name || fallback.name).toUpperCase());
  const price = ((details?.priceCents ?? fallback.priceCents) / 100).toFixed(2);
  const draw = esc((details ? (details.drawLabel || '') : fallback.drawLabel).toUpperCase());
  const svg = `<svg width="1800" height="600" viewBox="0 0 1800 600" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="m" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#4a0000"/><stop offset="1" stop-color="#870d22"/></linearGradient></defs>
    <rect width="1800" height="600" rx="28" fill="#fffdf8"/><rect width="1800" height="600" rx="28" fill="none" stroke="#630819" stroke-width="28"/>
    <path d="M0 430 L450 540 L900 450 L1350 540 L1800 430 V600 H0Z" fill="url(#m)"/><path d="M0 405 L450 515 L900 425 L1350 515 L1800 405" fill="none" stroke="#df9917" stroke-width="12"/>
    <image href="${logoUri}" x="55" y="55" width="330" height="330" preserveAspectRatio="xMidYMid meet"/>
    <text x="1040" y="92" text-anchor="middle" font-family="Arial,sans-serif" font-size="54" font-weight="700" fill="#4a0000">NEWCOMB AND DISTRICT CRICKET CLUB</text>
    <text x="1040" y="205" text-anchor="middle" font-family="Arial,sans-serif" font-size="92" font-weight="900" fill="#690719">${title}</text>
    <rect x="520" y="252" width="1040" height="154" rx="18" fill="#fff" stroke="#690719" stroke-width="8"/>
    <text x="1040" y="302" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" font-weight="700" fill="#2778aa">TICKET REFERENCE</text>
    <text x="1040" y="375" text-anchor="middle" font-family="Arial,sans-serif" font-size="72" font-weight="900" fill="#690719">${ref}</text>
    <text x="1040" y="500" text-anchor="middle" font-family="Arial,sans-serif" font-size="48" font-weight="900" fill="#ffffff">$${price} AUD</text>
    <text x="1040" y="552" text-anchor="middle" font-family="Arial,sans-serif" font-size="32" font-weight="700" fill="#ffffff">${draw}</text>
  </svg>`;
  const sharp = await getServerSharp();
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}
