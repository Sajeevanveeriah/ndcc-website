// Dinos Prize Wheel rules: a VGCCC "small raffle" drawn live at the
// clubrooms by spinning wheel. Nothing is spun or won online.
//
// These checks mirror the database constraints in
// supabase/migrations/20260927100000_prize_wheel_small_raffle.sql; keep both
// in step. Safe for client and server code (no server-only imports).

export const WHEEL_CAMPAIGN_CODE_PREFIX = 'NDCCWHL';
export const WHEEL_MAX_PRIZE_POOL_CENTS = 50_000;
export const WHEEL_DAILY_PRIZE_CAP_CENTS = 100_000;
export const WHEEL_MAX_SALES_WINDOW_MS = 8 * 60 * 60 * 1000;
export const WHEEL_MIN_DIVISIONS = 2;
export const WHEEL_MAX_DIVISIONS = 100;
export const WHEEL_MIN_TICKET_MULTIPLE = 2;
export const WHEEL_MAX_TICKET_MULTIPLE = 6;
export const WHEEL_MAX_TICKETS_PER_ORDER = 20;
// Card checkout closes early enough that every Stripe session (35 minute
// expiry, as for the reverse raffle) has completed or expired before the draw.
export const WHEEL_ONLINE_CLOSE_MINUTES = 40;
// Results stay public for a week after the draw, then the page and link hide.
export const WHEEL_PUBLIC_RESULTS_DAYS = 7;
export const WHEEL_RECORD_RETENTION_YEARS = 3;
export const GAMBLING_HELP_PHONE = '1800 858 858';
export const GAMBLING_HELP_URL = 'https://www.gamblinghelponline.org.au';
export const MELBOURNE_TIME_ZONE = 'Australia/Melbourne';

const CAMPAIGN_CODE_PATTERN = /^NDCCWHL[0-9]{6}[A-Z]$/;
const TICKET_REFERENCE_PATTERN = /^NDCCWHL-([0-9]{6}[A-Z])-([0-9]{3})$/;

export type WheelPrizeInput = {
  name: string;
  description?: string | null;
  retail_value_cents: number;
  quantity?: number;
};

export type WheelCampaignInput = {
  name: string;
  price_cents: number;
  wheel_divisions: number;
  sales_open_at: string;
  draw_at: string;
  draw_label: string;
  prizes: WheelPrizeInput[];
  active?: boolean;
  public_visibility_mode?: 'hidden' | 'scheduled' | 'visible';
  public_opens_at?: string | null;
};

export type WheelDayCampaign = {
  id: string;
  draw_at: string | null;
  prize_pool_cents: number | null;
  active: boolean;
};

export function isWheelCampaignCode(code: unknown): code is string {
  return typeof code === 'string' && CAMPAIGN_CODE_PATTERN.test(code);
}

export function wheelTicketReference(campaignCode: string, ticketNumber: number): string {
  if (!isWheelCampaignCode(campaignCode) || !Number.isInteger(ticketNumber) || ticketNumber < 1 || ticketNumber > WHEEL_MAX_DIVISIONS) {
    throw new Error('Invalid prize wheel ticket.');
  }
  return `${WHEEL_CAMPAIGN_CODE_PREFIX}-${campaignCode.slice(WHEEL_CAMPAIGN_CODE_PREFIX.length)}-${String(ticketNumber).padStart(3, '0')}`;
}

export function parseWheelTicketReference(reference: unknown): { campaignCode: string; ticketNumber: number } | null {
  if (typeof reference !== 'string') return null;
  const match = TICKET_REFERENCE_PATTERN.exec(reference);
  if (!match) return null;
  const ticketNumber = Number(match[2]);
  if (ticketNumber < 1 || ticketNumber > WHEEL_MAX_DIVISIONS) return null;
  return { campaignCode: `${WHEEL_CAMPAIGN_CODE_PREFIX}${match[1]}`, ticketNumber };
}

export function prizeValueCents(prize: WheelPrizeInput): number {
  return prize.retail_value_cents * (prize.quantity ?? 1);
}

export function prizeTotalCents(prizes: readonly WheelPrizeInput[]): number {
  return prizes.reduce((sum, prize) => sum + prizeValueCents(prize), 0);
}

/** The 2x-6x rule: total ticket value (price x divisions) against total prize value. */
export function ticketValueSummary(priceCents: number, divisions: number, prizePoolCents: number) {
  const totalTicketCents = priceCents * divisions;
  const minCents = WHEEL_MIN_TICKET_MULTIPLE * prizePoolCents;
  const maxCents = WHEEL_MAX_TICKET_MULTIPLE * prizePoolCents;
  const valid = [priceCents, divisions, prizePoolCents].every(Number.isSafeInteger) && prizePoolCents > 0;
  return {
    totalTicketCents,
    minCents,
    maxCents,
    multiple: valid ? totalTicketCents / prizePoolCents : null,
    withinRange: valid && totalTicketCents >= minCents && totalTicketCents <= maxCents,
  };
}

