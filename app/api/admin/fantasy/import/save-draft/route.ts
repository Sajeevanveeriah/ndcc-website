import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { buildFantasyImportPreview } from '@/lib/fantasy-scoring';

export const dynamic = 'force-dynamic';

const MAX_CSV_BYTES = 250_000;

type SaveDraftRequest = {
  csvText?: string;
  filename?: string;
  sourceUrl?: string;
};

function parseSourceUrl(value: unknown): { ok: true; url: string | null } | { ok: false } {
  if (typeof value !== 'string' || !value.trim()) return { ok: true, url: null };
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { ok: false };
    return { ok: true, url: parsed.toString().slice(0, 500) };
  } catch {
    return { ok: false };
  }
}

export async function POST(request: Request) {
  const user = await requirePermission('fantasy.imports');
  if (!user) {
    return NextResponse.json({ success: false, error: 'Admin session required.' }, { status: 403 });
  }

  let payload: SaveDraftRequest;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const csvText = typeof payload.csvText === 'string' ? payload.csvText : '';
  if (new TextEncoder().encode(csvText).length > MAX_CSV_BYTES) {
    return NextResponse.json({ success: false, error: 'CSV is too large for the draft importer.' }, { status: 400 });
  }

  const supabase = createServerClient();
  const [playersResult, roundsResult, scoringRulesResult, seasonResult] = await Promise.all([
    supabase.from('fantasy_players').select('id, display_name'),
    supabase.from('fantasy_rounds').select('id, round_number, name, season_id'),
    supabase.from('fantasy_scoring_rules').select('key, points, enabled'),
    supabase.from('fantasy_seasons').select('id').eq('is_current', true).limit(1).maybeSingle(),
  ]);

  const dataError = playersResult.error || roundsResult.error || scoringRulesResult.error;
  if (dataError) {
    return NextResponse.json({ success: false, error: dataError.message }, { status: 500 });
  }

  const preview = buildFantasyImportPreview({
    csvText,
    players: playersResult.data ?? [],
    rounds: roundsResult.data ?? [],
    scoringRules: scoringRulesResult.data ?? [],
  });

  if (preview.errors.length > 0 || preview.summary.rowsParsed === 0 || preview.summary.errorRows > 0) {
    return NextResponse.json({ success: false, error: 'CSV validation must pass before saving a draft import.', preview }, { status: 400 });
  }

  const filename = typeof payload.filename === 'string' && payload.filename.trim()
    ? payload.filename.trim().slice(0, 255)
    : null;

  const sourceUrl = parseSourceUrl(payload.sourceUrl);
  if (!sourceUrl.ok) {
    return NextResponse.json({ success: false, error: 'Source URL must be a valid http(s) address.' }, { status: 400 });
  }

  const seasonByRound = new Map((roundsResult.data ?? []).map((round) => [round.id, round.season_id]));
  const currentSeasonId = seasonResult.data?.id ?? null;
  const rowSeasons = new Set(preview.rows.map((row) => seasonByRound.get(row.roundId as string) ?? currentSeasonId));
  if (rowSeasons.size > 1) {
    return NextResponse.json({ success: false, error: 'CSV rows span multiple fantasy seasons. Import one season at a time.' }, { status: 400 });
  }
  const batchSeasonId = rowSeasons.values().next().value ?? currentSeasonId;
  if (!batchSeasonId) {
    return NextResponse.json({ success: false, error: 'No current fantasy season is configured.' }, { status: 400 });
  }

  const batchResult = await supabase
    .from('fantasy_import_batches')
    .insert({
      filename,
      season_id: batchSeasonId,
      source: 'manual_csv',
      source_url: sourceUrl.url,
      fetched_at: new Date().toISOString(),
      status: 'draft',
      uploaded_by: user.id,
      notes: `Draft CSV import with ${preview.summary.validRows} validated row${preview.summary.validRows === 1 ? '' : 's'}.`,
    })
    .select('id, filename, status, created_at')
    .single();

  if (batchResult.error || !batchResult.data) {
    return NextResponse.json({ success: false, error: batchResult.error?.message || 'Import batch could not be created.' }, { status: 500 });
  }

  const insertRows = preview.rows.map((row) => ({
    import_batch_id: batchResult.data.id,
    season_id: seasonByRound.get(row.roundId as string) ?? batchSeasonId,
    round_id: row.roundId,
    player_id: row.playerId,
    match_date: row.parsed?.match_date,
    opponent: row.parsed?.opponent,
    runs: row.parsed?.runs ?? 0,
    wickets: row.parsed?.wickets ?? 0,
    maidens: row.parsed?.maidens ?? 0,
    catches: row.parsed?.catches ?? 0,
    runouts: row.parsed?.runouts ?? 0,
    stumpings: row.parsed?.stumpings ?? 0,
    ducks: row.parsed?.ducks ?? 0,
    not_out: row.parsed?.not_out ?? false,
    player_of_match: row.parsed?.player_of_match ?? false,
  }));

  const statsResult = await supabase.from('fantasy_match_stats').insert(insertRows).select('id');
  if (statsResult.error) {
    await supabase.from('fantasy_import_batches').delete().eq('id', batchResult.data.id);
    return NextResponse.json({ success: false, error: statsResult.error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    batch: batchResult.data,
    rowsSaved: statsResult.data?.length ?? insertRows.length,
    preview: { summary: preview.summary },
  });
}
