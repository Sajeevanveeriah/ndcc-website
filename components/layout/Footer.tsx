import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Mail, Phone, ExternalLink } from 'lucide-react';
import ScrollReveal, { ScrollRevealItem } from '@/components/common/ScrollReveal';
import { ACKNOWLEDGEMENT } from '@/lib/constants';
import { fallbackClubSettings } from '@/lib/club-settings-types';
import {
  fallbackFooterAffiliationLinks,
  fallbackFooterGetInvolvedLinks,
  fallbackFooterQuickLinks,
  type PageLinkCard,
} from '@/lib/structured-content';

function isExternalLink(link: PageLinkCard) {
  return link.is_external || /^https?:\/\//i.test(link.href);
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

export default function Footer() {
  const currentYear = new Date().getFullYear();
  const settings = fallbackClubSettings;
  const quickLinks = fallbackFooterQuickLinks;
  const getInvolvedLinks = fallbackFooterGetInvolvedLinks;
  const affiliationLinks = fallbackFooterAffiliationLinks;
  const emailHref = settings.email ? `mailto:${settings.email}` : undefined;
  const phoneHref = settings.phone ? `tel:${settings.phone.replace(/\s+/g, '')}` : undefined;
  const acknowledgement = ACKNOWLEDGEMENT;
  const acknowledgementImage = null;

  return (
    <footer className="bg-maroon-900 text-white" role="contentinfo">
      {/* Acknowledgement */}
      <div
        className="px-4 sm:px-6 lg:px-8 py-5 border-b border-white/10"
        style={acknowledgementImage
          ? { backgroundImage: `linear-gradient(rgba(74,0,0,0.75), rgba(74,0,0,0.75)), url(${acknowledgementImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
          : { background: 'rgba(255,255,255,0.06)' }}
      >
        <div className="container-width">
          <p className="text-sm text-maroon-200 font-body leading-relaxed max-w-4xl">
            {acknowledgement}
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
            </ScrollRevealItem>

            {/* Quick Links */}
            <ScrollRevealItem>
              <h3 className="font-display font-semibold uppercase tracking-wide text-[13px] mb-4 pb-2 border-b border-white/10">Quick Links</h3>
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

            {/* More Links */}
            <ScrollRevealItem>
              <h3 className="font-display font-semibold uppercase tracking-wide text-[13px] mb-4 pb-2 border-b border-white/10">Get Involved</h3>
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

            {/* Partners */}
            <ScrollRevealItem>
              <h3 className="font-display font-semibold uppercase tracking-wide text-[13px] mb-4 pb-2 border-b border-white/10">Affiliations</h3>
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
