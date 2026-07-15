import type { Metadata } from 'next';
import Link from 'next/link';
import ScrollReveal from '@/components/common/ScrollReveal';
import Card, { CardContent } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { getClubSettings } from '@/lib/club-settings';
import { getContentBlocks } from '@/lib/content-blocks';
import { getPageLinkCards } from '@/lib/structured-content';
import { getPlayHQPublicData } from '@/lib/playhq/client';
import type { PlayHQFixture, PlayHQLadderRow } from '@/lib/playhq/types';
import { PLAYHQ_ORG_URL } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Fixtures & Results',
};

function fixtureTime(value: string | null) {
  if (!value) return 'Date TBC';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Australia/Melbourne' }).format(date);
}

function splitFixtures(fixtures: PlayHQFixture[]) {
  const now = Date.now();
  const upcoming = fixtures
    .filter((fixture) => !fixture.startsAt || Date.parse(fixture.startsAt) >= now)
    .sort((a, b) => (Date.parse(a.startsAt || '') || Number.MAX_SAFE_INTEGER) - (Date.parse(b.startsAt || '') || Number.MAX_SAFE_INTEGER));
  const results = fixtures
    .filter((fixture) => fixture.startsAt && Date.parse(fixture.startsAt) < now)
    .sort((a, b) => (Date.parse(b.startsAt || '') || 0) - (Date.parse(a.startsAt || '') || 0));
  return { upcoming, results };
}

function groupByGrade<T extends { gradeId: string; gradeName: string }>(rows: T[]) {
  return rows.reduce<Record<string, { gradeName: string; rows: T[] }>>((groups, row) => {
    const key = row.gradeId || row.gradeName;
    groups[key] ||= { gradeName: row.gradeName, rows: [] };
    groups[key].rows.push(row);
    return groups;
  }, {});
}

function PlayHQCtaLink({ href, label }: { href: string; label: string }) {
  // Same external-link affordance as the homepage season-status CTA.
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="btn-accent inline-flex items-center whitespace-nowrap">
      {label}
      <svg className="ml-2 w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
      </svg>
    </a>
  );
}

