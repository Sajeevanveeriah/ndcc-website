// Pure helpers for the PlayHQ -> Fantasy importer. No IO here so every rule is
// deterministic and unit-testable (scripts/test-fantasy-seasons.mjs). The IO
// orchestration lives in lib/playhq/fantasy-sync.ts.
import { createHash } from 'node:crypto';
import type { PlayHQFixture } from './types';

export type PlayHQRoundInfo = { number: number; name: string };

export type PlayHQPlayerStatLine = {
  playhq_player_id: string;
  display_name: string;
  team_name: string;
  runs: number;
  wickets: number;
  maidens: number;
  catches: number;
  runouts: number;
  stumpings: number;
  ducks: number;
  not_out: boolean;
  player_of_match: boolean;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
function text(...values: unknown[]) {
  return values.find((v) => typeof v === 'string' && (v as string).trim()) as string | undefined;
}
function count(...values: unknown[]) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

// Deterministic hash of any JSON-able payload: keys are sorted recursively so
// semantically identical PlayHQ responses always hash the same.
export function computeSourceHash(payload: unknown): string {
  const stable = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [key, stable((value as Record<string, unknown>)[key])]));
    }
    return value;
  };
  return createHash('sha256').update(JSON.stringify(stable(payload))).digest('hex');
}

// Exact round mapping only. Returns null when PlayHQ metadata is missing or
// ambiguous - callers must route those games to admin review, never guess.
export function extractRoundInfo(rawFixture: unknown): PlayHQRoundInfo | null {
  const r = asRecord(rawFixture);
  const round = asRecord(r.round);
  const name = text(round.name, r.roundName, typeof r.round === 'string' ? r.round : undefined);
  const explicitNumber = count(round.number ?? r.roundNumber ?? NaN, NaN);
  if (Number.isInteger(explicitNumber) && explicitNumber > 0) {
    return { number: explicitNumber, name: name || `Round ${explicitNumber}` };
  }
  if (name) {
    const match = name.match(/^\s*Round\s+(\d+)\s*$/i);
    if (match) return { number: Number(match[1]), name: name.trim() };
  }
  return null;
}

export function isCompletedFixture(fixture: Pick<PlayHQFixture, 'status'>): boolean {
  const status = (fixture.status || '').toUpperCase().replace(/[^A-Z]/g, '');
  return ['FINAL', 'FINALISED', 'FINALIZED', 'COMPLETED', 'COMPLETE'].includes(status);
}

// Only recognised non-final states may explain an empty preseason queue.
// Unknown states stay reviewable rather than silently hiding completed games.
export function isPendingFixture(fixture: Pick<PlayHQFixture, 'status'>): boolean {
  const status = (fixture.status || '').toUpperCase().replace(/[^A-Z]/g, '');
  return ['UPCOMING', 'SCHEDULED', 'NOTSTARTED', 'INPROGRESS', 'LIVE', 'POSTPONED', 'CANCELLED', 'CANCELED', 'ABANDONED', 'BYE'].includes(status);
}

export function canRetryEmptyFixtureJob(job: { status?: string; total_games?: number; processed_games?: number; failed_games?: number; review_items?: unknown }): boolean {
  const reviews = Array.isArray(job.review_items) ? job.review_items : [];
  return job.status === 'needs_review' && Number(job.total_games) === 0
    && Number(job.processed_games) === 0 && Number(job.failed_games) === 0
    && reviews.length > 0 && reviews.every((item) => item && typeof item === 'object' && item.type === 'empty_queue');
}

// The sync always passes resolveClubTeamMatcher(...).matches from
// season-match.ts (the shared club-name check). The regex default only keeps
// this pure module import-free and accepts the same aliases (newcomb, ndcc).
export function involvesClubTeam(
  fixture: Pick<PlayHQFixture, 'homeTeam' | 'awayTeam'>,
  clubName: RegExp | ((teamName: string) => boolean) = /\b(?:newcomb|ndcc)\b/i,
): boolean {
  const matches = typeof clubName === 'function' ? clubName : (name: string) => clubName.test(name);
  return matches(fixture.homeTeam || '') || matches(fixture.awayTeam || '');
}

// Calendar date of a fixture in the club's time zone. PlayHQ start times with
// an explicit offset or 'Z' are converted to Australia/Melbourne first, so a
// Saturday 9:30 am AEDT start (Friday 22:30 UTC) stays on Saturday and lands
// in the right Dino Coach week. Plain dates and offset-free local timestamps
// are already local and are kept as written.
export function localMatchDate(startsAt: string | null | undefined): string | null {
  const value = String(startsAt ?? '').trim();
  const datePart = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!datePart) return null;
  if (!/T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) return datePart[1];
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return datePart[1];
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

