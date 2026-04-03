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

  const { id, status } = await request.json();
  if (!id || !status) return NextResponse.json({ success: false, error: 'id and status are required.' }, { status: 400 });

  const supabase = createServerClient();
  const { error } = await supabase.from('kitchen_orders').update({ status }).eq('id', id);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
