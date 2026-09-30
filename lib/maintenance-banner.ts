// Site-wide maintenance banner (requested by Saj, 30 September 2026).
// Pure rules shared by the public banner, the admin API and tests. No
// imports, so tests can load it with --experimental-strip-types.
//
// While switched on in the CMS the banner shows on every page as advance
// notice, reads "Maintenance in progress" from the start time, and hides
// itself at the end time. Times are shown in the club's time zone.

export const MAINTENANCE_TIMEZONE = 'Australia/Melbourne';
export const MAINTENANCE_MESSAGE_MAX = 300;

/** What the public site needs; only present while switched on and not yet over. */
export type MaintenanceBanner = {
  startsAt: string;
  endsAt: string | null;
  message: string | null;
  /** When the server read the setting (ms), so the first client render matches the server HTML. */
  checkedAt: number;
};

export type MaintenancePhase = 'upcoming' | 'active' | 'ended';

export type MaintenanceSettingsRow = {
  maintenance_banner_enabled?: unknown;
  maintenance_starts_at?: unknown;
  maintenance_ends_at?: unknown;
  maintenance_message?: unknown;
};

export type MaintenanceSettings = {
  enabled: boolean;
  starts_at: string | null;
  ends_at: string | null;
  message: string | null;
};

function instant(value: unknown): number | null {
  if (typeof value !== 'string' || !value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function maintenancePhase(banner: Pick<MaintenanceBanner, 'startsAt' | 'endsAt'>, now: number): MaintenancePhase {
  const end = instant(banner.endsAt);
  if (end !== null && now >= end) return 'ended';
  const start = instant(banner.startsAt);
  return start !== null && now < start ? 'upcoming' : 'active';
}

/** The next moment the banner changes (start or end), or null when nothing is scheduled. */
export function nextMaintenanceChange(banner: Pick<MaintenanceBanner, 'startsAt' | 'endsAt'>, now: number): number | null {
  const phase = maintenancePhase(banner, now);
  if (phase === 'upcoming') return instant(banner.startsAt);
  if (phase === 'active') return instant(banner.endsAt);
  return null;
}

/** The public banner from the stored setting, or null when off, incomplete or already over. */
export function publicMaintenanceBanner(row: MaintenanceSettingsRow | null | undefined, now: number): MaintenanceBanner | null {
  if (!row || row.maintenance_banner_enabled !== true) return null;
  const start = instant(row.maintenance_starts_at);
  if (start === null) return null;
  const end = row.maintenance_ends_at == null ? null : instant(row.maintenance_ends_at);
  if (row.maintenance_ends_at != null && end === null) return null;
  const banner: MaintenanceBanner = {
    startsAt: new Date(start).toISOString(),
    endsAt: end === null ? null : new Date(end).toISOString(),
    message: cleanMessage(row.maintenance_message),
    checkedAt: now,
  };
  return maintenancePhase(banner, now) === 'ended' ? null : banner;
}

export function cleanMessage(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  // Single line of plain text: control characters and runs of whitespace collapse to one space.
  const text = Array.from(value, (char) => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127 ? ' ' : char;
  }).join('').replace(/\s+/g, ' ').trim();
  return text ? text : null;
}

type WhenParts = { date: string; time: string; zone: string; dayKey: string };

function whenParts(value: string): WhenParts {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: MAINTENANCE_TIMEZONE,
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short',
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';
  return {
    date: `${part('weekday')} ${part('day')} ${part('month')}`,
    time: `${part('hour')}:${part('minute')} ${part('dayPeriod').toLowerCase()}`,
    zone: part('timeZoneName'),
    dayKey: `${part('year')}-${part('month')}-${part('day')}`,
  };
}

/** "Saturday 3 October, 8:00 pm to 10:00 pm AEST", across days, or open-ended. */
export function formatMaintenanceWindow(banner: Pick<MaintenanceBanner, 'startsAt' | 'endsAt'>): string {
  const start = whenParts(banner.startsAt);
  if (!banner.endsAt) return `from ${start.date}, ${start.time} ${start.zone} until further notice`;
  const end = whenParts(banner.endsAt);
  if (start.dayKey === end.dayKey) {
    const startZone = start.zone === end.zone ? '' : ` ${start.zone}`;
    return `${start.date}, ${start.time}${startZone} to ${end.time} ${end.zone}`;
  }
  return `${start.date}, ${start.time} ${start.zone} to ${end.date}, ${end.time} ${end.zone}`;
}

export function maintenanceBannerText(banner: Pick<MaintenanceBanner, 'startsAt' | 'endsAt' | 'message'>, phase: MaintenancePhase): { heading: string; detail: string } | null {
  if (phase === 'ended') return null;
  const window = formatMaintenanceWindow(banner);
  const heading = phase === 'upcoming' ? 'Scheduled maintenance' : 'Maintenance in progress';
  const when = banner.endsAt ? `: ${window}.` : ` ${window}.`;
  const lead = phase === 'upcoming'
    ? `The website may be unavailable${when}`
    : `Some parts of the website may not work${when}`;
  return { heading, detail: banner.message ? `${lead} ${banner.message}` : lead };
}

export type MaintenanceInputResult = { ok: true; value: MaintenanceSettings } | { ok: false; error: string };

function optionalInstant(value: unknown): { ok: true; value: string | null } | { ok: false } {
  if (value === null || value === undefined || value === '') return { ok: true, value: null };
  const parsed = instant(value);
  return parsed === null ? { ok: false } : { ok: true, value: new Date(parsed).toISOString() };
}

/** Validate an admin save. Times arrive as ISO instants (the editor converts Melbourne wall time). */
export function validateMaintenanceInput(raw: Record<string, unknown>, now: number): MaintenanceInputResult {
  if (typeof raw.enabled !== 'boolean') return { ok: false, error: 'Choose whether the banner is shown.' };
  const start = optionalInstant(raw.starts_at);
  const end = optionalInstant(raw.ends_at);
  if (!start.ok || !end.ok) return { ok: false, error: 'Enter valid start and end times.' };
  if (raw.message !== undefined && raw.message !== null && typeof raw.message !== 'string') return { ok: false, error: 'The message must be text.' };
  const message = cleanMessage(raw.message);
  if (message && message.length > MAINTENANCE_MESSAGE_MAX) return { ok: false, error: `Keep the message to ${MAINTENANCE_MESSAGE_MAX} characters or fewer.` };
  if (start.value && end.value && Date.parse(end.value) <= Date.parse(start.value)) return { ok: false, error: 'The end time must be after the start time.' };
  if (raw.enabled) {
    if (!start.value) return { ok: false, error: 'Enter the maintenance start time before showing the banner.' };
    if (end.value && Date.parse(end.value) <= now) return { ok: false, error: 'The end time has already passed. Choose a later end time or switch the banner off.' };
  }
  return { ok: true, value: { enabled: raw.enabled, starts_at: start.value, ends_at: end.value, message } };
}
