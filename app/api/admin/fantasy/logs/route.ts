import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';

async function requireAdmin() {
  const user = await requirePermission('fantasy.seasons');
  return user?.role === 'admin' ? user : null;
}

export async function GET(request: Request) {
  if (!await requireAdmin()) return NextResponse.json({ success: false, error: 'Admin access required.' }, { status: 403 });
  const seasonId = new URL(request.url).searchParams.get('seasonId');
  const { data, error } = await createServerClient().rpc('preview_fantasy_operational_log_clear', { p_season_id: seasonId || null });
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, preview: data });
}

export async function DELETE(request: Request) {
  if (!await requireAdmin()) return NextResponse.json({ success: false, error: 'Admin access required.' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const { data, error } = await createServerClient().rpc('clear_fantasy_operational_logs', {
    p_season_id: typeof body.seasonId === 'string' && body.seasonId ? body.seasonId : null,
    p_confirmation: body.confirmation,
  });
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  return NextResponse.json({ success: true, result: data });
}
