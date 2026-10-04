import CookieDoughVisibility from '@/components/common/CookieDoughVisibility';
import { COOKIE_DOUGH_ENDS_AT, isCookieDoughOpen, isCookieDoughLink } from '@/lib/cookie-dough';
import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Mail, Phone, ExternalLink, Facebook, Instagram } from 'lucide-react';
import { fallbackClubSettings } from '@/lib/club-settings-types';
import ScrollReveal, { ScrollRevealItem } from '@/components/common/ScrollReveal';
import { type PageLinkCard } from '@/lib/structured-content';
import { ACKNOWLEDGEMENT, FACEBOOK_URL, INSTAGRAM_URL } from '@/lib/constants';
import { getSiteChromeSnapshot } from '@/lib/server/nav-visibility';

function isExternalLink(link: PageLinkCard) {
  // Only real http(s) URLs open in a new tab — a local route mis-flagged
  // is_external in the CMS must still navigate in the same tab.
  return /^https?:\/\//i.test(link.href);
}

// getSiteChromeData already reserves fallback links for unconfigured/failed-query
// paths, so a successful empty section stays hidden rather than resurrecting seed
// links. Links are deduped by href AND by normalised title (first occurrence wins,
// order preserved) so a duplicate re-seed or import can never make the footer
// visibly repeat a link — even when two rows share a label but point at different
// destinations.
function resolveLinks(links: PageLinkCard[]) {
  const seenHrefs = new Set<string>();
  const seenTitles = new Set<string>();
  return links.filter((link) => {
    const titleKey = link.title.trim().toLowerCase();
    if (seenHrefs.has(link.href) || seenTitles.has(titleKey)) return false;
    seenHrefs.add(link.href);
    seenTitles.add(titleKey);
    return true;
  });
}

type CookieWindow = { open: boolean; endsAt: number | null };

function FooterLink({ link, className, cookie }: { link: PageLinkCard; className: string; cookie: CookieWindow }) {
  if (isCookieDoughLink(link.href)) {
    return <CookieDoughVisibility initialOpen={cookie.open} endsAt={cookie.endsAt}><Link prefetch={false} href={link.href} className={className}>{link.title}</Link></CookieDoughVisibility>;
  }
  const external = isExternalLink(link);
  const content = (
    <>
      {link.title}
      {external && (
        <>
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
          <span className="sr-only">(opens in new tab)</span>
        </>
      )}
    </>
  );

  if (external) {
    return (
      <a href={link.href} target="_blank" rel="noopener noreferrer" className={className}>
        {content}
      </a>
    );
  }

  return <Link prefetch={false} href={link.href} className={className}>{content}</Link>;
}

