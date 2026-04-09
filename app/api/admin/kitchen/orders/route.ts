import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';

export async function GET() {
  const user = await requireSession(['admin', 'president', 'secretary', 'committee']);
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('kitchen_orders')
    .select('*, kitchen_order_items(quantity, price, kitchen_items(name))')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data: data ?? [] });
}

export async function PATCH(request: Request) {
  const user = await requireSession(['admin']);
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const { id, status, payment_status, processed } = await request.json();
  if (!id) return NextResponse.json({ success: false, error: 'id is required.' }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if (typeof status === 'string' && status) patch.status = status;
  if (typeof payment_status === 'string' && payment_status) patch.payment_status = payment_status;
  if (typeof processed === 'boolean') patch.processed = processed;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ success: false, error: 'No valid fields provided.' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { error } = await supabase.from('kitchen_orders').update(patch).eq('id', id);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
