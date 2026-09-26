import {
  formatRaffleAud,
  parseRaffleReference,
  RAFFLE_FALLBACK_DISPLAY,
  RAFFLE_CAMPAIGN_CODE,
} from './raffle-constants';
import { escapeEmailHtml } from './email-html';

/** Shared vector artwork for the emailed ticket and downloadable design sample. */
export function trailerRaffleTicketSvg(
  reference: string,
  logoUri: string,
  sample = false,
  priceCents: number = RAFFLE_FALLBACK_DISPLAY[RAFFLE_CAMPAIGN_CODE].priceCents,
  drawLabel: string | null = null,
  name: string = RAFFLE_FALLBACK_DISPLAY[RAFFLE_CAMPAIGN_CODE].name,
): string {
  const parsed = parseRaffleReference(reference);
  if (!parsed || parsed.code !== RAFFLE_CAMPAIGN_CODE) throw new Error('Invalid trailer raffle ticket reference.');
  const number = parsed.ticketNumber;
  const price = formatRaffleAud(priceCents).replace('.00 ', ' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="700" viewBox="0 0 1800 700" role="img" aria-labelledby="title desc">
  <title id="title">${escapeEmailHtml(name.toUpperCase())} - ticket ${number}</title>
  <desc id="desc">Newcomb and District Cricket Club. Raffle number ${number}. ${price}. Reference ${reference}.${sample ? ' Design sample, not valid for entry.' : ''}</desc>
  <rect width="1800" height="700" fill="#641D2C"/>
  <rect x="1190" width="610" height="700" fill="#8cc6d1"/>
  <path d="M1190 30V670" stroke="#641D2C" stroke-width="2" stroke-dasharray="8 12" opacity=".45"/>
  <image href="${logoUri}" x="55" y="36" width="165" height="165" preserveAspectRatio="xMidYMid meet"/>
  <g font-family="Noto Sans, sans-serif">
    <text x="250" y="105" fill="#FAF7F0" font-size="31" letter-spacing="2">NEWCOMB &amp; DISTRICT</text>
    <text x="250" y="151" fill="#FAF7F0" font-size="31" letter-spacing="2">CRICKET CLUB</text>
    <text x="65" y="237" fill="#FAF7F0" font-size="25">${escapeEmailHtml((drawLabel || "").toUpperCase())}</text>
    <text x="65" y="359" fill="#8cc6d1" font-size="149" font-weight="900" letter-spacing="-5">TRAILER</text>
    <text x="65" y="519" fill="#FAF7F0" font-size="149" font-weight="900" letter-spacing="-5">RAFFLE</text>
    <path d="M65 584H1095" stroke="#D9AF58" stroke-width="2"/>
    <text x="65" y="637" fill="#FAF7F0" font-size="24" letter-spacing="2">${sample ? 'DESIGN SAMPLE - NOT VALID FOR ENTRY' : 'KEEP THIS TICKET FOR THE DRAW'}</text>
    <text x="1495" y="114" text-anchor="middle" fill="#641D2C" font-size="37" font-weight="700">RAFFLE NUMBER</text>
    <text x="1495" y="383" text-anchor="middle" fill="#641D2C" font-size="235" font-weight="900" letter-spacing="-8">${number}</text>
    <text x="1495" y="488" text-anchor="middle" fill="#641D2C" font-size="66" font-weight="700">${price}</text>
    <text x="1495" y="578" text-anchor="middle" fill="#641D2C" font-size="23" letter-spacing="2">TICKET REFERENCE</text>
    <text x="1495" y="626" text-anchor="middle" fill="#641D2C" font-size="31" font-weight="700">${reference}</text>
  </g>
</svg>`;
}
