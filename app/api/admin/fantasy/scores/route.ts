/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { ScoringInputError, calculateRound, saveRoundScores } from '@/lib/dino-coach/round-scores';
import { resolveSeason } from '@/lib/fantasy-seasons';
import { revalidateDinoPublicCache } from '@/lib/server/revalidate-public';

export const dynamic = 'force-dynamic';

function seasonSelector(request: Request, body?: { season?: unknown; seasonId?: unknown }) {
  const url = new URL(request.url);
  const fromBody = [body?.seasonId, body?.season].find((value) => typeof value === 'string' && value.trim());
  return (fromBody as string | undefined) || url.searchParams.get('seasonId') || url.searchParams.get('season');
}

function scoringErrorResponse(error: unknown, fallback: string) {
  if (error instanceof ScoringInputError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  console.error('[admin-fantasy-scores]', error instanceof Error ? error.message : error);
  return NextResponse.json({ success: false, error: fallback }, { status: 500 });
}

export async function GET(request: Request) {
  const user = await requirePermission('fantasy.home');
  if (!user) return NextResponse.json({ success: false, error: 'Admin sign in is required.' }, { status: 403 });
  try {
    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);
    const roundId = searchParams.get('roundId');
    const season = await resolveSeason(seasonSelector(request), { includeNonPublic: true });
    if (!season) return NextResponse.json({ success: true, season: null, rounds: [], preview: [], warning: 'No Dino Coach season is configured.' });
    const { data: rounds, error } = await supabase.from('fantasy_rounds').select('id, round_number, name, season_id').eq('season_id', season.id).order('round_number');
    if (error) throw new Error(error.message);
    const preview = roundId ? (await calculateRound(roundId, season.id)).rows : [];
    return NextResponse.json({ success: true, season: { id: season.id, name: season.name }, rounds, preview, warning: 'Scores are calculated using the currently enabled fantasy scoring rules and published import batches only.' });
  } catch (error) {
    return scoringErrorResponse(error, 'Could not calculate Dino Coach scores. Please try again.');
  }
}

export async function POST(request: Request) {
  const user = await requirePermission('fantasy.home');
  if (!user) return NextResponse.json({ success: false, error: 'Admin sign in is required.' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const roundId = String(body?.roundId || '');
  if (!roundId) return NextResponse.json({ success: false, error: 'Round is required.' }, { status: 400 });
  try {
    const season = await resolveSeason(seasonSelector(request, body), { includeNonPublic: true });
    if (!season) throw new ScoringInputError('No Dino Coach season is configured.', 404);
    const saved = await saveRoundScores(roundId, season.id);
    revalidateDinoPublicCache();
    return NextResponse.json({ success: true, saved: saved.rows.length, preview: saved.preview });
  } catch (error) {
    return scoringErrorResponse(error, 'Could not save Dino Coach scores. Please try again.');
  }
}
