/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Card, { CardContent } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { Select } from '@/components/ui/Input';
import { fantasyJsonFetch } from '@/lib/fantasy-browser';

export default function TransfersClient() {
  const [data, setData] = useState<any>(null); const [outId, setOutId] = useState(''); const [inId, setInId] = useState(''); const [feedback, setFeedback] = useState<string | null>(null); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(true);
  const load = () => fantasyJsonFetch<any>('/api/fantasy/transfers').then(setData).catch((err) => setError(err.message)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);
  if (loading) return <Card><CardContent className="p-6"><p className="font-body text-gray-700">Loading transfer options…</p></CardContent></Card>;
  if (error?.includes('sign in')) return <Card><CardContent className="p-6"><p className="mb-4 font-body">Sign in to make transfers.</p><Link className="btn-primary" href="/fantasy/login">Sign in</Link></CardContent></Card>;
  const squadPlayers = data?.squad?.fantasy_squad_players ?? [];
  const playerOptions = (data?.players ?? []).map((player: any) => ({ value: player.id, label: `${player.display_name} (${player.role}, ${Number(player.price_million).toFixed(1)})` }));
  const squadOptions = squadPlayers.map((item: any) => ({ value: item.player_id, label: `${item.fantasy_players?.display_name || 'Player'} (${item.fantasy_players?.role || ''})` }));
  const recordChip = async (chipType: string) => { setError(null); setFeedback(null); try { await fantasyJsonFetch('/api/fantasy/chips', { method: 'POST', body: JSON.stringify({ chipType }) }); setFeedback(`${chipType.replace('_', ' ')} recorded for this round.`); load(); } catch (err) { setError(err instanceof Error ? err.message : 'Could not record chip.'); } };
  const transfer = async () => { setError(null); setFeedback(null); try { const result = await fantasyJsonFetch<any>('/api/fantasy/transfers', { method: 'POST', body: JSON.stringify({ playerOutId: outId, playerInId: inId }) }); setFeedback(`Transfer saved. Penalty: ${result.penaltyPoints} point${result.penaltyPoints === 1 ? '' : 's'}.`); setOutId(''); setInId(''); load(); } catch (err) { setError(err instanceof Error ? err.message : 'Could not save transfer.'); } };
  return <div className="space-y-6"><Card><CardContent className="p-6 space-y-4"><p className="font-body text-gray-700">Free transfers this round: {data?.settings?.free_transfers_per_round ?? 1}. Extra transfers cost {data?.settings?.transfer_penalty_points ?? 4} points. Wildcard removes transfer penalties for the round. Free Hit is recorded for MVP audit only; temporary squad restoration is not automated.</p>{data && squadPlayers.length === 0 && <p className="font-body text-gray-700">You have not submitted a squad yet, so there is nothing to transfer. <Link className="text-maroon-700 font-semibold hover:underline" href="/fantasy/squad">Build your squad first</Link>.</p>}<div className="grid grid-cols-1 md:grid-cols-2 gap-4"><Select id="playerOut" label="Player out" value={outId} onChange={(e) => setOutId(e.target.value)} options={squadOptions} /><Select id="playerIn" label="Player in" value={inId} onChange={(e) => setInId(e.target.value)} options={playerOptions} /></div>{feedback && <p className="text-green-700 font-body">{feedback}</p>}{error && <p className="text-red-600 font-body">{error}</p>}<Button onClick={transfer}>Save transfer</Button></CardContent></Card><Card><CardContent className="p-6"><h2 className="text-xl font-display font-bold mb-3">Chips</h2><div className="flex flex-wrap gap-3">{['wildcard','free_hit','bench_boost','triple_captain'].map((chip) => <Button key={chip} variant="secondary" onClick={() => recordChip(chip)}>Use {chip.replace('_', ' ')}</Button>)}</div><div className="mt-4 flex flex-wrap gap-2">{(data?.chips ?? []).map((chip: any) => <Badge key={chip.id}>{chip.chip_type.replace('_', ' ')}</Badge>)}</div></CardContent></Card></div>;
}
