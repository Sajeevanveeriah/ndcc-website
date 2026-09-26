import { getPublicTeams } from '@/lib/public-teams';
import AnimatedCounter from '@/components/common/AnimatedCounter';
import ParallaxLayer from '@/components/common/motion/ParallaxLayer';
import ScrollReveal, { ScrollRevealItem } from '@/components/common/ScrollReveal';
import { CLUB_ESTABLISHED, CLUB_NICKNAME } from '@/lib/constants';
import { getHistoryPremierships } from '@/lib/structured-content';

const GCA_START_YEAR = 1995;

// A compact "club at a glance" band placed directly under the hero. It breaks up the page,
// adds depth, and surfaces the club's headline numbers. The premiership count is the
// number of active entries in the CMS honour roll (history_premierships, the same list
// the About page's honour board and "Premierships Won" count use; controlled fallbacks
// apply only when that read fails). Team totals use the live CMS list.
// Presentation: an editorial honour-board moment - a static nickname watermark
// behind the numbers and a gold rule above them.
export default async function HomeStatsStrip() {
  const [teams, premierships] = await Promise.all([getPublicTeams(), getHistoryPremierships()]);
  const currentYear = new Date().getFullYear();
  const seasonsInGca = Math.max(currentYear - GCA_START_YEAR, 0);

  const stats: { label: string; value: number; animate: boolean }[] = [
    { label: 'Established', value: CLUB_ESTABLISHED, animate: false },
    { label: 'Premierships', value: premierships.length, animate: true },
    { label: 'Seasons in the GCA', value: seasonsInGca, animate: true },
    { label: 'Teams Across the Club', value: teams.length, animate: false },
  ];

  return (
    <section className="band-maroon border-y border-maroon-950/40 px-4 py-8 sm:px-6 lg:px-8" aria-labelledby="home-stats-heading">
      <h2 id="home-stats-heading" className="sr-only">Club at a glance</h2>
      {/* Oversized club-nickname typography sitting behind the numbers. */}
      <ParallaxLayer drift={16} className="absolute inset-0 flex items-center justify-center overflow-hidden">
        <span className="watermark-type whitespace-nowrap text-[28vw] sm:text-[20vw] lg:text-[15rem]">
          {CLUB_NICKNAME}
        </span>
      </ParallaxLayer>
      <div className="container-width relative">
        <ScrollReveal stagger staggerInterval={0.1}>
          <ScrollRevealItem
            effect="draw"
            className="mx-auto mb-5 h-px w-28 bg-gradient-to-r from-gold-300/0 via-gold-300/80 to-gold-300/0"
          />
          <ul className="grid grid-cols-2 gap-x-6 gap-y-6 text-center lg:grid-cols-4">
            {stats.map((stat) => (
              <ScrollRevealItem
                as="li"
                key={stat.label}
                className="lg:border-r lg:border-white/10 lg:last:border-r-0"
              >
                <p className="stat-value text-3xl text-gold-200 sm:text-4xl">
                  {stat.animate ? <AnimatedCounter to={stat.value} /> : stat.value}
                </p>
                <p className="stat-label text-maroon-100">{stat.label}</p>
              </ScrollRevealItem>
            ))}
          </ul>
        </ScrollReveal>
      </div>
    </section>
  );
}
