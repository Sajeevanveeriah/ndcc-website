import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Mail, Phone, ExternalLink } from 'lucide-react';
import { getNavigationLinks, getSiteSettings } from '@/lib/cms-content';
import { getContentBlocks } from '@/lib/content-blocks';

export default async function Footer() {
  const currentYear = new Date().getFullYear();
  const [settings, navLinks, footerAffiliations, blocks] = await Promise.all([
    getSiteSettings(),
    getNavigationLinks('main'),
    getNavigationLinks('footer_affiliations'),
    getContentBlocks(['footer.acknowledgement', 'footer.contact']),
  ]);
  const clubName = settings.club_name || '';
  const clubShort = settings.club_short || '';
  const clubAssociation = settings.club_association || '';
  const clubEstablished = settings.club_established || '';
  const clubGround = settings.club_ground || '';
  const clubAddress = settings.club_address || '';
  const clubEmail = settings.club_email || '';
  const clubPhone = settings.club_phone || '';
  const emailHref = clubEmail ? `mailto:${clubEmail}` : '';
  const phoneHref = clubPhone ? `tel:${clubPhone.replace(/\s+/g, '')}` : '';
  const acknowledgement = blocks['footer.acknowledgement']?.body || settings.acknowledgement || '';
  const acknowledgementImage = blocks['footer.acknowledgement']?.image_url;
  const footerContactBody = blocks['footer.contact']?.body || '';
  const quickLinks = navLinks.slice(0, 6);
  const moreLinks = navLinks.slice(6);

  return (
    <footer className="bg-maroon-900 text-white" role="contentinfo">
      {/* Acknowledgement */}
      <div
        className="bg-maroon-900 px-4 sm:px-6 lg:px-8 py-6 bg-cover bg-center"
        style={acknowledgementImage ? { backgroundImage: `linear-gradient(rgba(74,0,0,0.82), rgba(74,0,0,0.82)), url(${acknowledgementImage})` } : undefined}
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
            {/* Club Info */}
            <div className="lg:col-span-1">
              <Link href="/" className="flex items-center gap-3 mb-4">
                <Image
                  src="/images/logo.jpg"
                  alt={clubShort ? `${clubShort} logo` : 'Club logo'}
                  width={40}
                  height={40}
                  className="rounded-full"
                />
                <span className="font-display font-semibold uppercase tracking-wide text-lg">{clubShort}</span>
              </Link>
              <p className="text-maroon-200 text-sm font-body mb-4">
                {clubName}{footerContactBody ? `. ${footerContactBody}` : clubAssociation || clubEstablished ? `. Proudly competing in the ${clubAssociation}${clubEstablished ? ` since ${clubEstablished}` : ''}.` : ''}
              </p>
              <div className="space-y-2">
                <div className="flex items-start gap-2 text-sm text-maroon-200">
                  <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                  <span className="font-body">
                    {[clubGround, clubAddress].filter(Boolean).join(', ')}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-maroon-200">
                  <Mail className="h-4 w-4 shrink-0" />
                  <a href={emailHref} className="font-body hover:text-white transition-colors">
                    {clubEmail}
                  </a>
                </div>
                <div className="flex items-center gap-2 text-sm text-maroon-200">
                  <Phone className="h-4 w-4 shrink-0" />
                  <a href={phoneHref} className="font-body hover:text-white transition-colors">
                    {clubPhone}
                  </a>
                </div>
              </div>
            </div>

            {/* Quick Links */}
            <div>
              <h3 className="font-display font-semibold uppercase tracking-wide text-base mb-4">Quick Links</h3>
              <ul className="space-y-2">
                {quickLinks.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-maroon-200 hover:text-white transition-colors font-body"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* More Links */}
            <div>
              <h3 className="font-display font-semibold uppercase tracking-wide text-base mb-4">Get Involved</h3>
              <ul className="space-y-2">
                {moreLinks.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-maroon-200 hover:text-white transition-colors font-body"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link
                    href="/admin/login"
                    className="text-sm text-maroon-300 hover:text-white transition-colors font-body"
                  >
                    Committee Login
                  </Link>
                </li>
              </ul>
            </div>

            {/* Partners */}
            <div>
              <h3 className="font-display font-semibold uppercase tracking-wide text-base mb-4">Affiliations</h3>
              <ul className="space-y-2">
                {footerAffiliations.map((link) => {
                  const external = /^https?:\/\//.test(link.href);
                  return (
                    <li key={link.href}>
                      {external ? (
                        <a href={link.href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-maroon-200 hover:text-white transition-colors font-body">
                          {link.label}<ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <Link href={link.href} className="text-sm text-maroon-200 hover:text-white transition-colors font-body">{link.label}</Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-maroon-700 px-4 sm:px-6 lg:px-8 py-6">
        <div className="container-width flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-maroon-300 font-body">
            &copy; {currentYear} {clubName}. All rights reserved.
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
