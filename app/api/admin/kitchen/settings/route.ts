import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { readKitchenOrderingSettings } from '@/lib/kitchen-ordering-settings';
import { validKitchenSettings } from '@/lib/kitchen-order-window';
export const dynamic = 'force-dynamic';
export async function GET() {
  if (!await requirePermission('kitchen')) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  try { return NextResponse.json({ data: await readKitchenOrderingSettings() }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return NextResponse.json({ error: 'Could not load ordering settings.' }, { status: 503 }); }
}
export async function PATCH(request: Request) {
  if (!await requirePermission('kitchen', ['admin'])) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!validKitchenSettings(body)) return NextResponse.json({ error: 'Choose a valid opening and later closing time between Monday and Thursday.' }, { status: 400 });
  const { enabled, open_day, open_time, close_day, close_time } = body;
  const { data, error } = await createServerClient().from('kitchen_ordering_settings').update({ enabled, open_day, open_time, close_day, close_time, updated_at: new Date().toISOString() }).eq('id', true).select('enabled,open_day,open_time,close_day,close_time').single();
  if (error || !data) return NextResponse.json({ error: 'Could not save ordering settings.' }, { status: 503 });
  return NextResponse.json({ data });
}
