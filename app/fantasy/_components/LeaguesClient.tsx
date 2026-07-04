/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Card, { CardContent } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { fantasyJsonFetch } from '@/lib/fantasy-browser';
export default function LeaguesClient() {
 const [data,setData]=useState<any>({leagues:[]}); const [name,setName]=useState(''); const [code,setCode]=useState(''); const [error,setError]=useState<string|null>(null); const [feedback,setFeedback]=useState<string|null>(null); const [loading,setLoading]=useState(true);
 const load=()=>fantasyJsonFetch<any>('/api/fantasy/leagues').then(setData).catch((err)=>setError(err.message)).finally(()=>setLoading(false)); useEffect(()=>{load();},[]);
 if (loading) return <Card><CardContent className="p-6"><p className="font-body text-gray-700">Loading your leagues…</p></CardContent></Card>;
 if (error?.includes('sign in')) return <Card><CardContent className="p-6"><p className="mb-4 font-body">Sign in to manage leagues.</p><Link className="btn-primary" href="/fantasy/login">Sign in</Link></CardContent></Card>;
 const post=async(action:string)=>{setError(null);setFeedback(null);try{await fantasyJsonFetch('/api/fantasy/leagues',{method:'POST',body:JSON.stringify(action==='join'?{action,code}:{action,name})});setFeedback(action==='join'?'League joined.':'League created.');setName('');setCode('');load();}catch(err){setError(err instanceof Error?err.message:'League request failed.')}};
 return <div className="space-y-6"><Card><CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6"><div className="space-y-3"><Input id="leagueName" label="Create private league" value={name} onChange={(e)=>setName(e.target.value)} /><Button onClick={()=>post('create')}>Create league</Button></div><div className="space-y-3"><Input id="leagueCode" label="Join by code" value={code} onChange={(e)=>setCode(e.target.value.toUpperCase())} /><Button onClick={()=>post('join')}>Join league</Button></div>{feedback&&<p className="text-green-700 font-body md:col-span-2">{feedback}</p>}{error&&<p className="text-red-600 font-body md:col-span-2">{error}</p>}</CardContent></Card>{data.leagues.length===0&&!error&&<Card><CardContent className="p-6"><p className="font-body text-gray-700">You are not in a private league yet. Create one above, or join with a code from another manager.</p></CardContent></Card>}{data.leagues.map((league:any)=><Card key={league.id}><CardContent className="p-6"><h2 className="text-xl font-display font-bold text-gray-900">{league.name}</h2><p className="font-body text-sm text-gray-600 mb-4">Join code: <strong>{league.code}</strong></p><Table><TableHead><TableRow><TableHeader>Rank</TableHeader><TableHeader>Team</TableHeader><TableHeader>Manager</TableHeader><TableHeader>Net points</TableHeader></TableRow></TableHead><TableBody>{league.leaderboard.map((row:any)=><TableRow key={row.managerId}><TableCell>{row.rank}</TableCell><TableCell>{row.teamName}</TableCell><TableCell>{row.displayName}</TableCell><TableCell className="font-bold text-maroon-800">{row.totalNetPoints}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>)}</div>;
}
