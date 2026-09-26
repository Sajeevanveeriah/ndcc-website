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

/**
 * The current season's public registration, or null when there is none.
 * Pages degrade to null on any read failure. `strict` (the sitemap) reads
 * uncached and throws instead, so a failed read is never mistaken for
 * "registration closed" and cached.
 */
export async function getPublicPlayerRegistration(options: { strict?: boolean } = {}): Promise<PublicPlayerRegistration | null> {
  const strict = options.strict === true;
  if (!isServerSupabaseConfigured()) {
    if (strict) throw new Error('Player registration unavailable');
    return null;
  }

  try {
    const supabase = createServerClient(strict ? {} : { publicReadCache: true });
    const { data: season, error: seasonError } = await supabase
      .from('club_seasons')
      .select('id,name')
      .eq('is_current', true)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();

    if (seasonError && strict) throw new Error('Player registration season unavailable');
    if (seasonError || !season) return null;

    const { data: settings, error: settingsError } = await supabase
      .from('club_season_registration_settings')
      .select(PLAYER_REGISTRATION_SETTINGS_COLUMNS)
      .eq('club_season_id', season.id)
      .limit(1)
      .maybeSingle();

    // Migration-first rollout safety: previews connected to the old schema
    // degrade to the unavailable state until the additive migration is live.
    if (settingsError && strict) throw new Error('Player registration settings unavailable');
    if (settingsError || !settings) return null;
    return publicRegistrationFromRow(settings as unknown as StoredRegistrationRow, season.name);
  } catch (error) {
    if (strict) throw error;
    return null;
  }
}
