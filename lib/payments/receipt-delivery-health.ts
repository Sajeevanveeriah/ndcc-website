import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Read-only health summary of the payment receipt outbox
 * (public.receipt_delivery_jobs, migration 20260830130840) for the admin
 * Website operations page. Type-only imports: tested directly with
 * --experimental-strip-types (scripts/test-receipt-delivery-health.mjs).
 *
 * The automatic retry cron (/api/cron/payment-receipts) runs once daily at
 * 05:10 UTC because the Vercel Hobby plan limits cron frequency, so a due or
 * retrying receipt can wait up to a day. This summary makes that visible.
 * Every count is independent: one unreadable figure shows as null
 * ("unavailable") and never hides the others.
 */

export const RECEIPT_CRON_SCHEDULE_UTC = '05:10 UTC daily';

export type ReceiptDeliveryHealth = {
  /** queued or retry jobs whose next attempt time has passed. */
  due: number | null;
  /** jobs waiting for a scheduled retry (status retry, due or not). */
  retrying: number | null;
  /** jobs that exhausted their attempts and will not be retried automatically. */
  deadLetter: number | null;
  /** processing jobs whose lease has expired (a run stopped mid-send). */
  staleLeases: number | null;
  /** earliest next_attempt_at among due jobs, ISO string. */
  oldestDueAt: string | null;
  /** most recent dead-letter update, ISO string. */
  latestDeadLetterAt: string | null;
  cronSchedule: string;
  /** true when anything needs an administrator's attention. */
  needsAttention: boolean;
};

type CountResult = { count: number | null; error: unknown };
type RowsResult = { data: unknown; error: unknown };

async function count(query: () => PromiseLike<CountResult>): Promise<number | null> {
  try {
    const { count: value, error } = await query();
    return error ? null : value ?? 0;
  } catch {
    return null;
  }
}

async function firstTimestamp(query: () => PromiseLike<RowsResult>, column: string): Promise<string | null> {
  try {
    const { data, error } = await query();
    const first = !error && Array.isArray(data) ? data[0] as Record<string, unknown> | undefined : undefined;
    const value = first?.[column];
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

export function summariseReceiptDeliveryHealth(parts: Omit<ReceiptDeliveryHealth, 'cronSchedule' | 'needsAttention'>): ReceiptDeliveryHealth {
  const needsAttention = [parts.due, parts.deadLetter, parts.staleLeases].some((value) => value === null || value > 0);
  return { ...parts, cronSchedule: RECEIPT_CRON_SCHEDULE_UTC, needsAttention };
}

export async function loadReceiptDeliveryHealth(db: SupabaseClient, now: Date = new Date()): Promise<ReceiptDeliveryHealth> {
  const at = now.toISOString();
  const table = () => db.from('receipt_delivery_jobs');
  const head = { count: 'exact', head: true } as const;
  const [due, retrying, deadLetter, staleLeases, oldestDueAt, latestDeadLetterAt] = await Promise.all([
    count(() => table().select('id', head).in('status', ['queued', 'retry']).lte('next_attempt_at', at)),
    count(() => table().select('id', head).eq('status', 'retry')),
    count(() => table().select('id', head).eq('status', 'dead_letter')),
    count(() => table().select('id', head).eq('status', 'processing').lt('lease_expires_at', at)),
    firstTimestamp(() => table().select('next_attempt_at').in('status', ['queued', 'retry']).lte('next_attempt_at', at).order('next_attempt_at', { ascending: true }).limit(1), 'next_attempt_at'),
    firstTimestamp(() => table().select('updated_at').eq('status', 'dead_letter').order('updated_at', { ascending: false }).limit(1), 'updated_at'),
  ]);
  return summariseReceiptDeliveryHealth({ due, retrying, deadLetter, staleLeases, oldestDueAt, latestDeadLetterAt });
}
