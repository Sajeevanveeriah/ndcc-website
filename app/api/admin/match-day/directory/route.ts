import { createServerClient } from '@/lib/supabase-server';
import { requirePermissionResult } from '@/lib/auth/guard';
import { denied, reply } from '@/lib/server/match-day-admin';

export const dynamic = 'force-dynamic';

/** Pick lists for the team sheet and winner forms: teams, Dino Coach players and player sponsors. */
export async function GET() {
  const access = await requirePermissionResult('publications');
  if (!access.user) return denied(access);
  const db = createServerClient();
  const [teams, players, sponsors] = await Promise.all([
    db.from('teams').select('id,name,grade,is_active').order('sort_order', { ascending: true }),
    db.from('fantasy_players').select('id,display_name,team_label,active').eq('active', true).order('display_name', { ascending: true }).limit(2000),
    db.from('player_sponsors').select('id,player_name,sponsor_name,active').order('sort_order', { ascending: true }),
  ]);
  if (teams.error) return reply({ success: false, error: 'Unable to load teams. Please retry.' }, 503);
  return reply({
    success: true,
    teams: teams.data ?? [],
    // Dino Coach links are optional: a missing table or column must not block team sheets.
    players: players.error ? [] : players.data ?? [],
    sponsors: sponsors.error ? [] : sponsors.data ?? [],
  });
}
