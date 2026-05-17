'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Menu, X, ChevronDown } from 'lucide-react';
import { NAV_LINKS } from '@/lib/constants';
import { fallbackClubSettings, type ClubSettings } from '@/lib/club-settings-types';
import { cn } from '@/lib/utils';

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const [sessionUser, setSessionUser] = useState<{ full_name: string; role: string } | null>(null);
  const [settings, setSettings] = useState<ClubSettings>(fallbackClubSettings);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  useEffect(() => {
    const loadClubSettings = async () => {
      try {
        const res = await fetch('/api/club-settings', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (data?.data) setSettings(data.data);
      } catch {
        // Safe fallback constants are already loaded.
      }
    };
    loadClubSettings();
  }, []);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const res = await fetch('/api/admin/auth/session', { cache: 'no-store', credentials: 'include' });
        if (!res.ok) {
          setSessionUser(null);
          return;
        }
        const data = await res.json();
        setSessionUser(data?.authenticated ? data.user : null);
      } catch {
        setSessionUser(null);
      }
    };
    loadSession();
  }, [pathname]);

  const handleSignOut = async () => {
    await fetch('/api/admin/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => undefined);
    setSessionUser(null);
  };

  const primaryLinks = NAV_LINKS.slice(0, 7);
  const moreLinks = NAV_LINKS.slice(7);

  return (
    <nav
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        scrolled
          ? 'bg-white/95 backdrop-blur-sm shadow-sm border-b border-gray-200'
          : 'bg-white border-b border-transparent'
      )}
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="container-width px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-[4.75rem]">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 shrink-0" aria-label={`${settings.club_short} Home`}>
            <Image
              src="/images/logo.jpg"
              alt="NDCC Logo"
              width={48}
              height={48}
              className="rounded-full"
              priority
            />
            <div className="hidden sm:block">
              <span className="text-maroon-700 font-display font-semibold uppercase tracking-wide text-lg leading-tight block">
                {settings.club_short}
              </span>
              <span className="text-gray-500 text-xs font-body tracking-wide">Est. {settings.established_year}</span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-1">
            {primaryLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                target={link.openInNewTab ? '_blank' : undefined}
                rel={link.openInNewTab ? 'noopener noreferrer' : undefined}
                className={cn(
                  'px-3 py-2 text-sm font-body font-medium rounded-lg transition-colors',
                  pathname === link.href
                    ? 'text-maroon-700 bg-maroon-50'
                    : 'text-gray-600 hover:text-maroon-700 hover:bg-maroon-50'
                )}
              >
                {link.label}
              </Link>
            ))}

            {/* More dropdown */}
            <div className="relative group">
              <button className="flex items-center gap-1 px-3 py-2 text-sm font-body font-medium text-gray-600 hover:text-maroon-700 hover:bg-maroon-50 rounded-lg transition-colors">
                More <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <div className="absolute right-0 top-full pt-1 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200">
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 py-2 min-w-[180px]">
                  {moreLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      target={link.openInNewTab ? '_blank' : undefined}
                      rel={link.openInNewTab ? 'noopener noreferrer' : undefined}
                      className={cn(
                        'block px-4 py-2 text-sm font-body transition-colors',
                        pathname === link.href
                          ? 'text-maroon-700 bg-maroon-50'
                          : 'text-gray-600 hover:text-maroon-700 hover:bg-maroon-50'
                      )}
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            {sessionUser && (
              <div className="relative group ml-2">
                <button className="flex items-center gap-1 px-3 py-2 text-sm font-body font-medium text-gray-600 hover:text-maroon-700 hover:bg-maroon-50 rounded-lg transition-colors">
                  {sessionUser.full_name} <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <div className="absolute right-0 top-full pt-1 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200">
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 py-2 min-w-[180px]">
                    <Link href="/admin" className="block px-4 py-2 text-sm text-gray-600 hover:text-maroon-700 hover:bg-maroon-50">Account</Link>
                    <Link href="/admin" className="block px-4 py-2 text-sm text-gray-600 hover:text-maroon-700 hover:bg-maroon-50">Admin Panel</Link>
                    <button type="button" onClick={handleSignOut} className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:text-maroon-700 hover:bg-maroon-50">
                      Logout
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="lg:hidden p-2 rounded-md border border-gray-200 hover:bg-gray-100 transition-colors"
            aria-label={isOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={isOpen}
          >
            {isOpen ? <X className="h-6 w-6 text-gray-700" /> : <Menu className="h-6 w-6 text-gray-700" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation */}
      <div
        className={cn(
          'lg:hidden overflow-hidden transition-all duration-300',
          isOpen ? 'max-h-[80vh] opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className="bg-white border-t border-gray-200 px-4 py-4 space-y-1 max-h-[70vh] overflow-y-auto">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              target={link.openInNewTab ? '_blank' : undefined}
              rel={link.openInNewTab ? 'noopener noreferrer' : undefined}
              className={cn(
                'block px-4 py-3 text-base font-body font-medium rounded-lg transition-colors',
                pathname === link.href
                  ? 'text-maroon-700 bg-maroon-50'
                  : 'text-gray-600 hover:text-maroon-700 hover:bg-maroon-50'
              )}
            >
              {link.label}
            </Link>
          ))}
          {sessionUser && (
            <>
              <Link href="/admin" className="block px-4 py-3 text-base font-body font-medium rounded-lg text-gray-600 hover:text-maroon-700 hover:bg-maroon-50">
                {sessionUser.full_name} ({sessionUser.role})
              </Link>
              <button type="button" onClick={handleSignOut} className="block w-full text-left px-4 py-3 text-base font-body font-medium rounded-lg text-gray-600 hover:text-maroon-700 hover:bg-maroon-50">
                Logout
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
