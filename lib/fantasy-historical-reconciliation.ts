import { computeSourceHash, type PlayHQPlayerStatLine } from './playhq/fantasy-import';

export type ReconciliationClassification =
  | 'exact_match'
  | 'probable_match_requires_review'
  | 'ambiguous_player'
  | 'ambiguous_fixture'
  | 'conflicting_statistics'
  | 'no_source_data'
  | 'required_field_unavailable'
  | 'rejected';

export type LegacyStatInput = {
  id: string;
  player_id: string;
  player_name: string;
  match_date: string | null;
  opponent: string | null;
  round_id?: string | null;
  round_number?: number | null;
  runs?: number | null;
  wickets?: number | null;
  catches?: number | null;
  runouts?: number | null;
  stumpings?: number | null;
  ducks?: number | null;
  maidens?: number | null;
  playhq_player_id?: string | null;
};

export type PlayHQCandidateInput = {
  gameId: string;
  fixtureId?: string | null;
  sourceUrl?: string | null;
  fetchedAt?: string | null;
  sourcePayload?: unknown;
  roundNumber?: number | null;
  roundName?: string | null;
  matchDate?: string | null;
  opponent?: string | null;
  players: PlayHQPlayerStatLine[];
};

export type ReconciliationRow = {
  legacyMatchStatId: string;
  playerId: string;
  classification: ReconciliationClassification;
  reviewStatus: 'pending';
  confidence: number;
  reviewReason: string;
  sourceUrl: string | null;
  fetchedAt: string | null;
  playhqGameId: string | null;
  playhqFixtureId: string | null;
  playhqRoundNumber: number | null;
  playhqRoundName: string | null;
  opponent: string | null;
  matchDate: string | null;
  sourceHash: string | null;
  legacySnapshot: Record<string, unknown>;
  playhqSnapshot: Record<string, unknown>;
  diff: Record<string, unknown>;
  predictedPlayerTotalDelta: number;
  predictedFantasyScoreDelta: number;
};

const statKeys = ['runs', 'wickets', 'catches', 'runouts', 'stumpings', 'ducks', 'maidens'] as const;

function normaliseName(value: string) {
  return value.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function dateOnly(value: string | null | undefined) {
  return value ? value.slice(0, 10) : null;
}

function sameOpponent(a?: string | null, b?: string | null) {
  if (!a || !b) return false;
  return normaliseName(a).includes(normaliseName(b)) || normaliseName(b).includes(normaliseName(a));
}

function statDiff(legacy: LegacyStatInput, playhq: PlayHQPlayerStatLine) {
  const diff: Record<string, { legacy: number; playhq: number }> = {};
  for (const key of statKeys) {
    const legacyValue = Number(legacy[key] ?? 0);
    const playhqValue = Number(playhq[key] ?? 0);
    if (legacyValue !== playhqValue) diff[key] = { legacy: legacyValue, playhq: playhqValue };
  }
  return diff;
}

function fantasyScoreDelta(diff: Record<string, { legacy: number; playhq: number }>) {
  // Conservative default point impacts used only for preview deltas. Manager
  // competition recalculation remains unavailable unless historical squads and
  // scoring rules are genuinely present.
  const weights: Record<string, number> = { runs: 1, wickets: 20, catches: 10, runouts: 10, stumpings: 15, ducks: -5, maidens: 5 };
  return Object.entries(diff).reduce((total, [key, value]) => total + ((value.playhq - value.legacy) * (weights[key] ?? 0)), 0);
}

function emptyRow(legacy: LegacyStatInput, classification: ReconciliationClassification, reason: string): ReconciliationRow {
  return {
    legacyMatchStatId: legacy.id,
    playerId: legacy.player_id,
    classification,
    reviewStatus: 'pending',
    confidence: 0,
    reviewReason: reason,
    sourceUrl: null,
    fetchedAt: null,
    playhqGameId: null,
    playhqFixtureId: null,
    playhqRoundNumber: null,
    playhqRoundName: null,
    opponent: legacy.opponent,
    matchDate: dateOnly(legacy.match_date),
    sourceHash: null,
    legacySnapshot: legacy as unknown as Record<string, unknown>,
    playhqSnapshot: {},
    diff: {},
    predictedPlayerTotalDelta: 0,
    predictedFantasyScoreDelta: 0,
  };
}

export function reconcileLegacyStat(legacy: LegacyStatInput, candidates: PlayHQCandidateInput[]): ReconciliationRow {
  if (!legacy.match_date) return emptyRow(legacy, 'required_field_unavailable', 'Legacy row has no match date, so fixture matching cannot be deterministic.');
  const fixtureCandidates = candidates.filter((candidate) => {
    const dateMatch = dateOnly(candidate.matchDate) === dateOnly(legacy.match_date);
    const opponentMatch = sameOpponent(legacy.opponent, candidate.opponent);
    const roundMatch = legacy.round_number && candidate.roundNumber ? legacy.round_number === candidate.roundNumber : true;
    return dateMatch && opponentMatch && roundMatch;
  });
  if (!fixtureCandidates.length) return emptyRow(legacy, 'no_source_data', 'No PlayHQ fixture candidate matched date, opponent and round.');
  if (fixtureCandidates.length > 1) return emptyRow(legacy, 'ambiguous_fixture', 'More than one PlayHQ fixture matched date, opponent and round.');

  const fixture = fixtureCandidates[0];
  let playerMatches = fixture.players.filter((player) => legacy.playhq_player_id && player.playhq_player_id === legacy.playhq_player_id);
  const matchedById = playerMatches.length === 1;
  if (!matchedById) {
    const name = normaliseName(legacy.player_name);
    playerMatches = fixture.players.filter((player) => normaliseName(player.display_name) === name);
    if (!playerMatches.length) return emptyRow(legacy, 'ambiguous_player', 'No PlayHQ player ID match and no exact display-name match was available for review.');
    if (playerMatches.length > 1) return emptyRow(legacy, 'ambiguous_player', 'Multiple PlayHQ players share this display name.');
  }

  const playhq = playerMatches[0];
  const diff = statDiff(legacy, playhq);
  const sourceHash = computeSourceHash({ fixture: { gameId: fixture.gameId, fixtureId: fixture.fixtureId, roundNumber: fixture.roundNumber }, player: playhq, source: fixture.sourcePayload ?? null });
  const exactStats = Object.keys(diff).length === 0;
  const classification: ReconciliationClassification = exactStats && matchedById
    ? 'exact_match'
    : !exactStats
      ? 'conflicting_statistics'
      : 'probable_match_requires_review';
  const confidence = classification === 'exact_match' ? 1 : classification === 'probable_match_requires_review' ? 0.75 : 0.5;
  const reason = classification === 'exact_match'
    ? 'PlayHQ player ID, fixture metadata and statistics match exactly.'
    : classification === 'conflicting_statistics'
      ? 'Fixture and player matched, but one or more statistics differ from PlayHQ.'
      : 'Fixture and statistics matched, but player identity did not match by PlayHQ player ID, so approval must be manual.';

  return {
    legacyMatchStatId: legacy.id,
    playerId: legacy.player_id,
    classification,
    reviewStatus: 'pending',
    confidence,
    reviewReason: reason,
    sourceUrl: fixture.sourceUrl ?? null,
    fetchedAt: fixture.fetchedAt ?? null,
    playhqGameId: fixture.gameId,
    playhqFixtureId: fixture.fixtureId ?? null,
    playhqRoundNumber: fixture.roundNumber ?? null,
    playhqRoundName: fixture.roundName ?? null,
    opponent: fixture.opponent ?? legacy.opponent,
    matchDate: dateOnly(fixture.matchDate) ?? dateOnly(legacy.match_date),
    sourceHash,
    legacySnapshot: legacy as unknown as Record<string, unknown>,
    playhqSnapshot: playhq as unknown as Record<string, unknown>,
    diff,
    predictedPlayerTotalDelta: Object.values(diff).reduce((total, item) => total + (item.playhq - item.legacy), 0),
    predictedFantasyScoreDelta: fantasyScoreDelta(diff),
  };
}

export function summariseReconciliation(rows: ReconciliationRow[]) {
  const byClassification = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.classification] = (acc[row.classification] ?? 0) + 1;
    return acc;
  }, {});
  return {
    total: rows.length,
    exact: byClassification.exact_match ?? 0,
    requiresReview: rows.filter((row) => row.classification !== 'exact_match').length,
    rejected: byClassification.rejected ?? 0,
    byClassification,
    predictedPlayerTotalDelta: rows.reduce((total, row) => total + row.predictedPlayerTotalDelta, 0),
    predictedFantasyScoreDelta: rows.reduce((total, row) => total + row.predictedFantasyScoreDelta, 0),
  };
}

