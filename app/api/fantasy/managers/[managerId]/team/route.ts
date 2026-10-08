import { NextResponse } from 'next/server';
import { resolveFantasyManagerAuth } from '@/lib/fantasy-manager-auth';
import { createServerClient } from '@/lib/supabase-server';
import { resolveRequestSeason } from '@/lib/fantasy-seasons';
import { getActivePlayersWithLatestPrices } from '@/lib/fantasy-game';
import { buildSquadSlots } from '@/lib/dino-coach/domain';
import { getDinoCoachSettings } from '@/lib/dino-coach/server';
import { getPlayerStats } from '@/lib/dino-coach/player-stats-server';
import { SCORING_SQUAD_STATUSES } from '@/lib/dino-coach/round-scoring';
import { getCachedManagerStandings } from '@/lib/server/dino-public-cache';
import { enforceRateLimit, getClientIp } from '@/lib/server/request-guards';
import { logRouteError } from '@/lib/server/public-errors';
import { isUuidV1ToV5 } from '@/lib/validation/uuid';
import { buildTeamPicks, squadMarketValue, type SquadPickRow, type TeamView, type TeamViewPlayer } from '@/lib/dino-coach/team-view';

export const dynamic = 'force-dynamic';
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

type SquadRow = { id: string; manager_id: string; round_id: string | null; status: string; created_at: string | null; fantasy_squad_players: SquadPickRow[] | null };

// Newest first, so the first row is the manager's live squad.
async function loadSquads(managerId: string, seasonId: string): Promise<SquadRow[]> {
  const { data, error } = await createServerClient().from('fantasy_squads')
    .select('id,manager_id,round_id,status,created_at,fantasy_squad_players(player_id,slot_key,assigned_role,position_type,is_captain,is_vice_captain,purchase_price_dino_dollars,fantasy_players(display_name))')
    .eq('manager_id', managerId).eq('season_id', seasonId).in('status', [...SCORING_SQUAD_STATUSES])
    .order('created_at', { ascending: false }).order('id', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SquadRow[];
}

// Dino Coach teams are private: a signed-in manager can view only their own
// team. Any other manager id answers exactly like a missing team, before any
// data is read, so teams cannot be viewed or probed by changing the URL.
export async function GET(request: Request, { params }: { params: Promise<{ managerId: string }> }) {
  const { auth, errorMessage, errorStatus } = await resolveFantasyManagerAuth(request);
  if (!auth) return reply({ success: false, error: errorMessage }, errorStatus ?? 401);
  if (!await enforceRateLimit(`dino-team-view:${getClientIp(request)}`, 60, 60_000)) {
    return reply({ success: false, error: 'Too many requests. Please wait a minute.' }, 429);
  }
  const { managerId } = await params;
  if (!isUuidV1ToV5(managerId) || managerId !== auth.manager.id) return reply({ success: false, error: 'Team not found.' }, 404);
  try {
    const season = await resolveRequestSeason(request);
    if (!season) return reply({ success: false, error: 'No Dino Coach season is available.' }, 404);
    const [settings, players, standings, squads] = await Promise.all([
      getDinoCoachSettings(season.id),
      getActivePlayersWithLatestPrices(season.id),
      getCachedManagerStandings(season.id),
      loadSquads(managerId, season.id),
    ]);
    const squad = squads[0];
    if (!squad) return reply({ success: false, error: 'You have not saved a team for this season yet.' }, 404);
    const rows = squad.fantasy_squad_players ?? [];
    const ownedIds = new Set(rows.map((pick) => pick.player_id));
    const owned = players.filter((player) => ownedIds.has(player.id));
    const stats = await getPlayerStats(season.id, owned);
    const playerMap = new Map<string, TeamViewPlayer>(owned.map((player) => [player.id, {
      id: player.id, display_name: player.display_name, role: player.role, team_label: player.team_label,
      price_dino_dollars: player.price_dino_dollars, published_at: player.published_at, stats: stats.get(player.id) ?? null,
    }]));
    const picks = buildTeamPicks(rows, buildSquadSlots(settings.slot_counts), playerMap);
    const standing = standings.find((row) => row.managerId === managerId);
    const team: TeamView = {
      managerId, teamName: auth.manager.team_name || 'My team', displayName: auth.manager.display_name || 'You',
      rank: standing?.rank ?? null, totalPoints: standing?.totalPoints ?? 0,
      squadValueDinoDollars: squadMarketValue(picks), picks,
    };
    return reply({ success: true, season: { id: season.id, name: season.name, slug: season.slug }, team });
  } catch (error) {
    logRouteError('fantasy/managers/team', error);
    return reply({ success: false, error: 'Could not load this team. Please try again.' }, 503);
  }
}
