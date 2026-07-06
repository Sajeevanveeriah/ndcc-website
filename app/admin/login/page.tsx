'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CLUB_NAME, CLUB_SHORT } from '@/lib/constants';
import Button from '@/components/ui/Button';
import Input, { PasswordInput } from '@/components/ui/Input';
import { validateEmail } from '@/lib/utils';

const LOGIN_TIMEOUT_MS = 12_000;

async function readLoginResponse(response: Response) {
  try {
    return await response.json() as { error?: string; requestId?: string; stage?: string; diagnosticCode?: string };
  } catch {
    return { error: response.ok ? undefined : 'Sign-in failed. Please try again.' };
  }
}

function stageLabel(stage?: string) {
  const labels: Record<string, string> = {
    supabase_config: 'Supabase configuration',
    credential_rpc: 'Credential verification',
    session_insert: 'Session creation',
    unexpected: 'Unexpected login error',
  };
  return stage ? labels[stage] : undefined;
}

function loginErrorMessage(status: number, data: { error?: string; requestId?: string; stage?: string }) {
  const message = messageForStatus(status, data.error);
  const reference = data.requestId ? ` Reference: ${data.requestId}` : '';
  const stage = stageLabel(data.stage);
  return `${message}${reference}${stage ? ` Stage: ${stage}` : ''}`;
}

function messageForStatus(status: number, fallback?: string) {
  if (status === 401) return fallback || 'Invalid email or password.';
  if (status === 429) return fallback || 'Too many login attempts. Please wait and try again.';
  if (status === 503) return fallback || 'Login service is temporarily unavailable. Please try again in a minute.';
  return fallback || 'Sign-in failed. Please try again.';
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !password) return setError('Please enter both email and password.');
    if (!validateEmail(email)) return setError('Please enter a valid email address.');

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), LOGIN_TIMEOUT_MS);

    setLoading(true);
    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        cache: 'no-store',
        credentials: 'include',
        signal: controller.signal,
      });
      const data = await readLoginResponse(res);

      if (!res.ok) return setError(loginErrorMessage(res.status, data));

      setLoading(false);
      router.replace('/admin');
      router.refresh();
    } catch (err) {
      if (isAbortError(err)) {
        setError('Login service timed out. Please try again in a minute.');
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
          <div className="band-maroon px-6 py-8 text-center">
            <h1 className="text-3xl font-display font-bold text-white uppercase tracking-wide">{CLUB_SHORT}</h1>
            <p className="text-gold-200 font-body text-xs font-semibold uppercase tracking-[0.14em] mt-1.5">Admin Portal</p>
          </div>

          <form onSubmit={handleLogin} className="p-6 space-y-4">
            <h2 className="text-xl font-display font-bold text-gray-900 text-center">Sign In</h2>
            <p className="text-sm text-gray-500 font-body text-center">Access the {CLUB_NAME} administration panel.</p>

            {error && <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm font-body">{error}</div>}

            <Input id="email" label="Email Address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <PasswordInput id="password" label="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />

            <Button type="submit" variant="primary" className="w-full" isLoading={loading}>Sign In</Button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 font-body mt-6">&copy; {new Date().getFullYear()} {CLUB_NAME}</p>
      </div>
    </div>
  );
}
