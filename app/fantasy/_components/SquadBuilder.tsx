/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Card, { CardContent } from '@/components/ui/Card';
import { fantasyJsonFetch } from '@/lib/fantasy-browser';
import { useSeasonParam } from './useSeasonParam';

type Role = 'BAT' | 'AR' | 'WK' | 'BOWL';
type Player = { id: string; display_name: string; team_label: string | null; price_dino_dollars: number; source_status: string; published_at: string | null };
type Slot = { key: string; role: Role; positionType: 'starter' | 'bench'; label: string; order: number };
type Pick = { slotKey: string; playerId: string; assignedRole: Role; positionType: 'starter' | 'bench'; isCaptain: boolean; isViceCaptain: boolean; purchasePriceDinoDollars: number };

function money(value: number) { return `${Math.round(value).toLocaleString('en-AU')} Dino Dollars`; }

export default function SquadBuilder({ readonlyMode = false }: { readonlyMode?: boolean }) {
  const { query } = useSeasonParam();
  const [players, setPlayers] = useState<Player[]>([]); const [slots, setSlots] = useState<Slot[]>([]);
  const [selection, setSelection] = useState<Pick[]>([]); const [settings, setSettings] = useState<any>(null);
  const [search, setSearch] = useState(''); const [sort, setSort] = useState('name'); const [selectedPlayer, setSelectedPlayer] = useState('');
  const [feedback, setFeedback] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);

  useEffect(() => { setLoading(true); fantasyJsonFetch<any>(`/api/fantasy/squad${query}`).then((result) => {
    setPlayers(result.players || []); setSlots(result.slots || []); setSettings(result.settings);
    setSelection((result.squad?.fantasy_squad_players || []).map((item: any) => ({
      slotKey: item.slot_key, playerId: item.player_id, assignedRole: item.assigned_role, positionType: item.position_type,
      isCaptain: item.is_captain, isViceCaptain: item.is_vice_captain, purchasePriceDinoDollars: Number(item.purchase_price_dino_dollars),
    })));
  }).catch((reason) => setError(reason.message)).finally(() => setLoading(false)); }, [query]);

  const selectedIds = useMemo(() => new Set(selection.map((item) => item.playerId)), [selection]);
  const filtered = useMemo(() => players.filter((player) => player.display_name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => sort === 'price-high' ? b.price_dino_dollars - a.price_dino_dollars : sort === 'price-low' ? a.price_dino_dollars - b.price_dino_dollars : a.display_name.localeCompare(b.display_name)), [players, search, sort]);
  const used = selection.reduce((sum, item) => sum + item.purchasePriceDinoDollars, 0);
  const remaining = Number(settings?.budget_dino_dollars || 0) - used;

  const assign = (slot: Slot, playerId: string) => {
    if (readonlyMode || !playerId) return;
    const player = players.find((candidate) => candidate.id === playerId);
    if (!player || !player.published_at || player.price_dino_dollars <= 0) { setError('That player does not yet have a published Dino Dollar price.'); return; }
    setError(''); setSelection((current) => [...current.filter((item) => item.slotKey !== slot.key && item.playerId !== playerId), {
      slotKey: slot.key, playerId, assignedRole: slot.role, positionType: slot.positionType,
      isCaptain: false, isViceCaptain: false, purchasePriceDinoDollars: player.price_dino_dollars,
    }]);
    setFeedback(`${player.display_name} assigned to ${slot.label}.`);
  };
  const mark = (slotKey: string, kind: 'captain' | 'vice') => setSelection((current) => current.map((item) => ({ ...item,
    isCaptain: kind === 'captain' ? item.slotKey === slotKey : item.isCaptain,
    isViceCaptain: kind === 'vice' ? item.slotKey === slotKey : item.isViceCaptain,
  })));
  const save = async (mode: 'draft' | 'submit') => { setSaving(true); setError(''); try {
    await fantasyJsonFetch('/api/fantasy/squad', { method: 'POST', body: JSON.stringify({ selection, mode }) });
    setFeedback(mode === 'draft' ? 'Dino Coach draft saved.' : 'Dino Coach squad submitted.');
  } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save squad.'); } finally { setSaving(false); } };

  if (loading) return <Card><CardContent className="p-6"><p role="status">Loading Dino Coach squad builder...</p></CardContent></Card>;
  if (/sign in/i.test(error)) return <Card><CardContent className="p-6"><p className="mb-4">Sign in to manage your Dino Coach squad.</p><Link href="/fantasy/login" className="btn-primary">Sign in</Link></CardContent></Card>;
  return <div className="space-y-6">
    <Card><CardContent className="p-5"><div className="grid gap-4 sm:grid-cols-3 font-body"><div><strong>Squad</strong><br />{selection.length}/15</div><div><strong>Budget remaining</strong><br /><span className={remaining < 0 ? 'text-red-700' : ''}>{money(remaining)}</span></div><div><strong>Captain / vice</strong><br />{selection.some((p) => p.isCaptain) ? 'Captain set' : 'Needed'} / {selection.some((p) => p.isViceCaptain) ? 'Vice set' : 'Needed'}</div></div><p className="mt-4 text-sm text-content-muted">Any real NDCC player can fill any fantasy slot. The slot controls scoring. The playing XI scores; the bench scores zero.</p></CardContent></Card>
    {!settings?.team_selection_open && <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950" role="status"><strong>Team selection is closed.</strong> The committee will open it only after every player identity and price passes release checks.</div>}
    <Card><CardContent className="p-5"><h2 className="text-xl font-display font-bold mb-4">Player catalogue</h2><div className="grid gap-3 md:grid-cols-[1fr_12rem] mb-4"><label className="font-body text-sm">Search by player name<input className="form-input mt-1 w-full" type="search" value={search} onChange={(e) => setSearch(e.target.value)} /></label><label className="font-body text-sm">Sort<select className="form-input mt-1 w-full" value={sort} onChange={(e) => setSort(e.target.value)}><option value="name">Name</option><option value="price-high">Price: high to low</option><option value="price-low">Price: low to high</option></select></label></div><label className="font-body text-sm">Player for keyboard/touch assignment<select className="form-input mt-1 w-full" value={selectedPlayer} onChange={(e) => setSelectedPlayer(e.target.value)}><option value="">Choose a player</option>{filtered.map((player) => <option key={player.id} value={player.id} disabled={selectedIds.has(player.id) || !player.published_at}>{player.display_name} - {player.published_at ? money(player.price_dino_dollars) : 'price awaiting publication'}</option>)}</select></label><div className="mt-4 max-h-64 overflow-y-auto rounded-lg border"><ul className="divide-y">{filtered.map((player) => <li key={player.id} draggable={!readonlyMode && Boolean(player.published_at)} onDragStart={(event) => event.dataTransfer.setData('text/player-id', player.id)} className="flex items-center justify-between gap-3 p-3"><span><strong>{player.display_name}</strong><span className="block text-xs text-content-muted">{player.team_label || 'NDCC'}</span></span><span className="text-sm text-right">{player.published_at ? money(player.price_dino_dollars) : 'Awaiting verified price'}</span></li>)}</ul></div></CardContent></Card>
    <div aria-live="polite" className="min-h-6 text-sm font-body">{error ? <span className="text-red-700">{error}</span> : <span className="text-green-700">{feedback}</span>}</div>
    <section aria-labelledby="xi-title"><h2 id="xi-title" className="section-title">Playing XI</h2><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{slots.filter((s) => s.positionType === 'starter').map((slot) => <SlotBox key={slot.key} slot={slot} pick={selection.find((p) => p.slotKey === slot.key)} players={players} selectedPlayer={selectedPlayer} readonlyMode={readonlyMode} onAssign={assign} onRemove={() => setSelection((items) => items.filter((p) => p.slotKey !== slot.key))} onCaptain={() => mark(slot.key, 'captain')} onVice={() => mark(slot.key, 'vice')} />)}</div></section>
    <section aria-labelledby="bench-title"><h2 id="bench-title" className="section-title">Bench - zero points</h2><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{slots.filter((s) => s.positionType === 'bench').map((slot) => <SlotBox key={slot.key} slot={slot} pick={selection.find((p) => p.slotKey === slot.key)} players={players} selectedPlayer={selectedPlayer} readonlyMode={readonlyMode} onAssign={assign} onRemove={() => setSelection((items) => items.filter((p) => p.slotKey !== slot.key))} />)}</div></section>
    {!readonlyMode && <div className="flex flex-wrap gap-3"><Button onClick={() => save('submit')} disabled={saving || !settings?.team_selection_open}>Submit squad</Button><Button variant="secondary" onClick={() => save('draft')} disabled={saving || !settings?.team_selection_open}>Save draft</Button></div>}
  </div>;
}

function SlotBox({ slot, pick, players, selectedPlayer, readonlyMode, onAssign, onRemove, onCaptain, onVice }: { slot: Slot; pick?: Pick; players: Player[]; selectedPlayer: string; readonlyMode: boolean; onAssign: (slot: Slot, playerId: string) => void; onRemove: () => void; onCaptain?: () => void; onVice?: () => void }) {
  const player = players.find((candidate) => candidate.id === pick?.playerId);
  return <Card><CardContent className="p-4 min-h-44"><div onDragOver={(e) => e.preventDefault()} onDrop={(e) => onAssign(slot, e.dataTransfer.getData('text/player-id'))}><p className="text-xs font-bold uppercase tracking-wide text-content-muted">{slot.key}</p><h3 className="font-display text-lg font-bold">{slot.label}</h3>{player ? <div className="mt-3"><p className="font-semibold">{player.display_name}</p><p className="text-sm text-content-muted">{money(pick?.purchasePriceDinoDollars || 0)}</p>{slot.positionType === 'starter' && <div className="mt-3 flex gap-2"><button type="button" className={`rounded px-3 py-2 text-sm ${pick?.isCaptain ? 'bg-maroon-800 text-white' : 'border'}`} onClick={onCaptain} disabled={readonlyMode}>Captain</button><button type="button" className={`rounded px-3 py-2 text-sm ${pick?.isViceCaptain ? 'bg-maroon-800 text-white' : 'border'}`} onClick={onVice} disabled={readonlyMode}>Vice</button></div>}<button type="button" className="mt-3 text-sm font-semibold text-maroon-700 hover:underline" onClick={onRemove} disabled={readonlyMode}>Remove</button></div> : <div className="mt-4"><p className="text-sm text-content-muted">Drop a player here or use the accessible assignment control.</p><button type="button" className="btn-secondary mt-3 w-full" disabled={readonlyMode || !selectedPlayer} onClick={() => onAssign(slot, selectedPlayer)}>Assign selected player</button></div>}</div></CardContent></Card>;
}
