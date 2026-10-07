import { TEAMS } from '@/lib/constants';
import { createServerClient } from '@/lib/supabase-server';
import type { TeamInfo } from '@/lib/types';
import { normalisePublicLinkUrl } from '@/lib/public-link-url';
import { buildTeamSlugs } from '@/lib/playhq/team-view';
import { loadTeamPlayHQLinks } from '@/lib/playhq/mapping-store';
import { isBuildPrerender } from '@/lib/server/build-phase';

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

  // A failed read must never look like "the club has no teams": /teams would
  // render empty and /teams/[slug] would cache a 404 for every team. At
  // runtime, throw so ISR keeps serving the last good page. During `next
  // build` there is no last good page and a throw would fail the deployment,
  // so keep the static fallback there (the first runtime regeneration
  // replaces it).
  let data: TeamInfo[] | null = null;
  let failure: unknown = null;
  try {
    const supabase = createServerClient({ publicReadCache: true });
    const result = await supabase
      .from('teams')
      .select('id, name, grade, description, captain, playhq_url, image_url, sort_order, is_active')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (result.error) failure = result.error.message;
    else data = (result.data as TeamInfo[]) || [];
  } catch (err) {
    failure = err;
  }

  if (failure !== null) {
    if (!isBuildPrerender()) {
      console.error('[teams] Failed to load teams from Supabase:', failure);
      throw new Error('Teams temporarily unavailable');
    }
    console.error('[teams] Failed to load teams from Supabase during build; serving static fallback:', failure);
    return normaliseTeamLinks(TEAMS);
  }
  return normaliseTeamLinks(data || []);
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