export function melbourneDateKey(value: string | Date): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone: MELBOURNE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Total declared prizes of the other active wheel raffles drawn on the same Melbourne date. */
export function sameDayPrizeTotalCents(others: readonly WheelDayCampaign[], drawAt: string, excludeId?: string | null): number {
  const day = melbourneDateKey(drawAt);
  if (!day) return 0;
  return others
    .filter(campaign => campaign.id !== excludeId && campaign.active && campaign.draw_at && melbourneDateKey(campaign.draw_at) === day)
    .reduce((sum, campaign) => sum + (campaign.prize_pool_cents || 0), 0);
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 40 && !Number.isNaN(new Date(value).getTime());
}

const isCents = (value: unknown, max: number) => Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= max;

export function normaliseWheelCampaignInput(value: unknown): WheelCampaignInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const prizes = Array.isArray(row.prizes) ? row.prizes : null;
  if (!prizes) return null;
  return {
    name: String(row.name ?? '').trim(),
    price_cents: Number(row.price_cents),
    wheel_divisions: Number(row.wheel_divisions),
    sales_open_at: String(row.sales_open_at ?? ''),
    draw_at: String(row.draw_at ?? ''),
    draw_label: String(row.draw_label ?? '').trim(),
    active: row.active === true,
    public_visibility_mode: row.public_visibility_mode === 'visible' || row.public_visibility_mode === 'scheduled' ? row.public_visibility_mode : 'hidden',
    public_opens_at: typeof row.public_opens_at === 'string' && row.public_opens_at ? row.public_opens_at : null,
    prizes: prizes.map((prize) => {
      const item = (prize && typeof prize === 'object' ? prize : {}) as Record<string, unknown>;
      const description = String(item.description ?? '').trim();
      return {
        name: String(item.name ?? '').trim(),
        description: description || null,
        retail_value_cents: Number(item.retail_value_cents),
        quantity: item.quantity === undefined || item.quantity === null || item.quantity === '' ? 1 : Number(item.quantity),
      };
    }),
  };
}

/**
 * Mirrors the database checks. `others` are the club's other wheel campaigns
 * (for the $1,000 same-day limit); `selfId` excludes the campaign being edited.
 */
export function validateWheelCampaign(input: WheelCampaignInput, others: readonly WheelDayCampaign[] = [], selfId?: string | null): string[] {
  const errors: string[] = [];
  if (input.name.length < 2 || input.name.length > 120) errors.push('Enter a campaign name (2 to 120 characters).');
  if (input.draw_label.length < 1 || input.draw_label.length > 200) errors.push('Enter where the live draw happens (for example the clubrooms).');
  if (!isCents(input.price_cents, 100_000)) errors.push('Enter a ticket price in whole cents.');
  if (!Number.isInteger(input.wheel_divisions) || input.wheel_divisions < WHEEL_MIN_DIVISIONS || input.wheel_divisions > WHEEL_MAX_DIVISIONS) {
    errors.push(`The wheel needs between ${WHEEL_MIN_DIVISIONS} and ${WHEEL_MAX_DIVISIONS} numbered divisions.`);
  }
  if (!validDate(input.sales_open_at) || !validDate(input.draw_at)) {
    errors.push('Enter the sales opening time and the draw time.');
  } else {
    const window = new Date(input.draw_at).getTime() - new Date(input.sales_open_at).getTime();
    if (window <= 0) errors.push('The draw must be after sales open.');
    else if (window > WHEEL_MAX_SALES_WINDOW_MS) errors.push('The draw must be within 8 hours of sales opening.');
  }
  if (input.public_visibility_mode === 'scheduled' && !validDate(input.public_opens_at)) errors.push('Choose when the public page opens.');
  if (input.prizes.length < 1) errors.push('Add at least one prize.');
  if (Number.isInteger(input.wheel_divisions) && input.prizes.length > input.wheel_divisions) errors.push('There cannot be more prizes than wheel numbers.');
  input.prizes.forEach((prize, index) => {
    if (prize.name.length < 1 || prize.name.length > 120) errors.push(`Prize ${index + 1}: enter a name.`);
    if ((prize.description || '').length > 500) errors.push(`Prize ${index + 1}: keep the description under 500 characters.`);
    if (!isCents(prize.retail_value_cents, WHEEL_MAX_PRIZE_POOL_CENTS)) errors.push(`Prize ${index + 1}: enter the retail value.`);
    if (!Number.isInteger(prize.quantity) || (prize.quantity as number) < 1 || (prize.quantity as number) > 100) errors.push(`Prize ${index + 1}: quantity must be 1 to 100.`);
  });
  const pool = prizeTotalCents(input.prizes);
  if (Number.isSafeInteger(pool)) {
    if (pool > WHEEL_MAX_PRIZE_POOL_CENTS) errors.push('Total prize value must be $500 or less.');
    if (pool > 0 && Number.isSafeInteger(input.price_cents) && Number.isInteger(input.wheel_divisions)
      && !ticketValueSummary(input.price_cents, input.wheel_divisions, pool).withinRange) {
      errors.push('Total ticket value (price x numbers) must be between 2 and 6 times the total prize value.');
    }
    if (input.active && validDate(input.draw_at) && sameDayPrizeTotalCents(others, input.draw_at, selfId) + pool > WHEEL_DAILY_PRIZE_CAP_CENTS) {
      errors.push('Prize wheel raffles drawn on the same day may not exceed $1,000 in total prizes.');
    }
  }
  return errors;
}

