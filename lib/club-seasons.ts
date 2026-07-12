import { createServerClient } from './supabase-server';

export const CLUB_SEASON_COLUMNS = 'id, name, slug, start_date, end_date, status, is_current, playhq_season_id, registration_status, registration_url, source_season_id, scheduled_activation_at, activated_at, archived_at, created_at, updated_at';

export type ClubSeasonStatus = 'draft' | 'upcoming' | 'active' | 'completed' | 'archived';
export type ClubSeasonRegistrationStatus = 'closed' | 'opening_soon' | 'open' | 'waitlist' | 'archived';
export type ClubSeason = {
  id: string;
  name: string;
  slug: string;
  start_date: string;
  end_date: string;
  status: ClubSeasonStatus;
  is_current: boolean;
  playhq_season_id: string | null;
  registration_status: ClubSeasonRegistrationStatus;
  registration_url: string | null;
  source_season_id: string | null;
  scheduled_activation_at: string | null;
  activated_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export function slugifySeasonName(name: string) {
  return name.trim().toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export async function getClubSeasons() {
  const supabase = createServerClient();
  const { data, error } = await supabase.from('club_seasons').select(CLUB_SEASON_COLUMNS).order('start_date', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as ClubSeason[];
}

export async function getCurrentClubSeason() {
  const supabase = createServerClient();
  const { data, error } = await supabase.from('club_seasons').select(CLUB_SEASON_COLUMNS).eq('is_current', true).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data as ClubSeason | null;
}
