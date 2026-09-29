import { NextResponse } from 'next/server';
import { resolveFantasyManagerAuth } from '@/lib/fantasy-manager-auth';
import { createServerClient } from '@/lib/supabase-server';
import { resolveRequestSeason } from '@/lib/fantasy-seasons';
import { getActivePlayersWithLatestPrices, getRoundLockState } from '@/lib/fantasy-game';
import { buildSquadSlots } from '@/lib/dino-coach/domain';
import { getDinoCoachSettings } from '@/lib/dino-coach/server';
import { getPlayerStats } from '@/lib/dino-coach/player-stats-server';
import { SCORING_SQUAD_STATUSES } from '@/lib/dino-coach/round-scoring';
import { getCachedManagerStandings } from '@/lib/server/dino-public-cache';
import { enforceRateLimit, getClientIp } from '@/lib/server/request-guards';
import { logRouteError } from '@/lib/server/public-errors';
import { isUuidV1ToV5 } from '@/lib/validation/uuid';
import {
  TEAMS_HIDDEN_MESSAGE, buildTeamPicks, squadMarketValue, teamsRevealed,
  type SquadPickRow, type TeamView, type TeamViewPlayer,
} from '@/lib/dino-coach/team-view';

export const dynamic = 'force-dynamic';
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

async function loadSquadPicks(managerId: string, seasonId: string): Promise<SquadPickRow[] | null> {
  const { data, error } = await createServerClient().from('fantasy_squads')
    .select('id,fantasy_squad_players(player_id,slot_key,assigned_role,position_type,is_captain,is_vice_captain,purchase_price_dino_dollars,fantasy_players(display_name))')
    .eq('manager_id', managerId).eq('season_id', seasonId).in('status', [...SCORING_SQUAD_STATUSES])
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? (data.fantasy_squad_players ?? []) as SquadPickRow[] : null;
}

// Signed-in managers can open any public manager's team once the round is
// locked or the season is finished, like viewing another club in an ultimate-team game.
export async function GET(request: Request, { params }: { params: Promise<{ managerId: string }> }) {
  const { auth, errorMessage, errorStatus } = await resolveFantasyManagerAuth(request);
  if (!auth) return reply({ success: false, error: errorMessage }, errorStatus ?? 401);
  if (!await enforceRateLimit(`dino-team-view:${getClientIp(request)}`, 60, 60_000)) {
    return reply({ success: false, error: 'Too many requests. Please wait a minute.' }, 429);
  }
  const { managerId } = await params;
  if (!isUuidV1ToV5(managerId)) return reply({ success: false, error: 'Team not found.' }, 404);
  try {
    const season = await resolveRequestSeason(request);
    if (!season) return reply({ success: false, error: 'No Dino Coach season is available.' }, 404);
    const isSelf = managerId === auth.manager.id;
    const [settings, roundLock] = await Promise.all([
      getDinoCoachSettings(season.id),
      season.is_current ? getRoundLockState(season.id) : Promise.resolve({ locked: false }),
    ]);
    const revealed = teamsRevealed({ seasonStatus: season.status, isCurrentSeason: season.is_current, roundLocked: roundLock.locked });
    if (!isSelf && !revealed) return reply({ success: false, revealed: false, error: TEAMS_HIDDEN_MESSAGE }, 403);

    const db = createServerClient();
    const [target, demo] = await Promise.all([
      db.from('fantasy_managers').select('id,display_name,team_name,is_active,deleted_at,hidden_at').eq('id', managerId).maybeSingle(),
      db.from('fantasy_entries').select('is_demo').eq('manager_id', managerId).eq('season_id', season.id).maybeSingle(),
    ]);
    if (target.error || demo.error) throw new Error(target.error?.message || demo.error?.message);
    // Hidden, removed, inactive and demo managers never appear in the public standings, so their teams stay private.
    const listed = target.data && target.data.is_active && !target.data.deleted_at && !target.data.hidden_at && demo.data?.is_demo !== true;
    if (!target.data || (!isSelf && !listed)) return reply({ success: false, error: 'Team not found.' }, 404);

    const [players, standings, targetPicks, myPicks] = await Promise.all([
      getActivePlayersWithLatestPrices(season.id),
      getCachedManagerStandings(season.id),
      loadSquadPicks(managerId, season.id),
      isSelf ? Promise.resolve(null) : loadSquadPicks(auth.manager.id, season.id),
    ]);
    if (!targetPicks) return reply({ success: false, error: 'This manager has not picked a team yet.' }, 404);
    const ownedIds = new Set([...targetPicks, ...(myPicks ?? [])].map((pick) => pick.player_id));
    const owned = players.filter((player) => ownedIds.has(player.id));
    const stats = await getPlayerStats(season.id, owned);
    const playerMap = new Map<string, TeamViewPlayer>(owned.map((player) => [player.id, {
      id: player.id, display_name: player.display_name, role: player.role, team_label: player.team_label,
      price_dino_dollars: player.price_dino_dollars, published_at: player.published_at, stats: stats.get(player.id) ?? null,
    }]));
    const slots = buildSquadSlots(settings.slot_counts);
    const view = (id: string, teamName: string, displayName: string, rows: SquadPickRow[]): TeamView => {
      const picks = buildTeamPicks(rows, slots, playerMap);
      const standing = standings.find((row) => row.managerId === id);
      return {
        managerId: id, teamName, displayName, rank: standing?.rank ?? null, totalPoints: standing?.totalPoints ?? 0,
        squadValueDinoDollars: standing?.squadValueDinoDollars || squadMarketValue(picks), picks,
      };
    };
    return reply({
      success: true,
      season: { id: season.id, name: season.name, slug: season.slug },
      revealed,
      team: view(managerId, target.data.team_name || 'Team', target.data.display_name || 'Dino Coach manager', targetPicks),
      mine: myPicks ? view(auth.manager.id, auth.manager.team_name || 'My team', auth.manager.display_name || 'You', myPicks) : null,
    });
  } catch (error) {
    logRouteError('fantasy/managers/team', error);
    return reply({ success: false, error: 'Could not load this team. Please try again.' }, 503);
  }
}
