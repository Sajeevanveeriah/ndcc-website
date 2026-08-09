import 'server-only';

import { createServerClient, isServerSupabaseConfigured } from '@/lib/supabase-server';
import { publicRegistrationFromRow, type PublicPlayerRegistration, type StoredRegistrationRow } from '@/lib/player-registration';

export const PLAYER_REGISTRATION_SETTINGS_COLUMNS = [
  'page_title',
  'navigation_label',
  'intro_text',
  'status',
  'opens_at',
  'closes_at',
  'show_in_navigation',
  'registration_options',
  'terms_title',
  'terms_sections',
].join(',');

export async function getPublicPlayerRegistration(): Promise<PublicPlayerRegistration | null> {
  if (!isServerSupabaseConfigured()) return null;

  try {
    const supabase = createServerClient();
    const { data: season, error: seasonError } = await supabase
      .from('club_seasons')
      .select('id,name')
      .eq('is_current', true)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();

    if (seasonError || !season) return null;

    const { data: settings, error: settingsError } = await supabase
      .from('club_season_registration_settings')
      .select(PLAYER_REGISTRATION_SETTINGS_COLUMNS)
      .eq('club_season_id', season.id)
      .limit(1)
      .maybeSingle();

    // Migration-first rollout safety: previews connected to the old schema
    // degrade to the unavailable state until the additive migration is live.
    if (settingsError || !settings) return null;
    return publicRegistrationFromRow(settings as unknown as StoredRegistrationRow, season.name);
  } catch {
    return null;
  }
}
