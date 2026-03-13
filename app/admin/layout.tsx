'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { CLUB_SHORT } from '@/lib/constants';
import {
  LayoutDashboard,
  Users,
  ShoppingBag,
  Mail,
  Calendar,
  Newspaper,
  Handshake,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const sidebarLinks = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/volunteers', label: 'Volunteers', icon: Users },
  { href: '/admin/orders', label: 'Orders', icon: ShoppingBag },
  { href: '/admin/enquiries', label: 'Enquiries', icon: Mail },
  { href: '/admin/events', label: 'Events', icon: Calendar },
  { href: '/admin/news', label: 'News', icon: Newspaper },
  { href: '/admin/sponsors', label: 'Sponsors', icon: Handshake },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    if (pathname === '/admin/login') {
      setLoading(false);
      setAuthenticated(false);
      return;
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      setLoading(false);
      setAuthenticated(true);
      setUserEmail('demo@ndcc.com.au');
      return;
    }

    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setAuthenticated(true);
          setUserEmail(session.user.email || '');
        } else {
          router.push('/admin/login');
        }
      } catch {
        router.push('/admin/login');
      } finally {
        setLoading(false);
      }
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session && pathname !== '/admin/login') {
        router.push('/admin/login');
      }
    });

    return () => subscription.unsubscribe();
  }, [pathname, router]);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore sign-out errors
    }
    router.push('/admin/login');
  };

  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-maroon-700 mx-auto" />
          <p className="mt-4 text-gray-500 font-body">Loading...</p>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-maroon-800">
        <div className="px-6 py-5 border-b border-maroon-700">
          <Link href="/admin" className="text-white font-display font-bold text-xl">
            {CLUB_SHORT} <span className="text-maroon-200 text-sm font-body">Admin</span>
          </Link>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Admin navigation">
          {sidebarLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-body transition-colors',
                  isActive
                    ? 'bg-maroon-700 text-white'
                    : 'text-maroon-200 hover:bg-maroon-700/50 hover:text-white'
                )}
              >
                <link.icon className="h-5 w-5 flex-shrink-0" />
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-maroon-700">
          <p className="px-3 text-xs text-maroon-300 font-body truncate mb-2">{userEmail}</p>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-body text-maroon-200 hover:bg-maroon-700/50 hover:text-white transition-colors w-full"
          >
            <LogOut className="h-5 w-5 flex-shrink-0" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="fixed inset-y-0 left-0 w-64 bg-maroon-800 z-50 flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b border-maroon-700">
              <span className="text-white font-display font-bold text-xl">
                {CLUB_SHORT} <span className="text-maroon-200 text-sm font-body">Admin</span>
              </span>
              <button onClick={() => setMobileOpen(false)} className="text-maroon-200 hover:text-white" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Admin navigation">
              {sidebarLinks.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-body transition-colors',
                      isActive
                        ? 'bg-maroon-700 text-white'
                        : 'text-maroon-200 hover:bg-maroon-700/50 hover:text-white'
                    )}
                  >
                    <link.icon className="h-5 w-5 flex-shrink-0" />
                    {link.label}
                  </Link>
                );
              })}
            </nav>

            <div className="px-3 py-4 border-t border-maroon-700">
              <p className="px-3 text-xs text-maroon-300 font-body truncate mb-2">{userEmail}</p>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-body text-maroon-200 hover:bg-maroon-700/50 hover:text-white transition-colors w-full"
              >
                <LogOut className="h-5 w-5 flex-shrink-0" />
                Sign Out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 lg:ml-64">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 lg:px-8">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5 text-gray-600" />
            </button>
            <div className="hidden lg:block" />
            <p className="text-sm text-gray-500 font-body">{userEmail}</p>
          </div>
        </header>

        <main className="p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
