export const MEAL_COLLECTION_TIME_ZONE = 'Australia/Melbourne';

export const MEAL_COLLECTION_WINDOWS = [
  { value: 'juniors', label: 'Juniors - 6:00 pm', time: '18:00' },
  { value: 'seniors', label: 'Seniors - 7:30 pm', time: '19:30' },
] as const;

export type MealCollectionWindow = typeof MEAL_COLLECTION_WINDOWS[number]['value'];

export const MEAL_COLLECTION_REQUIRED_MESSAGE =
  'Please choose a meal collection time before continuing to payment.';

/** Do not coerce, trim or default values supplied by a public request. */
export function isMealCollectionWindow(value: unknown): value is MealCollectionWindow {
  return value === 'juniors' || value === 'seniors';
}

/** A missing historical value must never be assigned a collection window. */
export function mealCollectionLabel(value: unknown): string {
  return MEAL_COLLECTION_WINDOWS.find((window) => window.value === value)?.label
    ?? 'Collection time not recorded';
}

/** Calendar arithmetic on Melbourne dates, independent of server timezone/DST. */
export function mealServiceDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: MEAL_COLLECTION_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const date = new Date(Date.UTC(get('year'), get('month') - 1, get('day')));
  date.setUTCDate(date.getUTCDate() + (4 - date.getUTCDay() + 7) % 7);
  return date.toISOString().slice(0, 10);
}

export function mealServiceLabel(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Service date not recorded';
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return 'Service date not recorded';
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: MEAL_COLLECTION_TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(date);
}

export function mealContractMatches(order: { meal_collection_window?: unknown; meal_service_date?: unknown; meal_revision?: unknown }, metadata: Record<string, unknown>): boolean {
  return isMealCollectionWindow(order.meal_collection_window)
    && metadata.meal_collection_window === order.meal_collection_window
    && metadata.meal_service_date === order.meal_service_date
    && metadata.meal_revision === String(order.meal_revision)
    && metadata.meal_time_zone === MEAL_COLLECTION_TIME_ZONE;
}
