import { cache } from 'react';
import { createServerClient, isServerSupabaseConfigured } from '@/lib/supabase-server';

async function isDinoCoachPublicUncached(): Promise<boolean> {
  if (!isServerSupabaseConfigured()) return false;

  try {
    const supabase = createServerClient({ fetchTimeoutMs: 5_000, publicReadCache: true });
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

// Request-scoped deduplication for navigation, footer and page sections.
export const isDinoCoachPublic = cache(isDinoCoachPublicUncached);
