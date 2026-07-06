/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Card, { CardContent } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import { fantasyJsonFetch, getFantasyBrowserClient, isFantasySupabaseConfigured } from '@/lib/fantasy-browser';

type Mode = 'register' | 'login' | 'account';

function getSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
}

function getFantasyEmailRedirectTo() {
  return `${getSiteUrl().replace(/\/$/, '')}/fantasy/account`;
}

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
  const [autoCreating, setAutoCreating] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState<boolean | null>(null);
  const [sendingReset, setSendingReset] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (mode !== 'register') return;
    let cancelled = false;
    fantasyJsonFetch<any>('/api/fantasy/players')
      .then((result) => {
        if (!cancelled) setRegistrationOpen(result?.settings?.is_registration_open !== false);
      })
      .catch(() => {
        // If the settings lookup fails, leave registration available; the
        // manager API still enforces the registration toggle server-side.
        if (!cancelled) setRegistrationOpen(null);
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== 'account') return;
    if (!isFantasySupabaseConfigured) {
      setFeedback({ type: 'error', message: 'Fantasy sign-in is not configured yet.' });
      return;
    }

    const loadAccount = async () => {
      const client = getFantasyBrowserClient();
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      if (code) {
        const { error } = await client.auth.exchangeCodeForSession(code);
        if (error) {
          setFeedback({ type: 'error', message: `Confirmation link could not be completed: ${error.message}` });
          return;
        }
        window.history.replaceState({}, '', '/fantasy/account');
      }

      const { data } = await client.auth.getSession();
      setSessionEmail(data.session?.user.email ?? null);
      if (!data.session) return;
      fantasyJsonFetch<any>('/api/fantasy/manager')
        .then(async (result) => {
          setManager(result.manager);
          const metadataDisplayName = typeof data.session?.user.user_metadata?.display_name === 'string' ? data.session.user.user_metadata.display_name : '';
          const metadataTeamName = typeof data.session?.user.user_metadata?.team_name === 'string' ? data.session.user.user_metadata.team_name : '';
          const nextDisplayName = result.manager?.display_name || metadataDisplayName;
          const nextTeamName = result.manager?.team_name || metadataTeamName;
          setDisplayName(nextDisplayName);
          setTeamName(nextTeamName);

          if (!result.manager && metadataDisplayName && metadataTeamName) {
            setAutoCreating(true);
            try {
              const created = await fantasyJsonFetch<any>('/api/fantasy/manager', {
                method: 'POST',
                body: JSON.stringify({ displayName: metadataDisplayName, teamName: metadataTeamName }),
              });
              setManager(created.manager);
              setFeedback({ type: 'success', message: 'Fantasy manager profile created from your confirmed account details.' });
            } catch (err) {
              setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Could not create your fantasy manager profile automatically.' });
            } finally {
              setAutoCreating(false);
            }
          }
        })
        .catch((err) => setFeedback({ type: 'error', message: err.message }));
    };

    loadAccount().catch((err) => setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Could not load fantasy account.' }));
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
      const { error } = await getFantasyBrowserClient().auth.resend({ type: 'signup', email, options: { emailRedirectTo: getFantasyEmailRedirectTo() } });
      if (error) throw error;
      setFeedback({ type: 'success', message: `Confirmation email resent to ${email}. Check your inbox and spam folder.` });
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Could not resend email.' });
    } finally {
      setResending(false);
    }
  };
  const handleForgotPassword = async () => {
    setFeedback(null);
    const targetEmail = email.trim();
    if (!targetEmail) {
      setFeedback({ type: 'error', message: 'Enter your email above, then choose Forgot password.' });
      return;
    }
    setSendingReset(true);
    try {
      const { error } = await getFantasyBrowserClient().auth.resetPasswordForEmail(targetEmail, {
        redirectTo: `${window.location.origin}/fantasy/reset-password`,
      });
      if (error) throw error;
      setFeedback({ type: 'success', message: `Password reset email sent to ${targetEmail}. Follow the link in that email to set a new password.` });
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Could not send the password reset email.' });
    } finally {
      setSendingReset(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    setFeedback(null);
    try {
      const { error } = await getFantasyBrowserClient().auth.signOut();
      if (error) throw error;
      setSessionEmail(null);
      setManager(null);
      setDisplayName('');
      setTeamName('');
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Could not sign out.' });
    } finally {
      setSigningOut(false);
    }
  };

  const submit = async () => {
    if (mode === 'register' && registrationOpen === false) {
      setFeedback({ type: 'error', message: 'Fantasy registration is currently closed.' });
      return;
    }
    setLoading(true);
    setFeedback(null);
    try {
      if (mode === 'register') {
        const { data, error } = await getFantasyBrowserClient().auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName.trim(), team_name: teamName.trim() },
            emailRedirectTo: getFantasyEmailRedirectTo(),
          },
        });
        if (error) throw error;
        if (data.session) {
          await saveProfile();
          window.location.href = '/fantasy/account';
        } else {
          setAwaitingConfirm(true);
          setFeedback({
            type: 'success',
            message: `Almost there! A confirmation email has been sent to ${email}. Click the link in that email to return to your fantasy account and complete your manager profile.`,
          });
        }
      } else if (mode === 'login') {
        const { error } = await getFantasyBrowserClient().auth.signInWithPassword({ email, password });
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

  const registrationClosed = mode === 'register' && registrationOpen === false;

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        {registrationClosed && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
            <p className="text-sm font-body text-amber-900">
              <strong>Fantasy registration is currently closed.</strong> New manager sign-ups are paused by the club. Already have an account?{' '}
              <Link href="/fantasy/login" className="font-semibold text-maroon-700 hover:underline">Sign in instead</Link>.
            </p>
          </div>
        )}
        {mode !== 'login' && <Input id="displayName" label="Display name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />}
        {mode !== 'login' && <Input id="teamName" label="Fantasy team name" value={teamName} onChange={(event) => setTeamName(event.target.value)} required />}
        {mode !== 'account' && <Input id="email" label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />}
        {mode !== 'account' && <Input id="password" label="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />}
        {mode === 'account' && <p className="text-sm text-gray-600 font-body">Signed in as {sessionEmail}. {manager ? 'Your profile is active.' : autoCreating ? 'Creating your manager profile from your sign-up details...' : 'Create your manager profile to play.'}</p>}
        {feedback && <p className={`text-sm font-body ${feedback.type === 'error' ? 'text-red-600' : 'text-green-700'}`}>{feedback.message}</p>}
        <div className="flex flex-wrap gap-3">
          {!awaitingConfirm && (
            <Button onClick={submit} isLoading={loading} disabled={registrationClosed}>
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
          {mode === 'account' && sessionEmail && (
            <Button onClick={handleSignOut} isLoading={signingOut} variant="secondary">
              Sign out
            </Button>
          )}
        </div>
        {mode === 'login' && !awaitingConfirm && (
          <button
            type="button"
            onClick={handleForgotPassword}
            disabled={sendingReset}
            className="text-sm font-body font-semibold text-maroon-700 hover:underline disabled:opacity-60"
          >
            {sendingReset ? 'Sending reset email…' : 'Forgot password?'}
          </button>
        )}
      </CardContent>
    </Card>
  );
}
