import Link from 'next/link';
import DonationInvitation from '@/components/donations/DonationInvitation';
import LogoChip from '@/components/common/LogoChip';
import Card, { CardContent } from '@/components/ui/Card';
import ScrollReveal, { ScrollRevealItem } from '@/components/common/ScrollReveal';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/Table';
import {
  CLUB_NAME,
  CLUB_EMAIL_USER,
  CLUB_EMAIL_DOMAIN,
  CLUB_PHONE,
  SEED_SPONSOR_DESCRIPTIONS,
} from '@/lib/constants';
import { formatDownloadSize, sponsorshipDownloads2026_27 } from '@/lib/assets';
import { getInitials } from '@/lib/utils';
import type { Sponsor } from '@/lib/types';
import { mergeSponsorsWithFallback } from '@/lib/fallback-content';
import { sortSponsorsAlphabetically } from '@/lib/sponsor-presentation';
import { getPublicSponsors } from '@/lib/public-data';
import { getContentBlocks } from '@/lib/content-blocks';
import { getCurrentClubSeason } from '@/lib/club-seasons';
import SponsorEnquiryForm from './SponsorEnquiryForm';

// Server component: sponsors, CMS copy and the current season name are read
// server-side (same sources as /api/public/sponsors, /api/content-blocks and
// /api/public/club-season), so sponsor names are in the server HTML. ISR is
// configured in ./layout.tsx. Only the enquiry form is a client island.

const SPONSORSHIP_PACKAGES = [
  ['Social Membership', 'AUD 75'],
  ['Match Day Ball Sponsor', 'AUD 150'],
  ['Player Sponsorship', 'AUD 350'],
  ['Bronze Sponsorship', 'AUD 450'],
  ['Silver Sponsorship', 'AUD 850'],
  ['Gold Sponsorship', 'AUD 1,150'],
  ['Diamond Sponsorship', 'AUD 1,550'],
  ['Platinum Sponsorship', 'AUD 2,100'],
] as const;

const SPONSOR_DESCRIPTIONS_BY_NAME: Record<string, string> = {
  'APCO': 'Australian-owned service station and convenience retailer with Geelong-region locations, including Newcomb and North Geelong.',
  'Bennett': 'Proud local supporter of Newcomb and District Cricket Club.',
  "Blackman's Brewery": SEED_SPONSOR_DESCRIPTIONS['seed-blackmans'],
  'Champion Trophies': SEED_SPONSOR_DESCRIPTIONS['seed-champion'],
  'GP': 'Proud local supporter of Newcomb and District Cricket Club.',
  'Leopold Sportsmans Club': SEED_SPONSOR_DESCRIPTIONS['seed-leopold'],
  'Mahoney': 'Geelong and Bellarine Peninsula real estate services.',
  'MBR Cricket': SEED_SPONSOR_DESCRIPTIONS['seed-mbr'],
  'Phoenix Truck Bodies': SEED_SPONSOR_DESCRIPTIONS['seed-phoenix'],
};

function getSponsorDescription(sponsor: Sponsor) {
  return SEED_SPONSOR_DESCRIPTIONS[sponsor.id] || SPONSOR_DESCRIPTIONS_BY_NAME[sponsor.name] || '';
}

async function loadSponsors(): Promise<Sponsor[]> {
  try {
    const result = await getPublicSponsors();
    // A successful response is live truth, including an empty list; never
    // substitute the static seed sponsors for real CMS data. The merge only
    // backfills missing logo/website fields on live rows.
    const rows = Array.isArray(result.data) ? result.data : [];
    return rows.length > 0 ? mergeSponsorsWithFallback(rows) : [];
  } catch {
    // Show the static fallback (real sponsors) instead of a diagnostic so the
    // grid is never empty or broken.
    return mergeSponsorsWithFallback([]);
  }
}

async function loadCurrentSeasonName(): Promise<string> {
  try {
    const season = await getCurrentClubSeason();
    if (season?.name) return String(season.name);
  } catch {
    // The neutral fallback avoids publishing a stale year.
  }
  return 'Current Season';
}

