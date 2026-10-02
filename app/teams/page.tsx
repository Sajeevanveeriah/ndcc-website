import { pageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight, ExternalLink } from 'lucide-react';
import SafeImage from '@/components/common/SafeImage';
import { CLUB_NICKNAME } from '@/lib/constants';
import { getPublicTeams } from '@/lib/public-teams';
import { getPlayHQPublicData } from '@/lib/playhq/client';
import { loadTeamPlayHQLinks } from '@/lib/playhq/mapping-store';
import { buildTeamSlugs, fixturesForTeam, formatFixtureDay, formatFixtureStartTime, matchPlayHQTeam, opponentFor, splitTeamFixtures } from '@/lib/playhq/team-view';
import { groupByCategory, teamCategory, type TeamCategory } from '@/lib/playhq/team-category';
import type { PlayHQPublicData } from '@/lib/playhq/types';
import type { TeamInfo } from '@/lib/types';
import TeamsFilter, { type TeamFilterGroup } from './TeamsFilter';

const TEAM_IMAGES: Record<string, string> = {
  'Senior Women': '/images/Womens_Team.jpg',
};

const GROUP_HEADINGS: Record<TeamCategory, string> = {
  men: 'Senior men',
  women: 'Senior women',
  junior: 'Juniors',
};

// ISR: regenerated at most every 60s and on demand after admin writes
// (lib/server/revalidate-public.ts). 'force-static' lets the Supabase reads,
// which use cache: 'no-store' fetches, run during static regeneration instead
// of opting the route into per-request rendering. This route reads no
// cookies, headers or searchParams.
export const dynamic = 'force-static';
export const revalidate = 60;

export const metadata: Metadata = pageMetadata("/teams", "Cricket teams", "Explore senior men's, women's and junior cricket at Newcomb and District Cricket Club in Geelong, with current team information and registration links.");

type FixtureNote =
  | { kind: 'next'; startsAt: string | null; day: string; time: string | null; opponent: string; venueRole: 'Home' | 'Away' }
  | { kind: 'text'; text: string };

// Next-match line for a card, using the same PlayHQ match and fixture logic
// as /teams/[slug]. Returns null (no line) when PlayHQ data is unavailable or
// the team has no PlayHQ match, rather than guessing.
function fixtureNoteFor(team: TeamInfo, playhq: PlayHQPublicData | null, links: Map<string, string>): FixtureNote | null {
  if (!playhq || playhq.teams.length === 0) return null;
  const playhqTeam = matchPlayHQTeam({ ...team, playhq_team_id: (team.id && links.get(team.id)) || null }, playhq.teams);
  if (!playhqTeam) return null;
  if (!playhqTeam.gradeId) return { kind: 'text', text: 'Fixture not yet released by GCA.' };
  const { next } = splitTeamFixtures(fixturesForTeam(playhq.fixtures, playhqTeam));
  if (!next) return { kind: 'text', text: 'No upcoming matches are listed on PlayHQ.' };
  const { opponent, venueRole } = opponentFor(next, playhqTeam);
  return { kind: 'next', startsAt: next.startsAt, day: formatFixtureDay(next.startsAt), time: formatFixtureStartTime(next.startsAt), opponent, venueRole };
}

