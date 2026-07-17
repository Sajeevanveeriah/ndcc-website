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

export function involvesClubTeam(fixture: Pick<PlayHQFixture, 'homeTeam' | 'awayTeam'>, clubNamePattern = /newcomb/i): boolean {
  return clubNamePattern.test(fixture.homeTeam || '') || clubNamePattern.test(fixture.awayTeam || '');
}

// Parse a PlayHQ cricket game summary into per-player stat lines. Only the
// club-supported statistics are read; anything absent stays 0/false rather
// than being inferred. Ducks are only recorded when the summary shows the
// player batted, scored 0 and was dismissed.
export function normaliseGameSummaryPlayers(payload: unknown): PlayHQPlayerStatLine[] {
  const root = asRecord(payload);
  const data = root.data ?? payload;
  const lines = new Map<string, PlayHQPlayerStatLine>();

  const visitPlayer = (raw: unknown, teamName: string) => {
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

    const line = lines.get(playerId) ?? {
      playhq_player_id: playerId,
      display_name: displayName,
      team_name: teamName,
      runs: 0, wickets: 0, maidens: 0, catches: 0, runouts: 0, stumpings: 0, ducks: 0,
      not_out: false, player_of_match: false,
    };

    const runs = count(batting.runsScored, batting.runs, stats.runsScored, stats.runs);
    const ballsFaced = count(batting.ballsFaced, stats.ballsFaced);
    const dismissalText = text(batting.dismissal, batting.howOut, stats.dismissal);
    const notOutFlag = batting.notOut === true || stats.notOut === true || /not\s*out/i.test(dismissalText || '');
    const batted = batting.batted === true || ballsFaced > 0 || runs > 0 || Boolean(dismissalText) || notOutFlag;
    const dismissed = batted && !notOutFlag && (Boolean(dismissalText) || batting.out === true || stats.out === true);

    line.runs = Math.max(line.runs, runs);
    line.wickets = Math.max(line.wickets, count(bowling.wicketsTaken, bowling.wickets, stats.wicketsTaken, stats.wickets));
    line.maidens = Math.max(line.maidens, count(bowling.maidensBowled, bowling.maidens, stats.maidensBowled, stats.maidens));
    line.catches = Math.max(line.catches, count(fielding.catches, stats.catches));
    line.runouts = Math.max(line.runouts, count(fielding.runOuts, fielding.runouts, stats.runOuts, stats.runouts));
    line.stumpings = Math.max(line.stumpings, count(fielding.stumpings, stats.stumpings));
    if (batted && runs === 0 && dismissed) line.ducks = 1;
    if (batted && notOutFlag) line.not_out = true;
    lines.set(playerId, line);
  };

  const visitTeamContainer = (raw: unknown) => {
    const r = asRecord(raw);
    const teamName = text(asRecord(r.team).name, r.teamName, r.name) || '';
    for (const key of ['players', 'playerStatistics', 'playerStats', 'lineup']) {
      const players = r[key];
      if (Array.isArray(players)) players.forEach((player) => visitPlayer(player, teamName));
    }
    for (const key of ['batting', 'bowling', 'fielding']) {
      const section = r[key];
      if (Array.isArray(section)) section.forEach((player) => visitPlayer(player, teamName));
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

  return Array.from(lines.values());
}
