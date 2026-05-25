import { NextResponse } from 'next/server';
import { createServerClient, isServerSupabaseConfigured } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isServerSupabaseConfigured()) return NextResponse.json({ success: true, data: { current_window: null, next_window: null, processing_open: false, queue_allowed: false } });
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('merch_order_windows')
    .select('*')
    .eq('active', true)
    .order('open_date', { ascending: true });

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

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
