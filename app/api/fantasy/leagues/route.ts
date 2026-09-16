/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { resolveFantasyManagerAuth } from '@/lib/fantasy-manager-auth';
import { createServerClient } from '@/lib/supabase-server';
import { resolveRequestSeason } from '@/lib/fantasy-seasons';
import { getDinoManagerStandings } from '@/lib/dino-coach/standings';

export const dynamic = 'force-dynamic';

function makeCode() {
  return randomBytes(6).toString('hex').slice(0, 8).toUpperCase();
}

async function leagueLeaderboard(leagueId: string, seasonId: string) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('fantasy_league_members')
    .select('manager_id, fantasy_managers(display_name, team_name), fantasy_leagues(id, name, code)')
    .eq('league_id', leagueId);
  if (error) throw new Error(error.message);
  return getDinoManagerStandings(seasonId, {
    // Demo teams may practise privately, but never enter the public standings.
    includeDemo: true,
    members: (data ?? []).map((row: any) => ({
      managerId: row.manager_id,
      displayName: row.fantasy_managers?.display_name || 'Dino Coach manager',
      teamName: row.fantasy_managers?.team_name || 'Team',
    })),
  });
}

export async function GET(request: Request) {
  const { auth, errorMessage, errorStatus } = await resolveFantasyManagerAuth(request);
  if (!auth) return NextResponse.json({ success: false, error: errorMessage }, { status: errorStatus });
  const season = await resolveRequestSeason(request);
  if (!season) return NextResponse.json({ success: false, error: 'No fantasy season is available.' }, { status: 404 });
  const supabase = createServerClient();
  const { data: memberships, error } = await supabase
    .from('fantasy_league_members')
    .select('league_id, fantasy_leagues!inner(id, name, code, is_public, created_by_manager_id, season_id)')
    .eq('manager_id', auth.manager.id)
    .eq('fantasy_leagues.season_id', season.id)
    .order('joined_at', { ascending: false });
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  try {
    const leagues = await Promise.all((memberships ?? []).map(async (item: any) => ({ ...item.fantasy_leagues, leaderboard: await leagueLeaderboard(item.league_id, season.id) })));
    return NextResponse.json({ success: true, season, leagues });
  } catch (error) {
    console.error('[fantasy/leagues] Failed to load standings:', error);
    return NextResponse.json({ success: false, error: 'Failed to load league standings.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const { auth, errorMessage, errorStatus } = await resolveFantasyManagerAuth(request);
  if (!auth) return NextResponse.json({ success: false, error: errorMessage }, { status: errorStatus });
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || 'create');
  const season = await resolveRequestSeason(request, body);
  if (!season) return NextResponse.json({ success: false, error: 'No fantasy season is available.' }, { status: 404 });
  const supabase = createServerClient();

  if (action === 'join') {
    const code = String(body.code || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(code)) return NextResponse.json({ success: false, error: 'Enter a valid league code.' }, { status: 400 });
    const { data: league, error: leagueError } = await supabase.from('fantasy_leagues').select('id').eq('code', code).eq('season_id', season.id).maybeSingle();
    if (leagueError || !league) return NextResponse.json({ success: false, error: leagueError?.message || 'League code was not found.' }, { status: 404 });
    const { error } = await supabase.from('fantasy_league_members').upsert({ league_id: league.id, manager_id: auth.manager.id }, { onConflict: 'league_id,manager_id' });
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (action === 'leave') {
    const leagueId = String(body.leagueId || '').trim();
    if (!leagueId) return NextResponse.json({ success: false, error: 'A league is required to leave.' }, { status: 400 });
    const { error } = await supabase
      .from('fantasy_league_members')
      .delete()
      .eq('league_id', leagueId)
      .eq('manager_id', auth.manager.id);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  const name = String(body.name || '').trim().replace(/\s+/g, ' ');
  if (!name || name.length > 80) return NextResponse.json({ success: false, error: 'League name is required and must be 80 characters or fewer.' }, { status: 400 });
  let league = null as any;
  let lastError = null as any;
  for (let attempt = 0; attempt < 5 && !league; attempt += 1) {
    const { data, error } = await supabase.from('fantasy_leagues').insert({ name, code: makeCode(), season_id: season.id, created_by_manager_id: auth.manager.id, is_public: false }).select('id, name, code').single();
    if (!error) league = data;
    lastError = error;
  }
  if (!league) return NextResponse.json({ success: false, error: lastError?.message || 'Could not create league code.' }, { status: 500 });
  const { error: memberError } = await supabase.from('fantasy_league_members').insert({ league_id: league.id, manager_id: auth.manager.id });
  if (memberError) return NextResponse.json({ success: false, error: memberError.message }, { status: 500 });
  return NextResponse.json({ success: true, league });
}
