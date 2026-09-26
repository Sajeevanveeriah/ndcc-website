import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FixtureList, LadderTable } from '@/app/fixtures/_components/PlayHQTables';
import { getClubSettings } from '@/lib/club-settings';
import { getCurrentClubSeason } from '@/lib/club-seasons';
import { PLAYHQ_ORG_URL } from '@/lib/constants';
import { serializeJsonLd } from '@/lib/json-ld';
import { getPlayHQPublicData } from '@/lib/playhq/client';
import { currentSeasonPlayHQUrl } from '@/lib/playhq/season-match';
import { appointmentsForTeam, fixturesForTeam, formatFixtureDay, formatFixtureStartTime, isLadderRowForTeam, ladderForGrade, matchPlayHQTeam, opponentFor, splitTeamFixtures } from '@/lib/playhq/team-view';
import { getPublicSeasonAppointments } from '@/lib/public-season-appointments';
import { getPublicTeamBySlug, getPublicTeamsWithSlugs } from '@/lib/public-teams';
import { breadcrumbJsonLd, pageMetadata } from '@/lib/seo';

// ISR: PlayHQ data is cached for at most 300s (lib/playhq/client.ts) and
// purged by "Refresh PlayHQ now" on /admin/season/playhq. This route reads no
// cookies, headers or searchParams.
export const dynamic = 'force-static';
export const revalidate = 300;

