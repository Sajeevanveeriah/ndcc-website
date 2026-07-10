import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/guard';
import { FANTASY_ADMIN_ROLES } from '@/lib/auth/config';
import { getPlayHQPublicData } from '@/lib/playhq/client';
import { getPlayHQConfig, redactedPlayHQConfig } from '@/lib/playhq/config';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireSession(FANTASY_ADMIN_ROLES);
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403, headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' } });

  const config = getPlayHQConfig();
  const safeConfig = redactedPlayHQConfig(config);
  if (!config.configured) {
    return NextResponse.json({ success: true, config: safeConfig, canFetchSeasons: false, selectedSeasonId: null, gradeCount: 0, fixtureCount: 0, ladderCount: 0, lastError: 'PlayHQ environment variables are not fully configured.' }, { headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' } });
  }

  const data = await getPlayHQPublicData();
  return NextResponse.json({
    success: !data.error,
    config: safeConfig,
    canFetchSeasons: data.seasons.length > 0,
    selectedSeasonId: data.selectedSeasonId,
    gradeCount: data.grades.length,
    fixtureCount: data.fixtures.length,
    ladderCount: data.ladders.length,
    lastError: data.error || null,
  }, { headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' } });
}
