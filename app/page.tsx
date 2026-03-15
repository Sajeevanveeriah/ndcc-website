import Link from 'next/link';
import Card, { CardContent } from '@/components/ui/Card';
import {
  CLUB_NAME,
  CLUB_NICKNAME,
  CLUB_ESTABLISHED,
  PLAYHQ_ORG_URL,
} from '@/lib/constants';
import { createServerClient } from '@/lib/supabase-server';
import { formatDate, truncateText } from '@/lib/utils';

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
}

interface SponsorItem {
  id: string;
  name: string;
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
      .select('id, title, content, published_at')
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
      .select('id, name, website, logo_url')
      .eq('active', true)
      .order('created_at', { ascending: true });
    return (data as SponsorItem[]) || [];
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const [news, sponsors] = await Promise.all([getLatestNews(), getSponsors()]);

  return (
    <>
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-maroon-800 via-maroon-700 to-maroon-900 text-white section-padding">
        <div className="container-width text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-bold mb-4">
            {CLUB_NAME}
          </h1>
          <p className="text-xl sm:text-2xl text-maroon-100 font-body mb-8 max-w-2xl mx-auto">
            Home of the {CLUB_NICKNAME}. Est. {CLUB_ESTABLISHED}.
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
              Everything you need to know about the {CLUB_NICKNAME}.
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

      {/* Upcoming Fixtures CTA */}
      <section className="section-padding">
        <div className="container-width">
          <div className="text-center mb-12">
            <h2 className="section-title">Upcoming Fixtures</h2>
            <p className="section-subtitle mx-auto">
              Catch the {CLUB_NICKNAME} in action this season.
            </p>
          </div>
          <Card className="border-l-4 border-l-maroon-700 max-w-2xl mx-auto">
            <CardContent className="p-8 text-center">
              <p className="text-gray-700 font-body leading-relaxed mb-6">
                Fixtures, live scores, ladders, and results are managed through PlayHQ - the official platform
                of Cricket Australia and the Geelong Cricket Association.
              </p>
              <Link
                href={PLAYHQ_ORG_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary"
              >
                View Fixtures on PlayHQ
                <svg className="ml-2 w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Latest News */}
      {news.length > 0 && (
        <section className="section-padding bg-gray-50">
          <div className="container-width">
            <div className="text-center mb-12">
              <h2 className="section-title">Latest News</h2>
              <p className="section-subtitle mx-auto">
                Stay up to date with everything happening at NDCC.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {news.map((article) => (
                <Link key={article.id} href={`/news/${article.id}`} className="group">
                  <Card hover className="h-full">
                    <div className="h-48 bg-gradient-to-br from-maroon-100 to-maroon-200" aria-hidden="true" />
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
                </Link>
              ))}
            </div>
            <div className="text-center mt-8">
              <Link href="/news" className="btn-secondary">
                Read More News
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Sponsors Banner */}
      {sponsors.length > 0 && (
        <section className="section-padding">
          <div className="container-width">
            <div className="text-center mb-10">
              <h2 className="section-title">Our Sponsors</h2>
              <p className="section-subtitle mx-auto">
                Proudly supported by our local community partners.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-8" role="region" aria-label="Club sponsors">
              {sponsors.map((sponsor) => (
                <a
                  key={sponsor.id}
                  href={sponsor.website || undefined}
                  target={sponsor.website ? '_blank' : undefined}
                  rel={sponsor.website ? 'noopener noreferrer' : undefined}
                  className="flex-shrink-0"
                >
                  {sponsor.logo_url ? (
                    <div className="w-40 h-24 flex items-center justify-center p-2">
                      <img
                        src={sponsor.logo_url}
                        alt={sponsor.name}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="w-40 h-24 bg-maroon-50 rounded-lg flex items-center justify-center border border-maroon-100 hover:bg-maroon-100 transition-colors">
                      <span className="text-sm text-maroon-700 font-body font-semibold text-center px-2">
                        {sponsor.name}
                      </span>
                    </div>
                  )}
                </a>
              ))}
            </div>
            <div className="text-center mt-8">
              <Link href="/sponsors" className="btn-secondary">
                View All Sponsors
              </Link>
            </div>
          </div>
        </section>
      )}

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