export function validWheelSelection(value: unknown, quantity: number, divisions: number): value is number[] {
  return Number.isInteger(quantity) && quantity >= 1 && quantity <= WHEEL_MAX_TICKETS_PER_ORDER
    && Number.isInteger(divisions) && divisions >= WHEEL_MIN_DIVISIONS && divisions <= WHEEL_MAX_DIVISIONS
    && Array.isArray(value) && value.length === quantity
    && value.every(number => Number.isInteger(number) && number >= 1 && number <= divisions)
    && new Set(value).size === quantity;
}

export type WheelSalesState = 'upcoming' | 'open' | 'cash_only' | 'closed';

/** Online sales run from sales_open_at until 40 minutes before the draw; cash until the draw. */
export function wheelSalesState(campaign: { sales_open_at: string | null; draw_at: string | null }, now: Date = new Date()): WheelSalesState {
  if (!campaign.sales_open_at || !campaign.draw_at) return 'closed';
  const opens = new Date(campaign.sales_open_at).getTime();
  const draw = new Date(campaign.draw_at).getTime();
  const at = now.getTime();
  if (Number.isNaN(opens) || Number.isNaN(draw)) return 'closed';
  if (at < opens) return 'upcoming';
  if (at >= draw) return 'closed';
  if (at > draw - WHEEL_ONLINE_CLOSE_MINUTES * 60_000) return 'cash_only';
  return 'open';
}

export function isWheelPubliclyCurrent(campaign: { draw_at: string | null }, now: Date = new Date()): boolean {
  if (!campaign.draw_at) return false;
  const draw = new Date(campaign.draw_at).getTime();
  return !Number.isNaN(draw) && now.getTime() < draw + WHEEL_PUBLIC_RESULTS_DAYS * 24 * 60 * 60_000;
}

/** Public winner label: first-name initial only, never a full name. */
export function publicWinnerInitial(name: unknown): string {
  const first = String(name ?? '').trim().charAt(0).toUpperCase();
  return /^[A-Z]$/.test(first) ? `${first}.` : '';
}

export function formatAud(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatMelbourneDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-AU', { timeZone: MELBOURNE_TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

export function formatMelbourneTime(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-AU', { timeZone: MELBOURNE_TIME_ZONE, hour: 'numeric', minute: '2-digit' }).format(date);
}

// ---- Draw state (shared by the admin draw screen and public results) ----

export type WheelPrizeRow = { id: string; position: number; name: string; description: string | null; retail_value_cents: number; quantity: number };
export type WheelDrawRow = {
  id: string; prize_id: string; draw_number: number; winning_number: number; ticket_id: string | null;
  respin_reason: 'unsold' | 'unclaimed' | 'already_won' | null; created_at: string; random_value?: string; operator_id?: string;
};

export type WheelPrizeDrawState = {
  prize: WheelPrizeRow;
  draws: WheelDrawRow[];
  latest: WheelDrawRow | null;
  /** 'pending' = not yet drawn, 'respin' = latest spin has no winner, 'won' = latest spin has a winner. */
  status: 'pending' | 'respin' | 'won';
};

export function wheelDrawState(prizes: readonly WheelPrizeRow[], draws: readonly WheelDrawRow[]) {
  const ordered = [...prizes].sort((a, b) => a.position - b.position);
  const perPrize: WheelPrizeDrawState[] = ordered.map((prize) => {
    const prizeDraws = draws.filter(draw => draw.prize_id === prize.id).sort((a, b) => a.draw_number - b.draw_number);
    const latest = prizeDraws[prizeDraws.length - 1] || null;
    return { prize, draws: prizeDraws, latest, status: !latest ? 'pending' : latest.ticket_id ? 'won' : 'respin' };
  });
  // First draw wins first prize: the next prize is the first undrawn prize,
  // and only when every earlier prize has a winner.
  let next: WheelPrizeDrawState | null = null;
  for (const state of perPrize) {
    if (state.status === 'won') continue;
    next = state;
    break;
  }
  return { prizes: perPrize, next, complete: perPrize.length > 0 && perPrize.every(state => state.status === 'won') };
}

export function respinReasonLabel(reason: WheelDrawRow['respin_reason']): string {
  if (reason === 'unsold') return 'Re-spin: previous number unsold';
  if (reason === 'already_won') return 'Re-spin: previous number had already won';
  if (reason === 'unclaimed') return 'Re-spin: previous winner did not claim';
  return 'First spin';
}
