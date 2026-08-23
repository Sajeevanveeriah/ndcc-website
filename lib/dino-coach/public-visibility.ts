import { createServerClient, isServerSupabaseConfigured } from '@/lib/supabase-server';

export async function isDinoCoachPublic(): Promise<boolean> {
  if (!isServerSupabaseConfigured()) return false;

  try {
    const supabase = createServerClient({ fetchTimeoutMs: 5_000 });
    const { data: season } = await supabase
      .from('fantasy_seasons')
      .select('id')
      .eq('is_current', true)
      .limit(1)
      .maybeSingle();
    if (!season?.id) return false;

    const { data: settings } = await supabase
      .from('fantasy_dino_settings')
      .select('public_launch_enabled')
      .eq('season_id', season.id)
      .maybeSingle();

    return settings?.public_launch_enabled === true;
  } catch {
    return false;
  }
}
