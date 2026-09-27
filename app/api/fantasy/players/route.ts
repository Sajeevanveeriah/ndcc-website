import { NextResponse } from 'next/server';
import { toPublicDinoCoachSettings } from '@/lib/dino-coach/server';
import { getCachedActivePlayers, getCachedDinoCoachSettings, getCachedFantasySettings, resolveCachedRequestSeason } from '@/lib/server/dino-public-cache';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const season = await resolveCachedRequestSeason(request);
    if (!season) return NextResponse.json({ success: false, error: 'No fantasy season is available.' }, { status: 404 });
    const [settings, dinoSettings, players] = await Promise.all([getCachedFantasySettings(season.id), getCachedDinoCoachSettings(season.id), getCachedActivePlayers(season.id)]);
    return NextResponse.json({
      success: true, season,
      settings: { ...settings, ...toPublicDinoCoachSettings(dinoSettings), is_registration_open: dinoSettings.public_launch_enabled && dinoSettings.registration_open, is_team_selection_open: dinoSettings.public_launch_enabled && dinoSettings.team_selection_open },
      players,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Could not load fantasy players.' }, { status: 500 });
  }
}
