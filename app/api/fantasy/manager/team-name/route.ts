import { NextResponse } from 'next/server';
import { readFantasyMutation } from '@/lib/server/fantasy-mutation';
import { createServerClient } from '@/lib/supabase-server';
import { getAuthUserFromRequest } from '@/lib/fantasy-manager-auth';
import { resolveRequestSeason } from '@/lib/fantasy-seasons';
import { getDinoCoachSettings } from '@/lib/dino-coach/server';
import { moderateTeamName } from '@/lib/dino-coach/domain';
import { revalidateDinoStandingsCache } from '@/lib/server/revalidate-public';

export const dynamic = 'force-dynamic';

const MANAGER_FIELDS = 'id, team_name, team_name_status, team_name_locked, deleted_at' as const;
type ManagerRow = { id: string; team_name: string; team_name_status: string | null; team_name_locked: boolean | null; deleted_at: string | null };

function reply(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * A signed-in manager renames their own Dino Coach team. Only the team name
 * changes: no rules re-acceptance, payment or squad state is touched. Names
 * that match a committee-blocked term are refused rather than published, the
 * league manager's lock is honoured, and every attempt is logged.
 */
export async function POST(request: Request) {
  const user = await getAuthUserFromRequest(request);
  if (!user?.email) return reply({ success: false, error: 'Sign in is required.' }, 401);

  const input = await readFantasyMutation(request, user.id, 'profile');
  if ('response' in input) return input.response;
  const body = input.body;
  const teamName = typeof body.teamName === 'string' ? body.teamName.trim().replace(/\s+/g, ' ') : '';
  if (!teamName) return reply({ success: false, error: 'Enter a team name.' }, 400);
  if (teamName.length > 80) return reply({ success: false, error: 'Team names must be 80 characters or fewer.' }, 400);

  try {
    const supabase = createServerClient();
    const existing = await supabase.from('fantasy_managers').select(MANAGER_FIELDS).eq('auth_user_id', user.id).maybeSingle();
    if (existing.error) {
      console.error('[fantasy-team-name] Manager lookup failed', { userId: user.id, message: existing.error.message });
      return reply({ success: false, error: 'Could not load your Dino Coach team. Please try again.' }, 500);
    }
    const manager = existing.data as ManagerRow | null;
    if (!manager) return reply({ success: false, error: 'Create your Dino Coach manager profile first.' }, 404);
    if (manager.deleted_at) return reply({ success: false, error: 'Your team has been deleted. Contact the club to restore it.' }, 403);
    if (manager.team_name_locked) return reply({ success: false, error: 'This team name was replaced and locked by the league manager. Contact the club to change it.' }, 403);
    if (teamName === manager.team_name) return reply({ success: true, unchanged: true, manager: { team_name: manager.team_name, team_name_status: manager.team_name_status, team_name_locked: false } });

    const season = await resolveRequestSeason(request, body);
    if (!season) return reply({ success: false, error: 'No Dino Coach season is available.' }, 404);
    const settings = await getDinoCoachSettings(season.id);
    const moderation = moderateTeamName(teamName, settings.blocked_team_name_terms || []);
    const log = (status: string, resultingName: string | null, reason: string) => supabase.from('fantasy_team_name_moderation')
      .insert({ manager_id: manager.id, submitted_name: teamName, resulting_name: resultingName, status, reason })
      .then(({ error }) => { if (error) console.error('[fantasy-team-name] Moderation log failed', { managerId: manager.id, code: error.code, message: error.message }); });

    if (moderation.status !== 'approved') {
      // Public standings show team names straight away, so a flagged name is never saved.
      await log('review_required', null, 'Rename refused: matched a committee-managed blocked term. The previous name was kept.');
      return reply({ success: false, error: 'That team name cannot be used. Choose a different name, or contact the club if you think this is a mistake.' }, 422);
    }

    // Only update the row as it was read, so a concurrent committee lock or rename wins.
    const updated = await supabase.from('fantasy_managers')
      .update({ team_name: teamName, team_name_status: 'approved' })
      .eq('id', manager.id).eq('team_name', manager.team_name).eq('team_name_locked', false).is('deleted_at', null)
      .select('team_name, team_name_status, team_name_locked').maybeSingle();
    if (updated.error) {
      console.error('[fantasy-team-name] Rename failed', { managerId: manager.id, code: updated.error.code, message: updated.error.message });
      return reply({ success: false, error: 'Could not change your team name. Please try again or contact the club.' }, 500);
    }
    if (!updated.data) return reply({ success: false, error: 'Your team changed while you were editing. Reload the page and try again.' }, 409);

    await log('approved', teamName, `Renamed by the manager from "${manager.team_name}". Passed deterministic blocked-term checks.`);
    console.info('[fantasy-team-name] Team renamed', { userId: user.id, managerId: manager.id });
    // Team names appear in the cached public manager standings.
    revalidateDinoStandingsCache();
    return reply({ success: true, manager: updated.data });
  } catch (error) {
    console.error('[fantasy-team-name] Rename failed', { userId: user.id, message: error instanceof Error ? error.message : String(error) });
    return reply({ success: false, error: 'Could not change your team name. Please try again or contact the club.' }, 500);
  }
}
