// Spin the Wheel rules: an online wheel spun on the website. Separate from the
// Dinos Prize Wheel small raffle in lib/prize-wheel (drawn live at the
// clubrooms). These checks mirror the database constraints in
// supabase/migrations/20260928100000_spin_the_wheel.sql; keep both in step.
// Safe for client and server code (no server-only imports).

const SPIN_MIN_SEGMENTS = 2;
export const SPIN_MAX_SEGMENTS = 48;
export const SPIN_LABEL_MAX = 24;
const SPIN_MAX_WEIGHT = 1_000_000;
const SPIN_MAX_STOCK = 1_000_000;
const SPIN_MIN_PRICE_CENTS = 50;
const SPIN_MAX_PRICE_CENTS = 100_000;
const SPIN_MAX_FREE_SPINS = 100;
const SPIN_MAX_SPINS_PER_ORDER = 100;
const SPIN_MAX_SPINS_PER_DAY = 100;
export const SPIN_ORDER_CATEGORY = 'spin_wheel';
export const SPIN_RETURN_PATH = '/spin-the-wheel';
export const SPIN_ANIMATION_MS = 6000;
// Paid spin sales stop this long before a wheel closes, so every Stripe
// Checkout Session (60 minutes, see app/api/payments/checkout-session) has
// completed or expired while the spins can still be used.
export const SPIN_CHECKOUT_CLOSE_MINUTES = 70;
const MELBOURNE_TIME_ZONE = 'Australia/Melbourne';

const SPIN_STATUSES = ['draft', 'live', 'paused', 'ended'] as const;
export type SpinWheelStatus = typeof SPIN_STATUSES[number];
const SPIN_VISIBILITY_MODES = ['hidden', 'scheduled', 'visible'] as const;
export type SpinVisibilityMode = typeof SPIN_VISIBILITY_MODES[number];
export const SPIN_COLOURS = ['maroon', 'navy', 'blue', 'gold', 'cream'] as const;
export type SpinColour = typeof SPIN_COLOURS[number];

/** Club palette (tailwind.config.ts brand values). */
export const SPIN_COLOUR_HEX: Record<SpinColour, { fill: string; text: string; label: string }> = {
  maroon: { fill: '#880000', text: '#FBF7F0', label: 'Maroon' },
  navy: { fill: '#162845', text: '#FBF7F0', label: 'Navy' },
  blue: { fill: '#8cc6d1', text: '#162845', label: 'Sky blue' },
  gold: { fill: '#edc266', text: '#162845', label: 'Gold' },
  cream: { fill: '#FBF7F0', text: '#162845', label: 'Cream' },
};

export type SpinSegmentInput = {
  id?: string | null;
  label: string;
  prize_name: string | null;
  prize_description: string | null;
  is_prize: boolean;
  /** Win once per person; landing on it again gives a free bonus spin. */
  once_per_spinner: boolean;
  weight: number;
  stock: number | null;
  colour: SpinColour;
};

export type SpinWheelInput = {
  id?: string | null;
  name: string;
  description: string | null;
  status: SpinWheelStatus;
  starts_at: string | null;
  ends_at: string | null;
  free_spins_per_account: number;
  spin_price_cents: number | null;
  max_spins_per_order: number;
  /** Spins per person per Melbourne day; null = no limit. */
  max_spins_per_day: number | null;
  claim_instructions: string | null;
  public_visibility_mode: SpinVisibilityMode;
  public_opens_at: string | null;
  segments: SpinSegmentInput[];
};

export type SpinWheelRow = {
  id: string;
  name: string;
  description: string | null;
  status: SpinWheelStatus;
  starts_at: string | null;
  ends_at: string | null;
  free_spins_per_account: number;
  spin_price_cents: number | null;
  max_spins_per_order: number;
  max_spins_per_day: number | null;
  claim_instructions: string | null;
  public_visibility_mode: SpinVisibilityMode;
  public_opens_at: string | null;
  created_at?: string;
  updated_at?: string;
};

