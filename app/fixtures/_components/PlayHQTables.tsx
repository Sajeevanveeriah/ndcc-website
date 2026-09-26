// Shared, calm presentation for PlayHQ fixtures and ladders on /fixtures and
// /teams/[slug]. Server-safe (no hooks); all event details are HTML text.
import { formatFixtureDay, formatFixtureStartTime, isLadderRowForTeam, opponentFor } from '@/lib/playhq/team-view';
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

/** Date-led fixture list. With `team`, rows read "v Opponent (Home/Away)". */
export function FixtureList({ fixtures, team, showGrade = false, label }: { fixtures: PlayHQFixture[]; team?: Pick<PlayHQTeam, 'id' | 'name'>; showGrade?: boolean; label: string }) {
  return (
    <ol className="divide-y divide-edge-subtle overflow-hidden rounded-xl border border-edge-subtle bg-surface-card" aria-label={label}>
      {fixtures.map((fixture) => {
        const time = formatFixtureStartTime(fixture.startsAt);
        const versus = team ? opponentFor(fixture, team) : null;
        const status = statusLabel(fixture.status);
        return (
          <li key={fixture.id} className="grid gap-2 p-4 sm:grid-cols-[11rem_1fr_auto] sm:items-start sm:gap-4">
            <div className="font-body text-sm tabular-nums">
              <p className="font-semibold text-content-primary">
                {fixture.startsAt ? <time dateTime={fixture.startsAt}>{formatFixtureDay(fixture.startsAt)}</time> : formatFixtureDay(null)}
              </p>
              <p className="text-content-muted">{time || 'Start time to be confirmed'}</p>
            </div>
            <div className="font-body text-sm">
              {versus ? (
                <p className="font-semibold text-content-primary">v {versus.opponent} <span className="font-normal text-content-muted">({versus.venueRole})</span></p>
              ) : (
                <p className="font-semibold text-content-primary">{fixture.homeTeam} <span className="font-normal text-content-muted">v</span> {fixture.awayTeam}</p>
              )}
              {showGrade && <p className="text-content-secondary">{fixture.gradeName}</p>}
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
