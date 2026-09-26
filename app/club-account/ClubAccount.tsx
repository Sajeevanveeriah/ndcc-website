'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getAccountBrowserClient, isAccountAuthConfigured } from '@/lib/account/browser';
import { accountPasswordError, ACCOUNT_PASSWORD_MIN_LENGTH } from '@/lib/account/password';
import { clubAccountJsonFetch } from '@/lib/club-account/browser';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import MemberDashboard from '@/components/club-account/MemberDashboard';
import type { ClubMemberInput } from '@/lib/club-members';
type Profile = ClubMemberInput & { membership_status: string; privacy_accepted_at?: string | null };
export default function ClubAccount() {
 const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [signedIn,setSignedIn]=useState(false);
 const [profileLoaded,setProfileLoaded]=useState(false); const [profileSaved,setProfileSaved]=useState(false);
 const [register,setRegister]=useState(false); const [busy,setBusy]=useState(false); const [ready,setReady]=useState(false);
 const [message,setMessage]=useState(''); const [error,setError]=useState(''); const [accepted,setAccepted]=useState(false);
 const [retryLoad,setRetryLoad]=useState(false);
 const [profile,setProfile]=useState<Profile>({full_name:'',email:'',phone:'',member_type:'social',membership_status:'pending'});
 const load=useCallback(async()=>{
  setError('');setRetryLoad(false); setReady(false);setProfileLoaded(false);
  try {
   if(!isAccountAuthConfigured) throw new Error('Account access is temporarily unavailable. Please retry later.');
   const client=getAccountBrowserClient(); const code=new URLSearchParams(window.location.search).get('code');
   if(code){ const result=await client.auth.exchangeCodeForSession(code); if(result.error)throw result.error; window.history.replaceState({},'', '/club-account'); }
   const {data,error:sessionError}=await client.auth.getSession(); if(sessionError)throw sessionError; setSignedIn(Boolean(data.session));
   if(data.session){const result=await clubAccountJsonFetch<{profile:Profile|null;email:string;claimed?:boolean}>('/api/club-account');setEmail(result.email);
    // A record added by the committee is linked on first sign-in but still needs the member's privacy acceptance.
    setProfileSaved(Boolean(result.profile)&&result.profile?.privacy_accepted_at!==null);if(result.claimed)setMessage('We found the club record for this email and linked it to your account. Check your details and accept the privacy statement to finish.');setProfile(result.profile||{full_name:'',email:result.email,phone:'',member_type:'social',membership_status:'pending'});setAccepted(false);setProfileLoaded(true);}
  }catch(reason){setRetryLoad(true);setError(reason instanceof Error?reason.message:'Unable to load account.');}finally{setReady(true);}
 },[]);
 useEffect(()=>{void load();},[load]);
 const authenticate=async(event:React.FormEvent<HTMLFormElement>)=>{
  event.preventDefault();
  // Read the submitted controls: browser/password-manager autofill can leave
  // React state behind the values that the user sees. Never trim a password.
  const submittedEmail=(event.currentTarget.elements.namedItem('email') as HTMLInputElement).value.trim().toLowerCase();
  const submittedPassword=(event.currentTarget.elements.namedItem('password') as HTMLInputElement).value;
  setError('');setRetryLoad(false);setMessage('');setEmail(submittedEmail);setPassword(submittedPassword);
  const weak=register?accountPasswordError(submittedPassword):null; if(weak){setError(weak);return;}
  setBusy(true);
  try{const client=getAccountBrowserClient();
   const credentials={email:submittedEmail,password:submittedPassword};
   const result=register?await client.auth.signUp({...credentials,options:{emailRedirectTo:`${window.location.origin}/club-account`}}):await client.auth.signInWithPassword(credentials);
   if(result.error)throw result.error;
   setPassword(''); if(result.data.session)await load();else setMessage('Check your email to confirm your account. If you already have an account, sign in or reset your password.');
  }catch(reason){const text=reason instanceof Error?reason.message:'Unable to sign in.';setError(/not confirmed/i.test(text)?'Your email address has not been confirmed yet. Use the link in your confirmation email, or choose Resend confirmation email.':text);}finally{setBusy(false);}
 };
 const save=async(event:React.FormEvent)=>{event.preventDefault();if(!profileLoaded)return;setBusy(true);setError('');setMessage('');try{
  const result=await clubAccountJsonFetch<{profile:Profile}>('/api/club-account',{method:'POST',body:JSON.stringify({...profile,privacyAccepted:accepted})});setProfile(result.profile);setProfileSaved(true);setMessage('Your details are saved. Membership and playing registration are confirmed separately by the club.');
 }catch(reason){setError(reason instanceof Error?reason.message:'Unable to save.');}finally{setBusy(false);}};
 const reset=async(event:React.MouseEvent<HTMLButtonElement>)=>{
  const emailInput=event.currentTarget.form?.elements.namedItem('email') as HTMLInputElement|null;
  if(!emailInput?.reportValidity())return;
  const submittedEmail=emailInput.value.trim().toLowerCase();
  setEmail(submittedEmail);setBusy(true);setError('');setRetryLoad(false);setMessage('');
  try{const {error}=await getAccountBrowserClient().auth.resetPasswordForEmail(submittedEmail,{redirectTo:`${window.location.origin}/club-account/reset-password`});if(error)throw error;setMessage('If an account matches, a password reset email has been sent.');}catch(reason){setError(reason instanceof Error?reason.message:'Unable to send reset.');}finally{setBusy(false);}
 };
 const resend=async(event:React.MouseEvent<HTMLButtonElement>)=>{
  const emailInput=event.currentTarget.form?.elements.namedItem('email') as HTMLInputElement|null;
  if(!emailInput?.reportValidity())return;
  const submittedEmail=emailInput.value.trim().toLowerCase();
  setEmail(submittedEmail);setBusy(true);setError('');setRetryLoad(false);setMessage('');
  try{const {error}=await getAccountBrowserClient().auth.resend({type:'signup',email:submittedEmail,options:{emailRedirectTo:`${window.location.origin}/club-account`}});if(error)throw error;setMessage('If this email is waiting for confirmation, a new confirmation email has been sent. Check your spam folder too.');}catch(reason){setError(reason instanceof Error?reason.message:'Unable to resend the confirmation email.');}finally{setBusy(false);}
 };
 if(!ready)return <p role="status">Loading your account...</p>;
 return <div className="space-y-6">
 {error&&<div role="alert" className="rounded-lg border border-red-300 p-4"><p>{error}</p>{retryLoad&&<Button variant="secondary" onClick={load} disabled={busy}>Retry loading account</Button>}</div>}
 {message&&<p role="status" className="rounded-lg border border-green-300 p-4">{message}</p>}
 {!signedIn?<form onSubmit={authenticate} className="space-y-4"><h2 className="text-xl font-bold">{register?'Create an account':'Sign in'}</h2>
 <Input id="club-email" name="email" type="email" label="Email" autoComplete="username" autoCapitalize="none" spellCheck={false} value={email} onChange={e=>setEmail(e.target.value)} required />
 <Input id="club-password" name="password" type="password" label="Password" autoComplete={register?'new-password':'current-password'} minLength={register?ACCOUNT_PASSWORD_MIN_LENGTH:undefined} value={password} onChange={e=>setPassword(e.target.value)} required />
 {register&&<p id="club-password-rule" className="text-sm">Use at least {ACCOUNT_PASSWORD_MIN_LENGTH} characters for your password.</p>}
 {register&&<p className="text-sm">Read our <Link className="underline" href="/privacy">privacy statement</Link> before creating an account.</p>}
 <div className="flex flex-wrap gap-3"><Button type="submit" isLoading={busy}>{register?'Create account':'Sign in'}</Button><Button type="button" variant="secondary" disabled={busy} onClick={()=>{setRegister(!register);setError('');setRetryLoad(false);setMessage('');}}>{register?'Already have an account?':'Create an account'}</Button><Button type="button" variant="secondary" disabled={busy} onClick={reset}>Reset password</Button><Button type="button" variant="secondary" disabled={busy} onClick={resend}>Resend confirmation email</Button></div>{busy&&<p role="status">Contacting the account service...</p>}</form>:
 <><MemberDashboard key={email} email={email} name={profile.full_name} status={profile.membership_status} profileComplete={profileSaved}><form onSubmit={save} className="space-y-4"><p>Signed in as {email}</p><Input id="club-name" label="Full name" maxLength={120} value={profile.full_name} onChange={e=>setProfile({...profile,full_name:e.target.value})} required /><Input id="club-phone" type="tel" label="Phone (optional)" maxLength={40} value={profile.phone} onChange={e=>setProfile({...profile,phone:e.target.value})} />
 <label className="block">I am interested in<select className="form-input mt-1 w-full" value={profile.member_type} onChange={e=>setProfile({...profile,member_type:e.target.value as Profile['member_type']})}><option value="player">Playing</option><option value="social">Social membership</option><option value="both">Playing and social membership</option></select></label>
 <p>Club record: {profile.membership_status}. This account does not replace PlayHQ player registration or membership payment.</p>
 <label className="flex gap-3"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)} required /><span>I have read the <Link href="/privacy" className="underline">privacy statement</Link> and understand how the club uses these details.</span></label><Button disabled={busy||!accepted||!profileLoaded}>Save my details</Button></form>
 </MemberDashboard>
 <Button variant="secondary" disabled={busy} onClick={async()=>{setBusy(true);try{const {error}=await getAccountBrowserClient().auth.signOut();if(error)throw error;setSignedIn(false);setMessage('Signed out.');}catch(reason){setError(reason instanceof Error?reason.message:'Sign out failed.');}finally{setBusy(false);}}}>Sign out</Button></>}
 </div>;
}
