import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/auth/guard';
import { toCsv } from '@/lib/csv';
import {
  buildPaymentLedgerExportRows,
  paymentLedgerFilename,
  type PaymentLedgerExportRow,
} from '@/lib/payments/ledger-export';

export const dynamic = 'force-dynamic';

const EXPORT_BATCH_SIZE = 1000;

export async function POST() {
  const user = await requirePermission('payments', ['admin']);
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const supabase = createServerClient();
  const payments: PaymentLedgerExportRow[] = [];
  // Keep offset pagination stable if a new payment arrives during the export.
  const exportCutoff = new Date().toISOString();

  for (let offset = 0; ; offset += EXPORT_BATCH_SIZE) {
    const { data, error } = await supabase
      .from('order_payments')
      .select(`
        id,
        order_id,
        payment_reference,
        amount,
        currency,
        method,
        provider,
        provider_reference,
        provider_event_id,
        status,
        received_at,
        recorded_by,
        notes,
        reverses_payment_id,
        source_transaction_id,
        client_operation_id,
        created_at,
        order:orders!order_payments_order_id_fkey(
          id,
          payment_reference,
          order_category,
          customer_name,
          customer_email,
          customer_phone,
          total_amount,
          amount_paid,
          balance_due,
          payment_status,
          created_at
        )
      `)
      .lte('created_at', exportCutoff)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + EXPORT_BATCH_SIZE - 1);

    if (error) {
      console.error('Payment ledger export query failed:', error.message);
      return NextResponse.json(
        { success: false, error: 'Unable to export the payment ledger.' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const batch = (data || []) as unknown as PaymentLedgerExportRow[];
    payments.push(...batch);
    if (batch.length < EXPORT_BATCH_SIZE) break;
  }

  const csv = toCsv(buildPaymentLedgerExportRows(payments));
  const filename = paymentLedgerFilename();

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
