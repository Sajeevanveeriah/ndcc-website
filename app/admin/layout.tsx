'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { CLUB_SHORT } from '@/lib/constants';
import Button from '@/components/ui/Button';
import { LayoutDashboard, Users, ShoppingBag, Mail, Calendar, Newspaper, Handshake, LogOut, Menu, X, KeyRound, Image as ImageIcon, Shirt, UtensilsCrossed, FileText, UserRoundCheck, Settings, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseApiResponse } from '@/lib/admin-client';

const SESSION_CHECK_TIMEOUT_MS = 8_000;
const SESSION_RETRY_DELAYS_MS = [10_000, 30_000, 60_000] as const;

type SessionUser = {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'president' | 'secretary' | 'committee';
};

const baseLinks = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/volunteers', label: 'Volunteers', icon: Users },
  { href: '/admin/orders', label: 'Orders', icon: ShoppingBag },
  { href: '/admin/enquiries', label: 'Enquiries', icon: Mail },
  { href: '/admin/events', label: 'Events', icon: Calendar },
  { href: '/admin/news', label: 'News', icon: Newspaper },
  { href: '/admin/teams', label: 'Teams', icon: Users },
  { href: '/admin/fantasy', label: 'Fantasy Cricket', icon: Trophy },
  { href: '/admin/sponsors', label: 'Sponsors', icon: Handshake },
  { href: '/admin/memberships', label: 'Memberships', icon: Users },
  { href: '/admin/payments', label: 'Payments', icon: ShoppingBag },
  { href: '/admin/minutes', label: 'Minutes', icon: Newspaper },
  { href: '/admin/gallery', label: 'Gallery', icon: ImageIcon },
  { href: '/admin/apparel', label: 'Apparel', icon: Shirt },
  { href: '/admin/site-pages', label: 'Site Pages', icon: FileText },
  { href: '/admin/history', label: 'History', icon: Newspaper },
  { href: '/admin/kitchen', label: 'Kitchen', icon: UtensilsCrossed },
  { href: '/admin/season-appointments', label: 'Season Appointments', icon: UserRoundCheck },
  { href: '/admin/content', label: 'Content', icon: FileText },
  { href: '/admin/club-details', label: 'Club Details', icon: Settings },
  { href: '/admin/change-password', label: 'Password', icon: KeyRound },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isLoginPage = pathname === '/admin/login';
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [message, setMessage] = useState('');
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSessionCheck = useCallback(async (retryAttempt = 0, allowAutoRetry = true) => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SESSION_CHECK_TIMEOUT_MS);

    try {
      setLoading(true);
      const response = await fetch('/api/admin/auth/session', {
        cache: 'no-store',
        credentials: 'include',
        signal: controller.signal,
      });

      if (response.status === 503) {
        const nextDelay = SESSION_RETRY_DELAYS_MS[retryAttempt];
        if (allowAutoRetry && nextDelay) {
          setMessage(`Session validation is temporarily unavailable. Automatic retry ${retryAttempt + 1} of ${SESSION_RETRY_DELAYS_MS.length} will run in ${Math.round(nextDelay / 1000)} seconds.`);
          retryTimeoutRef.current = setTimeout(() => runSessionCheck(retryAttempt + 1, true), nextDelay);
        } else {
          setMessage('Session validation is temporarily unavailable. Supabase may still be recovering. Use Retry when ready or return to sign in.');
        }
        setUser(null);
        return;
      }

      if (response.status === 401) {
        router.push('/admin/login');
        return;
      }

      const data = await parseApiResponse<{ authenticated?: boolean; user?: SessionUser }>(response);
      if (!data.authenticated) {
        router.push('/admin/login');
        return;
      }
      setUser(data.user || null);
      setMessage('');
    } catch (error) {
      const isAbort = error instanceof Error && error.name === 'AbortError';
      const nextDelay = SESSION_RETRY_DELAYS_MS[retryAttempt];
      if (allowAutoRetry && nextDelay) {
        setMessage(`${isAbort ? 'Session validation timed out' : 'Session validation failed'}. Automatic retry ${retryAttempt + 1} of ${SESSION_RETRY_DELAYS_MS.length} will run in ${Math.round(nextDelay / 1000)} seconds.`);
        retryTimeoutRef.current = setTimeout(() => runSessionCheck(retryAttempt + 1, true), nextDelay);
      } else {
        setMessage(isAbort ? 'Session validation timed out. Use Retry when Supabase has recovered or return to sign in.' : 'Session validation failed. Use Retry when Supabase has recovered or return to sign in.');
      }
      setUser(null);
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (isLoginPage) {
      setLoading(false);
      return undefined;
    }

    runSessionCheck(0, true);
    return () => {
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, [isLoginPage, runSessionCheck]);

  const handleSignOut = async () => {
    const response = await fetch('/api/admin/auth/logout', { method: 'POST', cache: 'no-store', credentials: 'include' });
    await parseApiResponse(response).catch(() => undefined);
    router.push('/admin/login');
  };

  if (isLoginPage) return <>{children}</>;

  if (loading) {
    return <div className="min-h-screen bg-sky-50 flex items-center justify-center">Loading...</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-sky-50 flex items-center justify-center p-6">
        <div className="max-w-md rounded-xl border border-red-100 bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-display font-bold text-gray-900">Admin session unavailable</h1>
          <p className="mt-2 text-sm text-gray-600">
            {message || 'We could not confirm your admin session. Please wait for the automatic retry or sign in again.'}
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button type="button" variant="primary" onClick={() => runSessionCheck(0, false)}>Retry</Button>
            <Button type="button" variant="secondary" onClick={() => router.push('/admin/login')}>Back to sign in</Button>
          </div>
        </div>
      </div>
    );
  }

  const sidebarLinks = user.role === 'admin'
    ? [...baseLinks, { href: '/admin/users', label: 'Users', icon: Users }]
    : baseLinks;

  return (
    <div className="min-h-screen bg-sky-50 flex">
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:top-24 lg:bottom-0 bg-maroon-800">
        <div className="px-6 py-5 border-b border-maroon-700">
          <Link href="/admin" className="text-white font-display font-bold text-xl">{CLUB_SHORT} Admin</Link>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {sidebarLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link key={link.href} href={link.href} className={cn('flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm', isActive ? 'bg-maroon-700 text-white' : 'text-maroon-200 hover:bg-maroon-700/50 hover:text-white')}>
                <link.icon className="h-5 w-5" />{link.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-3 py-4 border-t border-maroon-700">
          <p className="px-3 text-xs text-maroon-300 mb-2 truncate">{user.email} ({user.role})</p>
          <button onClick={handleSignOut} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-maroon-200 hover:bg-maroon-700/50 hover:text-white w-full">
            <LogOut className="h-5 w-5" />Sign Out
          </button>
        </div>
      </aside>

      <div className="flex-1 lg:pl-64">
        <header className="lg:hidden bg-white border-b border-gray-200 sticky top-0 z-30">
          <div className="px-4 py-3 flex items-center justify-between">
            <button onClick={() => setMobileOpen((v) => !v)}>{mobileOpen ? <X /> : <Menu />}</button>
            <span className="font-bold">{CLUB_SHORT} Admin</span>
          </div>
          {mobileOpen && <nav className="px-4 pb-3 space-y-1 max-h-[70vh] overflow-y-auto">{sidebarLinks.map((link) => <Link className="block py-2" key={link.href} href={link.href}>{link.label}</Link>)}</nav>}
        </header>
        <main className="p-6 lg:p-8">{children}</main>
        {message && <p className="px-6 pb-6 text-sm text-red-600">{message}</p>}
      </div>
    </div>
  );
}
