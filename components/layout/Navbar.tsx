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
import ThemeToggle from '@/components/common/ThemeToggle';
type HeaderLink = {
  id?: string;
  label: string;
  href: string;
  openInNewTab?: boolean;
};


type PublicNavGroup = { label: string; href?: string; links?: Array<{ label: string; href: string }> };

const PUBLIC_NAV_GROUPS: PublicNavGroup[] = [
  { label: 'Home', href: '/' },
  { label: 'Cricket', links: [{ label: 'Teams', href: '/teams' }, { label: 'Fixtures', href: '/fixtures' }, { label: 'Fantasy', href: '/fantasy' }] },
  { label: 'Club', links: [{ label: 'About', href: '/about' }, { label: 'Facilities', href: '/facilities' }, { label: 'History', href: '/about#history' }] },
  { label: 'Get Involved', links: [{ label: 'Join', href: '/join' }, { label: 'Volunteer', href: '/volunteer' }, { label: 'Events', href: '/events' }] },
  { label: 'Community', links: [{ label: 'News', href: '/news' }, { label: 'Publications', href: '/publications' }, { label: 'Gallery', href: '/gallery' }, { label: 'Sponsors', href: '/sponsors' }] },
  { label: 'Shop', links: [{ label: 'Merchandise', href: '/merchandise' }, { label: 'Kitchen', href: '/kitchen' }] },
  { label: 'Contact', href: '/contact' },
];

function resolveLink(navLinks: HeaderLink[], fallback: { label: string; href: string }): HeaderLink {
  return navLinks.find((link) => link.href === fallback.href) || fallback;
}

function resolveGroups(navLinks: HeaderLink[]) {
  return PUBLIC_NAV_GROUPS.map((group) => group.href
    ? { ...resolveLink(navLinks, { label: group.label, href: group.href }), links: undefined }
    : { label: group.label, href: undefined, links: (group.links || []).map((link) => resolveLink(navLinks, link)) });
}

