'use client';
import { useState, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { LazyMotion, domAnimation, m, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Menu, X, ChevronDown, UserRound } from 'lucide-react';
import { useCookieDoughOpen } from '@/components/common/CookieDoughVisibility';
import { isCookieDoughLink } from '@/lib/cookie-dough';
import { fallbackClubSettings } from '@/lib/club-settings-types';
import { cn } from '@/lib/utils';
import ThemeToggle from '@/components/common/ThemeToggle';
import type { NavHeaderLink, NavVisibility } from '@/lib/server/nav-visibility';

type HeaderLink = NavHeaderLink;

type PublicNavGroup = { label: string; href?: string; links?: Array<{ label: string; href: string }> };

// Information architecture: Calendar sits with fixtures under Cricket, club
// and player sponsors share one Sponsors group, and both raffles share one
// Raffles group (shown only while at least one raffle is publicly visible).
// Contact appears once, as the final top-level item.
const PUBLIC_NAV_GROUPS: PublicNavGroup[] = [
  { label: 'Home', href: '/' },
  { label: 'Cricket', links: [{ label: 'Teams', href: '/teams' }, { label: 'Fixtures', href: '/fixtures' }, { label: 'Calendar', href: '/calendar' }, { label: 'Fantasy', href: '/fantasy' }] },
  { label: 'Club', links: [{ label: 'About', href: '/about' }, { label: 'Facilities', href: '/facilities' }, { label: 'History', href: '/about#club-history' }] },
  { label: 'Get Involved', links: [{ label: 'Join', href: '/join' }, { label: 'Volunteer', href: '/volunteer' }, { label: 'Events', href: '/events' }, { label: 'Cookie Dough Fundraiser', href: '/fundraising/cookie-dough' }] },
  { label: 'Community', links: [{ label: 'News', href: '/news' }, { label: 'Publications', href: '/publications' }, { label: 'Gallery', href: '/gallery' }] },
  { label: 'Sponsors', links: [{ label: 'Sponsors', href: '/sponsors' }, { label: 'Player Sponsors', href: '/player-sponsors' }] },
  { label: 'Shop', links: [{ label: 'Merchandise', href: '/merchandise' }, { label: 'Pot Club', href: '/pot-club' }, { label: 'Pay apparel balance', href: '/pay-balance' }, { label: 'Kitchen', href: '/kitchen' }] },
  { label: 'Raffles', links: [{ label: 'Raffle', href: '/raffle' }, { label: 'Reverse Raffle', href: '/reverse-raffle' }] },
  { label: 'Contact', href: '/contact' },
];

function resolveLink(navLinks: HeaderLink[], fallback: { label: string; href: string }): HeaderLink {
  return navLinks.find((link) => link.href === fallback.href) || fallback;
}

function resolveGroups(navLinks: HeaderLink[], dinoCoachEnabled: boolean, raffleEnabled: boolean, cookieDoughOpen: boolean, reverseRaffleEnabled: boolean) {
  return PUBLIC_NAV_GROUPS.map((group) => group.href
    ? { ...resolveLink(navLinks, { label: group.label, href: group.href }), links: undefined }
    : { label: group.label, href: undefined, links: (group.links || [])
      .filter((link) => (dinoCoachEnabled || link.href !== '/fantasy') && (raffleEnabled || link.href !== '/raffle') && (reverseRaffleEnabled || link.href !== '/reverse-raffle') && (cookieDoughOpen || !isCookieDoughLink(link.href)))
      .map((link) => resolveLink(navLinks, link)) })
    // A dropdown with no visible links (e.g. Raffles while both are hidden) is omitted.
    .filter((group) => group.href || (group.links && group.links.length > 0));
}

// The admin session cookie is httpOnly, so the client cannot see it. Rather
// than calling /api/admin/auth/session for every visitor (a guaranteed 401 for
// the public), the session is only checked on admin/committee surfaces, or on
// public pages once this browser has previously held a valid session. The hint
// is cleared on logout or on any 401. It is only a hint: the server remains the
// sole authority on the session and the hint grants nothing by itself.
const ADMIN_SESSION_HINT_KEY = 'ndcc-admin-session-hint';

function readAdminHint() {
  try { return window.localStorage.getItem(ADMIN_SESSION_HINT_KEY) === '1'; } catch { return false; }
}

function writeAdminHint(present: boolean) {
  try {
    if (present) window.localStorage.setItem(ADMIN_SESSION_HINT_KEY, '1');
    else window.localStorage.removeItem(ADMIN_SESSION_HINT_KEY);
  } catch { /* storage unavailable: sessions are then only checked on admin surfaces */ }
}

function isAdminSurface(pathname: string | null) {
  return Boolean(pathname && (pathname === '/admin' || pathname.startsWith('/admin/') || pathname === '/committee' || pathname.startsWith('/committee/')));
}

function menuItems(container: HTMLElement | null) {
  return Array.from(container?.querySelectorAll<HTMLElement>('[data-nav-menu] a, [data-nav-menu] button') ?? []);
}

type DropdownKeyHandlers = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
};

