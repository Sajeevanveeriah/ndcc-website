import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guard';
import { getCurrentClubSeason } from '@/lib/club-seasons';
import { parsePlayHQMappingPayload } from '@/lib/playhq/mapping';
import { loadPlayHQMappings, savePlayHQMappings } from '@/lib/playhq/mapping-store';
import { refreshPlayHQPublicData } from '@/lib/playhq/refresh';
import { createServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store', Vary: 'Cookie' } as const;

function forbidden() {
  return NextResponse.json({ success: false, error: 'Your account does not have access to this section.' }, { status: 403, headers: noStore });
}

type CmsTeamRow = { id: string; name: string; grade: string | null; is_active: boolean; sort_order: number | null; playhq_team_id?: string | null };

async function loadCmsTeams(): Promise<{ teams: CmsTeamRow[]; linkColumn: boolean }> {
  const supabase = createServerClient();
  const withLink = await supabase.from('teams').select('id, name, grade, is_active, sort_order, playhq_team_id').order('sort_order', { ascending: true }).order('name', { ascending: true });
  if (!withLink.error) return { teams: (withLink.data || []) as CmsTeamRow[], linkColumn: true };
  // teams.playhq_team_id is added by 20260927070000_playhq_season_links.sql.
  const basic = await supabase.from('teams').select('id, name, grade, is_active, sort_order').order('sort_order', { ascending: true }).order('name', { ascending: true });
  if (basic.error) throw new Error(basic.error.message);
  return { teams: (basic.data || []) as CmsTeamRow[], linkColumn: false };
}

async function seasonLinksAvailable() {
  const { error } = await createServerClient().from('club_season_playhq_seasons').select('id').limit(1);
  return !error;
}

export async function GET() {
  const user = await requirePermission('season.setup');
  if (!user) return forbidden();
  try {
    const clubSeason = await getCurrentClubSeason();
    const [mappings, cms, linksTable] = await Promise.all([
      loadPlayHQMappings(clubSeason?.id),
      loadCmsTeams(),
      seasonLinksAvailable(),
    ]);
    return NextResponse.json({
      success: true,
      clubSeason: clubSeason ? { id: clubSeason.id, name: clubSeason.name, slug: clubSeason.slug } : null,
      mappings: mappings ? { seasons: mappings.seasons, grades: mappings.grades, teams: mappings.teams } : { seasons: [], grades: [], teams: [] },
      cmsTeams: cms.teams.map((team) => ({ id: team.id, name: team.name, grade: team.grade, isActive: team.is_active, playhqTeamId: team.playhq_team_id || null })),
      schema: { seasonLinks: linksTable, teamLinkColumn: cms.linkColumn },
    }, { headers: noStore });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Could not load PlayHQ mappings.' }, { status: 500, headers: noStore });
  }
}

export async function PUT(request: Request) {
  const user = await requirePermission('season.setup');
  if (!user) return forbidden();
  const parsed = parsePlayHQMappingPayload(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error }, { status: 400, headers: noStore });
  try {
    const clubSeason = await getCurrentClubSeason();
    if (!clubSeason) return NextResponse.json({ success: false, error: 'Set a current club season before linking PlayHQ.' }, { status: 409, headers: noStore });
    const cms = await loadCmsTeams();
    if (!cms.linkColumn && parsed.value.cmsTeamLinks.some((link) => link.playhqTeamId)) {
      return NextResponse.json({ success: false, error: 'CMS team links need the database migration 20260927070000_playhq_season_links.sql. Save without team links or apply the migration first.' }, { status: 409, headers: noStore });
    }
    const { warnings } = await savePlayHQMappings(clubSeason.id, cms.linkColumn ? parsed.value : { ...parsed.value, cmsTeamLinks: [] }, cms.teams.map((team) => team.id));
    const refresh = refreshPlayHQPublicData();
    return NextResponse.json({ success: true, message: 'PlayHQ mappings saved. Public fixtures and team pages will use them on the next visit.', warnings: [...warnings, ...refresh.failures] }, { headers: noStore });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Could not save PlayHQ mappings.' }, { status: 500, headers: noStore });
  }
}
