import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guard';
import { FULL_ACCESS_ROLES } from '@/lib/auth/config';
import { createServerClient } from '@/lib/supabase-server';
import { processPaymentReceiptJobs } from '@/lib/payments/receipt-delivery';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  if (!await requirePermission('dashboard', FULL_ACCESS_ROLES)) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  const { data, error } = await createServerClient().rpc('ndcc_operational_health');
  if (error) return NextResponse.json({ error: 'Operational checks are temporarily unavailable.' }, { status: 503 });
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST() {
  if (!await requirePermission('payments', FULL_ACCESS_ROLES)) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  try {
    // Existing leasing/idempotency prevents sending a second receipt for a job.
    const result = await processPaymentReceiptJobs({ supabase: createServerClient({ fetchTimeoutMs: 10_000 }), limit: 5, leaseSeconds: 300 });
    return NextResponse.json({ success: true, ...result });
  } catch { return NextResponse.json({ error: 'Receipt processing could not finish. Retry later.' }, { status: 503 }); }
}