function FixtureCard({ fixture, result = false }: { fixture: PlayHQFixture; result?: boolean }) {
  return (
    <Card className="h-full hover-lift">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Badge variant={result ? 'success' : 'default'}>{result ? 'Result' : 'Fixture'}</Badge>
          <span className="text-xs text-content-muted font-body">{fixtureTime(fixture.startsAt)}</span>
        </div>
        <div>
          <p className="font-display font-bold text-content-primary">{fixture.homeTeam}</p>
          <p className="text-sm text-content-muted">v</p>
          <p className="font-display font-bold text-content-primary">{fixture.awayTeam}</p>
        </div>
        {(fixture.homeScore || fixture.awayScore) && (
          <p className="text-sm font-semibold text-maroon-700 dark:text-maroon-200">{fixture.homeScore || 'TBC'} · {fixture.awayScore || 'TBC'}</p>
        )}
        {fixture.venue && <p className="text-sm text-content-muted font-body">{fixture.venue}</p>}
        {fixture.playHQUrl && <Link href={fixture.playHQUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-maroon-700 dark:text-maroon-200 hover:underline">View on PlayHQ</Link>}
      </CardContent>
    </Card>
  );
}

function LadderTable({ rows }: { rows: PlayHQLadderRow[] }) {
  // Scorebook-ledger styling: maroon-tinted header, centred numeric columns.
  return (
    <div className="overflow-x-auto rounded-xl border border-edge-subtle bg-surface-card dark:border-slate-700">
      <table className="min-w-full divide-y divide-edge-subtle text-sm">
        <thead className="bg-maroon-50/60 text-left dark:bg-slate-800/80">
          <tr>
            <th className="px-4 py-3 text-center font-semibold uppercase tracking-wider text-xs text-maroon-800 dark:text-maroon-200 dark:text-slate-300">Pos</th>
            <th className="px-4 py-3 font-semibold uppercase tracking-wider text-xs text-maroon-800 dark:text-maroon-200 dark:text-slate-300">Team</th>
            <th className="px-4 py-3 text-center font-semibold uppercase tracking-wider text-xs text-maroon-800 dark:text-maroon-200 dark:text-slate-300">P</th>
            <th className="px-4 py-3 text-center font-semibold uppercase tracking-wider text-xs text-maroon-800 dark:text-maroon-200 dark:text-slate-300">Pts</th>
            <th className="px-4 py-3 text-center font-semibold uppercase tracking-wider text-xs text-maroon-800 dark:text-maroon-200 dark:text-slate-300">%</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-edge-subtle">
          {rows.map((row, index) => <tr key={`${row.gradeId}-${row.teamName}-${index}`} className="hover:bg-surface-blue-subtle/60 transition-colors"><td className="px-4 py-3 text-center font-display font-bold text-maroon-700 dark:text-maroon-200">{row.position ?? '-'}</td><td className="px-4 py-3 font-medium text-content-primary">{row.teamName}</td><td className="px-4 py-3 text-center">{row.played ?? '-'}</td><td className="px-4 py-3 text-center font-semibold">{row.points ?? '-'}</td><td className="px-4 py-3 text-center">{row.percentage ?? '-'}</td></tr>)}
        </tbody>
      </table>
    </div>
  );
}

export default async function FixturesPage() {
  const [settings, blocks, playhq, teamLinks] = await Promise.all([
    getClubSettings(),
    getContentBlocks(['fixtures.hero', 'fixtures.status', 'fixtures.team_links']),
    getPlayHQPublicData(),
    getPageLinkCards('fixtures', 'team_links'),
  ]);
  const { upcoming, results } = splitFixtures(playhq.fixtures);
  const upcomingByGrade = groupByGrade(upcoming);
  const resultsByGrade = groupByGrade(results.slice(0, 12));
  const laddersByGrade = groupByGrade(playhq.ladders);
  const playhqCtaUrl = blocks['fixtures.status']?.cta_url || settings.playhq_url || PLAYHQ_ORG_URL;
  const playhqCtaLabel = blocks['fixtures.status']?.cta_label || 'View fixtures on PlayHQ';
  const selectedSeason = playhq.selectedSeasonId ? playhq.seasons.find((season) => season.id === playhq.selectedSeasonId) : undefined;
  const seasonLabel = selectedSeason && selectedSeason.name !== selectedSeason.id ? selectedSeason.name : null;
  const fetchedAtDate = new Date(playhq.fetchedAt);
  const fetchedAtLabel = Number.isNaN(fetchedAtDate.getTime()) ? null : fetchedAtDate.toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Australia/Melbourne' });

  return (
    <>
      <section className="page-hero">
        <div className="container-width">
          <ScrollReveal onMount delay={0}><h1 className="page-hero-title">{blocks['fixtures.hero']?.title || 'Fixtures & Results'}</h1></ScrollReveal>
          <ScrollReveal onMount delay={0.15}><p className="page-hero-subtitle">{blocks['fixtures.hero']?.body || `Follow the ${settings.club_nickname} throughout the season across all grades.`}</p></ScrollReveal>
        </div>
      </section>

      <section className="section-padding">
        <div className="container-width space-y-8">
          {/* Season status plaque — same honour-board treatment as the homepage band. */}
          <div className="band-maroon rounded-2xl shadow-card p-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <span className="eyebrow-gold">Season Status</span>
                <h2 className="text-2xl font-display font-bold uppercase tracking-wide text-white mb-3">{blocks['fixtures.status']?.title || 'PlayHQ Fixtures'}</h2>
                <p className="text-white/75 font-body leading-relaxed max-w-3xl">
                  {playhq.message || blocks['fixtures.status']?.body || `Live fixtures, results and ladders for the ${settings.club_nickname}.`}
                </p>
                {fetchedAtLabel && (
                  <p className="mt-3 text-xs text-white/60 font-body">
                    Data from PlayHQ · last checked <time dateTime={playhq.fetchedAt}>{fetchedAtLabel}</time>
                  </p>
                )}
              </div>
              {seasonLabel && <Badge variant="default">{seasonLabel}</Badge>}
            </div>
          </div>

          {!playhq.configured ? (
            <Card><CardContent className="p-8 text-center"><h2 className="text-xl font-display font-bold text-content-primary">Fixtures will appear once PlayHQ is configured</h2><p className="mt-2 text-content-muted font-body">The site is ready for the PlayHQ Public API. No fixture data is shown until the server-only PlayHQ environment variables are set.</p><div className="mt-6"><PlayHQCtaLink href={playhqCtaUrl} label={playhqCtaLabel} /></div></CardContent></Card>
          ) : playhq.fixtures.length === 0 ? (
            <Card><CardContent className="p-8 text-center"><h2 className="text-xl font-display font-bold text-content-primary">No fixtures returned by PlayHQ</h2><p className="mt-2 text-content-muted font-body">Check the selected season and grade configuration in Vercel if fixtures are expected.</p><div className="mt-6"><PlayHQCtaLink href={playhqCtaUrl} label={playhqCtaLabel} /></div></CardContent></Card>
          ) : (
            <>
              <section>
                <h2 className="section-title mb-6">Upcoming Fixtures</h2>
                {Object.values(upcomingByGrade).length === 0 ? <p className="text-content-muted font-body">No upcoming fixtures are currently listed.</p> : Object.values(upcomingByGrade).map((group) => <div key={group.gradeName} className="mb-8"><h3 className="mb-4 text-xl font-display font-bold text-content-primary">{group.gradeName}</h3><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">{group.rows.map((fixture) => <FixtureCard key={fixture.id} fixture={fixture} />)}</div></div>)}
              </section>

              <section>
                <h2 className="section-title mb-6">Recent Results</h2>
                {Object.values(resultsByGrade).length === 0 ? <p className="text-content-muted font-body">No recent results are currently listed.</p> : Object.values(resultsByGrade).map((group) => <div key={group.gradeName} className="mb-8"><h3 className="mb-4 text-xl font-display font-bold text-content-primary">{group.gradeName}</h3><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">{group.rows.map((fixture) => <FixtureCard key={fixture.id} fixture={fixture} result />)}</div></div>)}
              </section>
            </>
          )}
        </div>
      </section>

      {playhq.ladders.length > 0 && <section className="section-padding surface-blue-band"><div className="container-width"><h2 className="section-title mb-8">Ladders</h2>{Object.values(laddersByGrade).map((group) => <div key={group.gradeName} className="mb-8"><h3 className="mb-4 text-xl font-display font-bold text-content-primary">{group.gradeName}</h3><LadderTable rows={group.rows} /></div>)}</div></section>}

      {teamLinks.length > 0 && (
        <section className="section-padding">
          <div className="container-width">
            <h2 className="section-title mb-4">{blocks['fixtures.team_links']?.title || 'Follow your team on PlayHQ'}</h2>
            {blocks['fixtures.team_links']?.body && <p className="text-content-muted font-body max-w-3xl mb-6">{blocks['fixtures.team_links'].body}</p>}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {teamLinks.map((link) => (
                <a key={link.id} href={link.href} {...(link.is_external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className="block h-full">
                  <Card className="h-full hover-lift">
                    <CardContent className="p-5 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="font-display font-bold text-content-primary">{link.title}</h3>
                        {link.badge && <Badge variant="default">{link.badge}</Badge>}
                      </div>
                      {link.description && <p className="text-sm text-content-muted font-body">{link.description}</p>}
                      <span className="inline-flex items-center text-sm font-semibold text-maroon-700 dark:text-maroon-200">
                        {link.is_external ? 'View on PlayHQ' : 'View'}
                        {link.is_external && (
                          <svg className="ml-1.5 w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                          </svg>
                        )}
                      </span>
                    </CardContent>
                  </Card>
                </a>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
