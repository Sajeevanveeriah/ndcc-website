export const dynamic = 'force-dynamic';

import Link from 'next/link';
import Image from 'next/image';
import SafeImage from '@/components/common/SafeImage';
import Card, { CardContent } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import {
  CLUB_NAME,
  CLUB_NICKNAME,
  CLUB_ESTABLISHED,
  PLAYHQ_ORG_URL,
  FACEBOOK_URL,
  SEED_SPONSORS,
  SPONSOR_TIERS,
} from '@/lib/constants';
import { formatDate, truncateText } from '@/lib/utils';
import { getContentBlocks } from '@/lib/content-blocks';
import { getPublishedNews, type PublicNewsRecord } from '@/lib/public-news';
import { createServerClient } from '@/lib/supabase-server';
import { getPageLinkCards } from '@/lib/structured-content';
import { normalizeSeasonAppointmentImage } from '@/lib/public-content-normalizers';

type NewsItem = PublicNewsRecord & {
  image?: string;
};

interface SponsorItem {
  id: string;
  name: string;
  tier: string;
  website: string;
  logo_url: string;
}

interface SeasonAppointmentItem {
  id: string;
  name: string;
  role: string;
  image_url: string | null;
  announcement_date: string;
}

async function getLatestNews(): Promise<NewsItem[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return [];
  }

  try {
    const data = await getPublishedNews({ limit: 3 });
    if (!Array.isArray(data)) return [];
    return data as NewsItem[];
  } catch {
    return [];
  }
}

async function getSponsors(): Promise<SponsorItem[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return [];
  }
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('sponsors')
      .select('id, name, tier, website, logo_url')
      .eq('active', true)
      .order('created_at', { ascending: true });
    return (data as SponsorItem[]) || [];
  } catch {
    return [];
  }
}

async function getSeasonAppointments(): Promise<SeasonAppointmentItem[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return [];
  }
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('season_appointments')
      .select('id, name, role, image_url, announcement_date')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('announcement_date', { ascending: false });
    return (data as SeasonAppointmentItem[]) || [];
  } catch {
    return [];
  }
}

const TIER_BADGE_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  major: 'danger',
  gold: 'warning',
  silver: 'default',
};

