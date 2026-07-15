'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { CLUB_SHORT } from '@/lib/constants';
import Button from '@/components/ui/Button';
import { BookOpen, LayoutDashboard, Users, ShoppingBag, Mail, Calendar, Newspaper, Handshake, LogOut, Menu, X, KeyRound, Image as ImageIcon, Shirt, UtensilsCrossed, FileText, UserRoundCheck, Settings, Trophy, CalendarDays, Search, Home, Building2, Megaphone, HeartHandshake, Shield, ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseApiResponse } from '@/lib/admin-client';
import InactivityGuard from '@/components/admin/InactivityGuard';

const SESSION_CHECK_TIMEOUT_MS = 8_000;
const SESSION_RETRY_DELAYS_MS = [10_000, 30_000, 60_000] as const;

type SessionUser = {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'president' | 'secretary' | 'committee' | 'fantasy_manager';
};

// fantasy_manager is a restricted CMS role: Fantasy modules and password only.
const fantasyManagerHrefs = ['/admin/fantasy', '/admin/fantasy/seasons', '/admin/fantasy/players', '/admin/fantasy/import', '/admin/fantasy/imports', '/admin/fantasy/reconciliation', '/admin/playhq-diagnostics', '/admin/change-password'];

type AdminLink = { href: string; label: string; plainLabel?: string; icon: typeof LayoutDashboard; roles?: SessionUser['role'][] };
type AdminGroup = { title: string; icon: typeof LayoutDashboard; links: AdminLink[] };

const adminGroups: AdminGroup[] = [
  { title: 'Home', icon: Home, links: [
    { href: '/admin', label: 'Dashboard', plainLabel: 'Home dashboard', icon: LayoutDashboard },
  ] },
  { title: 'Season', icon: ClipboardList, links: [
    { href: '/admin/season/new', label: 'Start New Season', plainLabel: 'Season setup wizard', icon: CalendarDays },
    { href: '/admin/club-details', label: 'Club Details', icon: Settings },
    { href: '/admin/teams', label: 'Teams', plainLabel: 'Teams and grades', icon: Users },
    { href: '/admin/season-appointments', label: 'Appointments', plainLabel: 'Coaches and appointments', icon: UserRoundCheck },
    { href: '/admin/calendar', label: 'Training & Calendar', icon: CalendarDays },
  ] },
  { title: 'Publish', icon: Megaphone, links: [
    { href: '/admin/news', label: 'News', icon: Newspaper },
    { href: '/admin/publications', label: 'Publications', icon: BookOpen },
    { href: '/admin/events', label: 'Events', icon: Calendar },
    { href: '/admin/site-pages', label: 'Pages & Links', plainLabel: 'Pages, buttons and links', icon: FileText },
    { href: '/admin/content', label: 'Page Sections', plainLabel: 'Page sections', icon: FileText },
    { href: '/admin/gallery', label: 'Gallery', icon: ImageIcon },
  ] },
  { title: 'Club', icon: Building2, links: [
    { href: '/admin/history', label: 'History', icon: Newspaper },
    { href: '/admin/minutes', label: 'Minutes', icon: Newspaper },
    { href: '/admin/club-details', label: 'Contact Details', icon: Settings },
  ] },
  { title: 'Community', icon: HeartHandshake, links: [
    { href: '/admin/volunteers', label: 'Volunteers', icon: Users },
    { href: '/admin/memberships', label: 'Memberships', icon: Users },
    { href: '/admin/enquiries', label: 'Enquiries', icon: Mail },
  ] },
  { title: 'Commercial', icon: ShoppingBag, links: [
    { href: '/admin/sponsors', label: 'Sponsors', icon: Handshake },
    { href: '/admin/apparel', label: 'Merchandise', icon: Shirt },
    { href: '/admin/kitchen', label: 'Kitchen', icon: UtensilsCrossed },
    { href: '/admin/orders', label: 'Orders', icon: ShoppingBag },
    { href: '/admin/payments', label: 'Payments', icon: ShoppingBag },
  ] },
  { title: 'Fantasy', icon: Trophy, links: [
    { href: '/admin/fantasy', label: 'Fantasy Home', icon: Trophy },
    { href: '/admin/fantasy/seasons', label: 'Seasons & PlayHQ', plainLabel: 'Fantasy seasons and PlayHQ grades', icon: CalendarDays },
    { href: '/admin/fantasy/players', label: 'Players', icon: Users },
    { href: '/admin/fantasy/imports', label: 'Imports', icon: FileText },
    { href: '/admin/fantasy/reconciliation', label: 'Historical Review', icon: Shield },
    { href: '/admin/playhq-diagnostics', label: 'PlayHQ Diagnostics', icon: Settings },
  ] },
  { title: 'Administration', icon: Shield, links: [
    { href: '/admin/users', label: 'Users', icon: Users, roles: ['admin'] },
    { href: '/admin/email-diagnostics', label: 'Email Diagnostics', icon: Mail },
    { href: '/admin/media-diagnostics', label: 'Media Diagnostics', icon: Settings },
    { href: '/admin/change-password', label: 'Password', icon: KeyRound },
  ] },
];

