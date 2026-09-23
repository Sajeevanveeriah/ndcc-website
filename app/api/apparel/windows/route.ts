import { NextResponse } from 'next/server';
import { createServerClient, isServerSupabaseConfigured } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

// Only the fields the public merchandise page uses (MerchandiseWindow in
// app/merchandise/MerchandiseClient.tsx); never expose admin-only columns.
const PUBLIC_WINDOW_COLUMNS = 'id,label,open_date,close_date,allow_queue_after_close';

export async function GET() {
  if (!isServerSupabaseConfigured()) return NextResponse.json({ success: true, data: { current_window: null, next_window: null, processing_open: false, queue_allowed: false } });
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('merch_order_windows')
    .select(PUBLIC_WINDOW_COLUMNS)
    .eq('active', true)
    .order('open_date', { ascending: true });

  if (error) {
    console.error('Merchandise order window lookup failed', { code: error.code, message: error.message });
    return NextResponse.json({ success: false, error: 'Merchandise order windows are temporarily unavailable.' }, { status: 500 });
  }

  const now = new Date();
  const current = (data ?? []).find((w) => new Date(w.open_date) <= now && new Date(w.close_date) >= now) ?? null;
  const next = (data ?? []).find((w) => new Date(w.open_date) > now) ?? null;

  return NextResponse.json({
    success: true,
    data: {
      current_window: current,
      next_window: next,
      processing_open: Boolean(current),
      queue_allowed: current ? Boolean(current.allow_queue_after_close) : Boolean(next?.allow_queue_after_close ?? false),
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