export type SpinSegmentRow = SpinSegmentInput & { id: string; wheel_id?: string; position: number };

/** What the public API may show: never weights or stock counts. */
export type PublicSpinSegment = {
  position: number;
  label: string;
  prize_name: string | null;
  prize_description: string | null;
  is_prize: boolean;
  once_per_spinner: boolean;
  colour: SpinColour;
  available: boolean;
};

export type SpinResultView = {
  reference: string;
  segment_position: number;
  segment_label: string;
  prize_name: string | null;
  prize_description: string | null;
  is_prize: boolean;
  /** Landed on a once-per-person prize already won: a free bonus spin instead. */
  repeat_bonus?: boolean;
  created_at: string;
  claimed_at?: string | null;
  voided_at?: string | null;
};

const text = (value: unknown) => String(value ?? '').trim();
const optionalText = (value: unknown) => text(value) || null;
const optionalInteger = (value: unknown): number | null => (value === null || value === undefined || value === '' ? null : Number(value));
const validDate = (value: string | null) => value !== null && value.length <= 40 && !Number.isNaN(new Date(value).getTime());
const inRange = (value: unknown, min: number, max: number) => Number.isInteger(value) && (value as number) >= min && (value as number) <= max;

function isSpinColour(value: unknown): value is SpinColour {
  return typeof value === 'string' && (SPIN_COLOURS as readonly string[]).includes(value);
}

export function normaliseSpinWheelInput(value: unknown): SpinWheelInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (!Array.isArray(row.segments)) return null;
  const status = (SPIN_STATUSES as readonly string[]).includes(String(row.status)) ? row.status as SpinWheelStatus : 'draft';
  const mode = (SPIN_VISIBILITY_MODES as readonly string[]).includes(String(row.public_visibility_mode)) ? row.public_visibility_mode as SpinVisibilityMode : 'hidden';
  return {
    id: typeof row.id === 'string' && row.id ? row.id : null,
    name: text(row.name),
    description: optionalText(row.description),
    status,
    starts_at: optionalText(row.starts_at),
    ends_at: optionalText(row.ends_at),
    free_spins_per_account: Number(row.free_spins_per_account ?? 0),
    spin_price_cents: optionalInteger(row.spin_price_cents),
    max_spins_per_order: Number(row.max_spins_per_order ?? 20),
    max_spins_per_day: optionalInteger(row.max_spins_per_day),
    claim_instructions: optionalText(row.claim_instructions),
    public_visibility_mode: mode,
    public_opens_at: mode === 'scheduled' ? optionalText(row.public_opens_at) : null,
    segments: row.segments.map((segment) => {
      const item = (segment && typeof segment === 'object' ? segment : {}) as Record<string, unknown>;
      return {
        id: typeof item.id === 'string' && item.id ? item.id : null,
        label: text(item.label),
        prize_name: optionalText(item.prize_name),
        prize_description: optionalText(item.prize_description),
        is_prize: item.is_prize === true,
        once_per_spinner: item.is_prize === true && item.once_per_spinner === true,
        weight: Number(item.weight),
        stock: optionalInteger(item.stock),
        colour: isSpinColour(item.colour) ? item.colour : 'maroon',
      };
    }),
  };
}

