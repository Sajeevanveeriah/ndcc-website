import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guard';
import { FULL_ACCESS_ROLES } from '@/lib/auth/config';
import { createServerClient } from '@/lib/supabase-server';
import { processPaymentReceiptJobs } from '@/lib/payments/receipt-delivery';
import { loadReceiptDeliveryHealth } from '@/lib/payments/receipt-delivery-health';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  if (!await requirePermission('dashboard', FULL_ACCESS_ROLES)) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  const supabase = createServerClient();
  // Read-only: the existing health RPC plus due/retry/dead-letter detail from
  // the receipt outbox (each figure fails independently to null).
  const [{ data, error }, receiptDelivery] = await Promise.all([
    supabase.rpc('ndcc_operational_health'),
    loadReceiptDeliveryHealth(supabase),
  ]);
  if (error || !data || typeof data !== 'object') return NextResponse.json({ error: 'Operational checks are temporarily unavailable.' }, { status: 503 });
  return NextResponse.json({ ...data, receiptDelivery }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST() {
  if (!await requirePermission('payments', FULL_ACCESS_ROLES)) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  try {
    // Existing leasing/idempotency prevents sending a second receipt for a job.
    const result = await processPaymentReceiptJobs({ supabase: createServerClient({ fetchTimeoutMs: 10_000 }), limit: 5, leaseSeconds: 300 });
    return NextResponse.json({ success: true, ...result });
  } catch { return NextResponse.json({ error: 'Receipt processing could not finish. Retry later.' }, { status: 503 }); }
}
