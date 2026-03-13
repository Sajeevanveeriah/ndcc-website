import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Mail, ExternalLink } from 'lucide-react';
import {
  CLUB_NAME,
  CLUB_SHORT,
  CLUB_ADDRESS,
  CLUB_GROUND,
  CLUB_EMAIL_USER,
  CLUB_EMAIL_DOMAIN,
  ACKNOWLEDGEMENT,
  CLUB_ASSOCIATION,
  NAV_LINKS,
} from '@/lib/constants';

export default function Footer() {
  const currentYear = new Date().getFullYear();
  const emailHref = `mailto:${CLUB_EMAIL_USER}@${CLUB_EMAIL_DOMAIN}`;

  return (
    <footer className="bg-maroon-800 text-white" role="contentinfo">
      {/* Acknowledgement */}
      <div className="bg-maroon-900 px-4 sm:px-6 lg:px-8 py-6">
        <div className="container-width">
          <p className="text-sm text-maroon-200 font-body leading-relaxed max-w-4xl">
            {ACKNOWLEDGEMENT}
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
                <span className="font-display font-bold text-lg">{CLUB_SHORT}</span>
              </Link>
              <p className="text-maroon-200 text-sm font-body mb-4">
                {CLUB_NAME}. Proudly competing in the {CLUB_ASSOCIATION} since 1972.
              </p>
              <div className="space-y-2">
                <div className="flex items-start gap-2 text-sm text-maroon-200">
                  <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                  <span className="font-body">
                    {CLUB_GROUND}, {CLUB_ADDRESS}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-maroon-200">
                  <Mail className="h-4 w-4 shrink-0" />
                  <a href={emailHref} className="font-body hover:text-white transition-colors">
                    {CLUB_EMAIL_USER}@{CLUB_EMAIL_DOMAIN}
                  </a>
                </div>
              </div>
            </div>

            {/* Quick Links */}
            <div>
              <h3 className="font-display font-bold text-base mb-4">Quick Links</h3>
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
              <h3 className="font-display font-bold text-base mb-4">Get Involved</h3>
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
              <h3 className="font-display font-bold text-base mb-4">Affiliations</h3>
              <ul className="space-y-2">
                <li>
                  <a
                    href="https://www.geelongcricket.com.au"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm text-maroon-200 hover:text-white transition-colors font-body"
                  >
                    {CLUB_ASSOCIATION}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
                <li>
                  <span className="text-sm text-maroon-200 font-body">
                    Newcomb Power Football Club
                  </span>
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
            &copy; {currentYear} {CLUB_NAME}. All rights reserved.
          </p>
          <a
            href="https://www.perplexity.ai/computer"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-maroon-400 hover:text-maroon-200 transition-colors font-body"
          >
            Created with Perplexity Computer
          </a>
        </div>
      </div>
    </footer>
  );
}
