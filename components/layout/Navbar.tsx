'use client';
import { useState, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { LazyMotion, domAnimation, m, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Menu, X, ChevronDown, UserRound } from 'lucide-react';
import { useCookieDoughOpen } from '@/components/common/CookieDoughVisibility';
import { COOKIE_DOUGH_ENDS_AT, isCookieDoughLink } from '@/lib/cookie-dough';
import { cn } from '@/lib/utils';
import ThemeToggle from '@/components/common/ThemeToggle';
import type { NavHeaderLink, NavVisibility } from '@/lib/server/nav-visibility';
import MaintenanceBanner from '@/components/layout/MaintenanceBanner';

type HeaderLink = NavHeaderLink;

type PublicNavGroup = { label: string; href?: string; links?: Array<{ label: string; href: string }> };

// Information architecture: Calendar sits with fixtures under Cricket, club
// and player sponsors share one Sponsors group, and every fundraiser (raffles,
// wheels and the Cookie Dough drive) shares one Fund Raiser group, shown only
// while at least one of them is publicly visible. Contact appears once, as the
// final top-level item.
const FUND_RAISER_GROUP = 'Fund Raiser';

const PUBLIC_NAV_GROUPS: PublicNavGroup[] = [
  { label: 'Home', href: '/' },
  { label: 'Cricket', links: [{ label: 'Teams', href: '/teams' }, { label: 'Fixtures', href: '/fixtures' }, { label: 'Calendar', href: '/calendar' }, { label: 'Fantasy', href: '/fantasy' }] },
  // Club also carries news, publications and the gallery (suggested layout:
  // one fewer top-level group, so the header fits beside the club name).
  { label: 'Club', links: [{ label: 'About', href: '/about' }, { label: 'History', href: '/about#club-history' }, { label: 'Facilities', href: '/facilities' }, { label: 'News', href: '/news' }, { label: 'Publications', href: '/publications' }, { label: 'Gallery', href: '/gallery' }] },
  { label: 'Get Involved', links: [{ label: 'Join', href: '/join' }, { label: 'Volunteer', href: '/volunteer' }, { label: 'Events', href: '/events' }] },
  { label: 'Sponsors', links: [{ label: 'Sponsors', href: '/sponsors' }, { label: 'Player Sponsors', href: '/player-sponsors' }] },
  { label: 'Shop', links: [{ label: 'Merchandise', href: '/merchandise' }, { label: 'Pot Club', href: '/pot-club' }, { label: 'Pay apparel balance', href: '/pay-balance' }, { label: 'Kitchen', href: '/kitchen' }] },
  { label: FUND_RAISER_GROUP, links: [{ label: 'Raffle', href: '/raffle' }, { label: 'Reverse Raffle', href: '/reverse-raffle' }, { label: 'Prize Wheel', href: '/prize-wheel' }, { label: 'Spin the Wheel', href: '/spin-the-wheel' },
    { label: 'Cookie Dough Fundraiser', href: '/fundraising/cookie-dough' }] },
  { label: 'Contact', href: '/contact' },
];

function resolveLink(navLinks: HeaderLink[], fallback: { label: string; href: string }): HeaderLink {
  return navLinks.find((link) => link.href === fallback.href) || fallback;
}

function resolveGroups(navLinks: HeaderLink[], dinoCoachEnabled: boolean, raffleEnabled: boolean, cookieDoughOpen: boolean, reverseRaffleEnabled: boolean, manageRaffles = false, prizeWheelEnabled = false, spinWheelEnabled = false) {
  const groups = PUBLIC_NAV_GROUPS.map((group) => group.href
    ? { ...resolveLink(navLinks, { label: group.label, href: group.href }), links: undefined }
    : { label: group.label, href: undefined, links: (group.links || [])
      .filter((link) => (dinoCoachEnabled || link.href !== '/fantasy') && (raffleEnabled || (link.href !== '/raffle' && link.href !== '/raffle/cash')) && (reverseRaffleEnabled || link.href !== '/reverse-raffle') && (prizeWheelEnabled || link.href !== '/prize-wheel') && (spinWheelEnabled || link.href !== '/spin-the-wheel') && (cookieDoughOpen || !isCookieDoughLink(link.href)))
      .map((link) => resolveLink(navLinks, link)) });
  // Management access follows the authenticated permission, never public sales
  // visibility. Staff use their committee session rather than a member login.
  const raffles = groups.find((group) => group.label === FUND_RAISER_GROUP);
  if (manageRaffles && raffles?.links) {
    raffles.links = [
      { label: 'Raffle administration', href: '/admin/raffle' },
      { label: 'Record cash sales', href: '/admin/raffle/cash' },
      ...raffles.links.filter((link) => link.href !== '/raffle/cash'),
    ];
  }
  // The Fund Raiser hub heads the group whenever at least one fundraiser is
  // visible, so the group still disappears when every fundraiser is hidden.
  if (raffles?.links && raffles.links.length > 0) {
    raffles.links = [resolveLink(navLinks, { label: 'All fundraisers', href: '/fundraising' }), ...raffles.links];
  }
  return groups.filter((group) => group.href || (group.links && group.links.length > 0));
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
  // CMS campaign dates when known; otherwise the built-in deadline.
  const cookieDoughOpen = useCookieDoughOpen(
    nav.cookieDoughOpen ?? true,
    nav.cookieDoughOpen === undefined ? COOKIE_DOUGH_ENDS_AT : nav.cookieDoughOpen ? (nav.cookieDoughEndsAt ?? null) : 0,
  );
  const reduceMotion = useReducedMotion();
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const [sessionUser, setSessionUser] = useState<{ full_name: string; role: string; permissions?: string[] } | null>(null);
  const [raffleVisibility, setRaffleVisibility] = useState({ enabled: nav.rafflePublic, reverseEnabled: nav.reverseRafflePublic, wheelEnabled: nav.prizeWheelPublic === true, spinEnabled: nav.spinWheelPublic === true });
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
    setRaffleVisibility({ enabled: nav.rafflePublic, reverseEnabled: nav.reverseRafflePublic, wheelEnabled: nav.prizeWheelPublic === true, spinEnabled: nav.spinWheelPublic === true });
    if (!isAdminSurface(pathname)) return;
    let cancelled = false;
    // Admin pages can retain a prerendered layout snapshot. Refresh only these
    // surfaces so a stale public visibility value cannot hide an open raffle.
    void fetch('/api/public/raffle-status', { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) return;
      const data = await response.json();
      if (!cancelled && typeof data.enabled === 'boolean' && typeof data.reverseEnabled === 'boolean') {
        setRaffleVisibility({ enabled: data.enabled, reverseEnabled: data.reverseEnabled, wheelEnabled: data.wheelEnabled === true, spinEnabled: data.spinEnabled === true });
      }
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [pathname, nav.rafflePublic, nav.reverseRafflePublic, nav.prizeWheelPublic, nav.spinWheelPublic]);
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
  const manageRaffles = sessionUser?.permissions?.includes('raffle') === true;
  const navGroups = resolveGroups(navLinks, nav.dinoCoachPublic, raffleVisibility.enabled, cookieDoughOpen, raffleVisibility.reverseEnabled, manageRaffles, raffleVisibility.wheelEnabled, raffleVisibility.spinEnabled);
  const accountExpanded = accountOpen || accountHover;
  return (
    <>
    <nav
      className={cn(
        'fixed top-0 left-0 right-0 z-50 border-b transition-[background-color,border-color,box-shadow] duration-300 ease-out',
        scrolled
          ? 'border-edge-subtle bg-surface-nav/75 backdrop-blur-xl backdrop-saturate-150 shadow-[0_8px_30px_-18px_rgba(29,29,31,0.25)]'
          : 'border-edge-subtle/70 bg-surface-nav'
      )}
      aria-label="Main navigation"
    >
      <MaintenanceBanner />
      {/* Header row: brand, main groups, theme and registration (mock layout).
          Account, privacy and social links live in the footer base row. */}
      <div className="nd-wrap">
        <div className="flex h-[68px] items-center justify-between gap-3 xl:gap-5">
          {/* Logo */}
          <Link prefetch={false} href="/" className="flex shrink-0 items-center gap-2.5 rounded-lg text-content-primary focus-ring" aria-label="Newcomb and District Cricket Club, home">
            <Image
              src="/images/logo.jpg"
              alt="NDCC Logo"
              width={53}
              height={40}
              className="h-10 w-auto rounded-lg"
              priority
            />
            <span className="flex flex-col min-[1100px]:hidden xl:flex">
              <span className="hidden font-display text-[15px] font-semibold leading-tight tracking-[-0.01em] min-[461px]:block">Newcomb &amp; District</span>
              <span className="font-display text-[15px] font-semibold leading-tight min-[461px]:hidden" aria-hidden="true">{settings.club_short}</span>
              <span className="hidden text-sm leading-tight text-content-muted sm:block">Cricket Club · The Dinos</span>
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden min-[1100px]:flex shrink-0 items-center gap-0.5">
            {navGroups.map((group) => {
              if (group.href) {
                return (
                  <Link prefetch={false}
                    key={`${group.href}-${group.label}`}
                    href={group.href}
                    aria-current={pathname === group.href ? 'page' : undefined}
                    className={cn(
                      'whitespace-nowrap rounded-full px-2.5 py-2 text-sm font-body font-medium transition-colors focus-ring xl:px-3 xl:text-[14.5px]',
                      // The logo already links home, so the header leaves Home
                      // to the logo (the mobile menu still lists it).
                      group.href === '/' && 'hidden',
                      pathname === group.href
                        ? 'bg-surface-muted text-content-primary font-semibold'
                        : 'text-content-primary hover:bg-surface-muted'
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
                      'flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-2 text-sm font-body font-medium transition-colors focus-ring xl:px-3 xl:text-[14.5px]',
                      // A group whose child route is active reads as active too,
                      // matching the top-level link treatment (hash links share
                      // their base pathname, e.g. /about#club-history).
                      group.links?.some((link) => pathname === link.href.split('#')[0])
                        ? 'bg-surface-muted text-maroon-700 font-semibold dark:text-maroon-200'
                        : cn('text-content-primary hover:bg-surface-muted', expanded && 'bg-surface-muted')
                    )}
                  >
                    {group.label} <ChevronDown className={cn('h-3 w-3 opacity-60 transition-transform duration-200', expanded && 'rotate-180')} aria-hidden="true" />
                  </button>
                  <div
                    id={menuId}
                    data-nav-menu
                    className={cn(
                      'absolute -left-1.5 top-full pt-2 transition-[opacity,transform,visibility] duration-200 ease-out',
                      expanded ? 'visible opacity-100 translate-y-0' : 'invisible opacity-0 -translate-y-1'
                    )}
                  >
                    <div className="min-w-[230px] rounded-2xl border border-edge-subtle bg-surface-elevated p-2 shadow-[0_1px_2px_rgba(29,29,31,0.04),0_8px_24px_rgba(29,29,31,0.10)]">
                      {group.links?.map((link) => (
                        <Link prefetch={false} key={`${group.label}-${link.href}`} href={link.href} aria-current={pathname === link.href ? 'page' : undefined} className={cn('block whitespace-nowrap rounded-[10px] px-3 py-2.5 text-[14.5px] font-body transition-colors duration-150 focus-ring', pathname === link.href ? 'text-maroon-700 bg-maroon-50 font-medium dark:text-maroon-200 dark:bg-maroon-950/70' : 'text-content-secondary hover:text-content-primary hover:bg-surface-muted dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/5')}>
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
                  className="flex h-9 w-9 items-center justify-center rounded-md transition-colors focus-ring text-content-muted hover:text-maroon-700 hover:bg-maroon-50 dark:text-slate-300 dark:hover:text-maroon-200 dark:hover:bg-maroon-950/50"
                >
                  <UserRound className="h-4 w-4" aria-hidden="true" />
                </button>
                <div
                  id="nav-menu-account"
                  data-nav-menu
                  className={cn(
                    'absolute right-0 top-full pt-2 transition-[opacity,transform,visibility] duration-200 ease-out',
                    accountExpanded ? 'visible opacity-100 translate-y-0' : 'invisible opacity-0 -translate-y-1'
                  )}
                >
                  <div className="min-w-[190px] rounded-2xl border border-edge-subtle bg-surface-elevated/95 p-1.5 shadow-[0_18px_40px_-20px_rgba(29,29,31,0.35)] backdrop-blur-xl">
                    <Link prefetch={false} href="/admin" className="block px-4 py-2 text-sm text-content-muted hover:text-maroon-700 hover:bg-maroon-50 dark:text-slate-300 dark:hover:text-maroon-200 dark:hover:bg-maroon-950/60">Admin Panel</Link>
                    <button type="button" onClick={handleSignOut} className="w-full text-left px-4 py-2 text-sm text-content-muted hover:text-maroon-700 hover:bg-maroon-50 dark:text-slate-300 dark:hover:text-maroon-200 dark:hover:bg-maroon-950/60">
                      Log out
                    </button>
                  </div>
                </div>
              </div>
            )}

            <Link prefetch={false} href="/club-account" aria-label="My Account" title="My Account" aria-current={pathname === '/club-account' ? 'page' : undefined} className="ml-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-edge-subtle bg-surface-card text-content-primary transition-colors hover:bg-surface-muted focus-ring">
              <UserRound className="h-[18px] w-[18px]" aria-hidden="true" />
            </Link>
            <ThemeToggle compact className="ml-1 shrink-0" />

            {/* Seasonal registration replaces the existing CTA slot when published. */}
            <Link prefetch={false}
              href={registrationNavigation?.href || '/join'}
              className={cn(
                'ml-1.5 inline-flex min-h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-maroon-700 px-4 text-center text-sm font-semibold leading-none text-white transition-colors duration-200 hover:bg-maroon-800 focus-ring',
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
            className="min-[1100px]:hidden flex h-11 w-11 items-center justify-center rounded-full border border-edge-subtle bg-surface-card transition-colors focus-ring hover:bg-surface-muted"
            ref={menuButtonRef}
            aria-label={isOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={isOpen}
            aria-controls="mobile-site-menu"
          >
            {isOpen ? <X className="h-6 w-6 text-content-secondary dark:text-slate-200" /> : <Menu className="h-6 w-6 text-content-secondary dark:text-slate-200" />}
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
              className="min-[1100px]:hidden fixed inset-0 z-60 flex flex-col bg-surface-nav"
              initial={reduceMotion ? false : { opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -16 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              role="dialog"
              aria-modal="true"
              aria-label="Site menu"
            >
              {/* The menu covers the header, so it repeats the maintenance notice. */}
              <div className="shrink-0"><MaintenanceBanner standalone /></div>
              <div className="flex shrink-0 items-center justify-between border-b border-edge-subtle px-4 py-4">
                <span className="flex items-center gap-3">
                  <Image src="/images/logo.jpg" alt="NDCC Logo" width={53} height={40} className="h-10 w-auto rounded-lg" />
                  <span className="font-display text-base font-semibold text-content-primary">Newcomb &amp; District</span>
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
                <Link prefetch={false} href="/club-account" onClick={() => setIsOpen(false)} className="flex items-center gap-2 rounded-xl px-4 py-3 text-base font-body font-semibold text-content-blue focus-ring">
                  <UserRound className="h-5 w-5" aria-hidden="true" />My Account
                </Link>
          {navGroups.map((group) => group.href ? (
            <Link prefetch={false} key={`${group.href}-${group.label}`} href={group.href} aria-current={pathname === group.href ? 'page' : undefined} className={cn('block px-4 py-3 text-base font-body font-medium rounded-xl transition-colors focus-ring', pathname === group.href ? 'text-maroon-700 bg-maroon-50 dark:text-maroon-200 dark:bg-maroon-950/50' : 'text-content-muted hover:text-maroon-700 hover:bg-maroon-50 dark:text-slate-300 dark:hover:text-maroon-200 dark:hover:bg-maroon-950/50')}>
              {group.label}
            </Link>
          ) : (
            <section key={group.label} className="border-b border-edge-subtle/70 py-2">
              <h2 className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-[0.16em] text-content-muted">{group.label}</h2>
              {group.links?.map((link) => <Link prefetch={false} key={`${group.label}-${link.href}`} href={link.href} aria-current={pathname === link.href ? 'page' : undefined} className="block rounded-lg px-3 py-2.5 text-base font-body text-content-muted hover:bg-maroon-50 hover:text-maroon-700 focus-ring dark:text-slate-300 dark:hover:bg-maroon-950/50 dark:hover:text-maroon-200">{link.label}</Link>)}
            </section>
          ))}
      <Link prefetch={false}
        href={registrationNavigation?.href || '/join'}
        className="block px-4 py-3 mt-3 text-base font-body font-semibold text-center bg-maroon-700 text-white rounded-full hover:bg-maroon-800 transition-colors focus-ring"
        aria-current={pathname === registrationNavigation?.href ? 'page' : undefined}
      >
        {registrationNavigation?.label || 'Join the Club'}
      </Link>
          {sessionUser && (
            <>
              <Link prefetch={false} href="/admin" className="block px-4 py-3 text-base font-body font-medium rounded-xl text-content-muted hover:text-maroon-700 hover:bg-maroon-50 dark:text-slate-300 dark:hover:text-maroon-200 dark:hover:bg-maroon-950/50">
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
