import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { runFantasyOrchestrator } from '@/lib/playhq/fantasy-orchestrator';
import { createServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const noStore = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
} as const;

/**
 * Executes one bounded PlayHQ orchestration pass with an expiring, one-use
 * release capability. This exists for audited release and recovery work when
 * an interactive committee session is unavailable; it cannot alter launch
 * flags and does not expose the token or its digest in the response.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token')?.trim() ?? '';
  if (token.length < 32 || token.length > 256) {
    return NextResponse.json({ success: false, error: 'Unauthorised.' }, { status: 401, headers: noStore });
  }

  const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex');
  const supabase = createServerClient();
  const { data: tokenId, error: tokenError } = await supabase.rpc('consume_fantasy_release_token', {
    p_token_hash: tokenHash,
  });
  if (tokenError) {
    console.error('[Dino Coach release runner] Token consumption failed', tokenError.message);
    return NextResponse.json({ success: false, error: 'Release authorisation failed.' }, { status: 500, headers: noStore });
  }
  if (!tokenId) {
    return NextResponse.json({ success: false, error: 'Unauthorised.' }, { status: 401, headers: noStore });
  }

  try {
    const result = await runFantasyOrchestrator({ invokedBy: `release-token:${tokenId}` });
    return NextResponse.json({ success: true, ...result }, { headers: noStore });
  } catch (error) {
    console.error('[Dino Coach release runner] Orchestration failed', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Orchestration failed.' },
      { status: 500, headers: noStore },
    );
  }
}
