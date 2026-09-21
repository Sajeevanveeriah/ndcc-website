import { TEAMS } from '@/lib/constants';
import { createServerClient } from '@/lib/supabase-server';
import type { TeamInfo } from '@/lib/types';
import { normalisePublicLinkUrl } from '@/lib/public-link-url';

function normaliseTeamLinks(teams: TeamInfo[]): TeamInfo[] {
  return teams.map((team) => ({
    ...team,
    playhq_url: normalisePublicLinkUrl(team.playhq_url),
  }));
}

export async function getPublicTeams(): Promise<TeamInfo[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return normaliseTeamLinks(TEAMS);
  }

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('teams')
      .select('id, name, grade, description, captain, playhq_url, image_url, sort_order, is_active')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      console.error('[teams] Failed to load teams from Supabase; serving static fallback:', error.message);
      return normaliseTeamLinks(TEAMS);
    }
    return normaliseTeamLinks((data as TeamInfo[]) || []);
  } catch (err) {
    console.error('[teams] Failed to load teams from Supabase; serving static fallback:', err);
    return normaliseTeamLinks(TEAMS);
  }
}

