'use client';
import { useState, useEffect, useRef } from 'react';
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

type RegistrationNavigation = {
  label: string;
  href: '/player-registration';
} | null;


type PublicNavGroup = { label: string; href?: string; links?: Array<{ label: string; href: string }> };

const PUBLIC_NAV_GROUPS: PublicNavGroup[] = [
  { label: 'Home', href: '/' },
  { label: 'Cricket', links: [{ label: 'Teams', href: '/teams' }, { label: 'Fixtures', href: '/fixtures' }, { label: 'Fantasy', href: '/fantasy' }] },
  { label: 'Club', links: [{ label: 'About', href: '/about' }, { label: 'Facilities', href: '/facilities' }, { label: 'History', href: '/about#history' }] },
  { label: 'Get Involved', links: [{ label: 'Join', href: '/join' }, { label: 'Volunteer', href: '/volunteer' }, { label: 'Events', href: '/events' }] },
  { label: 'Community', links: [{ label: 'News', href: '/news' }, { label: 'Publications', href: '/publications' }, { label: 'Gallery', href: '/gallery' }, { label: 'Sponsors', href: '/sponsors' }] },
  { label: 'Shop', links: [{ label: 'Merchandise', href: '/merchandise' }, { label: 'Kitchen', href: '/kitchen' }, { label: 'Raffle', href: '/raffle' }] },
  { label: 'Contact', href: '/contact' },
];

function resolveLink(navLinks: HeaderLink[], fallback: { label: string; href: string }): HeaderLink {
  return navLinks.find((link) => link.href === fallback.href) || fallback;
}

function resolveGroups(navLinks: HeaderLink[], dinoCoachEnabled: boolean) {
  return PUBLIC_NAV_GROUPS.map((group) => group.href
    ? { ...resolveLink(navLinks, { label: group.label, href: group.href }), links: undefined }
    : { label: group.label, href: undefined, links: (group.links || [])
      .filter((link) => dinoCoachEnabled || link.href !== '/fantasy')
      .map((link) => resolveLink(navLinks, link)) });
}

