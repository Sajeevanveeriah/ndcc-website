import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { buildFantasyImportPreview } from '@/lib/fantasy-scoring';

const MAX_CSV_BYTES = 250_000;

type SaveDraftRequest = {
  csvText?: string;
  filename?: string;
};

export async function POST(request: Request) {
  const user = await requireSession(['admin', 'president', 'secretary', 'committee']);
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
  const [playersResult, roundsResult, scoringRulesResult] = await Promise.all([
    supabase.from('fantasy_players').select('id, display_name'),
    supabase.from('fantasy_rounds').select('id, round_number, name'),
    supabase.from('fantasy_scoring_rules').select('key, points, enabled'),
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

  const batchResult = await supabase
    .from('fantasy_import_batches')
    .insert({
      filename,
      source: 'manual_csv',
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
    preview: {
      summary: preview.summary,
    },
  });
}
