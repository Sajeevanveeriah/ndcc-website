import { calculateFantasyPoints, type FantasyScoringRule, type FantasyStatLine } from '@/lib/fantasy-scoring';
import { createServerClient, isServerSupabaseConfigured } from '@/lib/supabase-server';

export type FantasyImportStatus = 'draft' | 'reviewed' | 'published' | 'rejected';

export type FantasyImportBatchSummary = {
  id: string;
  filename: string | null;
  source: string;
  source_url: string | null;
  fetched_at: string | null;
  status: FantasyImportStatus;
  created_at: string | null;
  rowCount: number;
  totalPreviewPoints: number;
};

export type FantasyImportStatRow = {
  id: string;
  playerName: string;
  playerRole: string | null;
  roundNumber: number | null;
  roundName: string | null;
  matchDate: string | null;
  opponent: string | null;
  runs: number;
  wickets: number;
  maidens: number;
  catches: number;
  runouts: number;
  stumpings: number;
  ducks: number;
  notOut: boolean;
  playerOfMatch: boolean;
  points: number;
};

export type FantasyImportBatchDetail = FantasyImportBatchSummary & {
  notes: string | null;
  rows: FantasyImportStatRow[];
};

export type FantasyRoundOption = {
  id: string;
  roundNumber: number;
  name: string;
};

export type FantasyLeaderboardRow = {
  rank: number;
  playerId: string;
  playerName: string;
  role: string | null;
  matchesCounted: number;
  runs: number;
  wickets: number;
  maidens: number;
  catches: number;
  runouts: number;
  stumpings: number;
  ducks: number;
  totalFantasyPoints: number;
};

export type FantasyLeaderboardData = {
  rows: FantasyLeaderboardRow[];
  rounds: FantasyRoundOption[];
  selectedRoundId: string | null;
};

type BatchRecord = {
  id: string;
  filename: string | null;
  source: string;
  source_url?: string | null;
  fetched_at?: string | null;
  status: FantasyImportStatus;
  created_at: string | null;
  notes?: string | null;
};

type StatRecord = {
  id: string;
  import_batch_id: string | null;
  round_id: string | null;
  player_id: string | null;
  match_date: string | null;
  opponent: string | null;
  runs: number | null;
  wickets: number | null;
  maidens: number | null;
  catches: number | null;
  runouts: number | null;
  stumpings: number | null;
  ducks: number | null;
  not_out: boolean | null;
  player_of_match: boolean | null;
  fantasy_players?: { display_name: string | null; role: string | null } | null;
  fantasy_rounds?: { id: string; round_number: number | null; name: string | null } | null;
};

type PlayerScore = Omit<FantasyLeaderboardRow, 'rank'>;

function toNumber(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function buildStatLine(row: StatRecord): FantasyStatLine {
  return {
    round_number: toNumber(row.fantasy_rounds?.round_number),
    match_date: row.match_date || '',
    opponent: row.opponent || '',
    player_name: row.fantasy_players?.display_name || 'Unknown player',
    runs: toNumber(row.runs),
    wickets: toNumber(row.wickets),
    maidens: toNumber(row.maidens),
    catches: toNumber(row.catches),
    runouts: toNumber(row.runouts),
    stumpings: toNumber(row.stumpings),
    ducks: toNumber(row.ducks),
    not_out: row.not_out === true,
    player_of_match: row.player_of_match === true,
  };
}

function calculateRowPoints(row: StatRecord, scoringRules: FantasyScoringRule[]) {
  return calculateFantasyPoints(buildStatLine(row), scoringRules);
}

function mapStatRow(row: StatRecord, scoringRules: FantasyScoringRule[]): FantasyImportStatRow {
  return {
    id: row.id,
    playerName: row.fantasy_players?.display_name || 'Unknown player',
    playerRole: row.fantasy_players?.role || null,
    roundNumber: row.fantasy_rounds?.round_number ?? null,
    roundName: row.fantasy_rounds?.name || null,
    matchDate: row.match_date,
    opponent: row.opponent,
    runs: toNumber(row.runs),
    wickets: toNumber(row.wickets),
    maidens: toNumber(row.maidens),
    catches: toNumber(row.catches),
    runouts: toNumber(row.runouts),
    stumpings: toNumber(row.stumpings),
    ducks: toNumber(row.ducks),
    notOut: row.not_out === true,
    playerOfMatch: row.player_of_match === true,
    points: calculateRowPoints(row, scoringRules),
  };
}

async function getScoringRules() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('fantasy_scoring_rules')
    .select('key, points, enabled');

  if (error) throw new Error(error.message);
  return (data ?? []) as FantasyScoringRule[];
}