export default async function Footer() {
  const currentYear = new Date().getFullYear();
  // One shared, cached (≤60s, tag-invalidated) snapshot with the Navbar: the
  // footer no longer queries Supabase on every request.
  const { chrome, nav } = await getSiteChromeSnapshot();
  const { settings, acknowledgement: acknowledgementBlock, quickLinks: cmsQuickLinks, getInvolvedLinks: cmsGetInvolvedLinks, affiliationLinks: cmsAffiliationLinks } = chrome;
  const emailHref = settings.email ? `mailto:${settings.email}` : undefined;
  const phoneHref = settings.phone ? `tel:${settings.phone.replace(/\s+/g, '')}` : undefined;
  const acknowledgement = acknowledgementBlock?.body;
  const acknowledgementImage = acknowledgementBlock?.image_url;

  const { dinoCoachPublic: dinoCoachEnabled, rafflePublic: raffleEnabled, reverseRafflePublic: reverseRaffleEnabled, prizeWheelPublic: prizeWheelEnabled, spinWheelPublic: spinWheelEnabled } = nav;
  // CMS campaign dates when known; otherwise the built-in deadline.
  const cookie: CookieWindow = nav.cookieDoughOpen === undefined
    ? { open: isCookieDoughOpen(), endsAt: COOKIE_DOUGH_ENDS_AT }
    : { open: nav.cookieDoughOpen, endsAt: nav.cookieDoughOpen ? (nav.cookieDoughEndsAt ?? null) : 0 };
  const hideDisabledFeatures = (link: PageLinkCard) =>
    (cookie.open || !isCookieDoughLink(link.href))
    && (dinoCoachEnabled || !link.href.startsWith('/fantasy'))
    && (raffleEnabled || !link.href.startsWith('/raffle'))
    && (reverseRaffleEnabled || !link.href.startsWith('/reverse-raffle'))
    && (prizeWheelEnabled === true || !link.href.startsWith('/prize-wheel'))
    && (spinWheelEnabled === true || !link.href.startsWith('/spin-the-wheel'));
  const quickLinks = resolveLinks(cmsQuickLinks).filter(hideDisabledFeatures);
  const getInvolvedLinks = resolveLinks(cmsGetInvolvedLinks).filter(hideDisabledFeatures);
  const affiliationLinks = resolveLinks(cmsAffiliationLinks).filter(hideDisabledFeatures);

  return (
    <footer className="bg-surface-footer text-white">
      {/* Acknowledgement */}
      <div
        className="border-b border-white/10 py-4"
        style={acknowledgementImage
          ? { backgroundImage: `linear-gradient(rgba(74,0,0,0.85), rgba(74,0,0,0.85)), url(${acknowledgementImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
          : { background: 'rgba(255,255,255,0.06)' }}
      >
        <div className="nd-wrap">
          <p className="text-sm text-white/75 font-body leading-relaxed max-w-4xl">
            {acknowledgement || ACKNOWLEDGEMENT}
          </p>
        </div>
      </div>

      {/* Main footer: club details, then the CMS link columns. */}
      <div className="py-14">
        <div className="nd-wrap">
          <ScrollReveal stagger className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,minmax(0,1fr))] lg:gap-8">
            {/* Club Info */}
            <ScrollRevealItem className="sm:col-span-2 lg:col-span-1">
              <Link prefetch={false} href="/" className="mb-3.5 flex items-center gap-3 focus-ring">
                <Image
                  src="/images/logo.jpg"
                  alt="NDCC Logo"
                  width={64}
                  height={48}
                  className="h-12 w-auto rounded-[10px]"
                />
                <span className="font-display text-base font-semibold leading-tight text-white">{settings.club_name}</span>
              </Link>
              <p className="font-body text-[14.5px] leading-relaxed text-white/80">
                Established {settings.established_year}. Competing in the {settings.association_name}.
              </p>
              <p className="mt-2 flex items-start gap-2 font-body text-[14.5px] leading-relaxed text-white/80">
                <MapPin className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{settings.ground_name}, {settings.address}</span>
              </p>
              <p className="mt-2.5 grid gap-1 font-body text-[14.5px]">
                {settings.phone && (
                  <a href={phoneHref || undefined} className="inline-flex items-center gap-2 text-white hover:underline">
                    <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />{settings.phone}
                  </a>
                )}
                {settings.email && (
                  <a href={emailHref || undefined} className="inline-flex items-center gap-2 break-all text-white hover:underline">
                    <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />{settings.email}
                  </a>
                )}
              </p>
            </ScrollRevealItem>

            {[
              { title: 'Quick Links', links: quickLinks },
              { title: 'Get Involved', links: getInvolvedLinks },
              { title: 'Affiliations', links: affiliationLinks },
            ].filter((column) => column.links.length > 0).map((column) => (
              <ScrollRevealItem key={column.title}>
                <h3 className="mb-3 font-display text-[12.5px] font-semibold uppercase tracking-[0.08em] text-gold-400">{column.title}</h3>
                <ul className="grid gap-2">
                  {column.links.map((link) => (
                    <li key={link.id}>
                      <FooterLink
                        link={link}
                        cookie={cookie}
                        className="inline-flex min-h-6 items-center gap-1.5 font-body text-[14.5px] text-white hover:underline"
                      />
                    </li>
                  ))}
                </ul>
              </ScrollRevealItem>
            ))}
          </ScrollReveal>

          {/* Base row: copyright, account and social links, credit. */}
          <div className="mt-9 flex flex-col gap-3 border-t border-white/[0.14] pt-5 font-body text-[13.5px] text-white/80 md:flex-row md:items-center md:justify-between">
            <p>&copy; {currentYear} {settings.club_name}</p>
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <li><Link prefetch={false} href="/privacy" className="text-white hover:underline">Privacy</Link></li>
              <li><Link prefetch={false} href="/club-account" className="text-white hover:underline">My Account</Link></li>
              <li>
                <a href={settings.facebook_url || FACEBOOK_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-white hover:underline">
                  <Facebook className="h-3.5 w-3.5" aria-hidden="true" />Facebook<span className="sr-only"> (opens in new tab)</span>
                </a>
              </li>
              <li>
                <a href={settings.instagram_url || INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-white hover:underline">
                  <Instagram className="h-3.5 w-3.5" aria-hidden="true" />Instagram<span className="sr-only"> (opens in new tab)</span>
                </a>
              </li>
              {(settings.playhq_url || fallbackClubSettings.playhq_url) && (
                <li>
                  <a href={settings.playhq_url || fallbackClubSettings.playhq_url || undefined} target="_blank" rel="noopener noreferrer" className="text-white hover:underline">
                    PlayHQ<span className="sr-only"> (opens in new tab)</span>
                  </a>
                </li>
              )}
              <li>
                <a
                  href="https://sv.sajeevanveeriah.workers.dev/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Built by Sajeevan Veeriah (opens portfolio in a new tab)"
                  className="text-white/80 hover:text-white hover:underline focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300"
                >
                  Built by Sajeevan Veeriah
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}