type Params = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return (await getPublicTeamsWithSlugs()).map((team) => ({ slug: team.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const team = await getPublicTeamBySlug(slug);
  if (!team) notFound();
  const description = `${team.name}${team.grade ? ` (${team.grade})` : ''} at Newcomb and District Cricket Club: fixtures, results and ladder from PlayHQ.`;
  return pageMetadata(`/teams/${team.slug}`, `${team.name} fixtures and ladder`, description);
}

function ordinal(position: number) {
  const mod100 = position % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${position}th`;
  return `${position}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[position % 10] || 'th'}`;
}

export default async function TeamPage({ params }: Params) {
  const { slug } = await params;
  const team = await getPublicTeamBySlug(slug);
  if (!team) notFound();

  const [playhq, settings, currentSeason, appointments] = await Promise.all([
    getPlayHQPublicData(),
    getClubSettings(),
    getCurrentClubSeason().catch(() => null),
    getPublicSeasonAppointments().catch(() => []),
  ]);

  const playhqTeam = matchPlayHQTeam(team, playhq.teams);
  const grade = playhqTeam?.gradeId ? playhq.grades.find((row) => row.id === playhqTeam.gradeId) : undefined;
  const gradeName = playhqTeam?.gradeName || grade?.name || null;
  const teamFixtures = playhqTeam?.gradeId ? fixturesForTeam(playhq.fixtures, playhqTeam) : [];
  const { upcoming, results, next } = splitTeamFixtures(teamFixtures);
  const ladder = ladderForGrade(playhq.ladders, playhqTeam?.gradeId);
  const ladderRow = playhqTeam ? ladder.find((row) => isLadderRowForTeam(row, playhqTeam)) : undefined;
  const people = appointmentsForTeam(appointments, team, playhqTeam?.name);
  const captain = team.captain?.trim() || people.captain;
  const clubPlayHQUrl = settings.playhq_url || PLAYHQ_ORG_URL;
  const teamPlayHQUrl = team.playhq_url ? currentSeasonPlayHQUrl(team.playhq_url, currentSeason?.slug, clubPlayHQUrl) : null;
  const fetchedAt = new Date(playhq.fetchedAt);
  const fetchedAtLabel = Number.isNaN(fetchedAt.getTime()) ? null : fetchedAt.toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Australia/Melbourne' });
  const nextVersus = next && playhqTeam ? opponentFor(next, playhqTeam) : null;
  const nextTime = next ? formatFixtureStartTime(next.startsAt) : null;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Teams', path: '/teams' }, { name: team.name, path: `/teams/${team.slug}` }])) }} />
      <section className="page-hero">
        <div className="container-width">
          <p className="mb-2 font-body text-sm">
            <Link href="/teams" className="font-semibold text-white/85 underline-offset-2 hover:underline">All teams</Link>
          </p>
          <h1 className="page-hero-title">{team.name}</h1>
          {(gradeName || team.grade) && <p className="page-hero-subtitle">{gradeName || team.grade}</p>}
        </div>
      </section>

      <section className="section-padding">
        <div className="container-width space-y-10">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="surface-panel border-l-4 border-l-maroon-700 p-6 lg:col-span-2">
              <h2 className="text-xl font-display font-bold text-content-primary">Next match</h2>
              {!playhqTeam ? (
                <p className="mt-2 font-body text-content-secondary">
                  Check PlayHQ for this team&apos;s fixtures.
                </p>
              ) : !playhqTeam.gradeId ? (
                <p className="mt-2 font-body text-content-secondary">Fixture not yet released by GCA.</p>
              ) : next && nextVersus ? (
                <div className="mt-2 space-y-1 font-body">
                  <p className="text-lg font-semibold text-content-primary">v {nextVersus.opponent} <span className="font-normal text-content-muted">({nextVersus.venueRole})</span></p>
                  <p className="tabular-nums text-content-secondary">
                    {next.startsAt ? <time dateTime={next.startsAt}>{formatFixtureDay(next.startsAt)}</time> : formatFixtureDay(null)}
                    {nextTime ? `, ${nextTime}` : ' - start time to be confirmed'}
                  </p>
                  {next.venue && <p className="text-content-secondary">{next.venue}</p>}
                  {next.playHQUrl && <a href={next.playHQUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-maroon-700 underline-offset-2 hover:underline dark:text-maroon-200">Game centre on PlayHQ<span className="sr-only"> (opens in a new tab)</span></a>}
                </div>
              ) : (
                <p className="mt-2 font-body text-content-secondary">No upcoming matches are listed on PlayHQ.</p>
              )}
            </div>
            <div className="surface-panel p-6">
              <h2 className="text-xl font-display font-bold text-content-primary">Team</h2>
              <dl className="mt-2 space-y-2 font-body text-sm">
                {gradeName && <div><dt className="font-semibold text-content-primary">Grade</dt><dd className="text-content-secondary">{gradeName}</dd></div>}
                {ladderRow?.position != null && <div><dt className="font-semibold text-content-primary">Ladder position</dt><dd className="tabular-nums text-content-secondary">{ordinal(ladderRow.position)} of {ladder.length}</dd></div>}
                {captain && <div><dt className="font-semibold text-content-primary">Captain</dt><dd className="text-content-secondary">{captain}</dd></div>}
                {people.coach && <div><dt className="font-semibold text-content-primary">Coach</dt><dd className="text-content-secondary">{people.coach}</dd></div>}
              </dl>
              {team.description && <p className="mt-4 font-body text-sm leading-relaxed text-content-secondary">{team.description}</p>}
            </div>
          </div>

          {playhqTeam?.gradeId && (
            <>
              <section aria-labelledby="team-fixtures">
                <h2 id="team-fixtures" className="section-title mb-4">Season fixtures</h2>
                {upcoming.length ? <FixtureList fixtures={upcoming} team={playhqTeam} label={`${team.name} upcoming fixtures`} /> : <p className="font-body text-content-muted">No upcoming fixtures are currently listed.</p>}
              </section>

              {results.length > 0 && (
                <section aria-labelledby="team-results">
                  <h2 id="team-results" className="section-title mb-4">Results</h2>
                  <FixtureList fixtures={results} team={playhqTeam} label={`${team.name} results`} />
                </section>
              )}

              {ladder.length > 0 && (
                <section aria-labelledby="team-ladder">
                  <h2 id="team-ladder" className="section-title mb-4">{gradeName ? `${gradeName} ladder` : 'Ladder'}</h2>
                  <LadderTable rows={ladder} caption={`${gradeName || 'Grade'} ladder`} highlightTeam={playhqTeam} />
                </section>
              )}
            </>
          )}

          <div className="flex flex-wrap items-center gap-4 font-body text-sm">
            <Link href="/fixtures" className="btn-secondary text-sm">All club fixtures</Link>
            <a href={teamPlayHQUrl || clubPlayHQUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-maroon-700 underline-offset-2 hover:underline dark:text-maroon-200">
              {teamPlayHQUrl ? 'This team on PlayHQ' : 'Club on PlayHQ'}<span className="sr-only"> (opens in a new tab)</span>
            </a>
            {playhqTeam && fetchedAtLabel && <span className="text-content-muted">Data from PlayHQ, last checked <time dateTime={playhq.fetchedAt}>{fetchedAtLabel}</time></span>}
          </div>
        </div>
      </section>
    </>
  );
}