/** Mirrors the database checks; returns readable errors (empty when valid). */
export function validateSpinWheel(input: SpinWheelInput): string[] {
  const errors: string[] = [];
  if (input.name.length < 2 || input.name.length > 120) errors.push('Enter a wheel name (2 to 120 characters).');
  if ((input.description || '').length > 2000) errors.push('Keep the description under 2,000 characters.');
  if ((input.claim_instructions || '').length > 2000) errors.push('Keep the claim instructions under 2,000 characters.');
  if (input.starts_at !== null && !validDate(input.starts_at)) errors.push('Enter a valid start time.');
  if (input.ends_at !== null && !validDate(input.ends_at)) errors.push('Enter a valid end time.');
  if (validDate(input.starts_at) && validDate(input.ends_at) && new Date(input.ends_at!).getTime() <= new Date(input.starts_at!).getTime()) {
    errors.push('The end time must be after the start time.');
  }
  if (!inRange(input.free_spins_per_account, 0, SPIN_MAX_FREE_SPINS)) errors.push(`Free spins per account must be 0 to ${SPIN_MAX_FREE_SPINS}.`);
  if (input.spin_price_cents !== null && !inRange(input.spin_price_cents, SPIN_MIN_PRICE_CENTS, SPIN_MAX_PRICE_CENTS)) {
    errors.push('Enter a spin price between $0.50 and $1,000, or leave it blank to turn paid spins off.');
  }
  if (!inRange(input.max_spins_per_order, 1, SPIN_MAX_SPINS_PER_ORDER)) errors.push(`Spins per order must be 1 to ${SPIN_MAX_SPINS_PER_ORDER}.`);
  const perDay = input.max_spins_per_day ?? null;
  if (perDay !== null && !inRange(perDay, 1, SPIN_MAX_SPINS_PER_DAY)) {
    errors.push(`Spins per person per day must be 1 to ${SPIN_MAX_SPINS_PER_DAY}, or blank for no limit.`);
  }
  if (input.public_visibility_mode === 'scheduled' && !validDate(input.public_opens_at)) errors.push('Choose when the public page opens.');
  if (input.segments.length < SPIN_MIN_SEGMENTS || input.segments.length > SPIN_MAX_SEGMENTS) {
    errors.push(`The wheel needs ${SPIN_MIN_SEGMENTS} to ${SPIN_MAX_SEGMENTS} segments.`);
  }
  input.segments.forEach((segment, index) => {
    const label = `Segment ${index + 1}`;
    if (segment.label.length < 1 || segment.label.length > SPIN_LABEL_MAX) errors.push(`${label}: enter a label of up to ${SPIN_LABEL_MAX} characters.`);
    if ((segment.prize_name || '').length > 120) errors.push(`${label}: keep the prize name under 120 characters.`);
    if ((segment.prize_description || '').length > 500) errors.push(`${label}: keep the prize description under 500 characters.`);
    if (segment.is_prize && !segment.prize_name) errors.push(`${label}: a prize segment needs a prize name.`);
    if (!inRange(segment.weight, 0, SPIN_MAX_WEIGHT)) errors.push(`${label}: odds weight must be a whole number from 0 to ${SPIN_MAX_WEIGHT.toLocaleString('en-AU')}.`);
    if (segment.stock !== null && !inRange(segment.stock, 0, SPIN_MAX_STOCK)) errors.push(`${label}: stock must be a whole number, or blank for unlimited.`);
    if (!isSpinColour(segment.colour)) errors.push(`${label}: choose a colour.`);
  });
  if (input.segments.length >= SPIN_MIN_SEGMENTS && !input.segments.some(segment => segment.weight > 0)) {
    errors.push('At least one segment needs an odds weight above 0.');
  }
  return errors;
}

/** Warnings that do not block saving. */
export function spinWheelWarnings(input: Pick<SpinWheelInput, 'segments' | 'status' | 'free_spins_per_account' | 'spin_price_cents'>): string[] {
  const warnings: string[] = [];
  const pickable = input.segments.filter(segment => segment.weight > 0 && (segment.stock === null || segment.stock > 0));
  if (input.segments.length && !pickable.length) warnings.push('Every segment is out of stock or has a 0 weight, so nobody can spin.');
  const prizes = input.segments.filter(segment => segment.is_prize);
  if (prizes.length && prizes.every(segment => segment.stock === 0 || segment.weight === 0)) warnings.push('All prize segments are out of stock or have a 0 weight.');
  if (input.status === 'live' && input.free_spins_per_account === 0 && input.spin_price_cents === null) {
    warnings.push('The wheel is live but has no free spins and no spin price, so only committee-granted spins can be used.');
  }
  return warnings;
}

