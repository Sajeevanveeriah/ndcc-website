import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/auth/guard';
import { buildApparelWorkbook, type ApparelWorkbookOrder } from '@/lib/orders/apparel-workbook';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requirePermission('merchandise', ['committee']);
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const supabase = createServerClient();
  const batchId = randomUUID();
  const exportedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from('orders')
    .update({ apparel_export_batch_id: batchId, apparel_exported_at: exportedAt })
    .eq('order_category', 'merch')
    .is('apparel_export_batch_id', null)
    .select('id,customer_name,items,created_at,payment_status,payment_reference,processed')
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  try {
    const workbook = buildApparelWorkbook((data || []) as unknown as ApparelWorkbookOrder[]);
    const filenameDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    const responseBody = new Uint8Array(workbook.length);
    responseBody.set(workbook);
    return new NextResponse(responseBody, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="ndcc-apparel-orders-${filenameDate}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (workbookError) {
    await supabase
      .from('orders')
      .update({ apparel_export_batch_id: null, apparel_exported_at: null })
      .eq('apparel_export_batch_id', batchId);
    const message = workbookError instanceof Error ? workbookError.message : 'Unable to build the apparel workbook.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