export default async function HomePage() {
  const [dbNews, dbSponsors, dbSeasonAppointments, blocks, quickLinks] = await Promise.all([
    getLatestNews(),
    getSponsors(),
    getSeasonAppointments(),
    getContentBlocks(['home.hero', 'home.quicklinks', 'home.season_status']),
    getPageLinkCards('home', 'quick_links'),
  ]);

  const news: NewsItem[] = dbNews;

  const sponsors: SponsorItem[] = dbSponsors.length > 0
    ? dbSponsors
    : SEED_SPONSORS.map((s) => ({
        id: s.id,
        name: s.name,
        tier: s.tier,
        website: s.website,
        logo_url: s.logo_url,
      }));

  const seasonAppointments = dbSeasonAppointments.map((item) => ({
    ...item,
    image_url: normalizeSeasonAppointmentImage(item.name, item.image_url),
  }));
  const heroCtaLabel = blocks['home.hero']?.cta_label || 'Join the Club';
  const heroCtaUrl = blocks['home.hero']?.cta_url || '/contact';

  return (
    <>
      <section className="relative text-white overflow-hidden" style={{ minHeight: '520px', display: 'flex', flexDirection: 'column' }}>
        <Image
          src="/images/Turf_Ground.jpg"
          alt="Grinter Reserve at dusk, home of the Newcomb and District Cricket Club"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, rgba(45,0,0,0.88) 0%, rgba(45,0,0,0.58) 55%, rgba(45,0,0,0.32) 100%)' }} />
        <div className="container-width relative z-10 flex-1 flex items-center section-padding">
          <div className="w-full">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-bold mb-4">
              {blocks['home.hero']?.title || CLUB_NAME}
            </h1>
            <p className="text-xl sm:text-2xl text-maroon-100 font-body mb-8 max-w-2xl">
              {blocks['home.hero']?.body || `Home of the ${CLUB_NICKNAME}. Est. ${CLUB_ESTABLISHED}.`}
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href={heroCtaUrl} className="btn-primary text-lg px-8 py-4">
                {heroCtaLabel}
              </Link>
              <Link href="/fixtures" className="btn-outline-white text-lg px-8 py-4">
                View Fixtures
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="section-padding surface-sky">
        <div className="container-width">
          <div className="text-center mb-12">
            <h2 className="section-title">{blocks['home.quicklinks']?.title || 'Explore the Club'}</h2>
            <p className="section-subtitle mx-auto">
              {blocks['home.quicklinks']?.body || `Everything you need to know about the ${CLUB_NICKNAME}.`}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {quickLinks.map((link) => (
              <Link
                key={link.id}
                href={link.href}
                className="group bg-white border border-gray-200 border-l-4 border-l-maroon-700 rounded-[10px] p-6 flex flex-col hover:shadow-lg hover:-translate-y-1 transition-all duration-200"
              >
                {link.icon && <span className="text-3xl mb-3 block" aria-hidden="true">{link.icon}</span>}
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-xl font-display font-bold text-maroon-800 mb-2 group-hover:text-maroon-700 transition-colors">
                    {link.title}
                  </h3>
                  <span className="text-gray-300 text-xl group-hover:text-maroon-500 group-hover:translate-x-1 transition-all duration-200 shrink-0">→</span>
                </div>
                <p className="text-gray-600 font-body text-sm">{link.description}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section-padding surface-sky">
        <div className="container-width">
          <div
            className="relative overflow-hidden rounded-2xl p-8 sm:p-10 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-8 items-center"
            style={{ background: 'linear-gradient(135deg, #2d0000 0%, #800000 100%)' }}
          >
            <div>
              <h2 className="section-title" style={{ color: '#ffffff' }}>Season Update</h2>
              <h3 className="text-xl font-display font-bold mb-3" style={{ color: '#ffffff' }}>{blocks['home.season_status']?.title || 'Season Update'}</h3>
              <p className="font-body leading-relaxed mb-0" style={{ color: 'rgba(255,255,255,0.65)' }}>
                {blocks['home.season_status']?.body || `Follow the latest ${CLUB_NICKNAME} season updates, match-day notices, and club announcements on our official channels.`}{' '}
                <Link href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer" className="text-sky_accent hover:underline font-semibold">
                  Facebook page
                </Link>.
              </p>
            </div>
            <Link
              href={blocks['home.season_status']?.cta_url || PLAYHQ_ORG_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-accent inline-flex items-center whitespace-nowrap"
            >
              {blocks['home.season_status']?.cta_label || 'View Results on PlayHQ'}
              <svg className="ml-2 w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      <section className="section-padding surface-sky">
        <div className="container-width">
          <div className="text-center mb-12">
            <h2 className="section-title">Latest News</h2>
            <p className="section-subtitle mx-auto">
              Stay up to date with everything happening at NDCC.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {news.map((article) => {
              const inner = (
                <Card hover className="h-full overflow-hidden">
                  {(article.image_url || article.image) ? (
                    <div className="relative h-48 w-full overflow-hidden">
                      <Image
                        src={article.image_url || article.image || '/images/Womens_Team.jpg'}
                        alt={article.title}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                        sizes="(max-width: 768px) 100vw, 33vw"
                      />
                    </div>
                  ) : (
                    <div className="relative h-48 w-full overflow-hidden">
                      <Image
                        src="/images/Womens_Team.jpg"
                        alt="Newcomb and District Cricket Club"
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                        sizes="(max-width: 768px) 100vw, 33vw"
                      />
                    </div>
                  )}
                  <CardContent className="p-6">
                    {article.published_at && (
                      <p className="text-sm text-maroon-600 font-body font-semibold mb-2">
                        {formatDate(article.published_at)}
                      </p>
                    )}
                    <h3 className="text-lg font-display font-bold text-gray-900 mb-2 group-hover:text-maroon-700 transition-colors">
                      {article.title}
                    </h3>
                    <p className="text-gray-600 font-body text-sm">
                      {truncateText(article.content, 120)}
                    </p>
                  </CardContent>
                </Card>
              );

              return (
                <Link key={article.id} href={`/news/${article.id}`} className="group">
                  {inner}
                </Link>
              );
            })}
          </div>
          <div className="text-center mt-8">
            <Link href="/news" className="btn-secondary">
              Read More News
            </Link>
          </div>
        </div>
      </section>

      <section className="section-padding surface-sky">
        <div className="container-width">
          <div className="text-center mb-12">
            <h2 className="section-title">2026/27 Season Appointments</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {seasonAppointments.map((appointment) => {
              const role = appointment.role.trim();
              const imageAlt = role
                ? `${appointment.name} appointed as ${role}`
                : `${appointment.name} season appointment announcement`;

              return (
                <div
                  key={appointment.id}
                  className="relative rounded-2xl overflow-hidden bg-maroon-900"
                  style={{ aspectRatio: '3/4' }}
                >
                  {appointment.image_url ? (
                    <SafeImage
                      src={appointment.image_url}
                      alt={imageAlt}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      fallback={
                        <div className="h-full flex items-center justify-center">
                          <span className="text-white/25 font-display font-black text-6xl">
                            {appointment.name.split(' ').map((w) => w[0]).join('')}
                          </span>
                        </div>
                      }
                    />
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      <span className="text-white/25 font-display font-black text-6xl">
                        {appointment.name.split(' ').map((w) => w[0]).join('')}
                      </span>
                    </div>
                  )}
                  <div
                    className="absolute inset-0"
                    style={{ background: 'linear-gradient(to top, rgba(45,0,0,0.92) 0%, rgba(45,0,0,0.18) 55%, transparent 100%)' }}
                  />
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <p className="text-[10.5px] font-bold tracking-[0.12em] uppercase text-sky_accent mb-1">
                      {appointment.role}
                    </p>
                    <p className="font-display font-bold text-white text-xl uppercase leading-tight">
                      {appointment.name}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-center text-gray-500 font-body text-sm mt-8">
            More appointments to be announced. Follow us on{' '}
            <Link href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer" className="text-maroon-700 hover:underline font-semibold">
              Facebook
            </Link>{' '}
            for updates.
          </p>
        </div>
      </section>

      <section className="section-padding surface-sky">
        <div className="container-width">
          <div className="text-center mb-10">
            <h2 className="section-title">Our Sponsors</h2>
            <p className="section-subtitle mx-auto">
              Proudly supported by our local community partners.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" role="region" aria-label="Club sponsors">
            {sponsors.map((sponsor) => {
              const tierInfo = SPONSOR_TIERS.find((t) => t.value === sponsor.tier);
              const card = (
                <Card hover={Boolean(sponsor.website)} className="h-full border border-sky-100">
                  <CardContent className="p-6 flex flex-col items-center text-center h-full">
                    <div className="w-full h-28 rounded-lg bg-white border border-gray-100 relative overflow-hidden mb-4">
                      {sponsor.logo_url ? (
                        <Image
                          src={sponsor.logo_url}
                          alt={`${sponsor.name} logo`}
                          fill
                          className="object-contain p-3"
                          sizes="(max-width: 1024px) 50vw, 320px"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-lg font-bold text-maroon-700">
                          {sponsor.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <p className="font-display font-bold text-gray-900 text-base mb-2">{sponsor.name}</p>
                    {tierInfo && (
                      <Badge variant={TIER_BADGE_VARIANT[sponsor.tier] || 'default'} className="text-xs mb-3">
                        {tierInfo.label}
                      </Badge>
                    )}
                    <p className="text-sm font-body text-maroon-700 font-semibold mt-auto">
                      {sponsor.website ? 'Visit sponsor website' : 'Website coming soon'}
                    </p>
                  </CardContent>
                </Card>
              );

              if (!sponsor.website) {
                return (
                  <div key={sponsor.id} className="block">
                    {card}
                  </div>
                );
              }

              return (
                <a
                  key={sponsor.id}
                  href={sponsor.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block group"
                >
                  {card}
                </a>
              );
            })}
          </div>
          <div className="text-center mt-8">
            <Link href="/sponsors" className="btn-secondary">
              View All Sponsors
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-maroon-950 text-white section-padding">
        <div className="container-width text-center">
          <h2 className="text-3xl sm:text-4xl font-display font-bold mb-4">
            Ready to join the {CLUB_NICKNAME}?
          </h2>
          <p className="text-lg text-maroon-100 font-body mb-8 max-w-xl mx-auto">
            Whether you’re a seasoned cricketer or picking up a bat for the first time, there is a place for you at NDCC.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/contact" className="btn-accent text-lg px-8 py-4">
              Get in Touch
            </Link>
            <Link href="/volunteer" className="btn-secondary border-white text-white hover:bg-white hover:text-maroon-800 text-lg px-8 py-4">
              Volunteer With Us
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