export default async function TeamsPage() {
  // PlayHQ data (cached, never throws) and saved PlayHQ team links (degrade to
  // name matching) are only used for the optional next-match line.
  const playhqPromise = getPlayHQPublicData().catch(() => null);
  const linksPromise = loadTeamPlayHQLinks().catch(() => new Map<string, string>());
  const teams = await getPublicTeams();
  const [playhq, links] = await Promise.all([playhqPromise, linksPromise]);
  // Same deterministic slugs as /teams/[slug] (getPublicTeamsWithSlugs).
  const slugs = new Map(buildTeamSlugs(teams).map(({ team, slug }) => [team, slug]));

  const renderTeamCard = (team: TeamInfo) => {
    const teamImage = team.image_url || TEAM_IMAGES[team.name];
    const note = fixtureNoteFor(team, playhq, links);

    return (
      <li key={team.id || team.name} className="nd-card nd-ev-card">
        {teamImage && (
          <div className="nd-ev-img">
            <SafeImage
              src={teamImage}
              alt={`${team.name} team photo`}
              fill
              className="object-contain"
              sizes="(max-width: 700px) 100vw, 380px"
              fallback={<div className="absolute inset-0 bg-surface-muted" aria-hidden="true" />}
            />
          </div>
        )}
        <div className="nd-ev-body">
          {team.grade && <span className="nd-pill self-start">{team.grade}</span>}
          <h3>{team.name}</h3>
          {team.description && <p className="nd-ev-meta">{team.description}</p>}
          {team.captain && (
            <p className="text-sm text-content-muted">
              <span className="font-semibold">Captain:</span> {team.captain}
            </p>
          )}
          {note?.kind === 'next' && (
            <p className="text-[14.5px] font-medium text-content-primary">
              Next:{' '}
              {note.startsAt ? <time dateTime={note.startsAt}>{note.day}</time> : note.day}
              {note.time ? `, ${note.time}` : ''} v {note.opponent} ({note.venueRole})
            </p>
          )}
          {note?.kind === 'text' && <p className="text-[14.5px] font-medium text-content-primary">{note.text}</p>}
          <div className="flex flex-wrap items-center gap-x-5">
            <Link href={`/teams/${slugs.get(team)}`} className="nd-link">
              Team page<span className="sr-only">: {team.name} fixtures and results</span>
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            {team.playhq_url && (
              <a href={team.playhq_url} target="_blank" rel="noopener noreferrer" className="nd-link">
                View on PlayHQ<span className="sr-only"> (opens in a new tab)</span>
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
      </li>
    );
  };

  const groups: TeamFilterGroup[] = groupByCategory(teams, (team) => teamCategory(team.name, team.grade)).map((group) => ({
    category: group.category,
    heading: GROUP_HEADINGS[group.category],
    count: group.items.length,
    content: <ul className="nd-ev-grid m-0 list-none p-0">{group.items.map(renderTeamCard)}</ul>,
  }));

  return (
    <>
      {/* Hero */}
      <section className="page-hero px-0 sm:px-0 lg:px-0">
        <div className="nd-wrap">
          <nav aria-label="Breadcrumb" className="nd-crumbs">
            <Link href="/">Home</Link> / <span aria-current="page">Teams</span>
          </nav>
          <h1 className="page-hero-title">Our Teams</h1>
          <p className="page-hero-subtitle">
            Meet the squads representing the {CLUB_NICKNAME} across all grades of the GCA.
          </p>
        </div>
      </section>

      {/* Teams, grouped by category with a client-side filter */}
      <section className="nd-sec-tight">
        <div className="nd-wrap">
          {teams.length > 0 && <TeamsFilter groups={groups} />}
        </div>
      </section>

      {/* Head Coach */}
      <section className="nd-band-blue nd-sec-tight">
        <div className="nd-wrap">
          <h2 className="mb-2">Head Coach: Craig Hillgrove</h2>
          <p className="max-w-3xl font-body leading-relaxed">
            Craig oversees coaching across all senior and junior teams at NDCC, working with
            team captains and assistant coaches to develop players at every level. If you are
            interested in joining the club or have questions about training, get in touch via
            the{' '}
            <Link href="/contact" className="font-semibold underline underline-offset-[3px]">
              contact page
            </Link>.
          </p>
        </div>
      </section>

      {/* Join CTA */}
      <section className="band-maroon nd-sec">
        <div className="nd-wrap text-center">
          <span className="eyebrow-gold">Get Involved</span>
          <h2 className="text-3xl sm:text-4xl font-display font-bold mb-4">
            Join a Team
          </h2>
          <p className="mx-auto mb-6 max-w-2xl font-body text-base text-maroon-100 sm:text-lg">
            Interested in playing for the {CLUB_NICKNAME}? Contact the club and we will point you to the
            right men&apos;s, women&apos;s or junior team.
          </p>
          <Link href="/contact" className="btn-accent px-7 py-3 text-base">
            Get in Touch
          </Link>
        </div>
      </section>
    </>
  );
}
