import type { ReactNode } from 'react';
import Link from 'next/link';
import DonationInvitation from '@/components/donations/DonationInvitation';
import LogoChip from '@/components/common/LogoChip';
import SafeImage from '@/components/common/SafeImage';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/Table';
import {
  CLUB_NAME,
  CLUB_EMAIL_USER,
  CLUB_EMAIL_DOMAIN,
  CLUB_PHONE,
  SEED_SPONSOR_DESCRIPTIONS,
} from '@/lib/constants';
import { formatDownloadSize, sponsorshipDownloads2026_27 } from '@/lib/assets';
import { resolveSponsorLogoSurface } from '@/lib/sponsor-logo-surface';
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
  const heroBody = blocks['sponsors.hero']?.body || 'The local businesses and organisations that support cricket at Newcomb.';
  const introTitle = blocks['sponsors.intro']?.title || 'Community Support';
  const introBody = blocks['sponsors.intro']?.body
    || `${CLUB_NAME} relies on the support of local businesses and community organisations to provide affordable cricket for players of all ages. Our sponsors help fund equipment, ground maintenance, junior development programmes, and club events. Every sponsorship dollar goes directly back into our cricket community.`;

  const tierOptions = SPONSORSHIP_PACKAGES.map(([name, price]) => ({ value: name, label: `${name} - ${price}` }));

  const sortedSponsors = sortSponsorsAlphabetically(sponsors);
  const describedSponsors = sortedSponsors
    .map((sponsor) => ({ sponsor, description: getSponsorDescription(sponsor) }))
    .filter((row) => row.description);

  return (
    <>
      {/* Hero */}
      <section className="page-hero px-0 sm:px-0 lg:px-0">
        <div className="nd-wrap">
          <nav aria-label="Breadcrumb" className="nd-crumbs">
            <Link href="/">Home</Link> / <span aria-current="page">Sponsors</span>
          </nav>
          <h1 className="page-hero-title">{heroTitle}</h1>
          <p className="page-hero-subtitle">{heroBody}</p>
          <nav aria-label="On this page" className="nd-hero-links">
            <a href="#current-sponsors">Current sponsors</a>
            <a href="#sponsorship-packages">Packages</a>
            <a href="#enquiry-form">Enquire</a>
          </nav>
        </div>
      </section>

      {/* Current sponsors: CMS intro, then one maintainable A-Z logo grid. */}
      <section id="current-sponsors" className="nd-sec-tight scroll-mt-28" aria-labelledby="current-sponsors-title">
        <div className="nd-wrap">
          <div className="mb-8">
            <h2 id="current-sponsors-title" className="nd-h2 mb-3">{introTitle}</h2>
            <p className="nd-lead">{introBody}</p>
          </div>

          {sortedSponsors.length === 0 ? (
            <div className="nd-card p-8 text-center">
              <h3 className="mb-2 font-display text-2xl font-semibold text-content-primary">No active sponsors published</h3>
              <p className="font-body text-content-muted">Active sponsor records will appear here after they are published in the CMS.</p>
            </div>
          ) : (
            <>
              <ul className="nd-logos m-0 list-none p-0" aria-label="Sponsors A-Z">
                {sortedSponsors.map((sponsor) => (
                  <li key={sponsor.id} className="flex">
                    <SponsorTile sponsor={sponsor} />
                  </li>
                ))}
              </ul>

              {describedSponsors.length > 0 && (
                <dl className="mt-8 grid grid-cols-1 gap-x-8 gap-y-4 font-body text-sm sm:grid-cols-2 lg:grid-cols-3">
                  {describedSponsors.map(({ sponsor, description }) => (
                    <div key={sponsor.id}>
                      <dt className="font-semibold text-content-primary">{sponsor.name}</dt>
                      <dd className="mt-0.5 text-content-muted">{description}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </>
          )}
        </div>
      </section>

      <DonationInvitation />

      {/* Become a sponsor: packages on the left, the live enquiry form on the right. */}
      <section className="nd-sec-tight" aria-labelledby="become-a-sponsor-title">
        <div className="nd-wrap nd-two-col">
          <div className="min-w-0">
            <span className="nd-eyebrow">Partner With the Dinos</span>
            <h2 id="become-a-sponsor-title" className="nd-h2 mb-3 mt-2">Become a Sponsor</h2>
            <p className="nd-lead">
              Interested in partnering with the Dinos? We offer flexible sponsorship packages for
              businesses of all sizes. Get your brand in front of our members, families, and the wider
              Geelong cricket community.
            </p>

            <div id="sponsorship-packages" className="nd-card mt-8 scroll-mt-28 p-5 sm:p-6">
              <h3 className="mb-3 font-display text-xl font-semibold text-content-primary">{currentSeasonName} Sponsorship Packages</h3>
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
                        <TableCell className="whitespace-nowrap text-right font-display font-bold text-maroon-700 dark:text-maroon-200">{price}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="space-y-2">
                {sponsorshipDownloads2026_27.map((download) => (
                  <a key={download.href} href={download.href} target="_blank" rel="noopener noreferrer" className="block font-body text-maroon-700 hover:text-maroon-500 hover:underline dark:text-maroon-200">
                    {download.title}{' '}
                    <span className="text-sm text-content-muted">(PDF, {formatDownloadSize(download.bytes)})</span>
                  </a>
                ))}
              </div>
            </div>

            <div className="nd-card mt-5 p-5 sm:p-6">
              <h3 className="mb-3 font-display text-xl font-semibold text-content-primary">Apparel Sponsorship</h3>
              <p className="mb-4 font-body text-content-secondary">
                Put your brand on Newcomb and District apparel and support community cricket in the {currentSeasonName.toLowerCase()}.
              </p>
              <p className="font-body text-content-secondary">
                This opportunity is separate from the standard sponsorship packages. Contact John Elliott, President, on <a href={clubPhoneHref} className="text-maroon-700 underline underline-offset-4 transition-colors hover:text-maroon-500 dark:text-maroon-200">{CLUB_PHONE}</a> or via email at <a href={`mailto:${clubEmail}`} className="wrap-break-word text-maroon-700 underline underline-offset-4 transition-colors hover:text-maroon-500 dark:text-maroon-200">{clubEmail}</a>.
              </p>
            </div>
          </div>

          {/* Sponsorship Enquiry Form */}
          <section id="enquiry-form" className="nd-card min-w-0 scroll-mt-28 p-5 sm:p-[26px]" aria-label="Sponsorship enquiry form">
            <h3 className="mb-2 font-display text-xl font-semibold text-content-primary">Sponsorship Enquiry</h3>
            <p className="mb-6 font-body text-content-muted">
              Fill out the form below and our sponsorship coordinator will be in touch.
            </p>

            <SponsorEnquiryForm tierOptions={tierOptions} />
          </section>
        </div>
      </section>
    </>
  );
}

// One white logo tile per sponsor. A tile with a website links to it; a
// sponsor without a logo (or whose logo fails to load) shows its name as text.
// Light-text artwork keeps its CMS/allowlisted dark plate via LogoChip.
function SponsorTile({ sponsor }: { sponsor: Sponsor }) {
  const nameText = (
    <span className="text-center text-[15px] font-semibold leading-tight text-[#1D1D1F]">{sponsor.name}</span>
  );
  const hasLogo = Boolean(sponsor.logo_url?.trim());
  const surface = resolveSponsorLogoSurface(sponsor.name, sponsor.logo_surface_mode);
  const sizes = '(max-width: 560px) 45vw, 200px';

  let content: ReactNode = sponsor.name;
  if (hasLogo && (surface === 'light' || surface === 'transparent')) {
    content = (
      <SafeImage
        src={sponsor.logo_url}
        alt={sponsor.name}
        width={340}
        height={144}
        sizes={sizes}
        style={sponsor.logo_object_position ? { objectPosition: sponsor.logo_object_position } : undefined}
        fallback={nameText}
      />
    );
  } else if (hasLogo) {
    content = (
      <LogoChip
        name={sponsor.name}
        alt={sponsor.name}
        src={sponsor.logo_url}
        surfaceMode={sponsor.logo_surface_mode}
        paddingClassName={sponsor.logo_padding || 'p-3'}
        objectPosition={sponsor.logo_object_position}
        width={340}
        height={144}
        sizes={sizes}
        className="h-full w-full rounded-xl"
        imageClassName="h-auto w-auto"
        fallback={nameText}
      />
    );
  }

  const className = `nd-logo-tile w-full${hasLogo ? '' : ' is-text'}`;
  if (!sponsor.website) return <div className={className}>{content}</div>;
  return (
    <a href={sponsor.website} target="_blank" rel="noopener noreferrer" className={`${className} focus-ring`}>
      {content}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