// Keyboard support shared by the desktop dropdowns: Enter/Space toggle via the
// native button click, ArrowDown/ArrowUp open and move through the links,
// Home/End jump, Escape closes and returns focus to the trigger.
function handleDropdownKeyDown(event: ReactKeyboardEvent<HTMLDivElement>, { isOpen, open, close }: DropdownKeyHandlers) {
  const container = event.currentTarget;
  const trigger = container.querySelector<HTMLButtonElement>('[data-nav-trigger]');
  const items = menuItems(container);
  const index = items.indexOf(document.activeElement as HTMLElement);
  const focusAt = (next: number) => {
    // A just-opened panel is still visibility:hidden for the first frame(s)
    // of its CSS transition, so retry for a few frames until focus lands.
    const run = (attempt: number) => {
      const target = menuItems(container)[(next + items.length) % Math.max(items.length, 1)];
      target?.focus();
      if (target && document.activeElement !== target && attempt < 20) {
        requestAnimationFrame(() => run(attempt + 1));
      }
    };
    run(0);
  };
  switch (event.key) {
    case 'Escape':
      if (!isOpen) return;
      event.preventDefault();
      close();
      trigger?.focus();
      return;
    case 'ArrowDown':
      event.preventDefault();
      if (!isOpen) open();
      focusAt(index < 0 ? 0 : index + 1);
      return;
    case 'ArrowUp':
      event.preventDefault();
      if (!isOpen) open();
      focusAt(index < 0 ? items.length - 1 : index - 1);
      return;
    case 'Home':
      if (index < 0) return;
      event.preventDefault();
      focusAt(0);
      return;
    case 'End':
      if (index < 0) return;
      event.preventDefault();
      focusAt(items.length - 1);
      return;
    default:
  }
}

type NavbarProps = {
  /** Server-computed feature visibility, club settings and CMS labels (lib/server/nav-visibility.ts). */
  nav: NavVisibility;
};

