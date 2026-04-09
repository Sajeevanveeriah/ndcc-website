const CLUB_TIMEZONE = 'Australia/Melbourne';

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-AU', {
    timeZone: CLUB_TIMEZONE,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-AU', {
    timeZone: CLUB_TIMEZONE,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function parseDateParts(parts: Intl.DateTimeFormatPart[]) {
  const lookup = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '0';
  return {
    year: Number(lookup('year')),
    month: Number(lookup('month')),
    day: Number(lookup('day')),
    hour: Number(lookup('hour')),
    minute: Number(lookup('minute')),
    second: Number(lookup('second')),
  };
}

function getTimeZoneOffsetMs(utcMs: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(utcMs));

  const { year, month, day, hour, minute, second } = parseDateParts(parts);
  const asUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  return asUtcMs - utcMs;
}

function melbourneWallClockToUtcMs(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;

  const [, year, month, day, hour, minute] = match;
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  const h = Number(hour);
  const min = Number(minute);

  let utcMs = Date.UTC(y, m - 1, d, h, min, 0);
  let offset = getTimeZoneOffsetMs(utcMs, CLUB_TIMEZONE);
  utcMs -= offset;
  offset = getTimeZoneOffsetMs(utcMs, CLUB_TIMEZONE);
  utcMs = Date.UTC(y, m - 1, d, h, min, 0) - offset;

  return utcMs;
}

export function datetimeLocalToClubIso(value: string): string {
  const utcMs = melbourneWallClockToUtcMs(value);
  if (utcMs === null) return value;
  return new Date(utcMs).toISOString();
}

export function toDatetimeLocalInClubTimezone(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLUB_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const { year, month, day, hour, minute } = parseDateParts(parts);
  const y = String(year).padStart(4, '0');
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  const h = String(hour).padStart(2, '0');
  const min = String(minute).padStart(2, '0');

  return `${y}-${m}-${d}T${h}:${min}`;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(amount);
}

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + '...';
}

export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function obfuscateEmail(email: string): string {
  const [user, domain] = email.split('@');
  return `${user}[at]${domain}`;
}

export function assembleEmail(user: string, domain: string): string {
  return `${user}@${domain}`;
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function validateEmail(email: string): boolean {
  const value = email.trim();
  if (value.length > 254) return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  return re.test(value);
}

export function validatePhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return false;
  return /^[0-9+()\-\s]+$/.test(phone.trim());
}

export function normalisePublicText(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .replace(/\\n/g, '\n')
    .replace(/[–—]/g, ' - ')
    .replace(/Peter ‘’Skinny’’ Harrison/g, "Peter 'Skinny' Harrison")
    .replace(/Newcomb Power Football Club/g, 'Newcomb Power Football & Netball Club')
    .trim();
}

export function sanitiseInput(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
