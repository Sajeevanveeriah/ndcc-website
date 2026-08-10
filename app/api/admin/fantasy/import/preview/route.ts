import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { buildFantasyImportPreview } from '@/lib/fantasy-scoring';

export const dynamic = 'force-dynamic';

const MAX_CSV_BYTES = 250_000;

type PreviewRequest = {
  csvText?: string;
};

export async function POST(request: Request) {
  const user = await requirePermission('fantasy.imports');
  if (!user) {
    return NextResponse.json({ success: false, error: 'Admin session required.' }, { status: 403 });
  }

  let payload: PreviewRequest;
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

  return NextResponse.json({ success: true, preview });
}
