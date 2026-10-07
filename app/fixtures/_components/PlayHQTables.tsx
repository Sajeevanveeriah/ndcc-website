// Shared, calm presentation for PlayHQ fixtures and ladders on /fixtures and
// /teams/[slug]. Server-safe (no hooks); all event details are HTML text.
import { clubVenueRole, DEFAULT_EXPANDED_GROUPS, fixtureTimeLabel, groupFixturesByDay, limitFixtureGroups, type FixtureDayGroup } from '@/lib/playhq/fixture-groups';
import { formatFixtureDay, isLadderRowForTeam, opponentFor } from '@/lib/playhq/team-view';
import type { PlayHQFixture, PlayHQLadderRow, PlayHQTeam } from '@/lib/playhq/types';

function ExternalIcon() {
  return (
    <svg className="ml-1 inline h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
    </svg>
  );
}

function statusLabel(status: string | null) {
  if (!status) return null;
  const text = status.replace(/_/g, ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function hasScore(fixture: PlayHQFixture) {
  return Boolean(fixture.homeScore || fixture.awayScore);
}

/** NDCC home/away marker: text, not colour alone. */
function VenueRoleBadge({ role }: { role: 'Home' | 'Away' | null }) {
  if (!role) return null;
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 font-body text-xs font-semibold ring-1 ring-inset ${role === 'Home'
      ? 'bg-maroon-100 text-maroon-800 ring-maroon-200/60 dark:bg-maroon-950 dark:text-maroon-200 dark:ring-maroon-800/60'
      : 'bg-surface-muted text-content-secondary ring-edge-strong'}`}>
      {role}<span className="sr-only"> game for Newcomb and District</span>
    </span>
  );
}

/**
 * Fixture list. With `team`, rows read "v Opponent" and the badge is that
 * team's Home/Away. Inside a match-day group (`hideDate`) the group heading
 * carries the date, so rows show only a start time, and none at all when the
 * heading already says the whole day's start time is TBC (`groupTimeTbc`).
 */
export function FixtureList({ fixtures, team, showGrade = false, label, hideDate = false, groupTimeTbc = false }: { fixtures: PlayHQFixture[]; team?: Pick<PlayHQTeam, 'id' | 'name'>; showGrade?: boolean; label: string; hideDate?: boolean; groupTimeTbc?: boolean }) {
  return (
    <ol className="divide-y divide-edge-subtle overflow-hidden rounded-xl border border-edge-subtle bg-surface-card" aria-label={label}>
      {fixtures.map((fixture) => {
        const time = fixtureTimeLabel(fixture.startsAt, hideDate && groupTimeTbc);
        const versus = team ? opponentFor(fixture, team) : null;
        const role = clubVenueRole(fixture, team);
        const status = statusLabel(fixture.status);
        return (
          <li key={fixture.id} className={`grid gap-2 p-4 sm:items-start sm:gap-4 ${hideDate ? 'sm:grid-cols-[1fr_auto]' : 'sm:grid-cols-[11rem_1fr_auto]'}`}>
            {!hideDate && (
              <div className="font-body text-sm tabular-nums">
                <p className="font-semibold text-content-primary">
                  {fixture.startsAt ? <time dateTime={fixture.startsAt}>{formatFixtureDay(fixture.startsAt)}</time> : formatFixtureDay(null)}
                </p>
                {time && <p className="text-content-muted">{time}</p>}
              </div>
            )}
            <div className="min-w-0 font-body text-sm">
              <div className="flex items-start justify-between gap-3">
                {versus ? (
                  <p className="font-semibold text-content-primary">v {versus.opponent}</p>
                ) : (
                  <p className="font-semibold text-content-primary">{fixture.homeTeam} <span className="font-normal text-content-muted">v</span> {fixture.awayTeam}</p>
                )}
                <VenueRoleBadge role={role} />
              </div>
              {(showGrade || (hideDate && time)) && (
                <p className="text-content-secondary">
                  {[hideDate ? time : null, showGrade ? fixture.gradeName : null].filter(Boolean).join(' · ')}
                </p>
              )}
              {fixture.venue && <p className="text-content-secondary">{fixture.venue}</p>}
              {hasScore(fixture) && (
                <p className="mt-1 tabular-nums text-content-primary">
                  <span className="sr-only">Score: </span>
                  {fixture.homeTeam} {fixture.homeScore || '-'}; {fixture.awayTeam} {fixture.awayScore || '-'}
                </p>
              )}
              {status && !/^upcoming$/i.test(fixture.status || '') && <p className="text-content-muted">{status}</p>}
            </div>
            {fixture.playHQUrl && (
              <a href={fixture.playHQUrl} target="_blank" rel="noopener noreferrer" className="font-body text-sm font-semibold text-maroon-700 underline-offset-2 hover:underline dark:text-maroon-200">
                Game centre<span className="sr-only"> for {fixture.homeTeam} v {fixture.awayTeam} on PlayHQ (opens in a new tab)</span><ExternalIcon />
              </a>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Fixtures grouped under one heading per match day (Melbourne date), so each
 * game is listed once in date order. Undated fixtures sit in a final group.
 * Only the first `expandedGroups` days are open; the rest stay in the HTML
 * inside a native <details> ("Show more"), which works without JavaScript and
 * exposes its expanded state to assistive technology. Results pass
 * `showTimeTbc={false}`: a played game has no start time to confirm.
 */
export function FixtureDayGroups({ fixtures, label, headingLevel = 3, expandedGroups = DEFAULT_EXPANDED_GROUPS, moreLabel = 'fixtures', showTimeTbc = true }: { fixtures: PlayHQFixture[]; label: string; headingLevel?: 2 | 3; expandedGroups?: number; moreLabel?: string; showTimeTbc?: boolean }) {
  const groups = groupFixturesByDay(fixtures);
  const { shown, more } = limitFixtureGroups(groups, expandedGroups);
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const idBase = `fixture-day-${label.replace(/\W+/g, '-')}`;
  const renderGroup = (group: FixtureDayGroup) => (
    <section key={group.key} aria-labelledby={`${idBase}-${group.key}`}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
        <Heading id={`${idBase}-${group.key}`} className="font-display text-base font-semibold tracking-tight text-content-primary">
          {group.dateTime ? <time dateTime={group.dateTime}>{group.day}</time> : group.day}
        </Heading>
        {showTimeTbc && group.timeTbc && <p className="font-body text-sm text-content-muted">Start time TBC</p>}
      </div>
      <FixtureList fixtures={group.fixtures} showGrade hideDate groupTimeTbc={!showTimeTbc || group.timeTbc} label={`${label}: ${group.day}`} />
    </section>
  );
  const hiddenGames = more.reduce((total, group) => total + group.fixtures.length, 0);
  return (
    <div className="space-y-6" aria-label={label} role="group">
      {shown.map(renderGroup)}
      {more.length > 0 && (
        <details className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl border border-edge-strong bg-surface-card px-4 py-3 font-body text-sm text-content-primary transition-colors hover:border-maroon-700 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-maroon-500 focus-visible:ring-offset-2 dark:hover:border-maroon-300 dark:focus-visible:ring-offset-slate-900 [&::-webkit-details-marker]:hidden">
            <span>
              <span className="font-semibold group-open:hidden">Show more {moreLabel}</span>
              <span className="hidden font-semibold group-open:inline">Show fewer {moreLabel}</span>
              <span className="block text-content-muted">{hiddenGames} more {more.length === 1 ? 'on 1 match day' : `across ${more.length} match days`}</span>
            </span>
            <svg className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </summary>
          <div className="mt-6 space-y-6">{more.map(renderGroup)}</div>
        </details>
      )}
    </div>
  );
}

/** Ledger-style ladder with numeric columns in tabular numerals. */
export function LadderTable({ rows, caption, highlightTeam }: { rows: PlayHQLadderRow[]; caption?: string; highlightTeam?: Pick<PlayHQTeam, 'name'> | null }) {
  const headClass = 'px-4 py-3 font-semibold uppercase tracking-wider text-sm text-maroon-800 dark:text-maroon-200';
  return (
    <div className="overflow-x-auto rounded-xl border border-edge-subtle bg-surface-card dark:border-slate-700">
      <table className="min-w-full divide-y divide-edge-subtle text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="bg-maroon-50/60 text-left dark:bg-slate-800/80">
          <tr>
            <th scope="col" className={`${headClass} text-center`}>Pos</th>
            <th scope="col" className={headClass}>Team</th>
            <th scope="col" className={`${headClass} text-center`}><abbr title="Played" className="no-underline">P</abbr></th>
            <th scope="col" className={`${headClass} text-center`}><abbr title="Points" className="no-underline">Pts</abbr></th>
            <th scope="col" className={`${headClass} text-center`}><abbr title="Percentage" className="no-underline">%</abbr></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-edge-subtle tabular-nums">
          {rows.map((row, index) => {
            const isTeam = highlightTeam ? isLadderRowForTeam(row, highlightTeam) : false;
            return (
              <tr key={`${row.gradeId}-${row.teamName}-${index}`} className={isTeam ? 'bg-maroon-50/70 dark:bg-maroon-950/40' : undefined} aria-current={isTeam ? 'true' : undefined}>
                <td className="px-4 py-3 text-center font-display font-bold text-maroon-700 dark:text-maroon-200">{row.position ?? '-'}</td>
                <th scope="row" className={`px-4 py-3 text-left ${isTeam ? 'font-bold' : 'font-medium'} text-content-primary`}>{row.teamName}</th>
                <td className="px-4 py-3 text-center">{row.played ?? '-'}</td>
                <td className="px-4 py-3 text-center font-semibold">{row.points ?? '-'}</td>
                <td className="px-4 py-3 text-center">{row.percentage ?? '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
