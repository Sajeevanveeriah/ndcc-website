import 'server-only';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { createServerClient, isServerSupabaseConfigured } from '@/lib/supabase-server';
import { receiptRecipients } from '@/lib/payments/receipt-recipients';
import { getContactEmailRecipients } from '@/lib/email';
import {
  groupActiveRecipients,
  recipientsForEvent,
  type NotificationRecipientRow,
  type NotificationRecipientSnapshot,
} from '@/lib/notification-recipients-core';
import {
  fallbackNotificationRecipients,
  type NotificationEventType,
} from '@/lib/notification-recipients-fallback';

export const NOTIFICATION_RECIPIENTS_TAG = 'notification-recipients';
const NOTIFICATION_RECIPIENTS_READ_TIMEOUT_MS = 5_000;

async function loadActiveRows(): Promise<NotificationRecipientRow[]> {
  const supabase = createServerClient({ fetchTimeoutMs: NOTIFICATION_RECIPIENTS_READ_TIMEOUT_MS });
  const { data, error } = await supabase
    .from('notification_recipients')
    .select('event_type,email,active,sort_order,created_at')
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  // Throwing keeps a failed read out of the Data Cache.
  if (error) throw new Error(error.message);
  return (data ?? []) as NotificationRecipientRow[];
}

// Cached for at most 60 seconds; /api/admin/notifications revalidates the tag
// on every change so edits apply to the next email.
const loadCachedRows = unstable_cache(loadActiveRows, ['notification-recipients-v1'], {
  revalidate: 60,
  tags: [NOTIFICATION_RECIPIENTS_TAG],
});

async function loadSnapshotUncached(): Promise<NotificationRecipientSnapshot> {
  if (!isServerSupabaseConfigured()) return { readable: false };
  try {
    return { readable: true, byType: groupActiveRecipients(await loadCachedRows()) };
  } catch {
    // unstable_cache is unavailable outside a Next.js request context; read
    // directly once before falling back to the hardcoded recipients.
    try {
      return { readable: true, byType: groupActiveRecipients(await loadActiveRows()) };
    } catch {
      console.warn('[notification-recipients] table unreadable; using fallback recipients.');
      return { readable: false };
    }
  }
}

const loadSnapshot = cache(loadSnapshotUncached);

/**
 * Active CMS recipients for an event. Falls back to the hardcoded list only
 * when the table cannot be read (migration not applied, Supabase down). An
 * event whose recipients were all removed in the CMS returns an empty list.
 */
export async function getNotificationRecipients(
  eventType: NotificationEventType,
  fallback: readonly string[] = fallbackNotificationRecipients(eventType),
): Promise<string[]> {
  try {
    return recipientsForEvent(await loadSnapshot(), eventType, fallback);
  } catch {
    return [...fallback];
  }
}

export function staffOrderEventType(category: 'apparel' | 'kitchen'): NotificationEventType {
  return category === 'apparel' ? 'apparel_order_staff' : 'kitchen_order_staff';
}

export async function getStaffOrderNotificationRecipients(category: 'apparel' | 'kitchen'): Promise<string[]> {
  return getNotificationRecipients(staffOrderEventType(category));
}

/**
 * Customer receipt addressing: the purchaser in To, and the club receipt copy
 * list plus any department list in BCC (see receiptRecipients).
 */
export async function getReceiptRecipients(purchaser: string, department: readonly string[] = []) {
  return receiptRecipients(purchaser, department, await getNotificationRecipients('receipt_copy'));
}

/**
 * Contact enquiry addressing. The CONTACT_TO_EMAIL server setting, when
 * present, keeps priority exactly as before. Otherwise the first active CMS
 * contact recipient is the main recipient and the rest are copied. Enquiries
 * are never left without a recipient: an empty list uses the default.
 */
export async function getContactNotificationRecipients() {
  const base = getContactEmailRecipients();
  if (base.contactToPresent) return base;
  const [primary, ...copies] = await getNotificationRecipients('contact');
  if (!primary) return base;
  return {
    ...base,
    effectiveContactRecipient: primary,
    cc: [...new Set([...copies, ...base.cc.map((email) => email.trim().toLowerCase())])].filter((email) => email !== primary),
  };
}
