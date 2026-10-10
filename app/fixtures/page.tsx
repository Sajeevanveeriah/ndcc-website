import { pageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';
import Link from 'next/link';
import ScrollReveal from '@/components/common/ScrollReveal';
import Card, { CardContent } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { getClubSettings } from '@/lib/club-settings';
import { getCurrentClubSeason } from '@/lib/club-seasons';
import { renderSeasonContent } from '@/lib/season-content';
import { getContentBlocks } from '@/lib/content-blocks';
import { getPublicTeamsWithSlugs } from '@/lib/public-teams';
import { getPlayHQPublicData } from '@/lib/playhq/client';
import { currentSeasonPlayHQUrl } from '@/lib/playhq/season-match';
import { fixturesForTeam, ladderForGrade, matchPlayHQTeam, shortTeamLabel, splitTeamFixtures, teamMatchKey, teamsAwaitingPlayHQ } from '@/lib/playhq/team-view';
import { groupByCategory, juniorAge, teamCategory, TEAM_CATEGORY_LABELS } from '@/lib/playhq/team-category';
import type { PlayHQTeam } from '@/lib/playhq/types';
import { PLAYHQ_ORG_URL } from '@/lib/constants';
import FixturesTeamTabs, { type FixturesTab } from './_components/FixturesTeamTabs';
import { FixtureDayGroups, FixtureList, LadderTable } from './_components/PlayHQTables';

// ISR: regenerated at most every 60s and on demand after admin writes
// (lib/server/revalidate-public.ts). 'force-static' lets the Supabase reads,
// which use cache: 'no-store' fetches, run during static regeneration instead
// of opting the route into per-request rendering. This route reads no
// cookies, headers or searchParams.
export const dynamic = 'force-static';
export const revalidate = 60;

export const metadata: Metadata = pageMetadata("/fixtures", "Fixtures and results", "Find Newcomb and District Cricket Club fixtures and results, with links to the current season on PlayHQ.");

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

// Men's teams by ordinal, then women's, then anything else by name.
function sortClubTeams(teams: PlayHQTeam[]) {
  const rank = (team: PlayHQTeam) => {
    const key = teamMatchKey(team.name);
    return [key.junior ? 2 : key.women ? 1 : 0, key.ordinal ?? 99] as const;
  };
  return [...teams].sort((a, b) => {
    const [ga, oa] = rank(a); const [gb, ob] = rank(b);
    return ga - gb || oa - ob || a.name.localeCompare(b.name);
  });
}

export default async function FixturesPage() {
  const [settings, blocks, playhq, teams, currentSeason] = await Promise.all([
    getClubSettings(),
    getContentBlocks(['fixtures.hero', 'fixtures.status', 'fixtures.team_links']),
    getPlayHQPublicData(),
    getPublicTeamsWithSlugs(),
    getCurrentClubSeason().catch((error) => {
      console.warn('[fixtures] Current season temporarily unavailable:', error instanceof Error ? error.message : 'unknown');
      return null;
    }),
  ]);
  const teamLinks = teams.map(team => ({ id: team.id, title: team.name, description: team.description, badge: team.grade, href: team.playhq_url || settings.playhq_url || PLAYHQ_ORG_URL, is_external: true }));
  // Same rule as the team views: a game stays upcoming for the rest of its
  // Melbourne match day, even after its start time, unless it is completed.
  const { upcoming, results } = splitTeamFixtures(playhq.fixtures);
  const laddersByGrade = groupByGrade(playhq.ladders);
  const playhqCtaUrl = blocks['fixtures.status']?.cta_url || settings.playhq_url || PLAYHQ_ORG_URL;
  const playhqCtaLabel = renderSeasonContent(blocks['fixtures.status']?.cta_label || 'View fixtures on PlayHQ', currentSeason);
  const selectedSeason = playhq.selectedSeasonId ? playhq.seasons.find((season) => season.id === playhq.selectedSeasonId) : undefined;
  const seasonLabel = selectedSeason && selectedSeason.name !== selectedSeason.id ? selectedSeason.name : null;
  const fetchedAtDate = new Date(playhq.fetchedAt);
  const fetchedAtLabel = Number.isNaN(fetchedAtDate.getTime()) ? null : fetchedAtDate.toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Australia/Melbourne' });
  // Team filter: one tab per NDCC PlayHQ team, linked to its /teams/[slug] page
  // when a website team card matches it.
  const clubTeams = sortClubTeams(playhq.teams);
  const teamPageByPlayHQId = new Map<string, { slug: string; name: string }>();
  for (const team of teams) {
    const match = matchPlayHQTeam(team, playhq.teams);
    if (match && !teamPageByPlayHQId.has(match.id)) teamPageByPlayHQId.set(match.id, { slug: team.slug, name: team.name });
  }
  const ungradedTeams = clubTeams.filter((team) => !team.gradeId);
  // Website team cards PlayHQ does not list yet (junior age groups before GCA
  // publishes the junior competitions). Only claimed when PlayHQ answered and
  // every current competition's teams were read.
  const discoveryComplete = !(playhq.warnings || []).some((warning) => /^Team discovery failed/i.test(warning));
  const awaitingTeams = playhq.configured && !playhq.error && discoveryComplete ? teamsAwaitingPlayHQ(teams, playhq.teams) : [];
  const categoryOfTeam = (team: { name: string; gradeName?: string | null }) => teamCategory(team.name, team.gradeName);
  const teamTabs: FixturesTab[] = clubTeams.map((team) => {
    const page = teamPageByPlayHQId.get(team.id);
    const split = team.gradeId ? splitTeamFixtures(fixturesForTeam(playhq.fixtures, team)) : null;
    const ladder = ladderForGrade(playhq.ladders, team.gradeId);
    return {
      id: team.id,
      label: shortTeamLabel(team.name),
      content: (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-display font-bold text-content-primary">{team.name}</h2>
              <p className="font-body text-content-secondary">{[TEAM_CATEGORY_LABELS[categoryOfTeam(team)], team.gradeName].filter(Boolean).join(' · ')}</p>
            </div>
            {page && <Link href={`/teams/${page.slug}`} className="font-body text-sm font-semibold text-maroon-700 underline-offset-2 hover:underline dark:text-maroon-200">{page.name} team page</Link>}
          </div>
          {!split ? (
            <p className="font-body text-content-secondary">Fixture not yet released by GCA.</p>
          ) : (
            <>
              <section>
                <h3 className="mb-3 text-xl font-display font-bold text-content-primary">Upcoming fixtures</h3>
                {split.upcoming.length ? <FixtureList fixtures={split.upcoming} team={team} label={`${team.name} upcoming fixtures`} /> : <p className="font-body text-content-muted">No upcoming fixtures are currently listed.</p>}
              </section>
              {split.results.length > 0 && (
                <section>
                  <h3 className="mb-3 text-xl font-display font-bold text-content-primary">Results</h3>
                  <FixtureList fixtures={split.results} team={team} label={`${team.name} results`} />
                </section>
              )}
              {ladder.length > 0 && (
                <section>
                  <h3 className="mb-3 text-xl font-display font-bold text-content-primary">{team.gradeName ? `${team.gradeName} ladder` : 'Ladder'}</h3>
                  <LadderTable rows={ladder} caption={`${team.gradeName || 'Grade'} ladder`} highlightTeam={team} />
                </section>
              )}
            </>
          )}
        </>
      ),
    };
  });

  // Category filter (Men's / Women's / Juniors), each with its own team filter.
  // Every category a team belongs to is listed, including junior teams still
  // awaiting their PlayHQ competition, so no age group silently disappears.
  const teamTabById = new Map(clubTeams.map((team, index) => [team.id, teamTabs[index]]));
  const categoryTabs: FixturesTab[] = groupByCategory(clubTeams, categoryOfTeam).flatMap(({ category, label, items }) => {
    const awaiting = awaitingTeams.filter((team) => teamCategory(team.name, team.grade) === category)
      .sort((a, b) => (juniorAge(a.name) ?? 99) - (juniorAge(b.name) ?? 99));
    if (items.length === 0 && awaiting.length === 0) return [];
    // Overview: the next three fixtures per team and the latest results; each
    // team's own tab keeps its full list, so the page does not repeat it all.
    const categoryFixtures = playhq.fixtures.filter((fixture) => items.some((team) => fixturesForTeam([fixture], team).length > 0));
    const { upcoming: allCategoryUpcoming, results: categoryResults } = splitTeamFixtures(categoryFixtures);
    const nextPerTeam = new Set(items.flatMap((team) => splitTeamFixtures(fixturesForTeam(categoryFixtures, team)).upcoming.slice(0, 3).map((fixture) => fixture.id)));
    const categoryUpcoming = allCategoryUpcoming.filter((fixture) => nextPerTeam.has(fixture.id));
    // "Upcoming junior fixtures", "Upcoming men's fixtures".
    const lower = category === 'junior' ? 'junior' : label.toLowerCase();
    const overview = (
      <>
        {awaiting.length > 0 && (
          <div className="surface-panel p-5">
            <h3 className="text-lg font-display font-bold text-content-primary">{items.length ? `More ${lower} teams` : `${category === 'junior' ? 'Junior' : label} fixtures`}</h3>
            <p className="mt-1 font-body text-content-secondary">
              {items.length ? 'Fixtures for these teams have not been published by GCA on PlayHQ yet.' : `${category === 'junior' ? 'Junior' : label} fixtures have not been published by GCA on PlayHQ yet.`}{' '}
              They will appear here automatically once released.
            </p>
            <ul className="mt-3 space-y-1 font-body">
              {awaiting.map((team) => (
                <li key={team.id || team.name}>
                  <Link href={`/teams/${team.slug}`} className="font-semibold text-maroon-700 underline-offset-2 hover:underline dark:text-maroon-200">{team.name}</Link>
                  {team.grade && <span className="text-content-muted"> · {team.grade}</span>}
                  <span className="text-content-muted">: fixture not yet published</span>
                </li>
              ))}
            </ul>
            <a href={playhqCtaUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex font-body text-sm font-semibold text-maroon-700 underline-offset-2 hover:underline dark:text-maroon-200">Check the club on PlayHQ<span className="sr-only"> (opens in a new tab)</span></a>
          </div>
        )}
        {items.length > 0 && (
          <section>
            <h3 className="mb-3 text-xl font-display font-bold text-content-primary">Next {lower} fixtures</h3>
            {categoryUpcoming.length ? (
              <>
                <FixtureList fixtures={categoryUpcoming} showGrade label={`Next ${lower} fixtures`} />
                <p className="mt-2 font-body text-sm text-content-muted">Showing the next three for each team. Choose a team above for its full fixture list, results and ladder.</p>
              </>
            ) : <p className="font-body text-content-muted">No upcoming {lower} fixtures are currently listed.</p>}
          </section>
        )}
        {categoryResults.length > 0 && (
          <section>
            <h3 className="mb-3 text-xl font-display font-bold text-content-primary">Recent {lower} results</h3>
            <FixtureList fixtures={categoryResults.slice(0, 6)} showGrade label={`Recent ${lower} results`} />
          </section>
        )}
      </>
    );
    const perTeam = items.map((team) => teamTabById.get(team.id)).filter((tab): tab is FixturesTab => Boolean(tab));
    const count = items.length + awaiting.length;
    return [{
      id: `category-${category}`,
      label: `${label} (${count})`,
      content: perTeam.length > 0
        ? <FixturesTeamTabs idPrefix={`fixtures-${category}`} compact label={`Filter ${lower} fixtures by team`} tabs={[{ id: `${category}-all`, label: `All ${label.toLowerCase()}`, content: overview }, ...perTeam]} />
        : overview,
    }];
  });

  // Unfiltered view: every NDCC game listed once, grouped by match day. The
  // next few days are open; later days sit behind a native "Show more".
  const allTeamsPanel = (
    <>
      <section aria-labelledby="fixtures-upcoming">
        <h2 id="fixtures-upcoming" className="section-title mb-6">Upcoming fixtures</h2>
        {upcoming.length === 0
          ? <p className="text-content-muted font-body">No upcoming fixtures are currently listed.</p>
          : <FixtureDayGroups fixtures={upcoming} label="Upcoming fixtures" />}
      </section>

      <section aria-labelledby="fixtures-results">
        <h2 id="fixtures-results" className="section-title mb-6">Recent results</h2>
        {results.length === 0
          ? <p className="text-content-muted font-body">No recent results are currently listed.</p>
          : <FixtureDayGroups fixtures={results.slice(0, 12)} label="Recent results" expandedGroups={2} moreLabel="results" showTimeTbc={false} />}
      </section>
    </>
  );

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
                <h2 className="text-2xl font-display font-bold uppercase tracking-wide text-white mb-3">{renderSeasonContent(blocks['fixtures.status']?.title || 'PlayHQ Fixtures', currentSeason)}</h2>
                <p className="text-white/75 font-body leading-relaxed max-w-3xl">
                  {playhq.message || renderSeasonContent(blocks['fixtures.status']?.body || `Live fixtures, results and ladders for the ${settings.club_nickname}.`, currentSeason)}
                </p>
                {fetchedAtLabel && (
                  <p className="mt-3 text-xs text-white/80 font-body">
                    Data from PlayHQ · last checked <time dateTime={playhq.fetchedAt}>{fetchedAtLabel}</time>
                  </p>
                )}
              </div>
              {seasonLabel && <Badge variant="default">{seasonLabel}</Badge>}
            </div>
          </div>

          {!playhq.configured ? (
            <Card><CardContent className="p-8 text-center"><h2 className="text-xl font-display font-bold text-content-primary">Check fixtures on PlayHQ</h2><p className="mt-2 text-content-muted font-body">Visit our club page on PlayHQ for published fixtures and results.</p><div className="mt-6"><PlayHQCtaLink href={playhqCtaUrl} label={playhqCtaLabel} /></div></CardContent></Card>
          ) : playhq.fixtures.length === 0 ? (
            <Card><CardContent className="p-8 text-center"><h2 className="text-xl font-display font-bold text-content-primary">Fixtures are not available here yet</h2><p className="mt-2 text-content-muted font-body">Check the club on PlayHQ for the latest published fixtures. Previous seasons will not be shown as the current season.</p><div className="mt-6"><PlayHQCtaLink href={playhqCtaUrl} label={playhqCtaLabel} /></div></CardContent></Card>
          ) : (
            teamTabs.length > 0
              ? <FixturesTeamTabs label="Filter fixtures by team category" tabs={[{ id: 'all', label: 'All teams', content: allTeamsPanel }, ...categoryTabs]} />
              : <div className="space-y-8">{allTeamsPanel}</div>
          )}

          {playhq.configured && (ungradedTeams.length > 0 || awaitingTeams.length > 0) && (
            <section aria-labelledby="awaiting-gca" className="surface-panel p-6">
              <h2 id="awaiting-gca" className="text-xl font-display font-bold text-content-primary">Awaiting GCA fixtures</h2>
              <ul className="mt-3 space-y-1 font-body text-content-secondary">
                {ungradedTeams.map((team) => {
                  const page = teamPageByPlayHQId.get(team.id);
                  return (
                    <li key={team.id}>
                      {page ? <Link href={`/teams/${page.slug}`} className="font-semibold text-maroon-700 underline-offset-2 hover:underline dark:text-maroon-200">{team.name}</Link> : <span className="font-semibold text-content-primary">{team.name}</span>}: Fixture not yet released by GCA.
                    </li>
                  );
                })}
                {awaitingTeams.map((team) => (
                  <li key={team.id || team.name}>
                    <Link href={`/teams/${team.slug}`} className="font-semibold text-maroon-700 underline-offset-2 hover:underline dark:text-maroon-200">{team.name}</Link>
                    {' '}({TEAM_CATEGORY_LABELS[teamCategory(team.name, team.grade)]}): Fixture not yet published by GCA on PlayHQ.
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </section>

      {playhq.ladders.length > 0 && <section className="section-padding surface-blue-band"><div className="container-width"><h2 className="section-title mb-8">Ladders</h2>{Object.values(laddersByGrade).map((group) => <div key={group.gradeName} className="mb-8"><h3 className="mb-4 text-xl font-display font-bold text-content-primary">{group.gradeName}</h3><LadderTable rows={group.rows} caption={`${group.gradeName} ladder`} /></div>)}</div></section>}

      {teamLinks.length > 0 && (
        <section className="section-padding">
          <div className="container-width">
            <h2 className="section-title mb-4">{renderSeasonContent(blocks['fixtures.team_links']?.title || 'Follow your team on PlayHQ', currentSeason)}</h2>
            {blocks['fixtures.team_links']?.body && <p className="text-content-muted font-body max-w-3xl mb-6">{renderSeasonContent(blocks['fixtures.team_links'].body, currentSeason)}</p>}
            {/* One compact row per team: the fixtures themselves are listed above. */}
            <ul className="divide-y divide-edge-subtle overflow-hidden rounded-xl border border-edge-subtle bg-surface-card">
              {teamLinks.map((link) => (
                <li key={link.id}>
                  <a href={currentSeasonPlayHQUrl(link.href, currentSeason?.slug, settings.playhq_url || PLAYHQ_ORG_URL)} {...(link.is_external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className="grid gap-1 p-4 font-body transition-colors hover:bg-surface-muted sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4">
                    <span>
                      <span className="block font-semibold text-content-primary">{link.title}{link.badge && <span className="font-normal text-content-muted"> · {link.badge}</span>}</span>
                      {link.description && <span className="block text-sm text-content-muted">{link.description}</span>}
                    </span>
                    <span className="inline-flex items-center text-sm font-semibold text-maroon-700 dark:text-maroon-200">
                      {link.is_external ? 'View on PlayHQ' : 'View'}
                      {link.is_external && (
                        <>
                          <span className="sr-only"> (opens in a new tab)</span>
                          <svg className="ml-1.5 w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                          </svg>
                        </>
                      )}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </>
  );
}
