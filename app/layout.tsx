import type { Metadata } from 'next';
import { Archivo, Barlow_Condensed, Inter, Oswald } from 'next/font/google';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import ThemeProvider from '@/components/common/ThemeProvider';
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

// Self-hosted via next/font: replaces the render-blocking Google Fonts
// @import that used to live in globals.css. Weights match that import.
const inter = Inter({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700'], variable: '--font-inter', display: 'swap' });
const barlowCondensed = Barlow_Condensed({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-barlow-condensed', display: 'swap' });
const archivo = Archivo({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-archivo', display: 'swap' });
const oswald = Oswald({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-oswald', display: 'swap' });

const fontVariables = `${inter.variable} ${barlowCondensed.variable} ${archivo.variable} ${oswald.variable}`;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.ndcc.com.au';

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SportsOrganization',
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
    'Official website of the Newcomb and District Cricket Club (NDCC), the Dinos. Competing in the Geelong Cricket Association since 1972. Based at Grinter Reserve, Moolap.',
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
      'Official website of the NDCC Dinos. Competing in the Geelong Cricket Association since 1972.',
    images: [{ url: '/images/logo.jpg', width: 800, height: 800, alt: 'NDCC Logo' }],
  },
  robots: { index: true, follow: true },
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://www.ndcc.com.au'),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning is required by next-themes: it stamps the theme
    // class on <html> before hydration, which is an expected mismatch.
    <html lang="en-AU" suppressHydrationWarning className={fontVariables}>
      <head>
        <meta name="theme-color" content="#800000" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
      </head>
      <body className="min-h-screen flex flex-col">
        <ThemeProvider>
          <Navbar />
          <main className="flex-1 pt-24 lg:pt-28">{children}</main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
