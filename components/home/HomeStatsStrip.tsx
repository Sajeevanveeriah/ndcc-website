import AnimatedCounter from '@/components/common/AnimatedCounter';
import { CLUB_ESTABLISHED } from '@/lib/constants';
import { fallbackHistoryPremierships } from '@/lib/fallback-content';

const GCA_START_YEAR = 1995;

// A compact "club at a glance" band placed directly under the hero. It breaks up the page,
// adds depth, and surfaces the club's headline numbers. Values are static/canonical (the
// premiership count mirrors the verified honour roll) so it never depends on a live query.
export default function HomeStatsStrip() {
  const currentYear = new Date().getFullYear();
  const seasonsInGca = Math.max(currentYear - GCA_START_YEAR, 0);

  const stats: { label: string; value: number; animate: boolean }[] = [
    { label: 'Established', value: CLUB_ESTABLISHED, animate: false },
    { label: 'Premierships', value: fallbackHistoryPremierships.length, animate: true },
    { label: 'Seasons in the GCA', value: seasonsInGca, animate: true },
    { label: 'Teams Across the Club', value: 7, animate: true },
  ];

  return (
    <section className="band-maroon px-4 sm:px-6 lg:px-8 py-12 border-y border-maroon-950/40" aria-label="Club at a glance">
      <div className="container-width">
        <ul className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-10 text-center">
          {stats.map((stat) => (
            <li key={stat.label} className="lg:border-r lg:border-white/10 lg:last:border-r-0">
              <p className="stat-value text-4xl sm:text-5xl text-gold-200">
                {stat.animate ? <AnimatedCounter to={stat.value} /> : stat.value}
              </p>
              <p className="stat-label text-maroon-100">{stat.label}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
