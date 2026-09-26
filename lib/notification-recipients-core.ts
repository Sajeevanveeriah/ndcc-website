// Pure helpers for CMS-managed notification recipients. No server imports so
// deterministic tests can load this file directly.
import {
  fallbackNotificationRecipients,
  isNotificationEventType,
  type NotificationEventType,
} from './notification-recipients-fallback';

export const NOTIFICATION_EMAIL_MAX_LENGTH = 254;
export const NOTIFICATION_NAME_MAX_LENGTH = 120;
// Matches the database check constraint on public.notification_recipients.email.
const RECIPIENT_EMAIL_PATTERN = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

export type NotificationRecipientRow = {
  event_type: string;
  email: string;
  active?: boolean | null;
  sort_order?: number | null;
  created_at?: string | null;
};

/** Either the table was read (even if empty) or it could not be read at all. */
export type NotificationRecipientSnapshot =
  | { readable: true; byType: Partial<Record<NotificationEventType, string[]>> }
  | { readable: false };

export function normaliseRecipientEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (!email || email.length > NOTIFICATION_EMAIL_MAX_LENGTH) return null;
  return RECIPIENT_EMAIL_PATTERN.test(email) ? email : null;
}

export function normaliseRecipientName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/\s+/g, ' ');
  return name ? name.slice(0, NOTIFICATION_NAME_MAX_LENGTH) : null;
}

function sortKey(row: NotificationRecipientRow) {
  return [Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0, String(row.created_at || ''), row.email] as const;
}

/** Active rows grouped by event type, in display order, de-duplicated. */
export function groupActiveRecipients(rows: readonly NotificationRecipientRow[]): Partial<Record<NotificationEventType, string[]>> {
  const sorted = [...rows].filter((row) => row.active !== false).sort((a, b) => {
    const [ao, ac, ae] = sortKey(a);
    const [bo, bc, be] = sortKey(b);
    return ao - bo || ac.localeCompare(bc) || ae.localeCompare(be);
  });
  const byType: Partial<Record<NotificationEventType, string[]>> = {};
  for (const row of sorted) {
    if (!isNotificationEventType(row.event_type)) continue;
    const email = normaliseRecipientEmail(row.email);
    if (!email) continue;
    const list = byType[row.event_type] ?? [];
    if (!list.includes(email)) list.push(email);
    byType[row.event_type] = list;
  }
  return byType;
}

/**
 * Unreadable table: use the hardcoded fallback. Readable table with no active
 * rows for this event: an administrator removed them deliberately, so send to
 * nobody for that event.
 */
export function recipientsForEvent(
  snapshot: NotificationRecipientSnapshot,
  eventType: NotificationEventType,
  fallback: readonly string[] = fallbackNotificationRecipients(eventType),
): string[] {
  if (!snapshot.readable) return [...fallback];
  return [...(snapshot.byType[eventType] ?? [])];
}
