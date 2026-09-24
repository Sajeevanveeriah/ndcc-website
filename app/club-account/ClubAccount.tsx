'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { fantasyJsonFetch, getFantasyBrowserClient, isFantasySupabaseConfigured } from '@/lib/fantasy-browser';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import type { ClubMemberInput } from '@/lib/club-members';
type Profile = ClubMemberInput & { membership_status: string };
export default function ClubAccount() {
 const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [signedIn,setSignedIn]=useState(false);
 const [profileLoaded,setProfileLoaded]=useState(false);
 const [register,setRegister]=useState(false); const [busy,setBusy]=useState(false); const [ready,setReady]=useState(false);
 const [message,setMessage]=useState(''); const [error,setError]=useState(''); const [accepted,setAccepted]=useState(false);
 const [profile,setProfile]=useState<Profile>({full_name:'',email:'',phone:'',member_type:'social',membership_status:'pending'});
 const load=useCallback(async()=>{
  setError(''); setReady(false);setProfileLoaded(false);
  try {
   if(!isFantasySupabaseConfigured) throw new Error('Account access is temporarily unavailable. Please retry later.');
   const client=getFantasyBrowserClient(); const code=new URLSearchParams(window.location.search).get('code');
   if(code){ const result=await client.auth.exchangeCodeForSession(code); if(result.error)throw result.error; window.history.replaceState({},'', '/club-account'); }
   const {data}=await client.auth.getSession(); setSignedIn(Boolean(data.session));
   if(data.session){const result=await fantasyJsonFetch<{profile:Profile|null;email:string}>('/api/club-account');setEmail(result.email);setProfile(result.profile||{full_name:'',email:result.email,phone:'',member_type:'social',membership_status:'pending'});setAccepted(false);setProfileLoaded(true);}
  }catch(reason){setError(reason instanceof Error?reason.message:'Unable to load account.');}finally{setReady(true);}
 },[]);
 useEffect(()=>{void load();},[load]);
 const authenticate=async(event:React.FormEvent)=>{
  event.preventDefault();setBusy(true);setError('');setMessage('');
  try{const client=getFantasyBrowserClient();
   const result=register?await client.auth.signUp({email,password,options:{emailRedirectTo:`${window.location.origin}/club-account`}}):await client.auth.signInWithPassword({email,password});
   if(result.error)throw result.error;
   setPassword(''); if(result.data.session)await load();else setMessage('Check your email to confirm your account. If you already have an account, sign in or reset your password.');
  }catch(reason){setError(reason instanceof Error?reason.message:'Unable to sign in.');}finally{setBusy(false);}
 };
 const save=async(event:React.FormEvent)=>{event.preventDefault();if(!profileLoaded)return;setBusy(true);setError('');setMessage('');try{
  const result=await fantasyJsonFetch<{profile:Profile}>('/api/club-account',{method:'POST',body:JSON.stringify({...profile,privacyAccepted:accepted})});setProfile(result.profile);setMessage('Your details are saved. Membership and playing registration are confirmed separately by the club.');
 }catch(reason){setError(reason instanceof Error?reason.message:'Unable to save.');}finally{setBusy(false);}};
 const reset=async()=>{setBusy(true);setError('');try{const {error}=await getFantasyBrowserClient().auth.resetPasswordForEmail(email,{redirectTo:`${window.location.origin}/fantasy/reset-password`});if(error)throw error;setMessage('If an account matches, a password reset email has been sent.');}catch(reason){setError(reason instanceof Error?reason.message:'Unable to send reset.');}finally{setBusy(false);}};
 if(!ready)return <p role="status">Loading your account...</p>;
 return <div className="space-y-6">
 {error&&<div role="alert" className="rounded-lg border border-red-300 p-4"><p>{error}</p><Button variant="secondary" onClick={load} disabled={busy}>Retry loading account</Button></div>}
 {message&&<p role="status" className="rounded-lg border border-green-300 p-4">{message}</p>}
 {!signedIn?<form onSubmit={authenticate} className="space-y-4"><h2 className="text-xl font-bold">{register?'Create an account':'Sign in'}</h2>
 <Input id="club-email" type="email" label="Email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required />
 <Input id="club-password" type="password" label="Password" autoComplete={register?'new-password':'current-password'} minLength={register?8:undefined} value={password} onChange={e=>setPassword(e.target.value)} required />
 {register&&<p className="text-sm">Read our <Link className="underline" href="/privacy">privacy statement</Link> before creating an account.</p>}
 <div className="flex flex-wrap gap-3"><Button disabled={busy}>{register?'Create account':'Sign in'}</Button><Button type="button" variant="secondary" disabled={busy} onClick={()=>setRegister(!register)}>{register?'Already have an account?':'Create an account'}</Button><Button type="button" variant="secondary" disabled={busy||!email} onClick={reset}>Reset password</Button></div></form>:
 <><form onSubmit={save} className="space-y-4"><p>Signed in as {email}</p><Input id="club-name" label="Full name" maxLength={120} value={profile.full_name} onChange={e=>setProfile({...profile,full_name:e.target.value})} required /><Input id="club-phone" type="tel" label="Phone (optional)" maxLength={40} value={profile.phone} onChange={e=>setProfile({...profile,phone:e.target.value})} />
 <label className="block">I am interested in<select className="form-input mt-1 w-full" value={profile.member_type} onChange={e=>setProfile({...profile,member_type:e.target.value as Profile['member_type']})}><option value="player">Playing</option><option value="social">Social membership</option><option value="both">Playing and social membership</option></select></label>
 <p>Club record: {profile.membership_status}. This account does not replace PlayHQ player registration or membership payment.</p>
 <label className="flex gap-3"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)} required /><span>I have read the <Link href="/privacy" className="underline">privacy statement</Link> and understand how the club uses these details.</span></label><Button disabled={busy||!accepted||!profileLoaded}>Save my details</Button></form>
 <nav aria-label="Club services" className="grid gap-3 sm:grid-cols-2">{[['/news','Club news'],['/calendar','Club calendar'],['/player-registration','Player registration'],['/join','Social membership'],['/pot-club','Pot Club'],['/fantasy/account','Dino Coach'],['/raffle/cash','Record trailer raffle cash sales']].map(([href,label])=><Link className="btn-secondary" key={href} href={href}>{label}</Link>)}</nav>
 <Button variant="secondary" disabled={busy} onClick={async()=>{setBusy(true);try{const {error}=await getFantasyBrowserClient().auth.signOut();if(error)throw error;setSignedIn(false);setMessage('Signed out.');}catch(reason){setError(reason instanceof Error?reason.message:'Sign out failed.');}finally{setBusy(false);}}}>Sign out</Button></>}
 </div>;
}
