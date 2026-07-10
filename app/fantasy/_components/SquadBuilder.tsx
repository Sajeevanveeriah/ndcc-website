/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Card, { CardContent } from '@/components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { fantasyJsonFetch } from '@/lib/fantasy-browser';
import { useSeasonParam } from './useSeasonParam';
import CarryoverPanel from './CarryoverPanel';

type Player = { id: string; display_name: string; role: 'WK' | 'BAT' | 'AR' | 'BOWL'; team_label: string | null; price_million: number };
type Selection = { playerId: string; positionType: 'starter' | 'bench'; benchOrder: number | null; isCaptain: boolean; isViceCaptain: boolean };

export default function SquadBuilder({ readonlyMode = false }: { readonlyMode?: boolean }) {
  const { season, query } = useSeasonParam();
  const [players, setPlayers] = useState<Player[]>([]);
  const [selection, setSelection] = useState<Selection[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [squadStatus, setSquadStatus] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    fantasyJsonFetch<any>(`/api/fantasy/squad${query}`)
      .then((result) => {
        setPlayers(result.players ?? []);
        setSettings(result.settings);
        setSquadStatus(result.squad?.status ?? null);
        const saved = result.squad?.fantasy_squad_players?.map((item: any) => ({ playerId: item.player_id, positionType: item.position_type, benchOrder: item.bench_order, isCaptain: item.is_captain, isViceCaptain: item.is_vice_captain })) ?? [];
        setSelection(saved);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [query, reloadKey]);

  const selectedIds = useMemo(() => new Set(selection.map((item) => item.playerId)), [selection]);
  const selectedPlayers = selection.map((item) => players.find((player) => player.id === item.playerId)).filter(Boolean) as Player[];
  const budgetUsed = selectedPlayers.reduce((total, player) => total + player.price_million, 0);

  const togglePlayer = (player: Player) => {
    if (readonlyMode) return;
    if (selectedIds.has(player.id)) setSelection((prev) => prev.filter((item) => item.playerId !== player.id));
    else setSelection((prev) => [...prev, { playerId: player.id, positionType: prev.filter((item) => item.positionType === 'starter').length < 11 ? 'starter' : 'bench', benchOrder: null, isCaptain: false, isViceCaptain: false }]);
  };

  const updateSelection = (playerId: string, patch: Partial<Selection>) => setSelection((prev) => prev.map((item) => item.playerId === playerId ? { ...item, ...patch } : item));

  const save = async (mode: 'draft' | 'submit') => {
    setFeedback(null); setError(null); setSaving(true);
    try {
      await fantasyJsonFetch('/api/fantasy/squad', { method: 'POST', body: JSON.stringify({ selection, mode, season: season || undefined }) });
      setSquadStatus(mode === 'draft' ? 'draft' : 'submitted');
      setFeedback(mode === 'draft' ? 'Draft saved. Submit your final squad before the round deadline.' : 'Squad saved and submitted.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save squad.'); }
    finally { setSaving(false); }
  };

  if (loading) return <Card><CardContent className="p-6">Loading fantasy squad tools…</CardContent></Card>;
  if (error && error.includes('sign in')) return <Card><CardContent className="p-6"><p className="font-body text-gray-700 mb-4">Sign in to manage your squad.</p><Link href="/fantasy/login" className="btn-primary">Sign in</Link></CardContent></Card>;
  if (error && error.includes('manager profile')) return <Card><CardContent className="p-6"><p className="font-body text-gray-700 mb-4">You are signed in, but you need a fantasy manager profile before building a squad.</p><Link href="/fantasy/account" className="btn-primary">Create your fantasy manager profile</Link></CardContent></Card>;

  if (readonlyMode && selection.length === 0) return <Card><CardContent className="p-6"><p className="font-body text-gray-700 mb-4">No squad submitted yet. Build and save your 15-player squad to see it here.</p><Link href="/fantasy/squad" className="btn-primary">Build my squad</Link></CardContent></Card>;

  return (
    <div className="space-y-6">
      {!readonlyMode && <CarryoverPanel onApplied={() => setReloadKey((value) => value + 1)} />}
      <Card><CardContent className="p-6"><div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm font-body"><div><strong>Squad</strong><br />{selection.length}/15</div><div><strong>Starters</strong><br />{selection.filter((item) => item.positionType === 'starter').length}/11</div><div><strong>Bench</strong><br />{selection.filter((item) => item.positionType === 'bench').length}/4</div><div><strong>Budget</strong><br />{budgetUsed.toFixed(1)} / {Number(settings?.squad_budget ?? 100).toFixed(1)}</div></div><p className="mt-4 text-sm text-gray-600 font-body">Select exactly 2 WK, 5 BAT, 3 AR and 5 BOWL. Captain and vice-captain must be starters. Bench players need order 1–4.</p></CardContent></Card>
      {feedback && <p className="text-green-700 font-body">{feedback}</p>}{error && <p className="text-red-600 font-body">{error}</p>}
      <Table><TableHead><TableRow><TableHeader>Pick</TableHeader><TableHeader>Player</TableHeader><TableHeader>Role</TableHeader><TableHeader>Price</TableHeader><TableHeader>Position</TableHeader><TableHeader>Captain</TableHeader><TableHeader>Vice</TableHeader><TableHeader>Bench order</TableHeader></TableRow></TableHead><TableBody>{players.map((player) => {
        const item = selection.find((entry) => entry.playerId === player.id);
        return <TableRow key={player.id}><TableCell><input type="checkbox" checked={Boolean(item)} disabled={readonlyMode} onChange={() => togglePlayer(player)} aria-label={`Select ${player.display_name}`} /></TableCell><TableCell className="font-medium">{player.display_name}<div className="text-xs text-gray-500">{player.team_label || 'NDCC'}</div></TableCell><TableCell><Badge>{player.role}</Badge></TableCell><TableCell>{player.price_million.toFixed(1)}</TableCell><TableCell>{item ? <select className="form-input min-w-28" disabled={readonlyMode} value={item.positionType} onChange={(event) => updateSelection(player.id, { positionType: event.target.value as any, benchOrder: event.target.value === 'starter' ? null : item.benchOrder })}><option value="starter">Starter</option><option value="bench">Bench</option></select> : '—'}</TableCell><TableCell>{item ? <input type="radio" name="captain" disabled={readonlyMode} checked={item.isCaptain} onChange={() => setSelection((prev) => prev.map((entry) => ({ ...entry, isCaptain: entry.playerId === player.id })))} /> : '—'}</TableCell><TableCell>{item ? <input type="radio" name="vice" disabled={readonlyMode} checked={item.isViceCaptain} onChange={() => setSelection((prev) => prev.map((entry) => ({ ...entry, isViceCaptain: entry.playerId === player.id })))} /> : '—'}</TableCell><TableCell>{item?.positionType === 'bench' ? <input className="form-input w-20" type="number" min="1" max="4" disabled={readonlyMode} value={item.benchOrder ?? ''} onChange={(event) => updateSelection(player.id, { benchOrder: Number(event.target.value) })} /> : '—'}</TableCell></TableRow>;
      })}</TableBody></Table>
      {!readonlyMode && (
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <Button onClick={() => save('submit')} disabled={saving}>Submit squad</Button>
          <Button variant="secondary" onClick={() => save('draft')} disabled={saving}>Save draft</Button>
          {squadStatus && (
            <span className="font-body text-sm text-gray-600">
              Current status: <strong className={squadStatus === 'submitted' ? 'text-green-700' : 'text-amber-700'}>{squadStatus}</strong>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