export default async function SponsorsPage() {
  const clubEmail = `${CLUB_EMAIL_USER}@${CLUB_EMAIL_DOMAIN}`;
  const clubPhoneHref = `tel:${CLUB_PHONE.replace(/\s+/g, '')}`;
  const [sponsors, blocks, currentSeasonName] = await Promise.all([
    loadSponsors(),
    getContentBlocks(['sponsors.hero', 'sponsors.intro']),
    loadCurrentSeasonName(),
  ]);
  const heroTitle = blocks['sponsors.hero']?.title || 'Our Sponsors';
  const heroBody = blocks['sponsors.hero']?.body || 'The generous support of our sponsors helps keep cricket thriving in the Newcomb and Geelong community. We are grateful for every partnership.';
  const introTitle = blocks['sponsors.intro']?.title || 'Community Support';
  const introBody = blocks['sponsors.intro']?.body
    || `${CLUB_NAME} relies on the support of local businesses and community organisations to provide affordable cricket for players of all ages. Our sponsors help fund equipment, ground maintenance, junior development programmes, and club events. Every sponsorship dollar goes directly back into our cricket community.`;

  const tierOptions = SPONSORSHIP_PACKAGES.map(([name, price]) => ({ value: name, label: `${name} - ${price}` }));

  const sortedSponsors = sortSponsorsAlphabetically(sponsors);

  return (
    <>
      {/* Hero */}
      <section className="page-hero">
        <div className="container-width">
          <ScrollReveal onMount delay={0}><h1 className="page-hero-title">{heroTitle}</h1></ScrollReveal>
          <ScrollReveal onMount delay={0.15}><p className="page-hero-subtitle">{heroBody}</p></ScrollReveal>
        </div>
      </section>

      <nav className="border-b border-edge-subtle bg-surface-card px-4 py-3 sm:px-6 lg:px-8" aria-label="On this page">
        <div className="container-width flex flex-wrap items-center gap-x-5 gap-y-2 font-body text-sm font-semibold">
          <span className="text-content-muted">On this page</span>
          <a href="#current-sponsors" className="text-maroon-700 hover:underline dark:text-maroon-200">Current sponsors</a>
          <a href="#sponsorship-packages" className="text-maroon-700 hover:underline dark:text-maroon-200">Packages</a>
          <a href="#enquiry-form" className="text-maroon-700 hover:underline dark:text-maroon-200">Enquire</a>
        </div>
      </nav>

      <DonationInvitation />

      {/* Intro */}
      <section id="current-sponsors" className="section-padding bg-surface-page scroll-mt-28">
        <div className="container-width">
          <ScrollReveal className="sponsor-introduction">
            <h2 className="section-title">{introTitle}</h2>
            <p className="text-content-muted font-body text-lg leading-relaxed">
              {introBody}
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* One maintainable A-Z sponsor list. */}
      {sortedSponsors.length === 0 ? (
          <section className="section-padding">
            <div className="container-width">
              <Card>
                <CardContent className="p-8 text-center">
                  <h2 className="text-2xl font-display font-bold text-maroon-800 dark:text-maroon-200 mb-2">No active sponsors published</h2>
                  <p className="text-content-muted font-body">Active sponsor records will appear here after they are published in the CMS.</p>
                </CardContent>
              </Card>
            </div>
          </section>
        ) : (
          <section className="section-padding">
            <div className="container-width">
              <div className="mb-5 flex items-center gap-4">
                <span className="h-1 w-10 rounded-full bg-maroon-700" aria-hidden="true" />
                <h2 className="section-title mb-0">Sponsors A-Z</h2>
              </div>
              <ScrollReveal stagger as="ul" className="sponsor-gallery grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {sortedSponsors.map((sponsor) => {
                  const description = getSponsorDescription(sponsor);
                  const logoFallback = (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 rounded-lg bg-maroon-800 px-4 text-center">
                      <span className="font-display text-2xl font-bold leading-none text-gold-200">{getInitials(sponsor.name)}</span>
                      <span className="font-display text-xs font-semibold uppercase tracking-wide text-gold-100">{sponsor.name}</span>
                    </div>
                  );
                  return (
                    <ScrollRevealItem key={sponsor.id} as="li">
                    <a
                      href={sponsor.website || undefined}
                      target={sponsor.website ? '_blank' : undefined}
                      rel={sponsor.website ? 'noopener noreferrer' : undefined}
                      className="block group h-full rounded-2xl focus-ring"
                    >
                      <div className="card-hover-sponsor h-full">
                        <CardContent className="p-5 sm:p-6">
                          <LogoChip
                            name={sponsor.name}
                            src={sponsor.logo_url}
                            surfaceMode={sponsor.logo_surface_mode}
                            paddingClassName={sponsor.logo_padding}
                            objectPosition={sponsor.logo_object_position}
                            width={640}
                            height={320}
                            sizes="(max-width: 639px) 90vw, (max-width: 1023px) 44vw, 380px"
                            className="mb-5 h-48 rounded-xl"
                            imageClassName="max-h-full max-w-full w-auto h-auto"
                            fallback={logoFallback}
                          />
                          {/* Name caption beneath the logo so a low-contrast or missing logo still
                              shows an identifiable, non-empty card. */}
                          <h3 className="font-display font-semibold text-content-primary text-lg group-hover:text-maroon-700 dark:group-hover:text-maroon-200 transition-colors mb-2">
                            {sponsor.name}
                          </h3>
                          {description && (
                            <p className="text-content-muted font-body text-sm mb-3">{description}</p>
                          )}
                          {sponsor.website && (
                            <p className="text-maroon-600 dark:text-maroon-300 font-body text-sm font-semibold group-hover:underline inline-flex items-center">
                              Visit website
                              <svg className="ml-1 w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                              </svg>
                            </p>
                          )}
                        </CardContent>
                      </div>
                    </a>
                    </ScrollRevealItem>
                  );
                })}
                  <ScrollRevealItem key="become-a-sponsor-cta" as="li">
                    <Link href="#enquiry-form" className="group block h-full">
                      <Card hover className="h-full border-2 border-dashed border-maroon-200">
                        <CardContent className="flex h-full flex-col items-center justify-center p-6 text-center">
                          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-maroon-50 dark:bg-maroon-950 text-2xl font-bold text-maroon-700 dark:text-maroon-200 transition-colors group-hover:bg-maroon-100" aria-hidden="true">+</span>
                          <h3 className="font-display text-lg font-bold text-maroon-800 dark:text-maroon-200">Become a Sponsor</h3>
                          <p className="mt-1 font-body text-sm text-content-muted">Partner with the Dinos. Enquire below.</p>
                        </CardContent>
                      </Card>
                    </Link>
                  </ScrollRevealItem>
              </ScrollReveal>
            </div>
          </section>
        )}

      {/* Become a Sponsor */}
      <section className="band-maroon section-padding">
        <div className="container-width text-center">
          <span className="eyebrow-gold">Partner With the Dinos</span>
          <h2 className="text-3xl sm:text-4xl font-display font-bold mb-4">Become a Sponsor</h2>
          <p className="mx-auto mb-5 max-w-2xl font-body text-base text-maroon-100 sm:text-lg">
            Interested in partnering with the Dinos? We offer flexible sponsorship packages for
            businesses of all sizes. Get your brand in front of our members, families, and the wider
            Geelong cricket community.
          </p>
          <Link href="#enquiry-form" className="btn-accent">
            Enquire Below
          </Link>
        </div>
      </section>

      <section id="sponsorship-packages" className="section-padding bg-surface-page scroll-mt-28">
        <div className="container-width mx-auto grid max-w-5xl grid-cols-1 items-start gap-4 lg:grid-cols-[1.25fr_1fr]">
          <Card>
            <CardContent className="p-5">
              <h2 className="text-2xl font-display font-bold text-content-primary mb-3">{currentSeasonName} Sponsorship Packages</h2>
              {/* Same 8 real packages/prices, presented as a scannable ledger table. */}
              <div className="mb-4" aria-label="Sponsorship package summary">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeader>Package</TableHeader>
                      <TableHeader className="text-right">Price</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {SPONSORSHIP_PACKAGES.map(([tier, price]) => (
                      <TableRow key={tier}>
                        <TableCell className="font-semibold text-content-primary">{tier}</TableCell>
                        <TableCell className="text-right font-display font-bold text-maroon-700 dark:text-maroon-200">{price}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="space-y-2">
                {sponsorshipDownloads2026_27.map((download) => (
                  <a key={download.href} href={download.href} target="_blank" rel="noopener noreferrer" className="block text-maroon-700 dark:text-maroon-200 hover:text-maroon-500 hover:underline font-body">
                    {download.title}{' '}
                    <span className="text-sm text-content-muted">(PDF, {formatDownloadSize(download.bytes)})</span>
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <h2 className="text-2xl font-display font-bold text-content-primary mb-3">Apparel Sponsorship</h2>
              <p className="text-content-secondary font-body mb-4">
                Put your brand on Newcomb and District apparel and support community cricket in the {currentSeasonName.toLowerCase()}.
              </p>
              <p className="text-content-secondary font-body">
                This opportunity is separate from the standard sponsorship packages. Contact John Elliott, President, on <a href={clubPhoneHref} className="text-maroon-700 dark:text-maroon-200 hover:text-maroon-500 transition-colors">{CLUB_PHONE}</a> or via email at <a href={`mailto:${clubEmail}`} className="text-maroon-700 dark:text-maroon-200 hover:text-maroon-500 transition-colors">{clubEmail}</a>.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Sponsorship Enquiry Form */}
      <section id="enquiry-form" className="section-padding scroll-mt-28" aria-label="Sponsorship enquiry form">
        <div className="container-width max-w-2xl mx-auto">
          <h2 className="section-title text-center">Sponsorship Enquiry</h2>
          <p className="section-subtitle mx-auto mb-6 text-center">
            Fill out the form below and our sponsorship coordinator will be in touch.
          </p>

          <SponsorEnquiryForm tierOptions={tierOptions} />
        </div>
      </section>
    </>
  );
}
