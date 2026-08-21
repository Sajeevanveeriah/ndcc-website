'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Card, { CardContent } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import { getFantasyBrowserClient, isFantasySupabaseConfigured } from '@/lib/fantasy-browser';

type Status = 'checking' | 'ready' | 'no-session' | 'done';

export default function ResetPasswordForm() {
  const [status, setStatus] = useState<Status>('checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isFantasySupabaseConfigured) {
      setStatus('no-session');
      setError('Dino Coach sign-in is not configured yet.');
      return;
    }

    const client = getFantasyBrowserClient();

    // Recovery links may arrive as a PKCE ?code= param or as hash tokens that
    // supabase-js consumes automatically; cover both before deciding.
    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => {
      if (session) setStatus((current) => (current === 'done' ? current : 'ready'));
    });

    const init = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      if (code) {
        const { error: exchangeError } = await client.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          setStatus('no-session');
          setError(`This password reset link could not be completed: ${exchangeError.message}`);
          return;
        }
        window.history.replaceState({}, '', '/fantasy/reset-password');
      }
      const { data } = await client.auth.getSession();
      setStatus((current) => (current === 'done' || current === 'ready' ? current : data.session ? 'ready' : 'no-session'));
    };

    init().catch((err) => {
      setStatus('no-session');
      setError(err instanceof Error ? err.message : 'Could not verify your password reset link.');
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const savePassword = async () => {
    setError(null);
    if (password.length < 8) {
      setError('Choose a password of at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('The two passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      const { error: updateError } = await getFantasyBrowserClient().auth.updateUser({ password });
      if (updateError) throw updateError;
      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update your password.');
    } finally {
      setSaving(false);
    }
  };

  if (status === 'checking') {
    return (
      <Card><CardContent className="p-6"><p className="font-body text-content-secondary">Checking your password reset link…</p></CardContent></Card>
    );
  }

  if (status === 'no-session') {
    return (
      <Card>
        <CardContent className="p-6 space-y-4">
          <p className="font-body text-content-secondary">
            This page needs a valid password reset link. Open the most recent reset email on this device, or request a new link from the sign-in page.
          </p>
          {error && <p className="text-sm font-body text-red-600">{error}</p>}
          <Link href="/fantasy/login" className="btn-primary">Go to sign in</Link>
        </CardContent>
      </Card>
    );
  }

  if (status === 'done') {
    return (
      <Card>
        <CardContent className="p-6 space-y-4">
          <p className="font-body text-green-700">Your password has been updated. You can now use it to sign in to your Dino Coach account.</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/fantasy/login" className="btn-primary">Go to sign in</Link>
            <Link href="/fantasy/account" className="btn-secondary">My Dino Coach account</Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <Input id="newPassword" label="New password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        <Input id="confirmPassword" label="Confirm new password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
        {error && <p className="text-sm font-body text-red-600">{error}</p>}
        <Button onClick={savePassword} isLoading={saving}>Set new password</Button>
      </CardContent>
    </Card>
  );
}
