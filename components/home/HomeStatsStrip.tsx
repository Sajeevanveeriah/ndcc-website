import { getPublicTeams } from '@/lib/public-teams';
import { getHistoryPremierships } from '@/lib/structured-content';

const GCA_START_YEAR = 1995;

// Compact, static "club at a glance" row shown inside the home hero. The
// premiership count is the number of active entries in the CMS honour roll
// (history_premierships, the same list the About page's honour board and
// "Premierships Won" count use; controlled fallbacks apply only when that read
// fails). Team totals use the live CMS list. A zero count is hidden rather
// than shown as a claim. The established year lives in the hero kicker.
export default async function HomeStatsStrip() {
  const [teams, premierships] = await Promise.all([getPublicTeams(), getHistoryPremierships()]);
  const currentYear = new Date().getFullYear();
  const seasonsInGca = Math.max(currentYear - GCA_START_YEAR, 0);

  const stats = [
    { label: 'Premierships', value: premierships.length },
    { label: 'Seasons in the GCA', value: seasonsInGca },
    { label: 'Teams', value: teams.length },
  ].filter((stat) => stat.value > 0);
  if (stats.length === 0) return null;

  return (
    <dl className="glass-panel mt-10 grid w-fit max-w-full grid-flow-col auto-cols-fr divide-x divide-edge-subtle px-1.5 py-4 sm:px-2 sm:py-5 dark:divide-white/10" aria-label="Club at a glance">
      {stats.map((stat) => (
        <div key={stat.label} className="flex min-w-0 flex-col gap-1 px-2.5 sm:px-5">
          <dt className="order-2 break-words text-xs leading-snug text-content-muted [hyphens:auto] sm:text-sm">{stat.label}</dt>
          <dd className="order-1 font-display text-2xl font-semibold tracking-[-0.04em] text-content-primary sm:text-4xl">{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}