export default function Navbar({ nav }: NavbarProps) {
  const cookieDoughOpen = useCookieDoughOpen();
  const reduceMotion = useReducedMotion();
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const [sessionUser, setSessionUser] = useState<{ full_name: string; role: string } | null>(null);
  const settings = nav.settings;
  const navLinks = nav.headerLinks;
  const registrationNavigation = nav.registration;
  // Which desktop dropdown is open by click/keyboard, and which by pointer
  // hover. Both drive the same rendered state so aria-expanded always matches
  // what is on screen. One label at a time so opening a group can never
  // surface another group's panel.
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [hoverGroup, setHoverGroup] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountHover, setAccountHover] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
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
    setHoverGroup(null);
    setAccountOpen(false);
    setAccountHover(false);
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
    // Public visitors never trigger a session request (see ADMIN_SESSION_HINT_KEY).
    if (!isAdminSurface(pathname) && !readAdminHint()) {
      setSessionUser(null);
      return;
    }
    let cancelled = false;
    const loadSession = async () => {
      try {
        const res = await fetch('/api/admin/auth/session', { cache: 'no-store', credentials: 'include' });
        if (cancelled) return;
        if (res.status === 401) writeAdminHint(false);
        if (!res.ok) {
          setSessionUser(null);
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        const user = data?.authenticated ? data.user : null;
        writeAdminHint(Boolean(user));
        setSessionUser(user);
      } catch {
        if (!cancelled) setSessionUser(null);
      }
    };
    loadSession();
    return () => { cancelled = true; };
  }, [pathname]);
  const handleSignOut = async () => {
    await fetch('/api/admin/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-NDCC-CSRF': '1' },
    }).catch(() => undefined);
    writeAdminHint(false);
    setSessionUser(null);
  };
  const navGroups = resolveGroups(navLinks, nav.dinoCoachPublic, nav.rafflePublic, cookieDoughOpen, nav.reverseRafflePublic);
  const accountExpanded = accountOpen || accountHover;
  // Homepage nav starts transparent over the cinematic hero and settles onto
  // a translucent blurred surface after ~20px of scroll. Inner pages are
  // solid from the start.
  const transparent = false;
  return (
    <>
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
      <div className={cn('px-4 sm:px-6 lg:px-8 py-[6px] flex items-center justify-between transition-colors duration-300', transparent ? 'bg-maroon-950/35 backdrop-blur-sm' : 'bg-surface-blue-subtle border-b border-edge-subtle')}>
        <span className="hidden sm:block text-xs text-content-blue font-body tracking-[0.02em]">
          {settings.ground_name}, {settings.address}
        </span>
        <div className="flex items-center gap-4 ml-auto">
          <Link href="/club-account" className="inline-flex items-center gap-1.5 text-xs font-semibold text-content-blue hover:underline font-body focus-ring" aria-current={pathname === '/club-account' ? 'page' : undefined}>
            <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
            My Account
          </Link>
          <a
            href={settings.facebook_url || fallbackClubSettings.facebook_url || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-content-blue hover:underline transition-colors font-body"
          >
            Facebook
          </a>
          <a
            href={settings.playhq_url || fallbackClubSettings.playhq_url || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-content-blue hover:underline transition-colors font-body"
          >
            PlayHQ
          </a>
        </div>
      </div>
      <div className="container-width px-4 sm:px-6 lg:px-5 xl:px-8">
        <div className="flex items-center justify-between gap-3 xl:gap-4 h-16 lg:h-[4.75rem]">
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
            <div className="hidden sm:flex lg:hidden flex-col">
              <span className={cn('font-display font-semibold uppercase tracking-wide text-lg leading-none block', transparent ? 'text-white' : 'text-maroon-700 dark:text-maroon-200')}>
                {settings.club_short}
              </span>
              <span className={cn('text-sm font-body tracking-[0.08em] uppercase mt-1', transparent ? 'text-white/70' : 'text-gray-600 dark:text-slate-400')}>
                The Dinos · Est. {settings.established_year}
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex shrink-0 items-center gap-0 xl:gap-1">
            {navGroups.map((group) => {
              if (group.href) {
                return (
                  <Link
                    key={`${group.href}-${group.label}`}
                    href={group.href}
                    aria-current={pathname === group.href ? 'page' : undefined}
                    className={cn(
                      'whitespace-nowrap px-[5px] xl:px-2 py-1.5 text-[13px] xl:text-sm font-body font-medium transition-colors rounded-md focus-ring',
                      // The logo already links home; the extra Home item only
                      // appears once there is room for it (xl and up).
                      group.href === '/' && 'hidden xl:inline-block',
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
                );
              }
              const expanded = openGroup === group.label || hoverGroup === group.label;
              const menuId = `nav-menu-${group.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
              return (
                <div
                  key={group.label}
                  className="relative"
                  onMouseEnter={() => setHoverGroup(group.label)}
                  onMouseLeave={() => setHoverGroup((current) => (current === group.label ? null : current))}
                  onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpenGroup((current) => (current === group.label ? null : current)); }}
                  onKeyDown={(e) => handleDropdownKeyDown(e, {
                    isOpen: expanded,
                    open: () => setOpenGroup(group.label),
                    close: () => { setOpenGroup(null); setHoverGroup(null); },
                  })}
                >
                  <button
                    type="button"
                    data-nav-trigger
                    aria-haspopup="true"
                    aria-expanded={expanded}
                    aria-controls={menuId}
                    onClick={() => {
                      // A click while the panel is hover-opened pins it open
                      // rather than closing it under the pointer.
                      if (hoverGroup === group.label && openGroup !== group.label) {
                        setOpenGroup(group.label);
                        return;
                      }
                      setOpenGroup((open) => (open === group.label ? null : group.label));
                      if (openGroup === group.label) setHoverGroup(null);
                    }}
                    className={cn(
                      'flex shrink-0 items-center gap-0.5 xl:gap-1 whitespace-nowrap px-[5px] xl:px-2 py-1.5 text-[13px] xl:text-sm font-body font-medium rounded-md transition-colors focus-ring',
                      // A group whose child route is active reads as active too,
                      // matching the top-level link treatment (hash links share
                      // their base pathname, e.g. /about#club-history).
                      group.links?.some((link) => pathname === link.href.split('#')[0])
                        ? transparent
                          ? 'text-white font-semibold'
                          : 'text-maroon-700 font-semibold dark:text-maroon-200'
                        : transparent
                          ? 'text-white/85 hover:text-white hover:bg-white/10'
                          : 'text-content-muted hover:text-maroon-700 hover:bg-maroon-50 dark:text-slate-300 dark:hover:text-maroon-200 dark:hover:bg-maroon-950/50'
                    )}
                  >
                    {group.label} <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200', expanded && 'rotate-180')} aria-hidden="true" />
                  </button>
                  <div
                    id={menuId}
                    data-nav-menu
                    className={cn(
                      'absolute left-0 top-full pt-1 transition-all duration-200',
                      expanded ? 'visible opacity-100 translate-y-0' : 'invisible opacity-0 -translate-y-2'
                    )}
                  >
                    <div className="bg-surface-elevated rounded-xl shadow-md border border-edge-subtle py-2 min-w-[190px]">
                      {group.links?.map((link) => (
                        <Link key={`${group.label}-${link.href}`} href={link.href} aria-current={pathname === link.href ? 'page' : undefined} className={cn('block whitespace-nowrap px-4 py-2 text-sm font-body transition-colors focus-ring', pathname === link.href ? 'text-maroon-700 bg-maroon-50 dark:text-maroon-200 dark:bg-maroon-950/70' : 'text-content-muted hover:text-maroon-700 hover:bg-maroon-50 dark:text-slate-300 dark:hover:text-maroon-200 dark:hover:bg-maroon-950/60')}>
                          {link.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}

            {sessionUser && (
              <div
                className="relative ml-1"
                onMouseEnter={() => setAccountHover(true)}
                onMouseLeave={() => setAccountHover(false)}
                onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setAccountOpen(false); }}
                onKeyDown={(e) => handleDropdownKeyDown(e, {
                  isOpen: accountExpanded,
                  open: () => setAccountOpen(true),
                  close: () => { setAccountOpen(false); setAccountHover(false); },
                })}
              >
                <button
                  type="button"
                  data-nav-trigger
                  aria-haspopup="true"
                  aria-expanded={accountExpanded}
                  aria-controls="nav-menu-account"
                  onClick={() => {
                    if (accountHover && !accountOpen) {
                      setAccountOpen(true);
                      return;
                    }
                    setAccountOpen((open) => !open);
                    if (accountOpen) setAccountHover(false);
                  }}
                  aria-label={`Account: ${sessionUser.full_name}`}
                  title={sessionUser.full_name}
                  className={cn('flex h-9 w-9 items-center justify-center rounded-md transition-colors focus-ring', transparent ? 'text-white/85 hover:text-white hover:bg-white/10' : 'text-content-muted hover:text-maroon-700 hover:bg-maroon-50 dark:text-slate-300 dark:hover:text-maroon-200 dark:hover:bg-maroon-950/50')}
                >
                  <UserRound className="h-4 w-4" aria-hidden="true" />
                </button>
                <div
                  id="nav-menu-account"
                  data-nav-menu
                  className={cn(
                    'absolute right-0 top-full pt-1 transition-all duration-200',
                    accountExpanded ? 'visible opacity-100 translate-y-0' : 'invisible opacity-0 -translate-y-2'
                  )}
                >
                  <div className="bg-surface-elevated rounded-xl shadow-md border border-edge-subtle py-2 min-w-[180px]">
                    <Link href="/admin" className="block px-4 py-2 text-sm text-content-muted hover:text-maroon-700 hover:bg-maroon-50 dark:text-slate-300 dark:hover:text-maroon-200 dark:hover:bg-maroon-950/60">Admin Panel</Link>
                    <button type="button" onClick={handleSignOut} className="w-full text-left px-4 py-2 text-sm text-content-muted hover:text-maroon-700 hover:bg-maroon-50 dark:text-slate-300 dark:hover:text-maroon-200 dark:hover:bg-maroon-950/60">
                      Log out
                    </button>
                  </div>
                </div>
              </div>
            )}

            <ThemeToggle className="ml-0.5 xl:ml-1 shrink-0" />

            {/* Seasonal registration replaces the existing CTA slot when published. */}
            <Link
              href={registrationNavigation?.href || '/join'}
              className={cn(
                'ml-1 inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-md bg-maroon-700 px-2.5 xl:px-3 text-center text-[13px] xl:text-sm font-semibold leading-none text-white transition-colors hover:bg-maroon-800 focus-ring',
                pathname === registrationNavigation?.href && 'ring-2 ring-gold-300',
              )}
              aria-label={registrationNavigation?.label || 'Join the Club'}
              title={registrationNavigation?.label || 'Join the Club'}
              aria-current={pathname === registrationNavigation?.href ? 'page' : undefined}
            >
              {registrationNavigation ? 'Register' : 'Join the Club'}
            </Link>
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className={cn('lg:hidden min-h-11 min-w-11 p-2 rounded-md border transition-colors focus-ring', transparent ? 'border-white/40 hover:bg-white/10' : 'border-edge-subtle hover:bg-surface-muted dark:border-slate-700 dark:hover:bg-maroon-950/50')}
            ref={menuButtonRef}
            aria-label={isOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={isOpen}
            aria-controls="mobile-site-menu"
          >
            {isOpen ? <X className={cn('h-6 w-6', transparent ? 'text-white' : 'text-content-secondary dark:text-slate-200')} /> : <Menu className={cn('h-6 w-6', transparent ? 'text-white' : 'text-content-secondary dark:text-slate-200')} />}
          </button>
        </div>
      </div>

    </nav>

      {/* Keep the viewport overlay outside the header: backdrop-filter on the
          scrolled header creates a containing block that clips fixed children. */}
      <LazyMotion features={domAnimation} strict>
        <AnimatePresence initial={false}>
          {isOpen && (
            <m.div
              key="mobile-menu"
              id="mobile-site-menu"
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
              <div className="flex shrink-0 items-center justify-between border-b border-edge-subtle px-4 py-4">
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
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-surface-nav px-4 py-4 space-y-1 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
                <Link href="/club-account" onClick={() => setIsOpen(false)} className="flex items-center gap-2 rounded-xl px-4 py-3 text-base font-body font-semibold text-content-blue focus-ring">
                  <UserRound className="h-5 w-5" aria-hidden="true" />My Account
                </Link>
          {navGroups.map((group) => group.href ? (
            <Link key={`${group.href}-${group.label}`} href={group.href} aria-current={pathname === group.href ? 'page' : undefined} className={cn('block px-4 py-3 text-base font-body font-medium rounded-xl transition-colors focus-ring', pathname === group.href ? 'text-maroon-700 bg-maroon-50 dark:text-maroon-200 dark:bg-maroon-950/50' : 'text-content-muted hover:text-maroon-700 hover:bg-maroon-50 dark:text-slate-300 dark:hover:text-maroon-200 dark:hover:bg-maroon-950/50')}>
              {group.label}
            </Link>
          ) : (
            <section key={group.label} className="rounded-xl border border-edge-subtle/60 p-2">
              <h2 className="px-2 py-1 text-sm font-bold uppercase tracking-wide text-maroon-700 dark:text-maroon-200">{group.label}</h2>
              {group.links?.map((link) => <Link key={`${group.label}-${link.href}`} href={link.href} aria-current={pathname === link.href ? 'page' : undefined} className="block rounded-lg px-3 py-2.5 text-base font-body text-content-muted hover:bg-maroon-50 hover:text-maroon-700 focus-ring dark:text-slate-300 dark:hover:bg-maroon-950/50 dark:hover:text-maroon-200">{link.label}</Link>)}
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
                Log out
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
    </>
  );
}
