import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Mail, Phone, ExternalLink, Facebook, Instagram } from 'lucide-react';
import ScrollReveal, { ScrollRevealItem } from '@/components/common/ScrollReveal';
import { type PageLinkCard } from '@/lib/structured-content';
import { getSiteChromeData } from '@/lib/site-chrome';
import { fallbackLinksFor } from '@/lib/fallback-content';
import { ACKNOWLEDGEMENT, FACEBOOK_URL, INSTAGRAM_URL } from '@/lib/constants';

function isExternalLink(link: PageLinkCard) {
  return link.is_external || /^https?:\/\//i.test(link.href);
}

// Prefer live CMS links; fall back to sensible defaults on a Supabase cold start so the
// footer is never blank and never shows a diagnostic. An empty section is hidden entirely.
// Links are deduped by href (first occurrence wins, order preserved) so a duplicate
// re-seed or import can never make the footer visibly repeat a link.
function resolveLinks(live: PageLinkCard[], pageSlug: string, sectionKey: string) {
  const links = live.length > 0 ? live : fallbackLinksFor(pageSlug, sectionKey);
  const seen = new Set<string>();
  return links.filter((link) => {
    if (seen.has(link.href)) return false;
    seen.add(link.href);
    return true;
  });
}

function FooterLink({ link, className }: { link: PageLinkCard; className: string }) {
  const external = isExternalLink(link);
  const content = (
    <>
      {link.title}
      {external && <ExternalLink className="h-3 w-3" />}
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

  const quickLinks = resolveLinks(cmsQuickLinks, 'site', 'footer_quick_links');
  const getInvolvedLinks = resolveLinks(cmsGetInvolvedLinks, 'site', 'footer_get_involved');
  const affiliationLinks = resolveLinks(cmsAffiliationLinks, 'site', 'footer_affiliations');

  return (
    <footer className="bg-maroon-900 text-white" role="contentinfo">
      {/* Acknowledgement */}
      <div
        className="px-4 sm:px-6 lg:px-8 py-5 border-b border-white/10"
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
      <div className="px-4 sm:px-6 lg:px-8 py-12">
        <div className="container-width">
          <ScrollReveal stagger className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
            {/* Club Info */}
            <ScrollRevealItem className="lg:col-span-1">
              <Link href="/" className="flex items-center gap-3 mb-4">
                <Image
                  src="/images/logo.jpg"
                  alt="NDCC Logo"
                  width={40}
                  height={40}
                  className="rounded-full"
                />
                <span className="font-display font-semibold uppercase tracking-wide text-lg">{settings.club_short}</span>
              </Link>
              <p className="text-maroon-200 text-sm font-body mb-4">
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
              <div className="mt-5 flex items-center gap-3">
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
                  href={INSTAGRAM_URL}
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
                <h3 className="font-display font-semibold uppercase tracking-[0.08em] text-[13px] text-gold-200 mb-4 pb-2 border-b border-gold-400/25">Quick Links</h3>
                <ul className="space-y-2">
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
                <h3 className="font-display font-semibold uppercase tracking-[0.08em] text-[13px] text-gold-200 mb-4 pb-2 border-b border-gold-400/25">Get Involved</h3>
                <ul className="space-y-2">
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
                <h3 className="font-display font-semibold uppercase tracking-[0.08em] text-[13px] text-gold-200 mb-4 pb-2 border-b border-gold-400/25">Affiliations</h3>
                <ul className="space-y-2">
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
      <div className="border-t border-maroon-700 px-4 sm:px-6 lg:px-8 py-5">
        <div className="container-width flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-maroon-300 font-body">
            &copy; {currentYear} {settings.club_name}. All rights reserved.
          </p>
          <a
            href="https://github.com/Sajeevanveeriah"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-maroon-400 hover:text-maroon-200 transition-colors font-body"
          >
            Built by Sajeevan Veeriah
          </a>
        </div>
      </div>
    </footer>
  );
}
