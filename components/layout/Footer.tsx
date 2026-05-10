import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Mail, Phone, ExternalLink } from 'lucide-react';
import {
  ACKNOWLEDGEMENT,
  NAV_LINKS,
} from '@/lib/constants';
import { getClubSettings } from '@/lib/club-settings';
import { getContentBlocks } from '@/lib/content-blocks';

export default async function Footer() {
  const currentYear = new Date().getFullYear();
  const [settings, blocks] = await Promise.all([
    getClubSettings(),
    getContentBlocks(['footer.acknowledgement']),
  ]);
  const emailHref = settings.email ? `mailto:${settings.email}` : undefined;
  const phoneHref = settings.phone ? `tel:${settings.phone.replace(/\s+/g, '')}` : undefined;
  const acknowledgement = blocks['footer.acknowledgement']?.body || ACKNOWLEDGEMENT;
  const acknowledgementImage = blocks['footer.acknowledgement']?.image_url;

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
            </div>

            {/* Quick Links */}
            <div>
              <h3 className="font-display font-semibold uppercase tracking-wide text-base mb-4">Quick Links</h3>
              <ul className="space-y-2">
                {NAV_LINKS.slice(0, 6).map((link) => (
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
                {NAV_LINKS.slice(6).map((link) => (
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
                <li>
                  <a
                    href="https://www.geelongcricket.com.au"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm text-maroon-200 hover:text-white transition-colors font-body"
                  >
                    {settings.association_name}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.facebook.com/newcombpowerfnc/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm text-maroon-200 hover:text-white transition-colors font-body"
                  >
                    Newcomb Power Football &amp; Netball Club
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
                <li>
                  <Link
                    href="/contact?topic=softball"
                    className="text-sm text-maroon-200 hover:text-white transition-colors font-body"
                  >
                    Softball club details
                  </Link>
                </li>
                <li>
                  <Link
                    href="/contact?topic=darts"
                    className="text-sm text-maroon-200 hover:text-white transition-colors font-body"
                  >
                    Darts club details
                  </Link>
                </li>
                <li>
                  <a
                    href="https://www.goodsports.com.au"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm text-maroon-200 hover:text-white transition-colors font-body"
                  >
                    Good Sports Level 3
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-maroon-700 px-4 sm:px-6 lg:px-8 py-6">
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