// How a batting entry ended, from PlayHQ's dismissal / how-out text. PlayHQ
// sends both prose ("not out", "Did not bat") and enum codes ("NOT_OUT",
// "DID_NOT_BAT"); underscores and hyphens are treated as spaces.
//   did_not_bat: never batted (did not bat, DNB, absent) - never a duck.
//   not_out:     not out, retired not out, retired hurt (recorded as not out
//                under the Laws of Cricket) - never a duck.
//   dismissed:   any other non-empty text, e.g. "b Smith", "retired out".
export type DismissalKind = 'did_not_bat' | 'not_out' | 'dismissed' | 'none';
export function classifyDismissal(value: string | null | undefined): DismissalKind {
  const how = String(value ?? '').toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!how) return 'none';
  if (/^(did not bat|dnb|absent( hurt| ill)?|not batted|yet to bat)$/.test(how)) return 'did_not_bat';
  if (/\bnot ?out\b/.test(how) || /^retired( hurt| ill)?$/.test(how) || /\bretired hurt\b/.test(how)) return 'not_out';
  return 'dismissed';
}

type StatSection = 'batting' | 'bowling' | 'fielding' | null;
type CountField = 'runs' | 'wickets' | 'maidens' | 'catches' | 'runouts' | 'stumpings' | 'ducks';
const COUNT_FIELDS: CountField[] = ['runs', 'wickets', 'maidens', 'catches', 'runouts', 'stumpings', 'ducks'];

// Innings identity of one entry, when PlayHQ states it. '' means unknown.
function inningsKey(...records: Record<string, unknown>[]): string {
  for (const r of records) {
    const innings = r.innings;
    const value = r.inningsNumber ?? r.inningNumber ?? r.inningsNo
      ?? (typeof innings === 'number' || typeof innings === 'string' ? innings : asRecord(innings).number ?? asRecord(innings).inningsNumber);
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
  }
  return '';
}