/** Probability of each segment (weight / total pickable weight). Out of stock = 0. */
export function segmentProbabilities(segments: ReadonlyArray<Pick<SpinSegmentInput, 'weight' | 'stock'>>): number[] {
  const weights = segments.map(segment => (segment.weight > 0 && (segment.stock === null || segment.stock > 0) ? segment.weight : 0));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map(weight => (total > 0 ? weight / total : 0));
}

export function formatPercent(probability: number): string {
  if (probability <= 0) return '0%';
  if (probability < 0.001) return '<0.1%';
  return `${(probability * 100).toFixed(probability < 0.1 ? 1 : 0)}%`;
}

export function isSpinWheelLive(wheel: Pick<SpinWheelRow, 'status' | 'starts_at' | 'ends_at'>, now: Date = new Date()): boolean {
  if (wheel.status !== 'live') return false;
  const at = now.getTime();
  if (wheel.starts_at && at < new Date(wheel.starts_at).getTime()) return false;
  if (wheel.ends_at && at >= new Date(wheel.ends_at).getTime()) return false;
  return true;
}

/** Whether spins may be bought now: live, priced, and not closing within the checkout window. */
export function isSpinCheckoutOpen(wheel: Pick<SpinWheelRow, 'status' | 'starts_at' | 'ends_at' | 'spin_price_cents' | 'public_visibility_mode' | 'public_opens_at'>, now: Date = new Date()): boolean {
  if (!wheel.spin_price_cents || !isSpinWheelOpen(wheel, now)) return false;
  return !wheel.ends_at || new Date(wheel.ends_at).getTime() - now.getTime() > SPIN_CHECKOUT_CLOSE_MINUTES * 60_000;
}

type OpenFields = Pick<SpinWheelRow, 'status' | 'starts_at' | 'ends_at' | 'public_visibility_mode' | 'public_opens_at'>;

/** Open to the public: live now and its public page is showing. */
export function isSpinWheelOpen(wheel: OpenFields, now: Date = new Date()): boolean {
  return isSpinWheelLive(wheel, now) && isSpinWheelPubliclyVisible(wheel, now);
}

/**
 * Whether saving `next` over `current` stops people using spins: a wheel that
 * is open now stops being open (status, a later start, an earlier close, or
 * hiding or rescheduling its public page), or its close time moves inside the
 * checkout window.
 */
export function closesSpinWheel(current: OpenFields, next: Pick<SpinWheelInput, 'status' | 'starts_at' | 'ends_at' | 'public_visibility_mode' | 'public_opens_at'>, now: Date = new Date()): boolean {
  if (!isSpinWheelOpen(current, now)) return false;
  if (!isSpinWheelOpen(next, now)) return true;
  if (!next.ends_at) return false;
  const nextEnds = new Date(next.ends_at).getTime();
  const currentEnds = current.ends_at ? new Date(current.ends_at).getTime() : Number.POSITIVE_INFINITY;
  return nextEnds < currentEnds && nextEnds - now.getTime() <= SPIN_CHECKOUT_CLOSE_MINUTES * 60_000;
}

export type SpinWheelPhase = 'upcoming' | 'live' | 'paused' | 'ended';

export function spinWheelPhase(wheel: Pick<SpinWheelRow, 'status' | 'starts_at' | 'ends_at'>, now: Date = new Date()): SpinWheelPhase {
  if (wheel.status === 'ended' || (wheel.ends_at && now.getTime() >= new Date(wheel.ends_at).getTime())) return 'ended';
  if (wheel.status === 'paused' || wheel.status === 'draft') return 'paused';
  if (wheel.starts_at && now.getTime() < new Date(wheel.starts_at).getTime()) return 'upcoming';
  return 'live';
}

