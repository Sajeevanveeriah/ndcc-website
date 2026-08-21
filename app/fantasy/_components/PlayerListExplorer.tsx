'use client';

import { useMemo, useState } from 'react';
import Badge from '@/components/ui/Badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';

export type PlayerListEntry = {
  id: string;
  display_name: string;
  role: string;
  team_label: string | null;
  price_million: number;
  price_dino_dollars: number;
  source_status: string;
  published_at: string | null;
  total_points: number;
  matches_counted: number;
};

type SortKey = 'name' | 'price' | 'points' | 'form';

const SORT_LABELS: Record<SortKey, string> = {
  name: 'Name (A-Z)',
  price: 'Price (high to low)',
  points: 'Total points (high to low)',
  form: 'Points per match (high to low)',
};

function formScore(player: PlayerListEntry) {
  return player.matches_counted > 0 ? player.total_points / player.matches_counted : 0;
}

export default function PlayerListExplorer({ players, hasPublishedPoints }: { players: PlayerListEntry[]; hasPublishedPoints: boolean }) {
  const [search, setSearch] = useState('');
  const [team, setTeam] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');

  const teams = useMemo(
    () => Array.from(new Set(players.map((p) => p.team_label).filter((label): label is string => Boolean(label && label.trim())))).sort(),
    [players],
  );

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = players.filter((player) => {
      if (query && !player.display_name.toLowerCase().includes(query)) return false;
      if (team !== 'all' && (player.team_label || '') !== team) return false;
      return true;
    });
    const sorted = [...filtered];
    if (sortKey === 'name') sorted.sort((a, b) => a.display_name.localeCompare(b.display_name));
    if (sortKey === 'price') sorted.sort((a, b) => b.price_dino_dollars - a.price_dino_dollars || a.display_name.localeCompare(b.display_name));
    if (sortKey === 'points') sorted.sort((a, b) => b.total_points - a.total_points || a.display_name.localeCompare(b.display_name));
    if (sortKey === 'form') sorted.sort((a, b) => formScore(b) - formScore(a) || a.display_name.localeCompare(b.display_name));
    return sorted;
  }, [players, search, team, sortKey]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <label className="block">
          <span className="sr-only">Search players</span>
          <input
            type="search"
            className="form-input w-full"
            placeholder="Search players…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        {teams.length > 0 && (
          <label className="block">
            <span className="sr-only">Filter by team or grade</span>
            <select className="form-input w-full" value={team} onChange={(event) => setTeam(event.target.value)}>
              <option value="all">All teams/grades</option>
              {teams.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
        )}
        <label className="block">
          <span className="sr-only">Sort players</span>
          <select className="form-input w-full" value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
            {(Object.keys(SORT_LABELS) as SortKey[])
              .filter((key) => hasPublishedPoints || (key !== 'points' && key !== 'form'))
              .map((key) => (
                <option key={key} value={key}>Sort: {SORT_LABELS[key]}</option>
              ))}
          </select>
        </label>
      </div>

      <p className="font-body text-sm text-content-muted" role="status">
        Showing {visible.length} of {players.length} players
      </p>

      {visible.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="font-body text-content-secondary">No players match the current search and filters.</p>
        </div>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Player</TableHeader>
              <TableHeader>Team / grade</TableHeader>
              <TableHeader>Price</TableHeader>
              {hasPublishedPoints && <TableHeader>Points</TableHeader>}
            </TableRow>
          </TableHead>
          <TableBody>
            {visible.map((player) => (
              <TableRow key={player.id}>
                <TableCell className="font-medium">{player.display_name}</TableCell>
                <TableCell>{player.team_label || 'NDCC'}</TableCell>
                <TableCell>{player.published_at ? `${player.price_dino_dollars.toLocaleString('en-AU')} Dino Dollars` : <Badge>Awaiting verified price</Badge>}</TableCell>
                {hasPublishedPoints && (
                  <TableCell>
                    {player.matches_counted > 0 ? `${player.total_points} (${player.matches_counted} match${player.matches_counted === 1 ? '' : 'es'})` : '—'}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