// Parse a PlayHQ cricket game summary into per-player stat lines. Only the
// club-supported statistics are read; anything absent stays 0/false rather
// than being inferred. Ducks are only recorded when the summary shows the
// player batted, scored 0 and was dismissed.
//
// One player can appear several times in a summary: in a team's `players`
// list AND in its `batting`/`bowling`/`fielding` sections, or under more than
// one container key. Those are the SAME innings, so repeated values are
// de-duplicated with Math.max (summing would double count). Values are only
// added together when entries carry different explicit innings numbers
// (two-innings games); an entry without an innings number never adds to a
// numbered one, it can only raise the total (max of the two).
//
// Flat section rows are read by section: a `bowling` row's `runs` are runs
// conceded and are never treated as runs scored, and a `batting` row's
// fields are never read as bowling or fielding figures.
export function normaliseGameSummaryPlayers(payload: unknown): PlayHQPlayerStatLine[] {
  const root = asRecord(payload);
  const data = root.data ?? payload;
  const lines = new Map<string, PlayHQPlayerStatLine>();
  // playerId -> field -> innings key -> value (max within one innings key).
  const parts = new Map<string, Map<CountField, Map<string, number>>>();
  const record = (playerId: string, field: CountField, key: string, value: number) => {
    const fields = parts.get(playerId) ?? new Map<CountField, Map<string, number>>();
    const byInnings = fields.get(field) ?? new Map<string, number>();
    byInnings.set(key, Math.max(byInnings.get(key) ?? 0, value));
    fields.set(field, byInnings);
    parts.set(playerId, fields);
  };

  const visitPlayer = (raw: unknown, teamName: string, section: StatSection, containerInnings: string) => {
    const r = asRecord(raw);
    const identity = asRecord(r.player ?? r.profile ?? r);
    const playerId = text(identity.id, identity.playerId, identity.profileId, r.playerId, r.id);
    if (!playerId) return;
    const firstName = text(identity.firstName) || '';
    const lastName = text(identity.lastName) || '';
    const displayName = text(identity.displayName, identity.name, `${firstName} ${lastName}`.trim()) || 'Unknown Player';

    const stats = asRecord(r.statistics ?? r.stats ?? r);
    const batting = asRecord(stats.batting ?? r.batting);
    const bowling = asRecord(stats.bowling ?? r.bowling);
    const fielding = asRecord(stats.fielding ?? r.fielding);
    // Flat (un-nested) figures belong to the section the row came from; a
    // row from a players list (section null) may carry any of them.
    const none: Record<string, unknown> = {};
    const battingFlat = section === null || section === 'batting' ? stats : none;
    const bowlingFlat = section === null || section === 'bowling' ? stats : none;
    const fieldingFlat = section === null || section === 'fielding' ? stats : none;

    const line = lines.get(playerId) ?? {
      playhq_player_id: playerId,
      display_name: displayName,
      team_name: teamName,
      runs: 0, wickets: 0, maidens: 0, catches: 0, runouts: 0, stumpings: 0, ducks: 0,
      not_out: false, player_of_match: false,
    };
    const key = inningsKey(batting, bowling, r, stats) || containerInnings;

    const runs = count(batting.runsScored, batting.runs, battingFlat.runsScored, battingFlat.runs);
    const ballsFaced = count(batting.ballsFaced, battingFlat.ballsFaced);
    const dismissalText = text(batting.dismissal, batting.howOut, battingFlat.dismissal, battingFlat.howOut);
    const kind = classifyDismissal(dismissalText);
    const notOutFlag = kind === 'not_out' || batting.notOut === true || battingFlat.notOut === true;
    const didNotBat = kind === 'did_not_bat' && runs === 0 && ballsFaced === 0;
    const batted = !didNotBat && (batting.batted === true || ballsFaced > 0 || runs > 0 || kind === 'dismissed' || notOutFlag);
    const dismissed = batted && !notOutFlag && (kind === 'dismissed' || batting.out === true || battingFlat.out === true);

    record(playerId, 'runs', key, runs);
    record(playerId, 'wickets', key, count(bowling.wicketsTaken, bowling.wickets, bowlingFlat.wicketsTaken, bowlingFlat.wickets));
    record(playerId, 'maidens', key, count(bowling.maidensBowled, bowling.maidens, bowlingFlat.maidensBowled, bowlingFlat.maidens));
    record(playerId, 'catches', key, count(fielding.catches, fieldingFlat.catches));
    record(playerId, 'runouts', key, count(fielding.runOuts, fielding.runouts, fieldingFlat.runOuts, fieldingFlat.runouts));
    record(playerId, 'stumpings', key, count(fielding.stumpings, fieldingFlat.stumpings));
    record(playerId, 'ducks', key, batted && runs === 0 && dismissed ? 1 : 0);
    if (batted && notOutFlag) line.not_out = true;
    lines.set(playerId, line);
  };

  const visitTeamContainer = (raw: unknown) => {
    const r = asRecord(raw);
    const teamName = text(asRecord(r.team).name, r.teamName, r.name) || '';
    const containerInnings = inningsKey(r);
    for (const key of ['players', 'playerStatistics', 'playerStats', 'lineup']) {
      const players = r[key];
      if (Array.isArray(players)) players.forEach((player) => visitPlayer(player, teamName, null, containerInnings));
    }
    for (const key of ['batting', 'bowling', 'fielding'] as const) {
      const section = r[key];
      if (Array.isArray(section)) section.forEach((player) => visitPlayer(player, teamName, key, containerInnings));
    }
  };

  const roots = Array.isArray(data) ? data : [data];
  for (const node of roots) {
    const r = asRecord(node);
    for (const key of ['teams', 'homeTeam', 'awayTeam', 'home', 'away']) {
      const value = r[key];
      if (Array.isArray(value)) value.forEach(visitTeamContainer);
      else if (value && typeof value === 'object') visitTeamContainer(value);
    }
    if (Array.isArray(r.players)) visitTeamContainer(r);

    const potm = asRecord(r.playerOfTheMatch ?? r.playerOfMatch);
    const potmId = text(potm.id, potm.playerId, potm.profileId);
    if (potmId && lines.has(potmId)) lines.get(potmId)!.player_of_match = true;
  }

  for (const [playerId, line] of lines) {
    const fields = parts.get(playerId);
    for (const field of COUNT_FIELDS) {
      const byInnings = fields?.get(field) ?? new Map<string, number>();
      let numbered = 0;
      for (const [key, value] of byInnings) if (key !== '') numbered += value;
      line[field] = Math.max(numbered, byInnings.get('') ?? 0);
    }
  }

  return Array.from(lines.values());
}