export function buildMigrationPreview(runId: string, rows: ReconciliationRow[]) {
  const exactRows = rows.filter((row) => row.classification === 'exact_match');
  const ids = exactRows.map((row) => `'${row.legacyMatchStatId.replace(/'/g, "''")}'`).join(', ');
  if (!ids) {
    return {
      sql: '-- No deterministic exact matches are available for bulk reassignment.',
      rollbackSql: '-- No rollback required because no rows are proposed for reassignment.',
    };
  }
  return {
    sql: `-- Review-only proposal generated from fantasy_historical_reconciliation_runs.id = '${runId}'.\n-- Apply only after committee approval.\nUPDATE fantasy_match_stats ms\nSET season_id = r.target_season_id,\n    playhq_game_id = r.playhq_game_id,\n    playhq_fixture_id = r.playhq_fixture_id,\n    playhq_round_number = r.playhq_round_number,\n    playhq_round_name = r.playhq_round_name,\n    source_hash = r.source_hash,\n    source_updated_at = r.fetched_at\nFROM fantasy_historical_reconciliation_rows r\nWHERE r.legacy_match_stat_id = ms.id\n  AND r.review_status = 'approved'\n  AND r.classification = 'exact_match'\n  AND r.run_id = '${runId}'\n  AND ms.id IN (${ids});`,
    rollbackSql: `-- Rollback exact-match reassignment for run '${runId}'.\nUPDATE fantasy_match_stats ms\nSET season_id = (SELECT id FROM fantasy_seasons WHERE slug = 'legacy-unverified'),\n    playhq_game_id = NULL,\n    playhq_fixture_id = NULL,\n    playhq_round_number = NULL,\n    playhq_round_name = NULL,\n    source_hash = NULL,\n    source_updated_at = NULL\nWHERE ms.id IN (${ids});`,
  };
}

export function toCsv(rows: ReconciliationRow[]) {
  const headers = ['legacy_match_stat_id','player_id','classification','review_status','confidence','review_reason','match_date','opponent','playhq_game_id','playhq_fixture_id','playhq_round_number','source_hash','predicted_player_total_delta','predicted_fantasy_score_delta'];
  const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return [headers.join(','), ...rows.map((row) => headers.map((header) => escape((row as unknown as Record<string, unknown>)[header] ?? (row as unknown as Record<string, unknown>)[header.replace(/_([a-z])/g, (_, c) => c.toUpperCase())])).join(','))].join('\n');
}