export default function Navbar() {
  const reduceMotion = useReducedMotion();
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const [sessionUser, setSessionUser] = useState<{ full_name: string; role: string } | null>(null);
  const [settings, setSettings] = useState<ClubSettings>(fallbackClubSettings);
  const [navLinks, setNavLinks] = useState<HeaderLink[]>(NAV_LINKS.map((link) => ({ ...link })));
  const [registrationNavigation, setRegistrationNavigation] = useState<RegistrationNavigation>(null);
  const [dinoCoachEnabled, setDinoCoachEnabled] = useState(false);
  // Which desktop dropdown group is click/keyboard-opened (hover opening is
  // handled per-group in CSS). One label at a time so opening a group can
  // never surface another group's panel.
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const loadDinoCoachStatus = async () => {
      try {
        const response = await fetch('/api/public/dino-coach-status', { cache: 'no-store' });
        const result = await response.json();
        setDinoCoachEnabled(response.ok && result?.enabled === true);
      } catch {
        setDinoCoachEnabled(false);
      }
    };
    loadDinoCoachStatus();
  }, [pathname]);
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  useEffect(() => {
    setIsOpen(false);
    setOpenGroup(null);
    setAccountOpen(false);
  }, [pathname]);
  // Full-screen mobile menu: lock body scroll, trap focus inside the overlay,
  // close on Escape, and hand focus back to the menu button on close.
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const menuButton = menuButtonRef.current;
    const container = menuRef.current;
    const focusables = () => Array.from(
      container?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);
    focusables()[0]?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      menuButton?.focus();
    };
  }, [isOpen]);
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
    const loadRegistrationNavigation = async () => {
      try {
        const response = await fetch('/api/public/player-registration', { cache: 'no-store' });
        if (!response.ok) {
          setRegistrationNavigation(null);
          return;
        }
        const result = await response.json();
        const registration = result?.data;
        const visible = Boolean(
          registration
          && registration.showInNavigation === true
          && registration.availability !== 'closed'
          && Array.isArray(registration.options)
          && registration.options.length > 0,
        );
        setRegistrationNavigation(visible
          ? { label: String(registration.navigationLabel || 'Player Registration'), href: '/player-registration' }
          : null);
      } catch {
        setRegistrationNavigation(null);
      }
    };
    loadRegistrationNavigation();
  }, [pathname]);
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
  const navGroups = resolveGroups(navLinks, dinoCoachEnabled);
  // Homepage nav starts transparent over the cinematic hero and settles onto
  // a translucent blurred surface after ~20px of scroll. Inner pages are
  // solid from the start.
  const isHome = pathname === '/';
  const transparent = isHome && !scrolled && !isOpen;
  return (
    <nav
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        transparent
          ? 'border-b border-white/15 bg-transparent'
          : scrolled
            ? 'border-b-2 border-maroon-700 bg-surface-nav/90 backdrop-blur-md shadow-md'
            : 'border-b-2 border-maroon-700 bg-surface-nav'
      )}
      role="navigation"
      aria-label="Main navigation"
    >
      {/* Maroon utility bar */}
      <div className={cn('px-4 sm:px-6 lg:px-8 py-[6px] flex items-center justify-between transition-colors duration-300', transparent ? 'bg-maroon-950/35 backdrop-blur-sm' : 'bg-maroon-700')}>
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
            <div className="hidden sm:flex lg:hidden xl:flex flex-col">
              <span className={cn('font-display font-semibold uppercase tracking-wide text-lg leading-none block', transparent ? 'text-white' : 'text-maroon-700 dark:text-maroon-200')}>
                {settings.club_short}
              </span>
              <span className={cn('text-[10.5px] font-body tracking-[0.08em] uppercase mt-1', transparent ? 'text-white/70' : 'text-gray-600 dark:text-slate-400')}>
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
                    ? transparent
                      ? "relative text-white font-semibold after:absolute after:left-3 after:right-3 after:bottom-1 after:h-0.5 after:rounded-full after:bg-gold-300 after:content-['']"
                      : "relative text-maroon-700 dark:text-maroon-200 font-semibold after:absolute after:left-3 after:right-3 after:bottom-1 after:h-0.5 after:rounded-full after:bg-maroon-700 after:content-[''] dark:text-maroon-200 dark:after:bg-maroon-300"
                    : transparent
                      ? 'nav-underline text-white/85 hover:text-white'
                      : 'nav-underline text-content-muted hover:text-maroon-700 dark:text-slate-300 dark:hover:text-maroon-200'
                )}
              >
                {group.label}
              </Link>
            ) : (
              <div
                key={group.label}
                className="relative group"
                onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpenGroup(null); }}
                onKeyDown={(e) => { if (e.key === 'Escape') setOpenGroup(null); }}
              >
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={openGroup === group.label}
                  onClick={() => setOpenGroup((open) => (open === group.label ? null : group.label))}
                  className={cn(
                    'flex items-center gap-1 px-3 py-2 text-sm font-body font-medium rounded-lg transition-colors focus-ring',
                    // A group whose child route is active reads as active too,
                    // matching the top-level link treatment (hash links share
                    // their base pathname, e.g. /about#history).
                    group.links?.some((link) => pathname === link.href.split('#')[0])
                      ? transparent
                        ? 'text-white font-semibold'
                        : 'text-maroon-700 font-semibold dark:text-maroon-200'
                      : transparent
                        ? 'text-white/85 hover:text-white hover:bg-white/10'
                        : 'text-content-muted hover:text-maroon-700 hover:bg-maroon-50 dark:text-slate-300 dark:hover:text-maroon-200 dark:hover:bg-maroon-950/50'
                  )}
                >
                  {group.label} <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200 group-hover:rotate-180', openGroup === group.label && 'rotate-180')} aria-hidden="true" />
                </button>
                <div className={cn(
                  'absolute left-0 top-full pt-1 transition-all duration-200 group-hover:visible group-hover:opacity-100 group-hover:translate-y-0',
                  openGroup === group.label ? 'visible opacity-100 translate-y-0' : 'invisible opacity-0 -translate-y-2'
                )}>
                  <div className="bg-surface-elevated rounded-xl shadow-md border border-edge-subtle py-2 min-w-[190px]" role="menu">
                    {group.links?.map((link) => (
                      <Link key={`${group.label}-${link.href}`} href={link.href} className={cn('block px-4 py-2 text-sm font-body transition-colors focus-ring', pathname === link.href ? 'text-maroon-700 bg-maroon-50 dark:text-maroon-200 dark:bg-maroon-950/70' : 'text-content-muted hover:text-maroon-700 hover:bg-maroon-50 dark:text-slate-300 dark:hover:text-maroon-200 dark:hover:bg-maroon-950/60')}>
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
                  className={cn('flex items-center gap-1 px-3 py-2 text-sm font-body font-medium rounded-lg transition-colors focus-ring', transparent ? 'text-white/85 hover:text-white hover:bg-white/10' : 'text-content-muted hover:text-maroon-700 hover:bg-maroon-50 dark:text-slate-300 dark:hover:text-maroon-200 dark:hover:bg-maroon-950/50')}
                >
                  {sessionUser.full_name} <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200 group-hover:rotate-180', accountOpen && 'rotate-180')} aria-hidden="true" />
                </button>
                <div className={cn(
                  'absolute right-0 top-full pt-1 transition-all duration-200 group-hover:visible group-hover:opacity-100 group-hover:translate-y-0',
                  accountOpen ? 'visible opacity-100 translate-y-0' : 'invisible opacity-0 -translate-y-2'
                )}>
                  <div className="bg-surface-elevated rounded-xl shadow-md border border-edge-subtle py-2 min-w-[180px]">
                    <Link href="/admin" className="block px-4 py-2 text-sm text-content-muted hover:text-maroon-700 hover:bg-maroon-50 dark:text-slate-300 dark:hover:text-maroon-200 dark:hover:bg-maroon-950/60">Account</Link>
                    <Link href="/admin" className="block px-4 py-2 text-sm text-content-muted hover:text-maroon-700 hover:bg-maroon-50 dark:text-slate-300 dark:hover:text-maroon-200 dark:hover:bg-maroon-950/60">Admin Panel</Link>
                    <button type="button" onClick={handleSignOut} className="w-full text-left px-4 py-2 text-sm text-content-muted hover:text-maroon-700 hover:bg-maroon-50 dark:text-slate-300 dark:hover:text-maroon-200 dark:hover:bg-maroon-950/60">
                      Logout
                    </button>
                  </div>
                </div>
              </div>
            )}

            <ThemeToggle className="ml-3" />

            {/* Seasonal registration replaces the existing CTA slot when published. */}
            <Link
              href={registrationNavigation?.href || '/join'}
              className={cn(
                'ml-2 inline-flex min-h-11 max-w-[180px] items-center justify-center rounded-lg bg-maroon-700 px-3 py-2 text-center text-xs font-semibold leading-tight text-white transition-colors hover:bg-maroon-800 focus-ring',
                pathname === registrationNavigation?.href && 'ring-2 ring-gold-300',
              )}
              aria-current={pathname === registrationNavigation?.href ? 'page' : undefined}
            >
              {registrationNavigation?.label || 'Join the Club'}
            </Link>
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className={cn('lg:hidden min-h-11 min-w-11 p-2 rounded-md border transition-colors focus-ring', transparent ? 'border-white/40 hover:bg-white/10' : 'border-edge-subtle hover:bg-surface-muted dark:border-slate-700 dark:hover:bg-maroon-950/50')}
            ref={menuButtonRef}
            aria-label={isOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={isOpen}
          >
            {isOpen ? <X className={cn('h-6 w-6', transparent ? 'text-white' : 'text-content-secondary dark:text-slate-200')} /> : <Menu className={cn('h-6 w-6', transparent ? 'text-white' : 'text-content-secondary dark:text-slate-200')} />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation: full-screen overlay with focus trap + scroll lock */}
      <LazyMotion features={domAnimation} strict>
        <AnimatePresence initial={false}>
          {isOpen && (
            <m.div
              key="mobile-menu"
              ref={menuRef}
              className="lg:hidden fixed inset-0 z-[60] flex flex-col bg-surface-nav"
              initial={reduceMotion ? false : { opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -16 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              role="dialog"
              aria-modal="true"
              aria-label="Site menu"
            >
              <div className="flex items-center justify-between border-b border-edge-subtle px-4 py-4">
                <span className="flex items-center gap-3">
                  <Image src="/images/logo.jpg" alt="NDCC Logo" width={40} height={40} className="rounded-full" />
                  <span className="font-display text-lg font-semibold uppercase tracking-wide text-maroon-700 dark:text-maroon-200">{settings.club_short}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="min-h-11 min-w-11 p-2 rounded-md border border-edge-subtle hover:bg-surface-muted transition-colors focus-ring"
                  aria-label="Close menu"
                >
                  <X className="h-6 w-6 text-content-secondary" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto bg-surface-nav px-4 py-4 space-y-1 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {navGroups.map((group) => group.href ? (
            <Link key={`${group.href}-${group.label}`} href={group.href} className={cn('block px-4 py-3 text-base font-body font-medium rounded-xl transition-colors focus-ring', pathname === group.href ? 'text-maroon-700 bg-maroon-50 dark:text-maroon-200 dark:bg-maroon-950/50' : 'text-content-muted hover:text-maroon-700 hover:bg-maroon-50 dark:text-slate-300 dark:hover:text-maroon-200 dark:hover:bg-maroon-950/50')}>
              {group.label}
            </Link>
          ) : (
            <section key={group.label} className="rounded-xl border border-edge-subtle/60 p-2">
              <h2 className="px-2 py-1 text-xs font-bold uppercase tracking-wide text-maroon-700 dark:text-maroon-200">{group.label}</h2>
              {group.links?.map((link) => <Link key={`${group.label}-${link.href}`} href={link.href} className="block rounded-lg px-3 py-2.5 text-base font-body text-content-muted hover:bg-maroon-50 hover:text-maroon-700 focus-ring dark:text-slate-300 dark:hover:bg-maroon-950/50 dark:hover:text-maroon-200">{link.label}</Link>)}
            </section>
          ))}
      <Link
        href={registrationNavigation?.href || '/join'}
        className="block px-4 py-3 mt-1 text-base font-body font-semibold text-center bg-maroon-700 text-white rounded-xl hover:bg-maroon-800 transition-colors focus-ring"
        aria-current={pathname === registrationNavigation?.href ? 'page' : undefined}
      >
        {registrationNavigation?.label || 'Join the Club'}
      </Link>
          {sessionUser && (
            <>
              <Link href="/admin" className="block px-4 py-3 text-base font-body font-medium rounded-xl text-content-muted hover:text-maroon-700 hover:bg-maroon-50 dark:text-slate-300 dark:hover:text-maroon-200 dark:hover:bg-maroon-950/50">
                {sessionUser.full_name} ({sessionUser.role})
              </Link>
              <button type="button" onClick={handleSignOut} className="block w-full text-left px-4 py-3 text-base font-body font-medium rounded-xl text-content-muted hover:text-maroon-700 hover:bg-maroon-50 dark:text-slate-300 dark:hover:text-maroon-200 dark:hover:bg-maroon-950/50">
                Logout
              </button>
            </>
          )}
          <div className="flex items-center justify-between px-4 pt-3 mt-2 border-t border-edge-subtle">
            <span className="text-sm font-body font-medium text-content-muted dark:text-slate-300">Theme</span>
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
