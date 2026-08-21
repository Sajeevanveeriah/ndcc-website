import { NextResponse } from 'next/server';
import { getActivePlayersWithLatestPrices, getFantasySettings } from '@/lib/fantasy-game';
import { resolveRequestSeason } from '@/lib/fantasy-seasons';
import { getDinoCoachSettings, toPublicDinoCoachSettings } from '@/lib/dino-coach/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const season = await resolveRequestSeason(request);
    if (!season) return NextResponse.json({ success: false, error: 'No fantasy season is available.' }, { status: 404 });
    const [settings, dinoSettings, players] = await Promise.all([getFantasySettings(season.id), getDinoCoachSettings(season.id), getActivePlayersWithLatestPrices(season.id)]);
    return NextResponse.json({
      success: true, season,
      settings: { ...settings, ...toPublicDinoCoachSettings(dinoSettings), is_registration_open: dinoSettings.registration_open, is_team_selection_open: dinoSettings.team_selection_open },
      players,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Could not load fantasy players.' }, { status: 500 });
  }
}
