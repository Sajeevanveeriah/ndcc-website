/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Card, { CardContent } from '@/components/ui/Card';
import { Select } from '@/components/ui/Input';
import { fantasyJsonFetch } from '@/lib/fantasy-browser';
import { useSeasonParam } from './useSeasonParam';

export default function TransfersClient() {
  const { season, query } = useSeasonParam();
  const [data, setData] = useState<any>(null); const [outId, setOutId] = useState(''); const [inId, setInId] = useState(''); const [feedback, setFeedback] = useState<string | null>(null); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(true);
  const load = () => fantasyJsonFetch<any>(`/api/fantasy/transfers${query}`).then(setData).catch((err) => setError(err.message)).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setLoading(true); load(); }, [query]);
  if (loading) return <Card><CardContent className="p-6"><p className="font-body text-content-secondary">Loading transfer options…</p></CardContent></Card>;
  if (error?.includes('sign in')) return <Card><CardContent className="p-6"><p className="mb-4 font-body">Sign in to make transfers.</p><Link className="btn-primary" href="/fantasy/login">Sign in</Link></CardContent></Card>;
  if (error?.includes('manager profile')) return <Card><CardContent className="p-6"><p className="mb-4 font-body">You are signed in, but you need a fantasy manager profile before making transfers.</p><Link className="btn-primary" href="/fantasy/account">Create your fantasy manager profile</Link></CardContent></Card>;
  const squadPlayers = data?.squad?.fantasy_squad_players ?? [];
  const playerOptions = (data?.players ?? []).filter((player: any) => player.published_at).map((player: any) => ({ value: player.id, label: `${player.display_name} (${Number(player.price_dino_dollars).toLocaleString('en-AU')} Dino Dollars)` }));
  const squadOptions = squadPlayers.map((item: any) => ({ value: item.player_id, label: `${item.fantasy_players?.display_name || 'Player'} (${item.slot_key})` }));
  const transfer = async () => { setError(null); setFeedback(null); try { await fantasyJsonFetch<any>('/api/fantasy/transfers', { method: 'POST', body: JSON.stringify({ playerOutId: outId, playerInId: inId, season: season || undefined }) }); setFeedback('Free transfer saved with zero points penalty.'); setOutId(''); setInId(''); load(); } catch (err) { setError(err instanceof Error ? err.message : 'Could not save transfer.'); } };
  return <div className="space-y-6"><Card><CardContent className="p-6 space-y-4"><p className="font-body text-content-secondary">Transfers are unlimited and free. The window is Monday 09:00 inclusive to Saturday 11:00 exclusive in Australia/Melbourne time.</p><p role="status" className={`font-semibold ${data?.windowOpen ? 'text-green-700' : 'text-amber-800'}`}>{data?.windowOpen ? 'Transfer window is open.' : 'Transfer window is closed.'}</p>{data && squadPlayers.length === 0 && <p className="font-body text-content-secondary">You have not submitted a squad yet, so there is nothing to transfer. <Link className="text-maroon-700 dark:text-maroon-200 font-semibold hover:underline" href="/fantasy/squad">Build your squad first</Link>.</p>}<div className="grid grid-cols-1 md:grid-cols-2 gap-4"><Select id="playerOut" label="Player out" value={outId} onChange={(e) => setOutId(e.target.value)} options={squadOptions} /><Select id="playerIn" label="Player in" value={inId} onChange={(e) => setInId(e.target.value)} options={playerOptions} /></div>{feedback && <p className="text-green-700 font-body">{feedback}</p>}{error && <p className="text-red-600 font-body">{error}</p>}<Button onClick={transfer} disabled={!data?.windowOpen || !outId || !inId}>Save free transfer</Button></CardContent></Card></div>;
}
