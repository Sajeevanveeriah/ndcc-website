import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!await requirePermission('fantasy.home')) {
    return NextResponse.json({ success: false, error: 'Admin sign in is required.' }, { status: 403 });
  }
  let enabled = false;
  try {
    const { data, error } = await createServerClient()
      .from('club_settings')
      .select('fantasy_melbourne_deadlines_enabled')
      .eq('id', 'default')
      .maybeSingle();
    enabled = !error && data?.fantasy_melbourne_deadlines_enabled === true;
  } catch {
    // A missing or unavailable switch keeps the existing editor behaviour.
  }
  return NextResponse.json({ success: true, enabled }, { headers: { 'Cache-Control': 'no-store' } });
}
