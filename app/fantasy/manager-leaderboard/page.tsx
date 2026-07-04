/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Metadata } from 'next';
import Card, { CardContent } from '@/components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { createServerClient } from '@/lib/supabase-server';
import { isServerSupabaseConfigured } from '@/lib/supabase-server';
import FantasyBackLink from '@/components/fantasy/FantasyBackLink';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Fantasy Manager Leaderboard' };

type Row = { managerId: string; displayName: string; teamName: string; totalPoints: number; transferPenalty: number; totalNetPoints: number; rank: number };

async function getRows(): Promise<Row[]> {
  if (!isServerSupabaseConfigured()) return [];
  const supabase = createServerClient();
  const { data, error } = await supabase.from('fantasy_manager_round_scores').select('manager_id, net_points, total_points, transfer_penalty, fantasy_managers(display_name, team_name)');
  if (error) throw new Error(error.message);
  const grouped = new Map<string, Omit<Row, 'rank'>>();
  for (const row of data ?? []) {
    const current = grouped.get(row.manager_id) ?? { managerId: row.manager_id, displayName: (row as any).fantasy_managers?.display_name || 'Fantasy manager', teamName: (row as any).fantasy_managers?.team_name || 'Team', totalPoints: 0, transferPenalty: 0, totalNetPoints: 0 };
    current.totalPoints += Number(row.total_points ?? 0);
    current.transferPenalty += Number(row.transfer_penalty ?? 0);
    current.totalNetPoints += Number(row.net_points ?? 0);
    grouped.set(row.manager_id, current);
  }
  return Array.from(grouped.values()).sort((a, b) => b.totalNetPoints - a.totalNetPoints).map((row, index) => ({ ...row, rank: index + 1 }));
}

export default async function FantasyManagerLeaderboardPage() {
  let rows: Row[] = [];
  try { rows = await getRows(); } catch { rows = []; }
  return <section className="section-padding"><div className="container-width"><FantasyBackLink /><h1 className="section-title">Manager Leaderboard</h1><p className="font-body text-gray-700 mb-6">Classic fantasy rankings from saved manager round scores only.</p>{rows.length === 0 ? <Card><CardContent className="p-8 text-center"><h2 className="text-xl font-display font-bold text-gray-900 mb-2">No manager scores yet</h2><p className="font-body text-gray-700">The manager leaderboard appears after admins calculate and save round scores.</p></CardContent></Card> : <Table><TableHead><TableRow><TableHeader>Rank</TableHeader><TableHeader>Team</TableHeader><TableHeader>Manager</TableHeader><TableHeader>Total points</TableHeader><TableHeader>Transfer penalties</TableHeader><TableHeader>Net points</TableHeader></TableRow></TableHead><TableBody>{rows.map((row)=><TableRow key={row.managerId}><TableCell className="font-bold">{row.rank}</TableCell><TableCell>{row.teamName}</TableCell><TableCell>{row.displayName}</TableCell><TableCell>{row.totalPoints}</TableCell><TableCell>{row.transferPenalty}</TableCell><TableCell className="font-bold text-maroon-800">{row.totalNetPoints}</TableCell></TableRow>)}</TableBody></Table>}</div></section>;
}
