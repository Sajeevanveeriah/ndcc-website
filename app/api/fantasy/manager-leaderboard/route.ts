/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { createServerClient, isServerSupabaseConfigured } from '@/lib/supabase-server';
import { resolveRequestSeason } from '@/lib/fantasy-seasons';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!isServerSupabaseConfigured()) return NextResponse.json({ success: true, rows: [] });
  const season = await resolveRequestSeason(request);
  if (!season) return NextResponse.json({ success: true, season: null, rows: [] });
  const supabase = createServerClient();
  const { data: scores, error } = await supabase
    .from('fantasy_manager_round_scores')
    .select('manager_id, net_points, total_points, transfer_penalty, fantasy_managers(display_name, team_name)')
    .eq('season_id', season.id);
  if (error) {
    console.error('[fantasy/manager-leaderboard] Failed to load manager round scores:', error.message);
    return NextResponse.json({ success: false, error: 'Failed to load leaderboard.' }, { status: 500 });
  }
  const grouped = new Map<string, any>();
  for (const row of scores ?? []) {
    const current = grouped.get(row.manager_id) ?? {
      managerId: row.manager_id,
      displayName: (row as any).fantasy_managers?.display_name || 'Fantasy manager',
      teamName: (row as any).fantasy_managers?.team_name || 'Team',
      totalPoints: 0,
      transferPenalty: 0,
      totalNetPoints: 0,
    };
    current.totalPoints += Number(row.total_points ?? 0);
    current.transferPenalty += Number(row.transfer_penalty ?? 0);
    current.totalNetPoints += Number(row.net_points ?? 0);
    grouped.set(row.manager_id, current);
  }
  const rows = Array.from(grouped.values()).sort((a, b) => b.totalNetPoints - a.totalNetPoints).map((row, index) => ({ ...row, rank: index + 1 }));
  return NextResponse.json({ success: true, season, rows });
}
