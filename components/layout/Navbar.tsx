'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { LazyMotion, domAnimation, m, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Menu, X, ChevronDown } from 'lucide-react';
import { NAV_LINKS } from '@/lib/constants';
import { fallbackClubSettings, type ClubSettings } from '@/lib/club-settings-types';
import { cn } from '@/lib/utils';
type HeaderLink = {
  id?: string;
  label: string;
  href: string;
  openInNewTab?: boolean;
};

export default function Navbar() {
  const reduceMotion = useReducedMotion();
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const [sessionUser, setSessionUser] = useState<{ full_name: string; role: string } | null>(null);
  const [settings, setSettings] = useState<ClubSettings>(fallbackClubSettings);
  const [navLinks, setNavLinks] = useState<HeaderLink[]>(NAV_LINKS.map((link) => ({ ...link })));
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
    const loadNavigation = async () => {
      try {
        const res = await fetch('/api/public/site-links?section=header_nav', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data?.data) && data.data.length > 0) {
          setNavLinks(data.data.map((link: { id: string; title: string; href: string; is_external: boolean }) => ({
            id: link.id,
            label: link.title,
            href: link.href,
            openInNewTab: link.is_external || /^https?:\/\//i.test(link.href),
          })));
        }
      } catch {
        // Safe fallback navigation remains loaded.
      }
    };
    loadNavigation();
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
  const primaryLinks = navLinks.slice(0, 7);
  const moreLinks = navLinks.slice(7);
  return (
    <nav
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b-2 border-maroon-700',
        scrolled
          ? 'bg-white/90 backdrop-blur-md shadow-md'
          : 'bg-white'
      )}
      role="navigation"
      aria-label="Main navigation"
    >
      {/* Maroon top bar */}
      <div className="bg-maroon-700 px-4 sm:px-6 lg:px-8 py-[5px] flex items-center justify-between">
        <span className="hidden sm:block text-[11px] text-maroon-100 font-body tracking-wide">
          {settings.ground_name}, {settings.address}
        </span>
        <div className="flex gap-4 ml-auto">
          <a
            href={settings.facebook_url || fallbackClubSettings.facebook_url || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-sky_accent hover:text-white transition-colors font-body"
          >
            Facebook
          </a>
          <a
            href={settings.playhq_url || fallbackClubSettings.playhq_url || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-sky_accent hover:text-white transition-colors font-body"
          >
            PlayHQ
          </a>
          <Link href="/contact" className="text-[11px] text-sky_accent hover:text-white transition-colors font-body">
            Contact
          </Link>
        </div>
      </div>
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
            <div className="hidden sm:flex flex-col">
              <span className="text-maroon-700 font-display font-semibold uppercase tracking-wide text-lg leading-none block">
                {settings.club_short}
              </span>
              <span className="text-gray-400 text-[10.5px] font-body tracking-[0.08em] uppercase mt-1">
                The Dinos · Est. {settings.established_year}
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-0.5">
            {primaryLinks.map((link) => (
              <Link
                key={`${link.href}-${link.label}`}
                href={link.href}
                target={link.openInNewTab ? '_blank' : undefined}
                rel={link.openInNewTab ? 'noopener noreferrer' : undefined}
                className={cn(
                  'px-3 py-2 text-sm font-body font-medium transition-colors',
                  pathname === link.href
                    ? 'text-maroon-700 border-b-2 border-maroon-700 pb-[6px] rounded-none'
                    : 'nav-underline text-gray-600 hover:text-maroon-700 rounded-lg'
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
              <div className="absolute right-0 top-full pt-1 invisible group-hover:visible opacity-0 group-hover:opacity-100 -translate-y-2 group-hover:translate-y-0 transition-all duration-200">
                <div className="bg-white rounded-xl shadow-md border border-gray-200 py-2 min-w-[180px]">
                  {moreLinks.map((link) => (
                    <Link
                      key={`${link.href}-${link.label}`}
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
                <div className="absolute right-0 top-full pt-1 invisible group-hover:visible opacity-0 group-hover:opacity-100 -translate-y-2 group-hover:translate-y-0 transition-all duration-200">
                  <div className="bg-white rounded-xl shadow-md border border-gray-200 py-2 min-w-[180px]">
                    <Link href="/admin" className="block px-4 py-2 text-sm text-gray-600 hover:text-maroon-700 hover:bg-maroon-50">Account</Link>
                    <Link href="/admin" className="block px-4 py-2 text-sm text-gray-600 hover:text-maroon-700 hover:bg-maroon-50">Admin Panel</Link>
                    <button type="button" onClick={handleSignOut} className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:text-maroon-700 hover:bg-maroon-50">
                      Logout
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Join CTA button */}
            <Link
              href="/join"
              className="ml-3 px-4 py-2 bg-maroon-700 text-white text-sm font-semibold rounded-lg hover:bg-maroon-800 transition-colors focus-ring"
            >
              Join the Club
            </Link>
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="lg:hidden p-2 rounded-md border border-gray-200 hover:bg-gray-100 transition-colors focus-ring"
            aria-label={isOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={isOpen}
          >
            {isOpen ? <X className="h-6 w-6 text-gray-700" /> : <Menu className="h-6 w-6 text-gray-700" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation */}
      <LazyMotion features={domAnimation} strict>
        <AnimatePresence initial={false}>
          {isOpen && (
            <m.div
              key="mobile-menu"
              className="lg:hidden overflow-hidden shadow-lg"
              initial={reduceMotion ? false : { height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              <div className="bg-white border-t border-gray-200 px-4 py-4 space-y-1 max-h-[70vh] overflow-y-auto">
          {navLinks.map((link) => (
            <Link
              key={`${link.href}-${link.label}`}
              href={link.href}
              target={link.openInNewTab ? '_blank' : undefined}
              rel={link.openInNewTab ? 'noopener noreferrer' : undefined}
              className={cn(
                'block px-4 py-3 text-base font-body font-medium rounded-xl transition-colors',
                pathname === link.href
                  ? 'text-maroon-700 bg-maroon-50'
                  : 'text-gray-600 hover:text-maroon-700 hover:bg-maroon-50'
              )}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/join"
            className="block px-4 py-3 mt-1 text-base font-body font-semibold text-center bg-maroon-700 text-white rounded-xl hover:bg-maroon-800 transition-colors focus-ring"
          >
            Join the Club
          </Link>
          {sessionUser && (
            <>
              <Link href="/admin" className="block px-4 py-3 text-base font-body font-medium rounded-xl text-gray-600 hover:text-maroon-700 hover:bg-maroon-50">
                {sessionUser.full_name} ({sessionUser.role})
              </Link>
              <button type="button" onClick={handleSignOut} className="block w-full text-left px-4 py-3 text-base font-body font-medium rounded-xl text-gray-600 hover:text-maroon-700 hover:bg-maroon-50">
                Logout
              </button>
            </>
          )}
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </LazyMotion>
    </nav>
  );
}
