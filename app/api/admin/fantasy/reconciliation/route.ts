/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { buildMigrationPreview, reconcileLegacyStat, summariseReconciliation, toCsv, type PlayHQCandidateInput } from '@/lib/fantasy-historical-reconciliation';

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store', Vary: 'Cookie' } as const;

function forbidden() {
  return NextResponse.json({ success: false, error: 'Admin sign in is required.' }, { status: 403, headers: noStore });
}

const RUN_COLUMNS = 'id, legacy_season_id, target_season_id, status, stats_row_count, exact_count, review_count, rejected_count, proposed_migration_sql, rollback_sql, notes, created_by, created_at, updated_at';

export async function GET(request: Request) {
  const user = await requirePermission('fantasy.review');
  if (!user) return forbidden();
  const url = new URL(request.url);
  const exportRunId = url.searchParams.get('export');
  const supabase = createServerClient();
  if (exportRunId) {
    const { data: rows, error } = await supabase.from('fantasy_historical_reconciliation_rows').select('*').eq('run_id', exportRunId).order('created_at');
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: noStore });
    return new NextResponse(toCsv((rows || []).map((row: any) => ({
      legacyMatchStatId: row.legacy_match_stat_id,
      playerId: row.player_id,
      classification: row.classification,
      reviewStatus: row.review_status,
      confidence: Number(row.confidence || 0),
      reviewReason: row.review_reason,
      sourceUrl: row.source_url,
      fetchedAt: row.fetched_at,
      playhqGameId: row.playhq_game_id,
      playhqFixtureId: row.playhq_fixture_id,
      playhqRoundNumber: row.playhq_round_number,
      playhqRoundName: row.playhq_round_name,
      opponent: row.opponent,
      matchDate: row.match_date,
      sourceHash: row.source_hash,
      legacySnapshot: row.legacy_snapshot,
      playhqSnapshot: row.playhq_snapshot,
      diff: row.diff,
      predictedPlayerTotalDelta: Number(row.predicted_player_total_delta || 0),
      predictedFantasyScoreDelta: Number(row.predicted_fantasy_score_delta || 0),
    }))), { headers: { ...noStore, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="fantasy-reconciliation-${exportRunId}.csv"` } });
  }
  const { data: runs, error } = await supabase.from('fantasy_historical_reconciliation_runs').select(RUN_COLUMNS).order('created_at', { ascending: false }).limit(20);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: noStore });
  return NextResponse.json({ success: true, runs }, { headers: noStore });
}

export async function POST(request: Request) {
  const user = await requirePermission('fantasy.review');
  if (!user) return forbidden();
  const body = await request.json().catch(() => ({}));
  const targetSeasonId = String(body.targetSeasonId || '').trim();
  if (!targetSeasonId) return NextResponse.json({ success: false, error: 'Choose the reviewed target season before creating a reconciliation run.' }, { status: 400, headers: noStore });
  const playhqCandidates = Array.isArray(body.playhqCandidates) ? body.playhqCandidates as PlayHQCandidateInput[] : [];

  const supabase = createServerClient();
  const { data: legacySeason, error: legacySeasonError } = await supabase.from('fantasy_seasons').select('id').eq('slug', 'legacy-unverified').maybeSingle();
  if (legacySeasonError) return NextResponse.json({ success: false, error: legacySeasonError.message }, { status: 500, headers: noStore });
  if (!legacySeason) return NextResponse.json({ success: false, error: 'Legacy / Unverified season is missing.' }, { status: 400, headers: noStore });

  const { data: stats, error: statsError } = await supabase
    .from('fantasy_match_stats')
    .select('id, player_id, match_date, opponent, round_id, runs, wickets, maidens, catches, runouts, stumpings, ducks, fantasy_players(id, display_name, playhq_player_id), fantasy_rounds(round_number)')
    .eq('season_id', legacySeason.id)
    .is('playhq_game_id', null)
    .order('match_date', { ascending: true });
  if (statsError) return NextResponse.json({ success: false, error: statsError.message }, { status: 500, headers: noStore });

  const { data: run, error: runError } = await supabase.from('fantasy_historical_reconciliation_runs').insert({
    legacy_season_id: legacySeason.id,
    target_season_id: targetSeasonId,
    status: 'draft',
    stats_row_count: stats?.length || 0,
    created_by: user.email,
    notes: 'Read-only reconciliation run. No fantasy_match_stats rows were reassigned.',
  }).select(RUN_COLUMNS).single();
  if (runError) return NextResponse.json({ success: false, error: runError.message }, { status: 500, headers: noStore });

  const rows = (stats || []).map((stat: any) => reconcileLegacyStat({
    id: stat.id,
    player_id: stat.player_id,
    player_name: stat.fantasy_players?.display_name || 'Unknown player',
    match_date: stat.match_date,
    opponent: stat.opponent,
    round_id: stat.round_id,
    round_number: stat.fantasy_rounds?.round_number ?? null,
    runs: stat.runs,
    wickets: stat.wickets,
    maidens: stat.maidens,
    catches: stat.catches,
    runouts: stat.runouts,
    stumpings: stat.stumpings,
    ducks: stat.ducks,
    playhq_player_id: stat.fantasy_players?.playhq_player_id ?? null,
  }, playhqCandidates));
  const summary = summariseReconciliation(rows);
  const preview = buildMigrationPreview(run.id, rows);

  if (rows.length) {
    const insertRows = rows.map((row) => ({
      run_id: run.id,
      legacy_match_stat_id: row.legacyMatchStatId,
      player_id: row.playerId,
      target_season_id: targetSeasonId,
      classification: row.classification,
      review_status: row.reviewStatus,
      confidence: row.confidence,
      review_reason: row.reviewReason,
      source_url: row.sourceUrl,
      fetched_at: row.fetchedAt,
      playhq_game_id: row.playhqGameId,
      playhq_fixture_id: row.playhqFixtureId,
      playhq_round_number: row.playhqRoundNumber,
      playhq_round_name: row.playhqRoundName,
      opponent: row.opponent,
      match_date: row.matchDate,
      source_hash: row.sourceHash,
      legacy_snapshot: row.legacySnapshot,
      playhq_snapshot: row.playhqSnapshot,
      diff: row.diff,
      predicted_player_total_delta: row.predictedPlayerTotalDelta,
      predicted_fantasy_score_delta: row.predictedFantasyScoreDelta,
    }));
    const { error: rowsError } = await supabase.from('fantasy_historical_reconciliation_rows').insert(insertRows);
    if (rowsError) return NextResponse.json({ success: false, error: rowsError.message }, { status: 500, headers: noStore });
  }

  const { error: updateError } = await supabase.from('fantasy_historical_reconciliation_runs').update({
    status: 'ready',
    exact_count: summary.exact,
    review_count: summary.requiresReview,
    rejected_count: summary.rejected,
    proposed_migration_sql: preview.sql,
    rollback_sql: preview.rollbackSql,
  }).eq('id', run.id);
  if (updateError) return NextResponse.json({ success: false, error: updateError.message }, { status: 500, headers: noStore });
  await supabase.from('fantasy_historical_reconciliation_audit').insert({ run_id: run.id, action: 'run_created', actor: user.email, detail: summary });

  return NextResponse.json({ success: true, runId: run.id, summary, migrationPreview: preview }, { headers: noStore });
}