async function getStatsForBatches(batchIds: string[]) {
  if (batchIds.length === 0) return [];

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('fantasy_match_stats')
    .select('id, import_batch_id, round_id, player_id, match_date, opponent, runs, wickets, maidens, catches, runouts, stumpings, ducks, not_out, player_of_match, fantasy_players(display_name, role), fantasy_rounds(id, round_number, name)')
    .in('import_batch_id', batchIds)
    .order('match_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as StatRecord[];
}

export async function getFantasyImportBatches(): Promise<FantasyImportBatchSummary[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('fantasy_import_batches')
    .select('id, filename, source, source_url, fetched_at, status, created_at')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  const batches = (data ?? []) as BatchRecord[];
  const [stats, scoringRules] = await Promise.all([
    getStatsForBatches(batches.map((batch) => batch.id)),
    getScoringRules(),
  ]);
  const groupedStats = stats.reduce((map, row) => {
    if (!row.import_batch_id) return map;
    const rows = map.get(row.import_batch_id) ?? [];
    rows.push(row);
    map.set(row.import_batch_id, rows);
    return map;
  }, new Map<string, StatRecord[]>());

  return batches.map((batch) => {
    const rows = groupedStats.get(batch.id) ?? [];
    return {
      id: batch.id,
      filename: batch.filename,
      source: batch.source,
      source_url: batch.source_url ?? null,
      fetched_at: batch.fetched_at ?? null,
      status: batch.status,
      created_at: batch.created_at,
      rowCount: rows.length,
      totalPreviewPoints: rows.reduce((total, row) => total + calculateRowPoints(row, scoringRules), 0),
    };
  });
}

export async function getFantasyImportBatchDetail(id: string): Promise<FantasyImportBatchDetail | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('fantasy_import_batches')
    .select('id, filename, source, source_url, fetched_at, status, created_at, notes')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(error.message);
  }

  const batch = data as BatchRecord;
  const [stats, scoringRules] = await Promise.all([
    getStatsForBatches([id]),
    getScoringRules(),
  ]);
  const rows = stats.map((row) => mapStatRow(row, scoringRules));

  return {
    id: batch.id,
    filename: batch.filename,
    source: batch.source,
    source_url: batch.source_url ?? null,
    fetched_at: batch.fetched_at ?? null,
    status: batch.status,
    created_at: batch.created_at,
    notes: batch.notes ?? null,
    rowCount: rows.length,
    totalPreviewPoints: rows.reduce((total, row) => total + row.points, 0),
    rows,
  };
}

export async function getPublishedFantasyLeaderboard(roundId?: string | null, seasonId?: string | null): Promise<FantasyLeaderboardData> {
  if (!isServerSupabaseConfigured()) {
    return { rows: [], rounds: [], selectedRoundId: null };
  }

  const supabase = createServerClient();
  let batchQuery = supabase
    .from('fantasy_import_batches')
    .select('id')
    .eq('status', 'published');
  if (seasonId) batchQuery = batchQuery.eq('season_id', seasonId);
  const { data: batches, error: batchesError } = await batchQuery;

  if (batchesError) throw new Error(batchesError.message);

  const batchIds = ((batches ?? []) as Array<{ id: string }>).map((batch) => batch.id);
  const [allStats, scoringRules] = await Promise.all([
    getStatsForBatches(batchIds),
    getScoringRules(),
  ]);

  const roundsById = new Map<string, FantasyRoundOption>();
  for (const row of allStats) {
    if (!row.round_id || !row.fantasy_rounds?.round_number || !row.fantasy_rounds.name) continue;
    roundsById.set(row.round_id, {
      id: row.round_id,
      roundNumber: row.fantasy_rounds.round_number,
      name: row.fantasy_rounds.name,
    });
  }
  const rounds = Array.from(roundsById.values()).sort((a, b) => a.roundNumber - b.roundNumber);
  const selectedRoundId = roundId && roundsById.has(roundId) ? roundId : null;
  const filteredStats = selectedRoundId ? allStats.filter((row) => row.round_id === selectedRoundId) : allStats;

  return {
    rows: aggregateLeaderboardRows(filteredStats, scoringRules),
    rounds,
    selectedRoundId,
  };
}

// Pure aggregation + ranking so the calculation is deterministic and
// unit-testable (scripts/test-fantasy-logic.mjs) independent of the DB reads.
export function aggregateLeaderboardRows(stats: StatRecord[], scoringRules: FantasyScoringRule[]): FantasyLeaderboardRow[] {
  const scoresByPlayer = new Map<string, PlayerScore>();
  for (const row of stats) {
    if (!row.player_id) continue;
    const existing = scoresByPlayer.get(row.player_id) ?? {
      playerId: row.player_id,
      playerName: row.fantasy_players?.display_name || 'Unknown player',
      role: row.fantasy_players?.role || null,
      matchesCounted: 0,
      runs: 0,
      wickets: 0,
      maidens: 0,
      catches: 0,
      runouts: 0,
      stumpings: 0,
      ducks: 0,
      totalFantasyPoints: 0,
    };

    existing.matchesCounted += 1;
    existing.runs += toNumber(row.runs);
    existing.wickets += toNumber(row.wickets);
    existing.maidens += toNumber(row.maidens);
    existing.catches += toNumber(row.catches);
    existing.runouts += toNumber(row.runouts);
    existing.stumpings += toNumber(row.stumpings);
    existing.ducks += toNumber(row.ducks);
    existing.totalFantasyPoints += calculateRowPoints(row, scoringRules);
    scoresByPlayer.set(row.player_id, existing);
  }

  const sortedScores = Array.from(scoresByPlayer.values()).sort((a, b) => {
    if (b.totalFantasyPoints !== a.totalFantasyPoints) return b.totalFantasyPoints - a.totalFantasyPoints;
    return a.playerName.localeCompare(b.playerName);
  });

  return sortedScores.map((row, index) => ({ ...row, rank: index + 1 }));
}
