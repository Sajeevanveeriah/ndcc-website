import { escapeEmailHtml } from '../email-html';
import { formatRaffleAud } from '../raffle-constants';
import { parseWheelTicketReference } from './rules';

/** Emailed prize wheel ticket artwork (club maroon, blue and gold). */
export function wheelTicketSvg(reference: string, logoUri: string, priceCents: number, name: string, drawLabel: string | null): string {
  const parsed = parseWheelTicketReference(reference);
  if (!parsed) throw new Error('Invalid prize wheel ticket reference.');
  const number = parsed.ticketNumber;
  const price = formatRaffleAud(priceCents).replace('.00 ', ' ');
  const safeName = escapeEmailHtml(name.toUpperCase());
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="700" viewBox="0 0 1800 700" role="img" aria-labelledby="title desc">
  <title id="title">${safeName} - wheel number ${number}</title>
  <desc id="desc">Newcomb and District Cricket Club. Prize wheel number ${number}. ${price}. Reference ${reference}. Drawn live, 18+ only.</desc>
  <rect width="1800" height="700" fill="#880000"/>
  <rect x="1190" width="610" height="700" fill="#8cc6d1"/>
  <path d="M1190 30V670" stroke="#880000" stroke-width="2" stroke-dasharray="8 12" opacity=".45"/>
  <image href="${logoUri}" x="55" y="36" width="165" height="165" preserveAspectRatio="xMidYMid meet"/>
  <g font-family="Noto Sans, sans-serif">
    <text x="250" y="105" fill="#FBF7F0" font-size="31" letter-spacing="2">NEWCOMB &amp; DISTRICT</text>
    <text x="250" y="151" fill="#FBF7F0" font-size="31" letter-spacing="2">CRICKET CLUB</text>
    <text x="65" y="237" fill="#FBF7F0" font-size="25">${escapeEmailHtml((drawLabel ? `DRAWN LIVE AT ${drawLabel}` : 'DRAWN LIVE').toUpperCase())}</text>
    <text x="65" y="359" fill="#edc266" font-size="149" font-weight="900" letter-spacing="-5">PRIZE</text>
    <text x="65" y="519" fill="#FBF7F0" font-size="149" font-weight="900" letter-spacing="-5">WHEEL</text>
    <path d="M65 584H1095" stroke="#edc266" stroke-width="2"/>
    <text x="65" y="637" fill="#FBF7F0" font-size="24" letter-spacing="2">KEEP THIS TICKET FOR THE LIVE DRAW. 18+ ONLY</text>
    <text x="1495" y="114" text-anchor="middle" fill="#162845" font-size="37" font-weight="700">WHEEL NUMBER</text>
    <text x="1495" y="383" text-anchor="middle" fill="#162845" font-size="235" font-weight="900" letter-spacing="-8">${number}</text>
    <text x="1495" y="488" text-anchor="middle" fill="#162845" font-size="66" font-weight="700">${price}</text>
    <text x="1495" y="578" text-anchor="middle" fill="#162845" font-size="23" letter-spacing="2">TICKET REFERENCE</text>
    <text x="1495" y="626" text-anchor="middle" fill="#162845" font-size="31" font-weight="700">${reference}</text>
  </g>
</svg>`;
}