export default function Navbar() {
  const reduceMotion = useReducedMotion();
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const [sessionUser, setSessionUser] = useState<{ full_name: string; role: string } | null>(null);
  const [settings, setSettings] = useState<ClubSettings>(fallbackClubSettings);
  const [navLinks, setNavLinks] = useState<HeaderLink[]>(NAV_LINKS.map((link) => ({ ...link })));
  const [moreOpen, setMoreOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  useEffect(() => {
    setIsOpen(false);
    setMoreOpen(false);
    setAccountOpen(false);
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
            // Local routes (e.g. /fantasy) must never open in a new tab, even if a CMS
            // row is mis-flagged is_external — only real http(s) URLs qualify.
            openInNewTab: /^https?:\/\//i.test(link.href),
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
  const navGroups = resolveGroups(navLinks);
  return (
    <nav
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b-2 border-maroon-700',
        scrolled
          ? 'bg-surface-nav/90 backdrop-blur-md shadow-md'
          : 'bg-surface-nav'
      )}
      role="navigation"
      aria-label="Main navigation"
    >
      {/* Maroon utility bar */}
      <div className="bg-maroon-700 px-4 sm:px-6 lg:px-8 py-[6px] flex items-center justify-between">
        <span className="hidden sm:block text-[10.5px] text-maroon-100 font-body tracking-[0.02em]">
          {settings.ground_name}, {settings.address}
        </span>
        <div className="flex gap-4 ml-auto">
          <a
            href={settings.facebook_url || fallbackClubSettings.facebook_url || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10.5px] font-semibold text-sky_accent hover:text-white transition-colors font-body"
          >
            Facebook
          </a>
          <a
            href={settings.playhq_url || fallbackClubSettings.playhq_url || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10.5px] font-semibold text-sky_accent hover:text-white transition-colors font-body"
          >
            PlayHQ
          </a>
          <Link href="/contact" className="text-[10.5px] font-semibold text-sky_accent hover:text-white transition-colors font-body">
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
              <span className="text-maroon-700 dark:text-maroon-200 font-display font-semibold uppercase tracking-wide text-lg leading-none block">
                {settings.club_short}
              </span>
              <span className="text-gray-400 dark:text-slate-400 text-[10.5px] font-body tracking-[0.08em] uppercase mt-1">
                The Dinos · Est. {settings.established_year}
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-0.5">
            {navGroups.map((group) => group.href ? (
              <Link
                key={`${group.href}-${group.label}`}
                href={group.href}
                className={cn(
                  'px-3 py-2 text-sm font-body font-medium transition-colors rounded-lg focus-ring',
                  pathname === group.href
                    ? "relative text-maroon-700 font-semibold after:absolute after:left-3 after:right-3 after:bottom-1 after:h-0.5 after:rounded-full after:bg-maroon-700 after:content-[''] dark:text-maroon-200 dark:after:bg-maroon-300"
                    : 'nav-underline text-gray-600 hover:text-maroon-700 dark:text-slate-300 dark:hover:text-maroon-200'
                )}
              >
                {group.label}
              </Link>
            ) : (
              <div
                key={group.label}
                className="relative group"
                onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setMoreOpen(false); }}
                onKeyDown={(e) => { if (e.key === 'Escape') setMoreOpen(false); }}
              >
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={moreOpen}
                  onClick={() => setMoreOpen((open) => !open)}
                  className="flex items-center gap-1 px-3 py-2 text-sm font-body font-medium text-gray-600 hover:text-maroon-700 hover:bg-maroon-50 rounded-lg transition-colors focus-ring dark:text-slate-300 dark:hover:text-maroon-200 dark:hover:bg-maroon-950/50"
                >
                  {group.label} <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <div className={cn(
                  'absolute left-0 top-full pt-1 transition-all duration-200 group-hover:visible group-hover:opacity-100 group-hover:translate-y-0',
                  moreOpen ? 'visible opacity-100 translate-y-0' : 'invisible opacity-0 -translate-y-2'
                )}>
                  <div className="bg-surface-elevated rounded-xl shadow-md border border-edge-subtle py-2 min-w-[190px]" role="menu">
                    {group.links?.map((link) => (
                      <Link key={`${group.label}-${link.href}`} href={link.href} className={cn('block px-4 py-2 text-sm font-body transition-colors focus-ring', pathname === link.href ? 'text-maroon-700 bg-maroon-50 dark:text-maroon-200 dark:bg-maroon-950/70' : 'text-gray-600 hover:text-maroon-700 hover:bg-maroon-50 dark:text-slate-300 dark:hover:text-maroon-200 dark:hover:bg-maroon-950/60')}>
                        {link.label}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            ))}

            {sessionUser && (
              <div
                className="relative group ml-2"
                onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setAccountOpen(false); }}
                onKeyDown={(e) => { if (e.key === 'Escape') setAccountOpen(false); }}
              >
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={accountOpen}
                  onClick={() => setAccountOpen((open) => !open)}
                  className="flex items-center gap-1 px-3 py-2 text-sm font-body font-medium text-gray-600 hover:text-maroon-700 hover:bg-maroon-50 rounded-lg transition-colors focus-ring dark:text-slate-300 dark:hover:text-maroon-200 dark:hover:bg-maroon-950/50"
                >
                  {sessionUser.full_name} <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <div className={cn(
                  'absolute right-0 top-full pt-1 transition-all duration-200 group-hover:visible group-hover:opacity-100 group-hover:translate-y-0',
                  accountOpen ? 'visible opacity-100 translate-y-0' : 'invisible opacity-0 -translate-y-2'
                )}>
                  <div className="bg-surface-elevated rounded-xl shadow-md border border-edge-subtle py-2 min-w-[180px]">
                    <Link href="/admin" className="block px-4 py-2 text-sm text-gray-600 hover:text-maroon-700 hover:bg-maroon-50 dark:text-slate-300 dark:hover:text-maroon-200 dark:hover:bg-maroon-950/60">Account</Link>
                    <Link href="/admin" className="block px-4 py-2 text-sm text-gray-600 hover:text-maroon-700 hover:bg-maroon-50 dark:text-slate-300 dark:hover:text-maroon-200 dark:hover:bg-maroon-950/60">Admin Panel</Link>
                    <button type="button" onClick={handleSignOut} className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:text-maroon-700 hover:bg-maroon-50 dark:text-slate-300 dark:hover:text-maroon-200 dark:hover:bg-maroon-950/60">
                      Logout
                    </button>
                  </div>
                </div>
              </div>
            )}

            <ThemeToggle className="ml-3" />

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
            className="lg:hidden p-2 rounded-md border border-gray-200 hover:bg-gray-100 transition-colors focus-ring dark:border-slate-700 dark:hover:bg-maroon-950/50"
            aria-label={isOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={isOpen}
          >
            {isOpen ? <X className="h-6 w-6 text-gray-700 dark:text-slate-200" /> : <Menu className="h-6 w-6 text-gray-700 dark:text-slate-200" />}
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
              <div className="bg-surface-nav px-4 py-4 space-y-1 max-h-[70vh] overflow-y-auto shadow-[inset_0_10px_14px_-12px_rgba(45,0,0,0.20)] dark:shadow-[inset_0_10px_14px_-12px_rgba(0,0,0,0.55)]">
          {navGroups.map((group) => group.href ? (
            <Link key={`${group.href}-${group.label}`} href={group.href} className={cn('block px-4 py-3 text-base font-body font-medium rounded-xl transition-colors focus-ring', pathname === group.href ? 'text-maroon-700 bg-maroon-50 dark:text-maroon-200 dark:bg-maroon-950/50' : 'text-gray-600 hover:text-maroon-700 hover:bg-maroon-50 dark:text-slate-300 dark:hover:text-maroon-200 dark:hover:bg-maroon-950/50')}>
              {group.label}
            </Link>
          ) : (
            <section key={group.label} className="rounded-xl border border-edge-subtle/60 p-2">
              <h2 className="px-2 py-1 text-xs font-bold uppercase tracking-wide text-maroon-700 dark:text-maroon-200">{group.label}</h2>
              {group.links?.map((link) => <Link key={`${group.label}-${link.href}`} href={link.href} className="block rounded-lg px-3 py-2.5 text-base font-body text-gray-600 hover:bg-maroon-50 hover:text-maroon-700 focus-ring dark:text-slate-300 dark:hover:bg-maroon-950/50 dark:hover:text-maroon-200">{link.label}</Link>)}
            </section>
          ))}
          <Link
            href="/join"
            className="block px-4 py-3 mt-1 text-base font-body font-semibold text-center bg-maroon-700 text-white rounded-xl hover:bg-maroon-800 transition-colors focus-ring"
          >
            Join the Club
          </Link>
          {sessionUser && (
            <>
              <Link href="/admin" className="block px-4 py-3 text-base font-body font-medium rounded-xl text-gray-600 hover:text-maroon-700 hover:bg-maroon-50 dark:text-slate-300 dark:hover:text-maroon-200 dark:hover:bg-maroon-950/50">
                {sessionUser.full_name} ({sessionUser.role})
              </Link>
              <button type="button" onClick={handleSignOut} className="block w-full text-left px-4 py-3 text-base font-body font-medium rounded-xl text-gray-600 hover:text-maroon-700 hover:bg-maroon-50 dark:text-slate-300 dark:hover:text-maroon-200 dark:hover:bg-maroon-950/50">
                Logout
              </button>
            </>
          )}
          <div className="flex items-center justify-between px-4 pt-3 mt-2 border-t border-edge-subtle">
            <span className="text-sm font-body font-medium text-gray-600 dark:text-slate-300">Theme</span>
            <ThemeToggle />
          </div>
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </LazyMotion>
    </nav>
  );
}
