import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Mail, Phone, ExternalLink, Facebook, Instagram } from 'lucide-react';
import ScrollReveal, { ScrollRevealItem } from '@/components/common/ScrollReveal';
import { type PageLinkCard } from '@/lib/structured-content';
import { getSiteChromeData } from '@/lib/site-chrome';
import { ACKNOWLEDGEMENT, FACEBOOK_URL, INSTAGRAM_URL } from '@/lib/constants';

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

function FooterLink({ link, className }: { link: PageLinkCard; className: string }) {
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

  return <Link href={link.href} className={className}>{content}</Link>;
}

export default async function Footer() {
  const currentYear = new Date().getFullYear();
  const { settings, acknowledgement: acknowledgementBlock, quickLinks: cmsQuickLinks, getInvolvedLinks: cmsGetInvolvedLinks, affiliationLinks: cmsAffiliationLinks } = await getSiteChromeData();
  const emailHref = settings.email ? `mailto:${settings.email}` : undefined;
  const phoneHref = settings.phone ? `tel:${settings.phone.replace(/\s+/g, '')}` : undefined;
  const acknowledgement = acknowledgementBlock?.body;
  const acknowledgementImage = acknowledgementBlock?.image_url;

  const quickLinks = resolveLinks(cmsQuickLinks);
  const getInvolvedLinks = resolveLinks(cmsGetInvolvedLinks);
  const affiliationLinks = resolveLinks(cmsAffiliationLinks);

  return (
    <footer className="bg-maroon-900 text-white" role="contentinfo">
      {/* Acknowledgement */}
      <div
        className="border-b border-white/10 px-4 py-4 sm:px-6 lg:px-8"
        style={acknowledgementImage
          ? { backgroundImage: `linear-gradient(rgba(74,0,0,0.85), rgba(74,0,0,0.85)), url(${acknowledgementImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
          : { background: 'rgba(255,255,255,0.06)' }}
      >
        <div className="container-width">
          <p className="text-sm text-maroon-100 font-body leading-relaxed max-w-4xl">
            {acknowledgement || ACKNOWLEDGEMENT}
          </p>
        </div>
      </div>

      {/* Main Footer */}
      <div className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="container-width">
          <ScrollReveal stagger className="grid grid-cols-2 gap-6 lg:grid-cols-4 lg:gap-8">
            {/* Club Info */}
            <ScrollRevealItem className="col-span-2 lg:col-span-1">
              <Link href="/" className="mb-3 flex items-center gap-3">
                <Image
                  src="/images/logo.jpg"
                  alt="NDCC Logo"
                  width={40}
                  height={40}
                  className="rounded-full"
                />
                <span className="font-display font-semibold uppercase tracking-wide text-lg">{settings.club_short}</span>
              </Link>
              <p className="mb-3 font-body text-sm text-maroon-200">
                {settings.club_name}. Proudly competing in the {settings.association_name} since {settings.established_year}.
              </p>
              <div className="space-y-2">
                <div className="flex items-start gap-2 text-sm text-maroon-200">
                  <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                  <span className="font-body">
                    {settings.ground_name}, {settings.address}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-maroon-200">
                  <Mail className="h-4 w-4 shrink-0" />
                  <a href={emailHref || undefined} className="font-body hover:text-white transition-colors">
                    {settings.email}
                  </a>
                </div>
                <div className="flex items-center gap-2 text-sm text-maroon-200">
                  <Phone className="h-4 w-4 shrink-0" />
                  <a href={phoneHref || undefined} className="font-body hover:text-white transition-colors">
                    {settings.phone}
                  </a>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <a
                  href={settings.facebook_url || FACEBOOK_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Newcomb & District Cricket Club on Facebook"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-maroon-100 transition-colors hover:bg-white/20 hover:text-white focus-ring"
                >
                  <Facebook className="h-4 w-4" />
                </a>
                <a
                  href={settings.instagram_url || INSTAGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Newcomb & District Cricket Club on Instagram"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-maroon-100 transition-colors hover:bg-white/20 hover:text-white focus-ring"
                >
                  <Instagram className="h-4 w-4" />
                </a>
              </div>
            </ScrollRevealItem>

            {/* Quick Links */}
            {quickLinks.length > 0 && (
              <ScrollRevealItem>
                <h3 className="mb-3 border-b border-gold-400/25 pb-2 font-display text-[13px] font-semibold uppercase tracking-[0.08em] text-gold-200">Quick Links</h3>
                <ul className="space-y-1.5">
                  {quickLinks.map((link) => (
                    <li key={link.id}>
                      <FooterLink
                        link={link}
                        className="inline-flex items-center gap-1.5 text-sm text-maroon-200 hover:text-white transition-colors font-body"
                      />
                    </li>
                  ))}
                </ul>
              </ScrollRevealItem>
            )}

            {/* More Links */}
            {getInvolvedLinks.length > 0 && (
              <ScrollRevealItem>
                <h3 className="mb-3 border-b border-gold-400/25 pb-2 font-display text-[13px] font-semibold uppercase tracking-[0.08em] text-gold-200">Get Involved</h3>
                <ul className="space-y-1.5">
                  {getInvolvedLinks.map((link) => (
                    <li key={link.id}>
                      <FooterLink
                        link={link}
                        className="inline-flex items-center gap-1.5 text-sm text-maroon-200 hover:text-white transition-colors font-body"
                      />
                    </li>
                  ))}
                </ul>
              </ScrollRevealItem>
            )}

            {/* Partners */}
            {affiliationLinks.length > 0 && (
              <ScrollRevealItem>
                <h3 className="mb-3 border-b border-gold-400/25 pb-2 font-display text-[13px] font-semibold uppercase tracking-[0.08em] text-gold-200">Affiliations</h3>
                <ul className="space-y-1.5">
                  {affiliationLinks.map((link) => (
                    <li key={link.id}>
                      <FooterLink
                        link={link}
                        className="inline-flex items-center gap-1.5 text-sm text-maroon-200 hover:text-white transition-colors font-body"
                      />
                    </li>
                  ))}
                </ul>
              </ScrollRevealItem>
            )}
          </ScrollReveal>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-maroon-700 px-4 py-4 sm:px-6 lg:px-8">
        <div className="container-width flex flex-col items-center justify-between gap-2 sm:flex-row">
          <p className="text-xs text-maroon-300 font-body">
            &copy; {currentYear} {settings.club_name}. All rights reserved.
          </p>
          <a
            href="https://sajeevanveeriah.github.io/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Built by Sajeevan Veeriah (opens portfolio in a new tab)"
            className="text-xs text-maroon-400 hover:text-maroon-200 transition-colors font-body focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maroon-200"
          >
            Built by Sajeevan Veeriah
          </a>
        </div>
      </div>
    </footer>
  );
}
