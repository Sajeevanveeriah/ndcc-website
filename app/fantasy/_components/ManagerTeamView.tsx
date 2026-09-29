'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { fantasyJsonFetch } from '@/lib/fantasy-browser';
import { CRICKET_ROLE_LABELS } from '@/lib/dino-coach/season-summary';
import { sharedPlayerIds, type TeamView, type TeamViewPick } from '@/lib/dino-coach/team-view';
import { useSeasonParam } from './useSeasonParam';

type TeamResponse = { team: TeamView; mine: TeamView | null; season: { name: string } };

const ROLE_SHORT: Record<string, string> = { BAT: 'BAT', BOWL: 'BOWL', AR: 'AR', WK: 'WK' };
const number = (value: number) => Math.round(value).toLocaleString('en-AU');
const statValue = (value: number | null | undefined) => (value == null ? '-' : value.toLocaleString('en-AU'));

export default function ManagerTeamView({ managerId }: { managerId: string }) {
  const { query } = useSeasonParam();
  const [data, setData] = useState<TeamResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [compare, setCompare] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    fantasyJsonFetch<TeamResponse>(`/api/fantasy/managers/${encodeURIComponent(managerId)}/team${query}`)
      .then((result) => { if (active) setData(result); })
      .catch((reason) => { if (active) { setData(null); setError(reason instanceof Error ? reason.message : 'Could not load this team.'); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [managerId, query, retry]);

  const shared = useMemo(() => (data?.mine ? sharedPlayerIds(data.team.picks, data.mine.picks) : new Set<string>()), [data]);

  if (loading) return <Card><CardContent className="p-6"><p role="status">Loading team...</p></CardContent></Card>;
  if (/sign in/i.test(error)) return <Card><CardContent className="p-6"><p className="mb-4 font-body">Sign in to view other Dino Coach teams.</p><Link href="/fantasy/login" className="btn-primary">Sign in</Link></CardContent></Card>;
  if (/manager profile/i.test(error)) return <Card><CardContent className="p-6"><p className="mb-4 font-body">You need a Dino Coach manager profile before viewing other teams.</p><Link href="/fantasy/account" className="btn-primary">Create your manager profile</Link></CardContent></Card>;
  if (!data) return <Card><CardContent className="p-6 space-y-4"><p role="alert" className="font-body">{error || 'Could not load this team.'}</p><div className="flex flex-wrap gap-3"><Button variant="secondary" onClick={() => setRetry((value) => value + 1)}>Try again</Button><Link href={`/fantasy/manager-leaderboard${query}`} className="btn-secondary">Back to Manager Standings</Link></div></CardContent></Card>;

  const comparing = compare && data.mine;
  return <div className="space-y-6">
    {data.mine && <div className="flex flex-wrap items-center gap-3">
      <Button variant="secondary" aria-pressed={compare} onClick={() => setCompare((value) => !value)}>
        {compare ? 'Hide comparison' : 'Compare with my team'}
      </Button>
      {compare && <p role="status" className="text-sm font-body text-content-secondary">
        {shared.size === 0 ? 'No players in common.' : `${shared.size} player${shared.size === 1 ? '' : 's'} in common, marked "Also in your team".`}
      </p>}
    </div>}
    <div className={comparing ? 'grid gap-8 lg:grid-cols-2' : ''}>
      <TeamColumn team={data.team} shared={comparing ? shared : null} sharedLabel="Also in your team" wide={!comparing} />
      {comparing && data.mine && <TeamColumn team={data.mine} shared={shared} sharedLabel={`Also in ${data.team.teamName}`} ownTeam wide={false} />}
    </div>
  </div>;
}

function TeamColumn({ team, shared, sharedLabel, ownTeam = false, wide }: { team: TeamView; shared: Set<string> | null; sharedLabel: string; ownTeam?: boolean; wide: boolean }) {
  const starters = team.picks.filter((pick) => pick.positionType === 'starter');
  const bench = team.picks.filter((pick) => pick.positionType === 'bench');
  const grid = wide ? 'grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4' : 'grid gap-3 grid-cols-2 sm:grid-cols-3';
  const headingId = `team-${team.managerId}`;
  return <section aria-labelledby={headingId} className="space-y-5 min-w-0">
    <div className="rounded-2xl border border-maroon-200 dark:border-maroon-800 bg-surface-card p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-content-muted">{ownTeam ? 'Your team' : 'Manager team'}</p>
      <h2 id={headingId} className="mt-1 text-2xl font-display font-bold text-content-primary break-words">{team.teamName}</h2>
      <p className="font-body text-content-secondary">Manager: {team.displayName}</p>
      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-edge-subtle pt-4 text-center">
        <div><dt className="text-xs font-semibold uppercase text-content-muted">Rank</dt><dd className="mt-1 text-xl font-display font-bold">{team.rank ?? '-'}</dd></div>
        <div><dt className="text-xs font-semibold uppercase text-content-muted">Points</dt><dd className="mt-1 text-xl font-display font-bold text-maroon-800 dark:text-maroon-200">{number(team.totalPoints)}</dd></div>
        <div><dt className="text-xs font-semibold uppercase text-content-muted">Value</dt><dd className="mt-1 font-display font-bold">{team.squadValueDinoDollars ? number(team.squadValueDinoDollars) : '-'}<span className="block text-xs font-body font-normal text-content-muted">Dino Dollars</span></dd></div>
      </dl>
    </div>
    <div>
      <h3 className="mb-3 text-lg font-display font-bold">Playing XI</h3>
      {starters.length ? <ul className={grid}>{starters.map((pick) => <li key={pick.slotKey}><PlayerCard pick={pick} shared={shared?.has(pick.playerId) ?? false} sharedLabel={sharedLabel} /></li>)}</ul>
        : <p className="font-body text-content-secondary">No playing XI saved.</p>}
    </div>
    <div>
      <h3 className="mb-3 text-lg font-display font-bold">Bench</h3>
      {bench.length ? <ul className={grid}>{bench.map((pick) => <li key={pick.slotKey}><PlayerCard pick={pick} shared={shared?.has(pick.playerId) ?? false} sharedLabel={sharedLabel} /></li>)}</ul>
        : <p className="font-body text-content-secondary">No bench players saved.</p>}
    </div>
  </section>;
}

function PlayerCard({ pick, shared, sharedLabel }: { pick: TeamViewPick; shared: boolean; sharedLabel: string }) {
  const player = pick.player;
  const role = ROLE_SHORT[pick.assignedRole] || pick.assignedRole;
  const badge = pick.isCaptain ? 'C' : pick.isViceCaptain ? 'VC' : '';
  const badgeLabel = pick.isCaptain ? 'Captain' : pick.isViceCaptain ? 'Vice-captain' : '';
  return <article aria-label={`${pick.displayName}, ${pick.slotLabel}${badgeLabel ? `, ${badgeLabel}` : ''}`}
    className={`relative flex h-full flex-col rounded-xl border bg-surface-card p-3 shadow-sm ${shared ? 'border-maroon-600 ring-2 ring-maroon-600/30 dark:border-maroon-300' : 'border-edge-subtle'}`}>
    <div className="flex items-start justify-between gap-2">
      <span className="rounded bg-maroon-800 px-1.5 py-0.5 text-xs font-bold tracking-wide text-white">{role}</span>
      {badge && <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-maroon-800 px-1.5 text-xs font-bold text-white dark:bg-maroon-200 dark:text-maroon-900" aria-hidden="true">{badge}</span>}
    </div>
    <h4 className="mt-2 font-display text-base font-bold leading-tight break-words">{pick.displayName}</h4>
    <p className="text-xs text-content-muted">{pick.slotLabel}{player && player.role !== pick.assignedRole ? ` - usually ${(CRICKET_ROLE_LABELS[player.role] || player.role).toLowerCase()}` : ''}</p>
    {player?.team_label && <p className="text-xs text-content-muted">{player.team_label}</p>}
    {player ? <div className="mt-2 grid grid-cols-3 gap-1 border-y border-edge-subtle py-2 text-center">
      <div><p className="text-sm font-bold">{statValue(player.stats?.runs)}</p><p className="text-[0.7rem] text-content-muted">Runs</p></div>
      <div><p className="text-sm font-bold">{statValue(player.stats?.wickets)}</p><p className="text-[0.7rem] text-content-muted">Wkts</p></div>
      <div><p className="text-sm font-bold">{statValue(player.stats?.catches)}</p><p className="text-[0.7rem] text-content-muted">Catches</p></div>
    </div> : <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">No longer in this season&apos;s player pool.</p>}
    <dl className="mt-2 space-y-0.5 text-xs">
      <div className="flex justify-between gap-2"><dt className="text-content-muted">Value</dt><dd className="font-semibold">{player?.published_at ? number(player.price_dino_dollars) : '-'}</dd></div>
      <div className="flex justify-between gap-2"><dt className="text-content-muted">Bought for</dt><dd className="font-semibold">{number(pick.purchasePriceDinoDollars)}</dd></div>
    </dl>
    {shared && <p className="mt-2 text-xs font-semibold text-maroon-800 dark:text-maroon-200">{sharedLabel}</p>}
  </article>;
}
