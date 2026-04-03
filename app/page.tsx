import Link from 'next/link';
import Image from 'next/image';
import Card, { CardContent } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import {
  CLUB_NAME,
  CLUB_NICKNAME,
  CLUB_ESTABLISHED,
  PLAYHQ_ORG_URL,
  FACEBOOK_URL,
  SEED_NEWS,
  SEED_SPONSORS,
  SPONSOR_TIERS,
  SEASON_APPOINTMENTS,
} from '@/lib/constants';
import { createServerClient } from '@/lib/supabase-server';
import { formatDate, truncateText } from '@/lib/utils';
import { getContentBlocks } from '@/lib/content-blocks';

const quickLinks = [
  { title: 'About Us', description: 'Learn about our history and the people behind the club.', href: '/about', icon: '🏏' },
  { title: 'Our Teams', description: 'Senior Men, Senior Women, and Junior Boys squads.', href: '/teams', icon: '👥' },
  { title: 'Events', description: 'Upcoming social events, fundraisers, and match days.', href: '/events', icon: '📅' },
  { title: 'Merchandise', description: 'Get your official NDCC gear and support the club.', href: '/merchandise', icon: '🛒' },
  { title: 'Volunteer', description: 'Help out on match days - canteen, scoring, and more.', href: '/volunteer', icon: '🤝' },
  { title: 'Contact', description: 'Get in touch with the club or make an enquiry.', href: '/contact', icon: '✉️' },
];

interface NewsItem {
  id: string;
  title: string;
  content: string;
  published_at: string | null;
  image?: string;
}

interface SponsorItem {
  id: string;
  name: string;
  tier: string;
  website: string;
  logo_url: string;
}

async function getLatestNews(): Promise<NewsItem[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return [];
  }
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('news')
      .select('id, title, content, published_at, image')
      .eq('published', true)
      .order('published_at', { ascending: false })
      .limit(3);
    return (data as NewsItem[]) || [];
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

const TIER_BADGE_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  major: 'danger',
  gold: 'warning',
  silver: 'default',
};