function groupsForUser(user: SessionUser, search: string) {
  const query = search.trim().toLowerCase();
  return adminGroups.map((group) => ({
    ...group,
    links: group.links.filter((link) => {
      if (user.role === 'fantasy_manager' && !fantasyManagerHrefs.includes(link.href)) return false;
      if (link.roles && !link.roles.includes(user.role)) return false;
      const label = `${group.title} ${link.label} ${link.plainLabel || ''}`.toLowerCase();
      return !query || label.includes(query);
    }),
  })).filter((group) => group.links.length > 0);
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isLoginPage = pathname === '/admin/login';
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [navSearch, setNavSearch] = useState('');
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
    return <div className="min-h-screen bg-surface-page flex items-center justify-center">Loading...</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-surface-page flex items-center justify-center p-6">
        <div className="max-w-md rounded-xl border border-red-100 bg-surface-card p-6 text-center shadow-sm">
          <h1 className="text-xl font-display font-bold text-content-primary">Admin session unavailable</h1>
          <p className="mt-2 text-sm text-content-muted">
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

  const groupedLinks = groupsForUser(user, navSearch);



  return (
    <div className="min-h-screen bg-surface-page flex">
      <InactivityGuard onLogout={handleSignOut} />
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:top-24 lg:bottom-0 bg-maroon-800 border-r border-maroon-900/60">
        <div className="px-6 py-5 border-b border-maroon-700">
          <Link href="/admin" className="text-white font-display font-bold text-xl uppercase tracking-wide">{CLUB_SHORT} Admin</Link>
          <p className="text-[10.5px] uppercase tracking-[0.14em] text-gold-200/80 font-body mt-1">Committee Tools</p>
        </div>
        <div className="px-3 pt-4">
          <label className="relative block">
            <span className="sr-only">Search admin modules</span>
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-maroon-200" />
            <input
              value={navSearch}
              onChange={(event) => setNavSearch(event.target.value)}
              placeholder="Search CMS"
              className="w-full rounded-lg border border-maroon-700 bg-maroon-900/40 py-2 pl-9 pr-3 text-sm text-white placeholder:text-maroon-200 focus:border-gold-300 focus:outline-none focus:ring-2 focus:ring-gold-300/30"
            />
          </label>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto" aria-label="Grouped admin navigation">
          {groupedLinks.map((group) => (
            <section key={group.title} aria-labelledby={`admin-nav-${group.title.toLowerCase()}`}>
              <h2 id={`admin-nav-${group.title.toLowerCase()}`} className="mb-1 flex items-center gap-2 px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-gold-200"><group.icon className="h-3.5 w-3.5" />{group.title}</h2>
              <div className="space-y-1">
                {group.links.map((link) => {
                  const isActive = pathname === link.href || (link.href !== '/admin' && pathname.startsWith(`${link.href}/`));
                  return (
                    <Link key={`${group.title}-${link.href}-${link.label}`} href={link.href} className={cn('flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-body transition-colors focus-ring', isActive ? 'bg-maroon-700 text-white shadow-inner ring-1 ring-white/10 border-l-2 border-gold-400' : 'text-maroon-100 hover:bg-maroon-700/50 hover:text-white')}>
                      <link.icon className="h-5 w-5" />{link.label}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-maroon-700">
          <p className="px-3 text-xs text-maroon-300 mb-2 truncate">{user.email} ({user.role})</p>
          <button onClick={handleSignOut} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-maroon-200 hover:bg-maroon-700/50 hover:text-white w-full">
            <LogOut className="h-5 w-5" />Sign Out
          </button>
        </div>
      </aside>

      <div className="flex-1 lg:pl-64">
        <header className="lg:hidden bg-surface-card border-b border-edge-subtle sticky top-0 z-30">
          <div className="px-4 py-3 flex items-center justify-between">
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="p-2 -m-1 rounded-lg border border-edge-subtle hover:bg-surface-muted transition-colors focus-ring"
              aria-label={mobileOpen ? 'Close admin menu' : 'Open admin menu'}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X /> : <Menu />}
            </button>
            <span className="font-display font-bold uppercase tracking-wide text-maroon-800 dark:text-maroon-200">{CLUB_SHORT} Admin</span>
          </div>
          {mobileOpen && <nav className="px-4 pb-3 space-y-4 max-h-[70vh] overflow-y-auto" aria-label="Mobile grouped admin navigation">{groupedLinks.map((group) => <section key={group.title}><h2 className="text-xs font-bold uppercase tracking-wide text-maroon-700 dark:text-maroon-200">{group.title}</h2>{group.links.map((link) => <Link className="block rounded-lg py-2 text-sm" key={`${group.title}-${link.href}-${link.label}`} href={link.href}>{link.label}</Link>)}</section>)}</nav>}
        </header>
        <main className="p-6 lg:p-8">{children}</main>
        {message && <p className="px-6 pb-6 text-sm text-red-600">{message}</p>}
      </div>
    </div>
  );
}
