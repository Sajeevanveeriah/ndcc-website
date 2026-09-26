import AuthEmailRedirect from '@/components/AuthEmailRedirect';
import { SITE_URL, ORGANIZATION_ID } from '@/lib/seo';
import type { Metadata } from 'next';
import { serializeJsonLd } from '@/lib/json-ld';
import { Suspense } from 'react';
import { Inter } from 'next/font/google';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import { getNavVisibility } from '@/lib/server/nav-visibility';
import ThemeProvider from '@/components/common/ThemeProvider';
import RouteProgress from '@/components/common/RouteProgress';
import SiteAnalytics from '@/components/common/SiteAnalytics';
import { BRAND_COLOURS } from '@/lib/brand-colours';
import {
  CLUB_NAME,
  CLUB_NICKNAME,
  CLUB_ESTABLISHED,
  CLUB_GROUND,
  CLUB_PHONE,
  CLUB_EMAIL_USER,
  CLUB_EMAIL_DOMAIN,
  FACEBOOK_URL,
  PLAYHQ_ORG_URL,
} from '@/lib/constants';
import './globals.css';

// One self-hosted family keeps headings clear and avoids an extra font download.
// Weights match the utilities actually used: font-normal/medium/semibold/bold
// (400-700) and font-black (900). No font-thin/extralight/light/extrabold.
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700', '900'], variable: '--font-inter', display: 'swap' });
const fontVariables = inter.variable;

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SportsOrganization',
  '@id': ORGANIZATION_ID,
  name: CLUB_NAME,
  alternateName: CLUB_NICKNAME,
  sport: 'Cricket',
  foundingDate: String(CLUB_ESTABLISHED),
  url: SITE_URL,
  logo: `${SITE_URL}/images/logo.jpg`,
  email: `${CLUB_EMAIL_USER}@${CLUB_EMAIL_DOMAIN}`,
  telephone: CLUB_PHONE,
  location: {
    '@type': 'Place',
    name: CLUB_GROUND,
    address: {
      '@type': 'PostalAddress',
      streetAddress: '141 Coppards Road',
      addressLocality: 'Moolap',
      addressRegion: 'VIC',
      postalCode: '3224',
      addressCountry: 'AU',
    },
  },
  sameAs: [FACEBOOK_URL, PLAYHQ_ORG_URL],
};

export const metadata: Metadata = {
  title: {
    default: 'Newcomb and District Cricket Club | NDCC Dinos',
    template: '%s | NDCC Dinos',
  },
  description:
    'Official website of the Newcomb and District Cricket Club (NDCC), the Dinos. Senior men\'s, women\'s and junior cricket at Grinter Reserve, Moolap. Serving Newcomb and the Geelong community.',
  keywords: [
    'Newcomb Cricket Club',
    'NDCC',
    'Dinos',
    'Geelong Cricket',
    'GCA',
    'Grinter Reserve',
    'Moolap',
    'cricket',
    'community cricket',
    'Geelong',
  ],
  authors: [{ name: 'Newcomb and District Cricket Club' }],
  openGraph: {
    type: 'website',
    locale: 'en_AU',
    siteName: 'Newcomb and District Cricket Club',
    title: 'Newcomb and District Cricket Club | NDCC Dinos',
    description:
      'Official website of the NDCC Dinos. Cricket and community at Grinter Reserve, Moolap.',
    images: [{ url: '/images/logo.jpg', width: 1184, height: 896, alt: 'NDCC Logo' }],
  },
  robots: { index: true, follow: true },
  metadataBase: new URL(SITE_URL),
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Navigation visibility is computed once on the server from a cached (<=60s,
  // tag-invalidated) snapshot shared with the Footer. It deliberately reads no
  // cookies/headers so the layout never forces ISR pages into dynamic rendering.
  const nav = await getNavVisibility();
  return (
    // suppressHydrationWarning is required by next-themes: it stamps the theme
    // class on <html> before hydration, which is an expected mismatch.
    <html lang="en-AU" suppressHydrationWarning className={fontVariables}>
      <head>
        <meta name="theme-color" content={BRAND_COLOURS.maroon} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(organizationJsonLd) }}
        />
      </head>
      <body className="min-h-screen flex flex-col">
        <ThemeProvider>
          <AuthEmailRedirect />
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-maroon-700 focus:px-4 focus:py-2 focus:text-white focus:shadow-lg"
          >
            Skip to content
          </a>
          {/* useSearchParams requires a Suspense boundary during prerender. */}
          <Suspense fallback={null}>
            <RouteProgress />
          </Suspense>
          <Navbar nav={nav} />
          <main id="main-content" className="flex-1 pt-24 lg:pt-28">{children}</main>
          {/* Footer queries must not delay the first paint of every public page. */}
          <Suspense fallback={null}><Footer /></Suspense>
          <Suspense fallback={null}><SiteAnalytics /></Suspense>
        </ThemeProvider>
      </body>
    </html>
  );
}
