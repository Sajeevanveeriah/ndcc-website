import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getServerSharp } from './server-fonts.mjs';
import { trailerRaffleTicketSvg } from './trailer-raffle-ticket';
import { reverseRaffleTicketSvg } from './reverse-raffle-ticket';
import { parseRaffleReference, RAFFLE_FALLBACK_DISPLAY, REVERSE_RAFFLE_CAMPAIGN_CODE } from './raffle-constants';

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
  const logo = await fs.readFile(path.join(process.cwd(), 'public/images/reverse-raffle-logo.png'));
  const svg = trailerRaffleTicketSvg(reference, `data:image/png;base64,${logo.toString('base64')}`, false,
    details?.priceCents ?? fallback.priceCents, details ? details.drawLabel : fallback.drawLabel, details?.name ?? fallback.name);
  const sharp = await getServerSharp();
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}
