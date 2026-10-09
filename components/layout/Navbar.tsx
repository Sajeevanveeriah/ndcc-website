'use client';
import { useState, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { LazyMotion, domAnimation, m, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Menu, X, ChevronDown, UserRound, ShieldCheck } from 'lucide-react';
import { useCookieDoughOpen } from '@/components/common/CookieDoughVisibility';
import { COOKIE_DOUGH_ENDS_AT, isCookieDoughLink } from '@/lib/cookie-dough';
import { cn } from '@/lib/utils';
import ThemeToggle from '@/components/common/ThemeToggle';
import type { NavHeaderLink, NavVisibility } from '@/lib/server/nav-visibility';
import MaintenanceBanner from '@/components/layout/MaintenanceBanner';

type HeaderLink = NavHeaderLink;

type NavLinkItem = { label: string; href: string };
type NavSection = { heading?: string; links: NavLinkItem[] };
type PublicNavGroup = { label: string; href?: string; sections?: NavSection[] };
type ResolvedNavGroup = { label: string; href?: string; openInNewTab?: boolean; sections?: Array<{ heading?: string; links: HeaderLink[] }> };

// Information architecture: four menus. Cricket holds match-day pages; Club
// holds the club itself plus news and media (and Contact); Get Involved holds
// playing, helping and sponsorship; Shop & Fundraisers pairs the shop with
// every fundraiser (raffles, wheels and the Cookie Dough drive). The
// Fundraisers section only shows while at least one fundraiser is publicly
// visible, and an empty section or group is dropped entirely.
const FUNDRAISERS_SECTION = 'Fundraisers';

const PUBLIC_NAV_GROUPS: PublicNavGroup[] = [
  { label: 'Home', href: '/' },
  { label: 'Cricket', sections: [{ links: [{ label: 'This Week', href: '/this-week' }, { label: 'Fixtures', href: '/fixtures' }, { label: 'Calendar', href: '/calendar' }, { label: 'Team Sheets', href: '/team-sheets' }, { label: 'Teams', href: '/teams' }, { label: 'Fantasy', href: '/fantasy' }] }] },
  { label: 'Club', sections: [
    { heading: 'The club', links: [{ label: 'About', href: '/about' }, { label: 'History', href: '/about#club-history' }, { label: 'Facilities', href: '/facilities' }, { label: 'Contact', href: '/contact' }] },
    { heading: 'News and media', links: [{ label: 'News', href: '/news' }, { label: 'Publications', href: '/publications' }, { label: 'Gallery', href: '/gallery' }, { label: 'Winners', href: '/winners' }] },
  ] },
  { label: 'Get Involved', sections: [
    { heading: 'Play and help', links: [{ label: 'Join', href: '/join' }, { label: 'Volunteer', href: '/volunteer' }, { label: 'Events', href: '/events' }] },
    { heading: 'Sponsorship', links: [{ label: 'Sponsors', href: '/sponsors' }, { label: 'Player Sponsors', href: '/player-sponsors' }] },
  ] },
  { label: 'Shop & Fundraisers', sections: [
    { heading: 'Shop', links: [{ label: 'Merchandise', href: '/merchandise' }, { label: 'Pay apparel balance', href: '/pay-balance' }, { label: 'Kitchen', href: '/kitchen' }, { label: 'Pot Club', href: '/pot-club' }] },
    { heading: FUNDRAISERS_SECTION, links: [{ label: 'Raffle', href: '/raffle' }, { label: 'Reverse Raffle', href: '/reverse-raffle' }, { label: 'Prize Wheel', href: '/prize-wheel' }, { label: 'Spin the Wheel', href: '/spin-the-wheel' },
      { label: 'Cookie Dough Fundraiser', href: '/fundraising/cookie-dough' }] },
  ] },
];

function resolveLink(navLinks: HeaderLink[], fallback: { label: string; href: string }): HeaderLink {
  return navLinks.find((link) => link.href === fallback.href) || fallback;
}

function resolveGroups(navLinks: HeaderLink[], dinoCoachEnabled: boolean, raffleEnabled: boolean, cookieDoughOpen: boolean, reverseRaffleEnabled: boolean, manageRaffles = false, prizeWheelEnabled = false, spinWheelEnabled = false): ResolvedNavGroup[] {
  const visible = (link: NavLinkItem) => (dinoCoachEnabled || link.href !== '/fantasy') && (raffleEnabled || (link.href !== '/raffle' && link.href !== '/raffle/cash')) && (reverseRaffleEnabled || link.href !== '/reverse-raffle') && (prizeWheelEnabled || link.href !== '/prize-wheel') && (spinWheelEnabled || link.href !== '/spin-the-wheel') && (cookieDoughOpen || !isCookieDoughLink(link.href));
  const groups: ResolvedNavGroup[] = PUBLIC_NAV_GROUPS.map((group) => group.href
    ? { ...resolveLink(navLinks, { label: group.label, href: group.href }), sections: undefined }
    : { label: group.label, href: undefined, sections: (group.sections || []).map((section) => ({ heading: section.heading, links: section.links.filter(visible).map((link) => resolveLink(navLinks, link)) })) });
  const fundraisers = groups.flatMap((group) => group.sections || []).find((section) => section.heading === FUNDRAISERS_SECTION);
  if (fundraisers) {
    // Management access follows the authenticated permission, never public sales
    // visibility. Staff use their committee session rather than a member login.
    if (manageRaffles) {
      fundraisers.links = [
        { label: 'Raffle administration', href: '/admin/raffle' },
        { label: 'Record cash sales', href: '/admin/raffle/cash' },
        ...fundraisers.links.filter((link) => link.href !== '/raffle/cash'),
      ];
    }
    // The Fund Raiser hub heads the section whenever it has any link, so the
    // section still disappears when every fundraiser is hidden.
    if (fundraisers.links.length > 0) {
      fundraisers.links = [resolveLink(navLinks, { label: 'All fundraisers', href: '/fundraising' }), ...fundraisers.links];
    }
  }
  return groups
    .map((group) => (group.sections ? { ...group, sections: group.sections.filter((section) => section.links.length > 0) } : group))
    .filter((group) => group.href || (group.sections && group.sections.length > 0));
}

function groupLinks(group: ResolvedNavGroup) {
  return (group.sections || []).flatMap((section) => section.links);
}

function isGroupActive(group: ResolvedNavGroup, pathname: string | null) {
  return groupLinks(group).some((link) => pathname === link.href.split('#')[0]);
}

function slug(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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
  // Mobile menu accordion: one group open at a time.
  const [mobileGroup, setMobileGroup] = useState<string | null>(null);
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
  const lastDropdown = [...navGroups].reverse().find((group) => !group.href)?.label;
  const registrationHref = registrationNavigation?.href || '/join';
  const registrationLabel = registrationNavigation?.label || 'Join the Club';
  return (
    <>
    <nav
      className={cn(
        'fixed top-0 left-0 right-0 z-50 border-b transition-[background-color,border-color,box-shadow] duration-300 ease-out',
        // 92% keeps the muted tagline at >= 4.5:1 even over black/maroon
        // (light) or white (dark) sections scrolling underneath.
        scrolled
          ? 'border-edge-subtle bg-surface-nav/92 backdrop-blur-xl backdrop-saturate-150 shadow-[0_8px_30px_-18px_rgba(29,29,31,0.25)]'
          : 'border-edge-subtle/70 bg-surface-nav'
      )}
      aria-label="Main navigation"
    >
      <MaintenanceBanner />
      {/* Header row: brand, four menus, account, theme and registration.
          Privacy and social links live in the footer base row. */}
      <div className="nd-wrap">
        <div className="flex h-[60px] items-center justify-between gap-3 xl:gap-5">
          {/* Logo */}
          <Link prefetch={false} href="/" className="flex shrink-0 items-center gap-2.5 rounded-lg text-content-primary focus-ring" aria-label="Newcomb and District Cricket Club, home">
            <Image
              src="/images/logo.jpg"
              alt="NDCC Logo"
              width={48}
              height={36}
              className="h-9 w-auto rounded-lg"
              priority
            />
            <span className="flex flex-col">
              <span className="hidden font-display text-[15px] font-semibold leading-tight tracking-[-0.01em] min-[461px]:block">Newcomb &amp; District</span>
              <span className="font-display text-[15px] font-semibold leading-tight min-[461px]:hidden" aria-hidden="true">{settings.club_short}</span>
              <span className="hidden text-sm leading-tight text-content-muted sm:block">Cricket Club · The Dinos</span>
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden min-[1100px]:flex shrink-0 items-center gap-1">
            {navGroups.map((group) => {
              if (group.href) {
                // The logo already links home, so the header leaves Home to the
                // logo (the mobile menu still lists it).
                if (group.href === '/') return null;
                return (
                  <Link prefetch={false}
                    key={`${group.href}-${group.label}`}
                    href={group.href}
                    aria-current={pathname === group.href ? 'page' : undefined}
                    className={cn(
                      'whitespace-nowrap rounded-full px-3.5 py-2 text-[15px] font-body font-medium transition-colors focus-ring',
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
              const active = isGroupActive(group, pathname);
              const menuId = `nav-menu-${slug(group.label)}`;
              const sections = group.sections || [];
              const twoColumns = sections.length > 1 && groupLinks(group).length > 6;
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
                      'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-[15px] font-body font-medium transition-colors focus-ring',
                      // A group whose child route is active reads as active too
                      // (hash links share their base pathname, e.g. /about#club-history).
                      active
                        ? 'bg-surface-muted text-maroon-700 font-semibold shadow-[inset_0_-2px_0_currentColor] dark:text-maroon-200'
                        : cn('text-content-primary hover:bg-surface-muted', expanded && 'bg-surface-muted')
                    )}
                  >
                    {group.label} <ChevronDown className={cn('h-3 w-3 opacity-60 transition-transform duration-200', expanded && 'rotate-180')} aria-hidden="true" />
                  </button>
                  <div
                    id={menuId}
                    data-nav-menu
                    className={cn(
                      'absolute top-full pt-2 transition-[opacity,transform,visibility] duration-200 ease-out',
                      // The last menu sits near the right-hand buttons, so its
                      // panel opens leftwards to stay inside the viewport.
                      group.label === lastDropdown ? 'right-0' : '-left-1.5',
                      expanded ? 'visible opacity-100 translate-y-0' : 'invisible opacity-0 -translate-y-1'
                    )}
                  >
                    <div className={cn(
                      'rounded-2xl border border-edge-subtle bg-surface-elevated p-2.5 shadow-[0_1px_2px_rgba(29,29,31,0.04),0_8px_24px_rgba(29,29,31,0.10)]',
                      twoColumns ? 'grid w-max grid-cols-2 gap-x-3' : 'min-w-[220px]'
                    )}>
                      {sections.map((section) => (
                        <div key={`${group.label}-${section.heading || 'links'}`} className="min-w-[200px]">
                          {section.heading && sections.length > 1 && (
                            <p className="px-3 pb-1 pt-2 text-sm font-semibold text-content-muted">{section.heading}</p>
                          )}
                          {section.links.map((link) => (
                            <Link prefetch={false} key={`${group.label}-${link.href}`} href={link.href} aria-current={pathname === link.href ? 'page' : undefined} className={cn('block whitespace-nowrap rounded-[10px] px-3 py-2 text-[14.5px] font-body transition-colors duration-150 focus-ring', pathname === link.href ? 'text-maroon-700 bg-maroon-50 font-medium dark:text-maroon-200 dark:bg-maroon-950/70' : 'text-content-secondary hover:text-content-primary hover:bg-surface-muted dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/5')}>
                              {link.label}
                            </Link>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden min-[1100px]:flex shrink-0 items-center gap-1">
            {sessionUser && (
              <div
                className="relative"
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
                  className="flex h-10 w-10 items-center justify-center rounded-full transition-colors focus-ring text-maroon-700 hover:bg-maroon-50 dark:text-maroon-200 dark:hover:bg-maroon-950/50"
                >
                  <ShieldCheck className="h-[18px] w-[18px]" aria-hidden="true" />
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
                    <Link prefetch={false} href="/admin" className="block rounded-[10px] px-4 py-2 text-sm text-content-muted hover:text-maroon-700 hover:bg-maroon-50 dark:text-slate-300 dark:hover:text-maroon-200 dark:hover:bg-maroon-950/60">Admin Panel</Link>
                    <button type="button" onClick={handleSignOut} className="w-full rounded-[10px] text-left px-4 py-2 text-sm text-content-muted hover:text-maroon-700 hover:bg-maroon-50 dark:text-slate-300 dark:hover:text-maroon-200 dark:hover:bg-maroon-950/60">
                      Log out
                    </button>
                  </div>
                </div>
              </div>
            )}

            <Link prefetch={false} href="/club-account" aria-label="My Account" title="My Account" aria-current={pathname === '/club-account' ? 'page' : undefined} className={cn('inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-content-primary transition-colors hover:bg-surface-muted focus-ring', pathname === '/club-account' && 'bg-surface-muted')}>
              <UserRound className="h-[18px] w-[18px]" aria-hidden="true" />
            </Link>
            <ThemeToggle compact className="shrink-0" />

            {/* Seasonal registration replaces the existing CTA slot when published. */}
            <Link prefetch={false}
              href={registrationHref}
              className={cn(
                'ml-1.5 inline-flex min-h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-maroon-700 px-[18px] text-center text-sm font-semibold leading-none text-white transition-colors duration-200 hover:bg-maroon-800 focus-ring',
                pathname === registrationNavigation?.href && 'ring-2 ring-gold-300',
              )}
              aria-label={registrationLabel}
              title={registrationLabel}
              aria-current={pathname === registrationNavigation?.href ? 'page' : undefined}
            >
              {registrationNavigation ? 'Register' : 'Join the Club'}
            </Link>
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => {
              if (!isOpen) setMobileGroup(navGroups.find((group) => isGroupActive(group, pathname))?.label ?? null);
              setIsOpen(!isOpen);
            }}
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
              <div className="flex h-[60px] shrink-0 items-center justify-between border-b border-edge-subtle px-4">
                <Link prefetch={false} href="/" onClick={() => setIsOpen(false)} className="flex items-center gap-2.5 rounded-lg focus-ring" aria-label="Newcomb and District Cricket Club, home">
                  <Image src="/images/logo.jpg" alt="NDCC Logo" width={48} height={36} className="h-9 w-auto rounded-lg" />
                  <span className="font-display text-[15px] font-semibold text-content-primary">Newcomb &amp; District</span>
                </Link>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-edge-subtle bg-surface-card transition-colors hover:bg-surface-muted focus-ring"
                  aria-label="Close menu"
                >
                  <X className="h-6 w-6 text-content-secondary dark:text-slate-200" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-surface-nav px-4 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
                <div className="grid grid-cols-2 gap-2 pb-3">
                  <Link prefetch={false}
                    href={registrationHref}
                    onClick={() => setIsOpen(false)}
                    className="flex min-h-11 items-center justify-center rounded-full bg-maroon-700 px-3 text-center text-[15px] font-semibold text-white transition-colors hover:bg-maroon-800 focus-ring"
                    aria-current={pathname === registrationNavigation?.href ? 'page' : undefined}
                  >
                    {registrationLabel}
                  </Link>
                  <Link prefetch={false} href="/club-account" onClick={() => setIsOpen(false)} aria-current={pathname === '/club-account' ? 'page' : undefined} className="flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-edge-strong bg-surface-card px-3 text-[15px] font-semibold text-content-primary transition-colors hover:bg-surface-muted focus-ring">
                    <UserRound className="h-4 w-4" aria-hidden="true" />My Account
                  </Link>
                </div>
                <div className="space-y-2">
                  {navGroups.map((group) => {
                    if (group.href) {
                      return (
                        <Link prefetch={false} key={`${group.href}-${group.label}`} href={group.href} onClick={() => setIsOpen(false)} aria-current={pathname === group.href ? 'page' : undefined} className={cn('flex min-h-12 items-center rounded-2xl border border-edge-subtle bg-surface-card px-4 text-base font-body font-semibold transition-colors focus-ring', pathname === group.href ? 'text-maroon-700 dark:text-maroon-200' : 'text-content-primary hover:bg-surface-muted')}>
                          {group.label}
                        </Link>
                      );
                    }
                    const expanded = mobileGroup === group.label;
                    const active = isGroupActive(group, pathname);
                    const panelId = `mobile-nav-${slug(group.label)}`;
                    const sections = group.sections || [];
                    return (
                      <section key={group.label} className="overflow-hidden rounded-2xl border border-edge-subtle bg-surface-card">
                        <h2 className="m-0">
                          <button
                            type="button"
                            aria-expanded={expanded}
                            aria-controls={panelId}
                            onClick={() => setMobileGroup((current) => (current === group.label ? null : group.label))}
                            className={cn('flex min-h-12 w-full items-center justify-between px-4 text-left text-base font-body font-semibold transition-colors focus-ring', active || expanded ? 'text-maroon-700 dark:text-maroon-200' : 'text-content-primary')}
                          >
                            {group.label}
                            <ChevronDown className={cn('h-4 w-4 opacity-70 transition-transform duration-200', expanded && 'rotate-180')} aria-hidden="true" />
                          </button>
                        </h2>
                        <div id={panelId} hidden={!expanded} className="border-t border-edge-subtle/70 px-1.5 pb-2 pt-1">
                          {sections.map((section) => (
                            <div key={`${group.label}-${section.heading || 'links'}`}>
                              {section.heading && sections.length > 1 && (
                                <p className="px-2.5 pb-0.5 pt-2.5 text-sm font-semibold text-content-muted">{section.heading}</p>
                              )}
                              <div className="grid grid-cols-2">
                                {section.links.map((link) => (
                                  <Link prefetch={false} key={`${group.label}-${link.href}`} href={link.href} onClick={() => setIsOpen(false)} aria-current={pathname === link.href ? 'page' : undefined} className={cn('flex min-h-11 items-center rounded-lg px-2.5 py-2 text-[15px] leading-snug font-body focus-ring', pathname === link.href ? 'bg-maroon-50 font-semibold text-maroon-700 dark:bg-maroon-950/50 dark:text-maroon-200' : 'text-content-secondary hover:bg-surface-muted hover:text-content-primary dark:text-slate-300')}>
                                    {link.label}
                                  </Link>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
                {sessionUser && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Link prefetch={false} href="/admin" onClick={() => setIsOpen(false)} className="flex min-h-11 items-center rounded-xl px-3 text-[15px] font-body font-medium text-content-muted hover:bg-surface-muted dark:text-slate-300">
                      {sessionUser.full_name} ({sessionUser.role})
                    </Link>
                    <button type="button" onClick={handleSignOut} className="flex min-h-11 items-center rounded-xl px-3 text-left text-[15px] font-body font-medium text-content-muted hover:bg-surface-muted dark:text-slate-300">
                      Log out
                    </button>
                  </div>
                )}
                <div className="mt-3 flex items-center justify-between border-t border-edge-subtle px-1 pt-3">
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
