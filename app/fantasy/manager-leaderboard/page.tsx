/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Metadata } from 'next';
import Card, { CardContent } from '@/components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { createServerClient } from '@/lib/supabase-server';
import { isServerSupabaseConfigured } from '@/lib/supabase-server';
import FantasyBackLink from '@/components/fantasy/FantasyBackLink';
import DataLoadErrorCard from '@/components/common/DataLoadErrorCard';
import SeasonSelector from '@/components/fantasy/SeasonSelector';
import { getSeasonPageContext } from '@/lib/fantasy-seasons';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Dino Coach Manager Leaderboard' };

type Row = { managerId: string; displayName: string; teamName: string; totalPoints: number; squadValueDinoDollars: number; rank: number };

async function getRows(seasonId: string | null): Promise<Row[]> {
  if (!isServerSupabaseConfigured() || !seasonId) return [];
  const supabase = createServerClient();
  const { data, error } = await supabase.from('fantasy_manager_round_scores').select('manager_id, total_points, fantasy_managers(display_name, team_name)').eq('season_id', seasonId);
  if (error) throw new Error(error.message);
  const grouped = new Map<string, Omit<Row, 'rank'>>();
  for (const row of data ?? []) {
    const current = grouped.get(row.manager_id) ?? { managerId: row.manager_id, displayName: (row as any).fantasy_managers?.display_name || 'Dino Coach manager', teamName: (row as any).fantasy_managers?.team_name || 'Team', totalPoints: 0, squadValueDinoDollars: 0 };
    current.totalPoints += Number(row.total_points ?? 0);
    grouped.set(row.manager_id, current);
  }
  const { data: squads, error: squadError } = await supabase.from('fantasy_squads').select('id,manager_id,created_at').eq('season_id', seasonId).eq('status', 'submitted').order('created_at', { ascending: false });
  if (squadError) throw new Error(squadError.message);
  const latestSquadByManager = new Map<string, string>();
  for (const squad of squads ?? []) if (!latestSquadByManager.has(squad.manager_id)) latestSquadByManager.set(squad.manager_id, squad.id);
  const squadIds = Array.from(latestSquadByManager.values());
  if (squadIds.length) {
    const [{ data: squadPlayers, error: squadPlayerError }, { data: prices, error: priceError }] = await Promise.all([
      supabase.from('fantasy_squad_players').select('squad_id,player_id').in('squad_id', squadIds),
      supabase.from('fantasy_player_prices').select('player_id,price_dino_dollars,created_at').eq('season_id', seasonId).not('published_at', 'is', null).order('created_at', { ascending: false }),
    ]);
    if (squadPlayerError) throw new Error(squadPlayerError.message);
    if (priceError) throw new Error(priceError.message);
    const latestPrice = new Map<string, number>();
    for (const price of prices ?? []) if (!latestPrice.has(price.player_id)) latestPrice.set(price.player_id, Number(price.price_dino_dollars ?? 0));
    const valueBySquad = new Map<string, number>();
    for (const player of squadPlayers ?? []) valueBySquad.set(player.squad_id, (valueBySquad.get(player.squad_id) ?? 0) + (latestPrice.get(player.player_id) ?? 0));
    for (const [managerId, squadId] of Array.from(latestSquadByManager.entries())) {
      const row = grouped.get(managerId);
      if (row) row.squadValueDinoDollars = valueBySquad.get(squadId) ?? 0;
    }
  }
  return Array.from(grouped.values()).sort((a, b) => b.totalPoints - a.totalPoints || b.squadValueDinoDollars - a.squadValueDinoDollars || a.teamName.localeCompare(b.teamName)).map((row, index) => ({ ...row, rank: index + 1 }));
}

export default async function FantasyManagerLeaderboardPage({ searchParams }: { searchParams?: { season?: string } }) {
  const seasonContext = await getSeasonPageContext(searchParams?.season || null).catch(() => ({ seasons: [], selected: null, options: [] }));
  let rows: Row[] = [];
  let loadFailed = false;
  try {
    rows = await getRows(seasonContext.selected?.id || null);
  } catch (err) {
    console.error('[fantasy/manager-leaderboard] Failed to load manager round scores; showing failure state:', err);
    loadFailed = true;
  }
  return <section className="section-padding"><div className="container-width"><FantasyBackLink /><h1 className="section-title">Dino Coach Manager Leaderboard</h1><p className="font-body text-content-secondary mb-4">Rankings from published Dino Coach round scores and current squad value.</p><div className="mb-6"><SeasonSelector seasons={seasonContext.options} selectedSlug={seasonContext.selected?.slug || ''} /></div>{loadFailed ? <DataLoadErrorCard title="We couldn&rsquo;t load the manager leaderboard" retryHref="/fantasy/manager-leaderboard" backHref="/fantasy" backLabel="Back to Dino Coach" /> : rows.length === 0 ? <Card><CardContent className="p-8 text-center"><h2 className="text-xl font-display font-bold text-content-primary mb-2">No manager scores yet</h2><p className="font-body text-content-secondary">The manager leaderboard appears after the committee publishes round scores.</p></CardContent></Card> : <Table><TableHead><TableRow><TableHeader>Rank</TableHeader><TableHeader>Team</TableHeader><TableHeader>Manager</TableHeader><TableHeader>Total points</TableHeader><TableHeader>Squad value</TableHeader></TableRow></TableHead><TableBody>{rows.map((row)=><TableRow key={row.managerId}><TableCell className="font-bold">{row.rank}</TableCell><TableCell>{row.teamName}</TableCell><TableCell>{row.displayName}</TableCell><TableCell className="font-bold text-maroon-800 dark:text-maroon-200">{row.totalPoints}</TableCell><TableCell>{row.squadValueDinoDollars ? `${row.squadValueDinoDollars.toLocaleString()} Dino Dollars` : 'Not available'}</TableCell></TableRow>)}</TableBody></Table>}</div></section>;
}