export default async function HomePage() {
  const [dbNews, dbSponsors, blocks] = await Promise.all([
    getLatestNews(),
    getSponsors(),
    getContentBlocks(['home.hero', 'home.quicklinks']),
  ]);

  const news: NewsItem[] = dbNews.length > 0
    ? dbNews
    : SEED_NEWS.slice(0, 3).map((n) => ({
        id: n.id,
        title: n.title,
        content: n.content,
        published_at: n.published_at,
        image: n.image,
      }));

  const sponsors: SponsorItem[] = dbSponsors.length > 0
    ? dbSponsors
    : SEED_SPONSORS.map((s) => ({
        id: s.id,
        name: s.name,
        tier: s.tier,
        website: s.website,
        logo_url: s.logo_url,
      }));

  return (
    <>
      {/* Hero Section with Background Image */}
      <section className="relative text-white section-padding overflow-hidden">
        <Image
          src="/images/Turf_Ground.jpg"
          alt="Grinter Reserve at dusk, home of the Newcomb and District Cricket Club"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-maroon-900/75" />
        <div className="container-width text-center relative z-10">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-bold mb-4">
            {blocks['home.hero']?.title || CLUB_NAME}
          </h1>
          <p className="text-xl sm:text-2xl text-maroon-100 font-body mb-8 max-w-2xl mx-auto">
            {blocks['home.hero']?.body || `Home of the ${CLUB_NICKNAME}. Est. ${CLUB_ESTABLISHED}.`}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/contact" className="btn-primary text-lg px-8 py-4">
              Join the Club
            </Link>
            <Link href="/fixtures" className="btn-secondary border-white text-white hover:bg-white hover:text-maroon-800 text-lg px-8 py-4">
              View Fixtures
            </Link>
          </div>
        </div>
      </section>

      {/* Quick Links Grid */}
      <section className="section-padding bg-gray-50">
        <div className="container-width">
          <div className="text-center mb-12">
            <h2 className="section-title">Explore the Club</h2>
            <p className="section-subtitle mx-auto">
              {blocks['home.quicklinks']?.body || `Everything you need to know about the ${CLUB_NICKNAME}.`}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {quickLinks.map((link) => (
              <Link key={link.href} href={link.href} className="group">
                <Card hover className="h-full">
                  <CardContent className="p-6">
                    <span className="text-3xl mb-3 block" aria-hidden="true">{link.icon}</span>
                    <h3 className="text-xl font-display font-bold text-maroon-800 mb-2 group-hover:text-maroon-600 transition-colors">
                      {link.title}
                    </h3>
                    <p className="text-gray-600 font-body">{link.description}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Season Status */}
      <section className="section-padding">
        <div className="container-width">
          <div className="text-center mb-12">
            <h2 className="section-title">Season Update</h2>
          </div>
          <Card className="border-l-4 border-l-maroon-700 max-w-2xl mx-auto">
            <CardContent className="p-8 text-center">
              <h3 className="text-xl font-display font-bold text-gray-900 mb-3">2025/26 Season Complete</h3>
              <p className="text-gray-700 font-body leading-relaxed mb-4">
                The 2025/26 season has concluded. The 2026/27 season begins October 2026. Pre-season training details will be announced on our{' '}
                <Link href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer" className="text-maroon-700 hover:underline font-semibold">
                  Facebook page
                </Link>.
              </p>
              <Link
                href={PLAYHQ_ORG_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary inline-flex items-center"
              >
                View 2025/26 Results on PlayHQ
                <svg className="ml-2 w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Latest News */}
      <section className="section-padding bg-gray-50">
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
                  {article.image ? (
                    <div className="relative h-48 w-full">
                      <Image
                        src={article.image}
                        alt={article.title}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 33vw"
                      />
                    </div>
                  ) : (
                    <div className="relative h-48 w-full">
                      <Image
                        src="/images/Womens_Team.jpg"
                        alt="Newcomb and District Cricket Club"
                        fill
                        className="object-cover"
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

      {/* 2026/27 Season Appointments */}
      <section className="section-padding">
        <div className="container-width">
          <div className="text-center mb-12">
            <h2 className="section-title">2026/27 Season Appointments</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {SEASON_APPOINTMENTS.map((appointment) => (
              <Card key={appointment.name} className="overflow-hidden">
                {appointment.image ? (
                  <div className="relative h-56 w-full">
                    <Image
                      src={appointment.image}
                      alt={`${appointment.name} appointed as ${appointment.role}`}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    />
                  </div>
                ) : (
                  <div className="h-24 bg-gradient-to-br from-maroon-700 to-maroon-900 flex items-center justify-center">
                    <span className="text-white/80 font-display font-bold text-3xl">
                      {appointment.name.split(' ').map((w) => w[0]).join('')}
                    </span>
                  </div>
                )}
                <CardContent className="p-5 text-center">
                  <h3 className="font-display font-bold text-gray-900 text-lg">{appointment.name}</h3>
                  <p className="text-maroon-600 font-body text-sm font-semibold">{appointment.role}</p>
                </CardContent>
              </Card>
            ))}
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

      {/* Sponsors Banner */}
      <section className="section-padding bg-gray-50">
        <div className="container-width">
          <div className="text-center mb-10">
            <h2 className="section-title">Our Sponsors</h2>
            <p className="section-subtitle mx-auto">
              Proudly supported by our local community partners.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" role="region" aria-label="Club sponsors">
            {sponsors.map((sponsor) => {
              const tierInfo = SPONSOR_TIERS.find((t) => t.value === sponsor.tier);
              return (
                <a
                  key={sponsor.id}
                  href={sponsor.website || undefined}
                  target={sponsor.website ? '_blank' : undefined}
                  rel={sponsor.website ? 'noopener noreferrer' : undefined}
                  className="block group"
                >
                  <Card hover className="h-full">
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="w-14 h-14 rounded-lg bg-gray-100 relative overflow-hidden flex-shrink-0">
                        {sponsor.logo_url ? (
                          <Image
                            src={sponsor.logo_url}
                            alt={`${sponsor.name} logo`}
                            fill
                            className="object-contain p-1"
                            sizes="56px"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs font-bold text-maroon-700">
                            {sponsor.name.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-display font-bold text-gray-900 text-sm group-hover:text-maroon-700 transition-colors truncate">{sponsor.name}</p>
                      </div>
                      {tierInfo && (
                        <Badge variant={TIER_BADGE_VARIANT[sponsor.tier] || 'default'} className="flex-shrink-0 text-xs">
                          {tierInfo.label}
                        </Badge>
                      )}
                    </CardContent>
                  </Card>
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

      {/* Final CTA */}
      <section className="bg-gradient-to-br from-maroon-700 to-maroon-900 text-white section-padding">
        <div className="container-width text-center">
          <h2 className="text-3xl sm:text-4xl font-display font-bold mb-4">
            Ready to join the {CLUB_NICKNAME}?
          </h2>
          <p className="text-lg text-maroon-100 font-body mb-8 max-w-xl mx-auto">
            Whether you&apos;re a seasoned cricketer or picking up a bat for the first time, there&apos;s a place for you at NDCC.
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
