/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps */
'use client';

import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Card, { CardContent } from '@/components/ui/Card';
import { Select } from '@/components/ui/Input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { adminFetch, parseApiResponse } from '@/lib/admin-client';

export default function AdminFantasyScoresPage(){
 const [rounds,setRounds]=useState<any[]>([]); const [roundId,setRoundId]=useState(''); const [preview,setPreview]=useState<any[]>([]); const [feedback,setFeedback]=useState<string|null>(null); const [error,setError]=useState<string|null>(null);
 const load=async(id=roundId)=>{setError(null);try{const url=id?`/api/admin/fantasy/scores?roundId=${id}`:'/api/admin/fantasy/scores';const result=await parseApiResponse<any>(await adminFetch(url));setRounds(result.rounds??[]);setPreview(result.preview??[]);}catch(err){setError(err instanceof Error?err.message:'Could not load scores.')}};
 useEffect(()=>{load('');},[]);
 const save=async()=>{setError(null);setFeedback(null);try{const result=await parseApiResponse<any>(await adminFetch('/api/admin/fantasy/scores',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({roundId})}));setFeedback(`Saved ${result.saved} manager score rows.`);setPreview(result.preview??[]);}catch(err){setError(err instanceof Error?err.message:'Could not save scores.')}};
 return <div><h1 className="text-2xl font-display font-bold text-gray-900 mb-2">Fantasy Score Calculation</h1><p className="font-body text-yellow-900 bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-6">Scores use current enabled scoring rules and published import batches only.</p><Card><CardContent className="p-6 space-y-4"><Select id="round" label="Round" value={roundId} onChange={(e)=>{setRoundId(e.target.value);load(e.target.value);}} options={rounds.map((r)=>({value:r.id,label:`Round ${r.round_number}: ${r.name}`}))}/>{error&&<p className="text-red-600 font-body">{error}</p>}{feedback&&<p className="text-green-700 font-body">{feedback}</p>}<Button onClick={save} disabled={!roundId}>Save/update manager scores</Button></CardContent></Card><div className="mt-6"><Table><TableHead><TableRow><TableHeader>Team</TableHeader><TableHeader>Manager</TableHeader><TableHeader>Total</TableHeader><TableHeader>Penalty</TableHeader><TableHeader>Net</TableHeader><TableHeader>Chips</TableHeader></TableRow></TableHead><TableBody>{preview.map((row)=><TableRow key={row.managerId}><TableCell>{row.teamName}</TableCell><TableCell>{row.displayName}</TableCell><TableCell>{row.totalPoints}</TableCell><TableCell>{row.transferPenalty}</TableCell><TableCell className="font-bold text-maroon-800">{row.netPoints}</TableCell><TableCell>{row.chips?.join(', ')||'—'}</TableCell></TableRow>)}</TableBody></Table></div></div>;
}
