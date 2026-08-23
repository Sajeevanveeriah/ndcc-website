import { NextResponse } from 'next/server';
import { createServerClient, isServerSupabaseConfigured } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isServerSupabaseConfigured()) {
    return NextResponse.json({ enabled: false }, { headers: { 'Cache-Control': 'no-store' } });
  }

  try {
    const supabase = createServerClient();
    const { data: season } = await supabase
      .from('fantasy_seasons')
      .select('id')
      .eq('is_current', true)
      .limit(1)
      .maybeSingle();
    if (!season?.id) return NextResponse.json({ enabled: false }, { headers: { 'Cache-Control': 'no-store' } });

    const { data: settings } = await supabase
      .from('fantasy_dino_settings')
      .select('public_launch_enabled')
      .eq('season_id', season.id)
      .maybeSingle();

    return NextResponse.json(
      { enabled: settings?.public_launch_enabled === true },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json({ enabled: false }, { headers: { 'Cache-Control': 'no-store' } });
  }
}
