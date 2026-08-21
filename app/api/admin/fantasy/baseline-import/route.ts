import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guard';
import { toCsv } from '@/lib/csv';
import {
  BASELINE_IMPORT_COLUMNS,
  buildDinoBaselineImportPreview,
  type DinoBaselineRosterPlayer,
} from '@/lib/dino-coach/baseline-import';
import { getDinoReleaseReadiness } from '@/lib/dino-coach/server';
import { createServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
const MAX_CSV_BYTES = 500_000;
const noStore = { 'Cache-Control': 'no-store', Vary: 'Cookie' } as const;

type BaselineRequest = {
  action?: 'preview' | 'apply';
  csvText?: string;
  filename?: string;
  sourceUrl?: string;
  sourceSeasonLabel?: string;
  sourceType?: 'committee_playhq_export' | 'committee_manual_baseline';
};

function forbidden() {
  return NextResponse.json({ success: false, error: 'Admin sign in is required.' }, { status: 403, headers: noStore });
}

function parseSourceUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString().slice(0, 500) : false;
  } catch { return false; }
}

async function loadCurrentRoster() {
  const supabase = createServerClient();
  const seasonResult = await supabase.from('fantasy_seasons').select('id,name').eq('is_current', true).single();
  if (seasonResult.error || !seasonResult.data) throw new Error(seasonResult.error?.message || 'Current Dino Coach season is missing.');
  const rosterResult = await supabase.from('fantasy_season_players')
    .select('player_id,playhq_player_id,fantasy_players(display_name,playhq_player_id,is_international)')
    .eq('season_id', seasonResult.data.id).eq('active', true).eq('selectable', true)
    .order('player_id');
  if (rosterResult.error) throw new Error(rosterResult.error.message);
  const roster = (rosterResult.data ?? []).map((row) => {
    const relation = Array.isArray(row.fantasy_players) ? row.fantasy_players[0] : row.fantasy_players;
    return {
      id: row.player_id,
      displayName: relation?.display_name ?? 'Unknown player',
      playhqPlayerId: row.playhq_player_id || relation?.playhq_player_id || null,
      isInternational: Boolean(relation?.is_international),
    } satisfies DinoBaselineRosterPlayer;
  }).sort((a, b) => a.displayName.localeCompare(b.displayName));
  return { supabase, season: seasonResult.data, roster };
}

export async function GET(request: Request) {
  const user = await requirePermission('fantasy.review');
  if (!user) return forbidden();
  try {
    const { season, roster } = await loadCurrentRoster();
    if (new URL(request.url).searchParams.get('template') === '1') {
      const csv = toCsv([
        [...BASELINE_IMPORT_COLUMNS],
        ...roster.map((player) => [
          player.displayName,
          player.playhqPlayerId ?? '',
          '',
          0,
          0,
          '',
        ]),
      ]);
      return new NextResponse(csv, { headers: {
        ...noStore,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="dino-coach-baseline-template.csv"',
      } });
    }
    return NextResponse.json({ success: true, season, rosterCount: roster.length }, { headers: noStore });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Baseline import could not be loaded.' }, { status: 500, headers: noStore });
  }
}

export async function POST(request: Request) {
  const user = await requirePermission('fantasy.review');
  if (!user) return forbidden();
  let body: BaselineRequest;
  try { body = await request.json(); }
  catch { return NextResponse.json({ success: false, error: 'Invalid JSON payload.' }, { status: 400, headers: noStore }); }

  const csvText = typeof body.csvText === 'string' ? body.csvText : '';
  if (new TextEncoder().encode(csvText).length > MAX_CSV_BYTES) {
    return NextResponse.json({ success: false, error: 'Baseline CSV is too large.' }, { status: 400, headers: noStore });
  }

  try {
    const { supabase, season, roster } = await loadCurrentRoster();
    const preview = buildDinoBaselineImportPreview(csvText, roster);
    if (body.action !== 'apply') return NextResponse.json({ success: true, preview, rosterCount: roster.length }, { headers: noStore });

    if (preview.errors.length || preview.summary.errorRows || preview.summary.missingPlayers || preview.summary.validRows !== roster.length) {
      return NextResponse.json({ success: false, error: 'Every selectable player needs one valid, evidence-backed final outcome before this baseline can be applied.', preview }, { status: 400, headers: noStore });
    }
    const sourceSeasonLabel = String(body.sourceSeasonLabel || '').trim().slice(0, 120);
    if (!sourceSeasonLabel) return NextResponse.json({ success: false, error: 'Source season is required.' }, { status: 400, headers: noStore });
    const sourceUrl = parseSourceUrl(body.sourceUrl);
    if (sourceUrl === false) return NextResponse.json({ success: false, error: 'Source URL must be a valid http(s) address.' }, { status: 400, headers: noStore });
    const sourceType = body.sourceType === 'committee_manual_baseline' ? body.sourceType : 'committee_playhq_export';
    const filename = typeof body.filename === 'string' && body.filename.trim() ? body.filename.trim().slice(0, 255) : null;
    const fileHash = createHash('sha256').update(csvText, 'utf8').digest('hex');

    const batchResult = await supabase.from('fantasy_baseline_import_batches').insert({
      target_season_id: season.id,
      source_season_label: sourceSeasonLabel,
      source_type: sourceType,
      filename,
      source_url: sourceUrl,
      source_file_sha256: fileHash,
      status: 'draft',
      row_count: preview.rows.length,
      created_by: user.email,
      evidence: { roster_count: roster.length, validation: preview.summary },
    }).select('id').single();
    if (batchResult.error || !batchResult.data) throw new Error(batchResult.error?.message || 'Baseline import batch could not be created.');

    const rowsResult = await supabase.from('fantasy_baseline_import_rows').insert(preview.rows.map((row) => ({
      batch_id: batchResult.data.id,
      player_id: row.playerId,
      submitted_player_name: row.submittedPlayerName,
      playhq_player_id: row.playhqPlayerId,
      source_status: row.sourceStatus,
      appearances: row.appearances,
      role_neutral_points: row.roleNeutralPoints,
      prior_average_points: row.priorAveragePoints,
      source_reference: row.sourceReference,
      identity_decision: row.identityDecision,
      calculation: { source_file_sha256: fileHash, row_number: row.rowNumber },
    })));
    if (rowsResult.error) {
      await supabase.from('fantasy_baseline_import_batches').update({ status: 'rejected', evidence: { error: rowsResult.error.message, validation: preview.summary } }).eq('id', batchResult.data.id);
      throw new Error(rowsResult.error.message);
    }

    const applyResult = await supabase.rpc('publish_dino_coach_baseline_import', { target_batch_id: batchResult.data.id, actor: user.email });
    if (applyResult.error) {
      await supabase.from('fantasy_baseline_import_batches').update({ status: 'rejected', evidence: { error: applyResult.error.message, validation: preview.summary } }).eq('id', batchResult.data.id);
      throw new Error(applyResult.error.message);
    }
    const readiness = await getDinoReleaseReadiness(season.id).catch(() => null);
    return NextResponse.json({ success: true, batchId: batchResult.data.id, result: applyResult.data, readiness }, { headers: noStore });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Baseline import failed.' }, { status: 400, headers: noStore });
  }
}
