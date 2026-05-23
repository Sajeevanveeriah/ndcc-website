/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Card, { CardContent } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import { fantasyBrowserClient, fantasyJsonFetch } from '@/lib/fantasy-browser';

type Mode = 'register' | 'login' | 'account';

export function FantasyAuthForm({ mode }: { mode: Mode }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [manager, setManager] = useState<any>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (mode !== 'account') return;
    fantasyBrowserClient.auth.getSession().then(({ data }) => {
      setSessionEmail(data.session?.user.email ?? null);
      if (!data.session) return;
      fantasyJsonFetch<any>('/api/fantasy/manager')
        .then((result) => {
          setManager(result.manager);
          setDisplayName(result.manager?.display_name || '');
          setTeamName(result.manager?.team_name || '');
        })
        .catch((err) => setFeedback({ type: 'error', message: err.message }));
    });
  }, [mode]);

  const saveProfile = async () => {
    const result = await fantasyJsonFetch<any>('/api/fantasy/manager', {
      method: 'POST',
      body: JSON.stringify({ displayName, teamName }),
    });
    setManager(result.manager);
    setFeedback({ type: 'success', message: 'Fantasy manager profile saved.' });
  };

  const handleResend = async () => {
    setResending(true);
    try {
      const { error } = await fantasyBrowserClient.auth.resend({ type: 'signup', email });
      if (error) throw error;
      setFeedback({ type: 'success', message: `Confirmation email resent to ${email}. Check your inbox and spam folder.` });
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Could not resend email.' });
    } finally {
      setResending(false);
    }
  };
  const submit = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      if (mode === 'register') {
        const { data, error } = await fantasyBrowserClient.auth.signUp({
          email,
          password,
          options: { data: { display_name: displayName, team_name: teamName } },
        });
        if (error) throw error;
        if (data.session) {
          await saveProfile();
          window.location.href = '/fantasy/squad';
        } else {
          setAwaitingConfirm(true);
          setFeedback({
            type: 'success',
            message: `Almost there! A confirmation email has been sent to ${email}. Click the link in that email, then come back and sign in to complete your manager profile.`,
          });
        }
      } else if (mode === 'login') {
        const { error } = await fantasyBrowserClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.href = '/fantasy/account';
      } else {
        await saveProfile();
      }
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Request failed.' });
    } finally {
      setLoading(false);
    }
  };

  if (mode === 'account' && !sessionEmail) {
    return (
      <Card><CardContent className="p-6"><p className="font-body text-gray-700 mb-4">Sign in to manage your fantasy account.</p><Link className="btn-primary" href="/fantasy/login">Sign in</Link></CardContent></Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        {mode !== 'login' && <Input id="displayName" label="Display name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />}
        {mode !== 'login' && <Input id="teamName" label="Fantasy team name" value={teamName} onChange={(event) => setTeamName(event.target.value)} required />}
        {mode !== 'account' && <Input id="email" label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />}
        {mode !== 'account' && <Input id="password" label="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />}
        {mode === 'account' && <p className="text-sm text-gray-600 font-body">Signed in as {sessionEmail}. {manager ? 'Your profile is active.' : 'Create your manager profile to play.'}</p>}
        {feedback && <p className={`text-sm font-body ${feedback.type === 'error' ? 'text-red-600' : 'text-green-700'}`}>{feedback.message}</p>}
        <div className="flex flex-wrap gap-3">
          {!awaitingConfirm && (
            <Button onClick={submit} isLoading={loading}>
              {mode === 'login' ? 'Sign in' : mode === 'register' ? 'Register' : 'Save profile'}
            </Button>
          )}
          {awaitingConfirm && (
            <>
              <Button onClick={handleResend} isLoading={resending} variant="secondary">
                Resend confirmation email
              </Button>
              <Link href="/fantasy/login" className="btn-primary">Sign in after confirming</Link>
            </>
          )}
          {!awaitingConfirm && (
            mode === 'login'
              ? <Link href="/fantasy/register" className="btn-secondary">Register</Link>
              : <Link href="/fantasy/login" className="btn-secondary">Sign in</Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
