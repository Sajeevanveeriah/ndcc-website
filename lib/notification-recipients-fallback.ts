// Hardcoded notification recipients, kept ONLY as the fallback used when the
// CMS-managed public.notification_recipients table cannot be read (migration
// not yet applied, Supabase unavailable). The migration
// 20260927060000_notification_recipients.sql seeds exactly these values so
// behaviour is identical after deploy. Keep the two in sync.
// No imports: this file is loaded directly by deterministic tests.

export const NOTIFICATION_EVENT_TYPES = [
  'dino_registration_copy',
  'dino_receipt_copy',
  'apparel_order_staff',
  'kitchen_order_staff',
  'raffle_staff',
  'receipt_copy',
  'contact',
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

export const NOTIFICATION_EVENT_LABELS: Readonly<Record<NotificationEventType, { label: string; description: string }>> = {
  dino_registration_copy: {
    label: 'Dino Coach registration copies',
    description: 'Receive a private copy (BCC) of every Dino Coach registration confirmation email.',
  },
  dino_receipt_copy: {
    label: 'Dino Coach payment receipt copies',
    description: 'Receive a private copy (BCC) of every Dino Coach entry payment receipt.',
  },
  apparel_order_staff: {
    label: 'Merchandise order staff',
    description: 'Receive a copy of merchandise order confirmations and payment receipts.',
  },
  kitchen_order_staff: {
    label: 'Kitchen order staff',
    description: 'Receive a copy of kitchen order confirmations and payment receipts.',
  },
  raffle_staff: {
    label: 'Raffle staff',
    description: 'Receive a copy of every paid raffle ticket receipt.',
  },
  receipt_copy: {
    label: 'All payment receipt copies',
    description: 'Receive a private copy (BCC) of every payment receipt the website sends (orders, raffle and Dino Coach).',
  },
  contact: {
    label: 'Website enquiries',
    description: 'Receive enquiries submitted through the Contact page. The first address is the main recipient.',
  },
};

export const FALLBACK_SECRETARY_EMAIL = 'ndcc.secretary1@gmail.com';

export const FALLBACK_NOTIFICATION_RECIPIENTS: Readonly<Record<NotificationEventType, readonly string[]>> = {
  dino_registration_copy: ['sajeevanveeriah@gmail.com'],
  dino_receipt_copy: ['sajeevanveeriah@gmail.com'],
  apparel_order_staff: [FALLBACK_SECRETARY_EMAIL, 'joshwalker20695@gmail.com'],
  kitchen_order_staff: [FALLBACK_SECRETARY_EMAIL, 'ndcc.treasurer1@gmail.com'],
  raffle_staff: ['ndsc.cricket@gmail.com', 'ndcc.vicepres@gmail.com', FALLBACK_SECRETARY_EMAIL],
  receipt_copy: [FALLBACK_SECRETARY_EMAIL, 'ndsc.cricket@gmail.com'],
  contact: [FALLBACK_SECRETARY_EMAIL],
};

export function isNotificationEventType(value: unknown): value is NotificationEventType {
  return typeof value === 'string' && (NOTIFICATION_EVENT_TYPES as readonly string[]).includes(value);
}

export function fallbackNotificationRecipients(eventType: NotificationEventType): string[] {
  return [...FALLBACK_NOTIFICATION_RECIPIENTS[eventType]];
}
