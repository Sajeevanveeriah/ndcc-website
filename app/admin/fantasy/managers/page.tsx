'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Badge from '@/components/ui/Badge';
import Card, { CardContent } from '@/components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { adminFetch, parseApiResponse } from '@/lib/admin-client';
import { Users } from 'lucide-react';

type ManagerRow = {
  id: string;
  displayName: string;
  teamName: string;
  registeredAt: string | null;
  squad: {
    status: string;
    roundName: string;
    budgetUsed: number;
    playerCount: number;
    starterCount: number;
    captain: string | null;
    viceCaptain: string | null;
    updatedAt: string | null;
  } | null;
};

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function squadStatusVariant(status: string) {
  if (status === 'submitted') return 'success' as const;
  if (status === 'locked') return 'info' as const;
  return 'warning' as const;
}

export default function AdminFantasyManagersPage() {
  const [managers, setManagers] = useState<ManagerRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetch('/api/admin/fantasy/managers')
      .then((response) => parseApiResponse<{ managers: ManagerRow[] }>(response))
      .then((result) => setManagers(result.managers))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load fantasy managers.'))
      .finally(() => setLoading(false));
  }, []);

  const query = search.trim().toLowerCase();
  const visible = query
    ? managers.filter((manager) => manager.displayName.toLowerCase().includes(query) || manager.teamName.toLowerCase().includes(query))
    : managers;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-content-primary flex items-center gap-2">
          <Users className="h-6 w-6 text-maroon-700 dark:text-maroon-200" aria-hidden="true" />
          Manager Review
        </h1>
        <p className="text-content-muted font-body mt-1">
          Registered fantasy managers with their latest squad status, budget, and captaincy picks. Read-only.
        </p>
      </div>

      {error && <p className="mb-4 text-sm text-red-600 font-body">{error}</p>}

      <div className="mb-4 max-w-sm">
        <label htmlFor="manager-search" className="sr-only">Search managers</label>
        <input
          id="manager-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by manager or team name…"
          className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-maroon-500 focus:outline-none focus:ring-2 focus:ring-maroon-200"
        />
      </div>

      {loading ? (
        <Card><CardContent className="p-6 font-body text-content-muted">Loading fantasy managers…</CardContent></Card>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="p-6 font-body text-content-secondary">
            {managers.length === 0 ? 'No fantasy managers are registered yet.' : 'No managers match the current search.'}
          </CardContent>
        </Card>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Manager</TableHeader>
              <TableHeader>Team</TableHeader>
              <TableHeader>Squad status</TableHeader>
              <TableHeader>Round</TableHeader>
              <TableHeader>Players</TableHeader>
              <TableHeader>Budget</TableHeader>
              <TableHeader>Captain / Vice</TableHeader>
              <TableHeader>Last updated</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {visible.map((manager) => (
              <TableRow key={manager.id}>
                <TableCell className="font-medium">{manager.displayName}</TableCell>
                <TableCell>{manager.teamName}</TableCell>
                <TableCell>
                  {manager.squad ? <Badge variant={squadStatusVariant(manager.squad.status)}>{manager.squad.status}</Badge> : <Badge variant="warning">no squad</Badge>}
                </TableCell>
                <TableCell>{manager.squad?.roundName ?? '—'}</TableCell>
                <TableCell>{manager.squad ? `${manager.squad.playerCount} (${manager.squad.starterCount} starters)` : '—'}</TableCell>
                <TableCell>{manager.squad ? manager.squad.budgetUsed.toFixed(1) : '—'}</TableCell>
                <TableCell>{manager.squad ? `${manager.squad.captain ?? '—'} / ${manager.squad.viceCaptain ?? '—'}` : '—'}</TableCell>
                <TableCell>{formatDate(manager.squad?.updatedAt ?? manager.registeredAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <p className="mt-6 font-body text-sm text-content-muted">
        Manager round scores are calculated on the <Link href="/admin/fantasy/scores" className="text-maroon-700 dark:text-maroon-200 underline">Manager Scores</Link> page.
      </p>
    </div>
  );
}
