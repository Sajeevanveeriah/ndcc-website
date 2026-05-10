'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CLUB_NAME, CLUB_SHORT } from '@/lib/constants';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { validateEmail } from '@/lib/utils';

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

    setLoading(true);
    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) return setError(data.error || 'Sign-in failed.');

      router.push('/admin');
      router.refresh();
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="bg-maroon-800 px-6 py-8 text-center">
            <h1 className="text-3xl font-display font-bold text-white">{CLUB_SHORT}</h1>
            <p className="text-maroon-200 font-body mt-1">Admin Portal</p>
          </div>

          <form onSubmit={handleLogin} className="p-6 space-y-4">
            <h2 className="text-xl font-display font-bold text-gray-900 text-center">Sign In</h2>
            <p className="text-sm text-gray-500 font-body text-center">Access the {CLUB_NAME} administration panel.</p>

            {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm font-body">{error}</div>}

            <Input id="email" label="Email Address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Input id="password" label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />

            <Button type="submit" variant="primary" className="w-full" isLoading={loading}>Sign In</Button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 font-body mt-6">&copy; {new Date().getFullYear()} {CLUB_NAME}</p>
      </div>
    </div>
  );
}
