// Single source for raffle campaign codes, ticket-reference formats and the
// fallback presentation values used when a raffle_campaigns row does not
// supply them. Safe for client and server code (no server-only imports).
//
// The live values (name, price_cents, draw_label, year_code) come from the
// raffle_campaigns table; the fallbacks below only preserve today's output
// when a caller has no campaign record.

export const RAFFLE_CAMPAIGN_CODE = 'NDCCRAF';
export const REVERSE_RAFFLE_CAMPAIGN_CODE = 'NDCCRRO';
export type RaffleCampaignCode = typeof RAFFLE_CAMPAIGN_CODE | typeof REVERSE_RAFFLE_CAMPAIGN_CODE;
export const RAFFLE_CAMPAIGN_CODES: readonly RaffleCampaignCode[] = [RAFFLE_CAMPAIGN_CODE, REVERSE_RAFFLE_CAMPAIGN_CODE];

// Reverse raffle numbers 201-300. Enforced in the database by migration
// 20260922104834_reverse_raffle_201_300; keep these in step with it.
export const REVERSE_RAFFLE_MIN_NUMBER = 201;
export const REVERSE_RAFFLE_MAX_NUMBER = 300;
export const REVERSE_RAFFLE_NUMBER_RANGE_LABEL = `${REVERSE_RAFFLE_MIN_NUMBER}-${REVERSE_RAFFLE_MAX_NUMBER}`;

// Ticket references are `${code}-${year_code}${lpad(ticket_number, 4)}`
// (see the raffle ticket allocation functions in supabase/migrations).
// year_code is two digits for the trailer raffle and a four-digit year for
// the reverse raffle (raffle_campaigns_year_code_check).
export const RAFFLE_YEAR_CODE_DIGITS: Record<RaffleCampaignCode, number> = {
  [RAFFLE_CAMPAIGN_CODE]: 2,
  [REVERSE_RAFFLE_CAMPAIGN_CODE]: 4,
};
export const RAFFLE_TICKET_NUMBER_DIGITS = 4;

export type RaffleCampaignDisplay = { name: string; priceCents: number; drawLabel: string };

// Fallback display values (today's campaign values) for when the campaign
// record is not available to the caller.
export const RAFFLE_FALLBACK_DISPLAY: Record<RaffleCampaignCode, RaffleCampaignDisplay> = {
  [RAFFLE_CAMPAIGN_CODE]: { name: 'Dinos Trailer Raffle', priceCents: 500, drawLabel: 'Drawn 19 December 2026 at the Christmas Party' },
  [REVERSE_RAFFLE_CAMPAIGN_CODE]: { name: 'Reverse Raffle', priceCents: 6000, drawLabel: '' },
};
// Example reference shown on the public trailer-raffle page (year code 26).
export const RAFFLE_SAMPLE_REFERENCE = `${RAFFLE_CAMPAIGN_CODE}-26XXXX`;

export type ParsedRaffleReference = { code: RaffleCampaignCode; yearCode: string; ticketNumber: number };

/**
 * Parses `${code}-${year_code}NNNN`. When `campaign` is given the code and
 * year_code must match it exactly; otherwise any year of the right width is
 * accepted for a known campaign code.
 */
export function parseRaffleReference(reference: string, campaign?: { code: string; year_code?: string | null }): ParsedRaffleReference | null {
  const match = /^([A-Z]+)-(\d+)$/.exec(reference);
  if (!match) return null;
  const code = match[1] as RaffleCampaignCode;
  if (!RAFFLE_CAMPAIGN_CODES.includes(code)) return null;
  if (campaign && campaign.code !== code) return null;
  const digits = match[2];
  const yearDigits = RAFFLE_YEAR_CODE_DIGITS[code];
  if (digits.length !== yearDigits + RAFFLE_TICKET_NUMBER_DIGITS) return null;
  const yearCode = digits.slice(0, yearDigits);
  if (campaign?.year_code && campaign.year_code !== yearCode) return null;
  return { code, yearCode, ticketNumber: Number(digits.slice(yearDigits)) };
}

export function isReverseRaffleNumber(value: number): boolean {
  return Number.isInteger(value) && value >= REVERSE_RAFFLE_MIN_NUMBER && value <= REVERSE_RAFFLE_MAX_NUMBER;
}

export function formatRaffleAud(priceCents: number): string {
  return `$${(priceCents / 100).toFixed(2)} AUD`;
}
