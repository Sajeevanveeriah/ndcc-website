import { TEAMS } from '@/lib/constants';
import { createServerClient } from '@/lib/supabase-server';
import type { TeamInfo } from '@/lib/types';
import { normalisePublicLinkUrl } from '@/lib/public-link-url';
import { buildTeamSlugs } from '@/lib/playhq/team-view';
import { loadTeamPlayHQLinks } from '@/lib/playhq/mapping-store';

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
    const supabase = createServerClient({ publicReadCache: true });
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


export type PublicTeamWithSlug = TeamInfo & { slug: string; playhq_team_id: string | null };

/**
 * Active CMS teams with their public /teams/[slug] slug (derived from the
 * team name in display order) and saved PlayHQ team link, if any. The link
 * read degrades to "not linked" before the teams.playhq_team_id migration.
 */
export async function getPublicTeamsWithSlugs(): Promise<PublicTeamWithSlug[]> {
  const [teams, links] = await Promise.all([getPublicTeams(), loadTeamPlayHQLinks()]);
  return buildTeamSlugs(teams).map(({ team, slug }) => ({ ...team, slug, playhq_team_id: (team.id && links.get(team.id)) || null }));
}

export async function getPublicTeamBySlug(slug: string): Promise<PublicTeamWithSlug | null> {
  return (await getPublicTeamsWithSlugs()).find((team) => team.slug === slug) || null;
}
