import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Kept as an explicit compatibility response so callers cannot bypass the
// canonical order-first flow. Orders must be created through /api/orders and
// paid through /api/payments/checkout-session, where the amount is checked
// against the server-side order balance and a pending ledger row is created.
export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error: 'This checkout endpoint has been replaced by the order-first payment flow.',
    },
    { status: 410, headers: { 'Cache-Control': 'no-store' } }
  );
}
