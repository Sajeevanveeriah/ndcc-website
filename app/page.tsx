import Link from 'next/link';
import Card, { CardContent } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import {
  CLUB_NAME,
  CLUB_NICKNAME,
  CLUB_ESTABLISHED,
} from '@/lib/constants';

const quickLinks = [
  { title: 'About Us', description: 'Learn about our history and the people behind the club.', href: '/about', icon: '🏏' },
  { title: 'Our Teams', description: 'Senior Men, Senior Women, and Junior Boys squads.', href: '/teams', icon: '👥' },
  { title: 'Events', description: 'Upcoming social events, fundraisers, and match days.', href: '/events', icon: '📅' },
  { title: 'Merchandise', description: 'Get your official NDCC gear and support the club.', href: '/merchandise', icon: '🛒' },
  { title: 'Volunteer', description: 'Help out on match days — canteen, scoring, and more.', href: '/volunteer', icon: '🤝' },
  { title: 'Contact', description: 'Get in touch with the club or make an enquiry.', href: '/contact', icon: '✉️' },
];

const placeholderFixtures = [
  { round: 'Round 10', date: 'Sat 15 Feb 2025', opponent: 'Lara CC', venue: 'Grinter Reserve', time: '12:30 PM' },
  { round: 'Round 11', date: 'Sat 22 Feb 2025', opponent: 'Manifold Heights CC', venue: 'Away', time: '12:30 PM' },
  { round: 'Round 12', date: 'Sat 1 Mar 2025', opponent: 'North Shore CC', venue: 'Grinter Reserve', time: '12:30 PM' },
];

const placeholderNews = [
  { title: 'Training Facility Nets Upgrade Complete', date: '10 Feb 2025', excerpt: 'The Peter "Skinny" Harrison Training Facility has received new turf wicket upgrades ahead of the 2024/25 season finals.' },
  { title: 'Women\'s Team Claims First Win', date: '3 Feb 2025', excerpt: 'Our Senior Women\'s side secured a fantastic victory in E Grade East, bowling out the opposition for 87 before chasing down the total with ease.' },
  { title: 'Junior Registration Now Open', date: '28 Jan 2025', excerpt: 'Registrations for the 2025/26 junior cricket season are now open. All skill levels welcome — come and join the Dinos family.' },
];

export default function HomePage() {
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

      {/* Upcoming Fixtures */}
      <section className="section-padding">
        <div className="container-width">
          <div className="text-center mb-12">
            <h2 className="section-title">Upcoming Fixtures</h2>
            <p className="section-subtitle mx-auto">
              Catch the {CLUB_NICKNAME} in action this season.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {placeholderFixtures.map((fixture) => (
              <Card key={fixture.round} className="border-l-4 border-l-maroon-700">
                <CardContent className="p-6">
                  <Badge className="mb-3">{fixture.round}</Badge>
                  <p className="text-sm text-gray-500 font-body mb-1">{fixture.date} &middot; {fixture.time}</p>
                  <h3 className="text-lg font-display font-bold text-gray-900 mb-1">
                    NDCC vs {fixture.opponent}
                  </h3>
                  <p className="text-sm text-gray-600 font-body">{fixture.venue}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link href="/fixtures" className="btn-secondary">
              View All Fixtures
            </Link>
          </div>
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
            {placeholderNews.map((article) => (
              <Card key={article.title} hover>
                <div className="h-48 bg-gradient-to-br from-maroon-100 to-maroon-200 flex items-center justify-center">
                  <span className="text-maroon-400 font-display text-sm">Photo coming soon</span>
                </div>
                <CardContent className="p-6">
                  <p className="text-sm text-maroon-600 font-body font-semibold mb-2">{article.date}</p>
                  <h3 className="text-lg font-display font-bold text-gray-900 mb-2">{article.title}</h3>
                  <p className="text-gray-600 font-body text-sm">{article.excerpt}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link href="/news" className="btn-secondary">
              Read More News
            </Link>
          </div>
        </div>
      </section>

      {/* Sponsors Banner */}
      <section className="section-padding">
        <div className="container-width">
          <div className="text-center mb-10">
            <h2 className="section-title">Our Sponsors</h2>
            <p className="section-subtitle mx-auto">
              Proudly supported by our local community partners.
            </p>
          </div>
          <div className="flex gap-8 overflow-x-auto pb-4 scrollbar-hide" role="region" aria-label="Club sponsors">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex-shrink-0 w-40 h-24 bg-gray-100 rounded-lg flex items-center justify-center border border-gray-200"
              >
                <span className="text-sm text-gray-400 font-body">Sponsor {i + 1}</span>
              </div>
            ))}
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