/** Public page visibility: never drafts or ended wheels. */
export function isSpinWheelPubliclyVisible(wheel: Pick<SpinWheelRow, 'status' | 'ends_at' | 'public_visibility_mode' | 'public_opens_at'>, now: Date = new Date()): boolean {
  if (wheel.status === 'draft' || wheel.status === 'ended') return false;
  if (wheel.ends_at && now.getTime() >= new Date(wheel.ends_at).getTime()) return false;
  if (wheel.public_visibility_mode === 'visible') return true;
  if (wheel.public_visibility_mode === 'scheduled' && wheel.public_opens_at) {
    const opens = new Date(wheel.public_opens_at).getTime();
    return !Number.isNaN(opens) && now.getTime() >= opens;
  }
  return false;
}

/** Choose the public wheel: live wheels first, then the most recently started. */
export function choosePublicSpinWheel<T extends SpinWheelRow>(rows: readonly T[], now: Date = new Date()): T | null {
  const visible = rows.filter(row => isSpinWheelPubliclyVisible(row, now));
  const rank = (row: T) => (isSpinWheelLive(row, now) ? 0 : 1);
  const started = (row: T) => new Date(row.starts_at || row.created_at || 0).getTime();
  return [...visible].sort((a, b) => rank(a) - rank(b) || started(b) - started(a))[0] || null;
}

export function publicSegments(segments: readonly SpinSegmentRow[]): PublicSpinSegment[] {
  return [...segments].sort((a, b) => a.position - b.position).map(segment => ({
    position: segment.position,
    label: segment.label,
    prize_name: segment.prize_name,
    prize_description: segment.prize_description,
    is_prize: segment.is_prize,
    once_per_spinner: segment.is_prize && segment.once_per_spinner === true,
    colour: segment.colour,
    available: segment.weight > 0 && (segment.stock === null || segment.stock > 0),
  }));
}

export function validSpinQuantity(value: unknown, max: number): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= Math.min(max, SPIN_MAX_SPINS_PER_ORDER);
}

const RESULT_REFERENCE_PATTERN = /^SPIN-[0-9A-HJKMNP-TV-Z]{6}$/;
export const SPIN_REFERENCE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function isSpinResultReference(value: unknown): value is string {
  return typeof value === 'string' && RESULT_REFERENCE_PATTERN.test(value);
}

/** Map a database exception to a message safe to show the person spinning. */
export function spinErrorMessage(message: string | undefined): { message: string; status: number; retrySegment: boolean } {
  const textValue = String(message || '');
  if (textValue.includes('spin_wheel:daily_limit')) return { message: 'You have used today\'s spins. Your remaining spins can be used from midnight (Melbourne time).', status: 409, retrySegment: false };
  if (textValue.includes('spin_wheel:no_spins_left')) return { message: 'You have no spins left on this wheel.', status: 409, retrySegment: false };
  if (textValue.includes('spin_wheel:not_live')) return { message: 'This wheel is not open for spins right now.', status: 409, retrySegment: false };
  if (textValue.includes('spin_wheel:segment_out_of_stock') || textValue.includes('spin_wheel:segment_unavailable')) {
    return { message: 'That prize has just run out. Please spin again.', status: 409, retrySegment: true };
  }
  return { message: 'The spin could not be recorded. Nothing was used. Please try again.', status: 503, retrySegment: false };
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

/** Label font size for the SVG wheel (viewBox 1000). */
export function spinLabelFontSize(segmentCount: number, longestLabel: number): number {
  const base = segmentCount > 32 ? 18 : segmentCount > 20 ? 24 : segmentCount > 12 ? 30 : 36;
  return longestLabel > 16 ? Math.round(base * 0.75) : longestLabel > 10 ? Math.round(base * 0.88) : base;
}
