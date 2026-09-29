import { NextResponse } from 'next/server';
import { resolveFantasyManagerAuth } from '@/lib/fantasy-manager-auth';
import { createServerClient } from '@/lib/supabase-server';
import { resolveRequestSeason } from '@/lib/fantasy-seasons';
import { getActivePlayersWithLatestPrices } from '@/lib/fantasy-game';
import { buildSquadSlots } from '@/lib/dino-coach/domain';
import { getDinoCoachSettings } from '@/lib/dino-coach/server';
import { getPlayerStats } from '@/lib/dino-coach/player-stats-server';
import { SCORING_SQUAD_STATUSES, selectScoringSquads } from '@/lib/dino-coach/round-scoring';
import { getCachedManagerStandings } from '@/lib/server/dino-public-cache';
import { enforceRateLimit, getClientIp } from '@/lib/server/request-guards';
import { logRouteError } from '@/lib/server/public-errors';
import { isUuidV1ToV5 } from '@/lib/validation/uuid';
import {
  TEAMS_HIDDEN_MESSAGE, buildTeamPicks, latestLockedRound, seasonFinished, squadMarketValue,
  type RevealRound, type SquadPickRow, type TeamView, type TeamViewPlayer,
} from '@/lib/dino-coach/team-view';

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

// Signed-in managers can open any public manager's team, like viewing another
// club in an ultimate-team game. A rival is shown with the squad that counts
// for the latest round whose deadline has passed (the same carry-forward rule
// as scoring), never live edits for a round still open.
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
    const db = createServerClient();
    const [settings, rounds] = await Promise.all([
      getDinoCoachSettings(season.id),
      db.from('fantasy_rounds').select('id,name,round_number,status,deadline_at').eq('season_id', season.id),
    ]);
    if (rounds.error) throw new Error(rounds.error.message);
    const finished = seasonFinished(season.status);
    // Finished seasons also use their latest locked round, so squads saved for a
    // round cancelled at season end are never shown as the final team.
    const lockedRound = latestLockedRound((rounds.data ?? []) as RevealRound[]);
    if (!isSelf && !finished && !lockedRound) return reply({ success: false, revealed: false, error: TEAMS_HIDDEN_MESSAGE }, 403);

    const [target, demo] = await Promise.all([
      db.from('fantasy_managers').select('id,display_name,team_name,is_active,deleted_at,hidden_at').eq('id', managerId).maybeSingle(),
      db.from('fantasy_entries').select('is_demo').eq('manager_id', managerId).eq('season_id', season.id).maybeSingle(),
    ]);
    if (target.error || demo.error) throw new Error(target.error?.message || demo.error?.message);
    // Hidden, removed, inactive and demo managers never appear in the public standings, so their teams stay private.
    const listed = target.data && target.data.is_active && !target.data.deleted_at && !target.data.hidden_at && demo.data?.is_demo !== true;
    if (!target.data || (!isSelf && !listed)) return reply({ success: false, error: 'Team not found.' }, 404);

    const [players, standings, targetSquads, mySquads] = await Promise.all([
      getActivePlayersWithLatestPrices(season.id),
      getCachedManagerStandings(season.id),
      loadSquads(managerId, season.id),
      isSelf ? Promise.resolve(null) : loadSquads(auth.manager.id, season.id),
    ]);
    // Your own team is always your live squad; a rival's is their locked-round squad.
    const roundNumbers = new Map((rounds.data ?? []).map((round) => [round.id, round.round_number as number | null]));
    const targetSquad = isSelf || !lockedRound
      ? targetSquads[0]
      : selectScoringSquads(targetSquads, { roundId: lockedRound.id, roundNumber: lockedRound.round_number, roundNumbers })[0];
    if (!targetSquad) return reply({ success: false, error: 'This manager has no team for the latest locked round.' }, 404);
    const targetPicks = targetSquad.fantasy_squad_players ?? [];
    const myPicks = mySquads?.[0]?.fantasy_squad_players ?? null;
    const ownedIds = new Set([...targetPicks, ...(myPicks ?? [])].map((pick) => pick.player_id));
    const owned = players.filter((player) => ownedIds.has(player.id));
    const stats = await getPlayerStats(season.id, owned);
    const playerMap = new Map<string, TeamViewPlayer>(owned.map((player) => [player.id, {
      id: player.id, display_name: player.display_name, role: player.role, team_label: player.team_label,
      price_dino_dollars: player.price_dino_dollars, published_at: player.published_at, stats: stats.get(player.id) ?? null,
    }]));
    const slots = buildSquadSlots(settings.slot_counts);
    const view = (id: string, teamName: string, displayName: string, rows: SquadPickRow[], roundName: string | null): TeamView => {
      const picks = buildTeamPicks(rows, slots, playerMap);
      const standing = standings.find((row) => row.managerId === id);
      return {
        managerId: id, teamName, displayName, rank: standing?.rank ?? null, totalPoints: standing?.totalPoints ?? 0,
        // Market value of the squad shown, so a rival's live squad value is never implied.
        squadValueDinoDollars: squadMarketValue(picks), roundName, picks,
      };
    };
    return reply({
      success: true,
      season: { id: season.id, name: season.name, slug: season.slug },
      team: view(managerId, target.data.team_name || 'Team', target.data.display_name || 'Dino Coach manager', targetPicks, isSelf ? null : lockedRound?.name ?? null),
      mine: myPicks ? view(auth.manager.id, auth.manager.team_name || 'My team', auth.manager.display_name || 'You', myPicks, null) : null,
    });
  } catch (error) {
    logRouteError('fantasy/managers/team', error);
    return reply({ success: false, error: 'Could not load this team. Please try again.' }, 503);
  }
}
