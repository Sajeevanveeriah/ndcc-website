'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { CLUB_SHORT } from '@/lib/constants';
import { LayoutDashboard, Users, ShoppingBag, Mail, Calendar, Newspaper, Handshake, LogOut, Menu, X, KeyRound, Image as ImageIcon, Shirt, UtensilsCrossed, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  { href: '/admin/sponsors', label: 'Sponsors', icon: Handshake },
  { href: '/admin/memberships', label: 'Memberships', icon: Users },
  { href: '/admin/payments', label: 'Payments', icon: ShoppingBag },
  { href: '/admin/minutes', label: 'Minutes', icon: Newspaper },
  { href: '/admin/gallery', label: 'Gallery', icon: ImageIcon },
  { href: '/admin/apparel', label: 'Apparel', icon: Shirt },
  { href: '/admin/kitchen', label: 'Kitchen', icon: UtensilsCrossed },
  { href: '/admin/content', label: 'Content', icon: FileText },
  { href: '/admin/change-password', label: 'Password', icon: KeyRound },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (pathname === '/admin/login') {
      setLoading(false);
      return;
    }

    const checkSession = async () => {
      try {
        const response = await fetch('/api/admin/auth/session', { cache: 'no-store' });
        if (!response.ok) {
          router.push('/admin/login');
          return;
        }

        const data = await response.json();
        if (!data.authenticated) {
          router.push('/admin/login');
          return;
        }
        setUser(data.user);
      } catch {
        router.push('/admin/login');
      } finally {
        setLoading(false);
      }
    };

    checkSession();
  }, [pathname, router]);

  const handleSignOut = async () => {
    await fetch('/api/admin/auth/logout', { method: 'POST' });
    router.push('/admin/login');
  };

  if (pathname === '/admin/login') return <>{children}</>;

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center">Loading...</div>;
  }

  if (!user) return null;

  const sidebarLinks = user.role === 'admin'
    ? [...baseLinks, { href: '/admin/users', label: 'Users', icon: Users }]
    : baseLinks;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-maroon-800">
        <div className="px-6 py-5 border-b border-maroon-700">
          <Link href="/admin" className="text-white font-display font-bold text-xl">{CLUB_SHORT} Admin</Link>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
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
          {mobileOpen && <nav className="px-4 pb-3 space-y-1">{sidebarLinks.map((link) => <Link className="block py-2" key={link.href} href={link.href}>{link.label}</Link>)}</nav>}
        </header>
        <main className="p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
