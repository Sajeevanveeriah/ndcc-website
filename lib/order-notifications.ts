import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type StaffOrderNotificationResult =
  | { status: 'sent'; id?: string }
  | { status: 'simulated'; reason: string }
  | { status: 'already_sent'; reason: string }
  | { status: 'not_applicable'; reason: string }
  | { status: 'failed'; reason: string };

type PaymentMarker = {
  id: string;
  metadata?: Record<string, unknown> | null;
};

export async function sendPaidStaffOrderNotificationForPayment(
  supabase: SupabaseClient,
  payment: PaymentMarker,
  orderId: string,
): Promise<StaffOrderNotificationResult> {
  // Kept as a compatibility entry point for existing settlement callers.
  // The receipt outbox owns the single customer + club message for every payment.
  void supabase; void payment; void orderId;
  return { status: 'not_applicable', reason: 'Staff recipients are included in the queued payment receipt.' };
}
