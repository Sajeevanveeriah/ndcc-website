// Team sheets and club winners: shared types, validation, bulk-import parsing
// and display helpers. No runtime imports, so admin pages, API routes, public
// pages and tests all use the same rules.

export type TeamSheetPlayer = {
  name: string;
  fantasy_player_id: string | null;
  captain: boolean;
  wicketkeeper: boolean;
  twelfth: boolean;
};

export type TeamSheet = {
  id: string;
  team_id: string | null;
  team_name: string;
  match_date: string;
  round_label: string;
  season_label: string;
  opponent: string;
  venue: string;
  start_time: string;
  players: TeamSheetPlayer[];
  notes: string;
  document_url: string;
  images: TeamSheetImage[];
  published: boolean;
  published_at: string | null;
  created_at?: string;
  updated_at?: string;
};

export type TeamSheetImage = { url: string; alt: string };

/** Grade folders a team sheet can be filed under instead of a single team. */
export const TEAM_SHEET_GROUPS = ["Men's", "Women's", 'Juniors'] as const;
export const MAX_TEAM_SHEET_IMAGES = 12;

export const WINNER_CATEGORIES = ['player_sponsor_award', 'dino_lotto', 'raffle', 'event', 'other'] as const;
export type WinnerCategory = (typeof WINNER_CATEGORIES)[number];
export const WINNER_CATEGORY_LABELS: Record<WinnerCategory, string> = {
  player_sponsor_award: 'Player sponsor award',
  dino_lotto: 'Dino Lotto',
  raffle: 'Raffle',
  event: 'Event',
  other: 'Other',
};

export type ClubWinner = {
  id: string;
  category: WinnerCategory;
  title: string;
  winner_name: string;
  show_full_name: boolean;
  prize: string;
  details: string;
  draw_date: string;
  round_label: string;
  season_label: string;
  player_sponsor_id: string | null;
  sponsor_name: string;
  image_url: string;
  image_alt: string;
  published: boolean;
  published_at: string | null;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
};

export const MAX_TEAM_SHEET_PLAYERS = 20;
export const MAX_BULK_ROWS = 300;

export const TEAM_SHEET_FIELDS = ['team_id', 'team_name', 'match_date', 'round_label', 'season_label', 'opponent', 'venue', 'start_time', 'players', 'notes', 'document_url', 'images', 'published'] as const;
export const WINNER_FIELDS = ['category', 'title', 'winner_name', 'show_full_name', 'prize', 'details', 'draw_date', 'round_label', 'season_label', 'player_sponsor_id', 'sponsor_name', 'image_url', 'image_alt', 'published', 'sort_order'] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text = (value: unknown, max: number) => (typeof value === 'string' ? value : value == null ? '' : String(value)).replace(/\s+/g, ' ').trim().slice(0, max);
const multiline = (value: unknown, max: number) => (typeof value === 'string' ? value : '').replace(/\r\n?/g, '\n').trim().slice(0, max);
const bool = (value: unknown) => value === true || (typeof value === 'string' && /^(y|yes|true|1|x)$/i.test(value.trim()));
const uuidOrNull = (value: unknown) => (typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null);

/** Accepts YYYY-MM-DD or Australian D/M/YYYY (also with - or .). Returns YYYY-MM-DD or ''. */
export function parseClubDate(value: unknown): string {
  const raw = text(value, 40);
  let year: number, month: number, day: number;
  let match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) { year = +match[1]; month = +match[2]; day = +match[3]; }
  else {
    match = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
    if (!match) return '';
    day = +match[1]; month = +match[2]; year = +match[3] < 100 ? 2000 + +match[3] : +match[3];
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Splits "Jane Smith (c) (wk)" into a name and role flags. */
export function parsePlayerEntry(entry: string): Omit<TeamSheetPlayer, 'fantasy_player_id'> {
  let name = entry;
  const flags = { captain: false, wicketkeeper: false, twelfth: false };
  name = name.replace(/[([]\s*(c|capt|captain|wk|keeper|w\/k|12th|12th man|twelfth)\s*[)\]]/gi, (_, tag: string) => {
    const lower = tag.toLowerCase();
    if (lower.startsWith('c')) flags.captain = true;
    else if (lower.startsWith('12') || lower.startsWith('tw')) flags.twelfth = true;
    else flags.wicketkeeper = true;
    return ' ';
  });
  return { name: text(name, 120), ...flags };
}

export function normalisePlayers(value: unknown): TeamSheetPlayer[] {
  const list = Array.isArray(value) ? value : [];
  return list.slice(0, MAX_TEAM_SHEET_PLAYERS).map((item) => {
    const row = (item && typeof item === 'object' ? item : { name: item }) as Record<string, unknown>;
    return {
      name: text(row.name, 120),
      fantasy_player_id: uuidOrNull(row.fantasy_player_id),
      captain: row.captain === true,
      wicketkeeper: row.wicketkeeper === true,
      twelfth: row.twelfth === true,
    };
  }).filter((player) => player.name);
}

/** Keeps uploaded image links with alt text; a missing alt is written from the sheet's details. */
export function normaliseTeamSheetImages(value: unknown, context: { team_name?: string; round_label?: string } = {}): TeamSheetImage[] {
  const list = Array.isArray(value) ? value : [];
  const rows = list.map((item) => (item && typeof item === 'object' ? item : { url: item }) as Record<string, unknown>)
    .map((row) => ({ url: text(row.url, 2048), alt: text(row.alt, 300) }))
    .filter((image) => image.url).slice(0, MAX_TEAM_SHEET_IMAGES);
  const label = [context.team_name, context.round_label].filter(Boolean).join(', ');
  return rows.map((image, index) => ({
    url: image.url,
    alt: image.alt || `${label ? `${label} ` : ''}team sheet${rows.length > 1 ? `, page ${index + 1} of ${rows.length}` : ''}`,
  }));
}

export function normaliseTeamSheet(input: Record<string, unknown>): Omit<TeamSheet, 'id' | 'published_at'> {
  return {
    team_id: uuidOrNull(input.team_id),
    team_name: text(input.team_name, 120),
    match_date: parseClubDate(input.match_date),
    round_label: text(input.round_label, 60),
    season_label: text(input.season_label, 40),
    opponent: text(input.opponent, 160),
    venue: text(input.venue, 200),
    start_time: text(input.start_time, 40),
    players: normalisePlayers(input.players),
    notes: multiline(input.notes, 2000),
    document_url: text(input.document_url, 2048),
    images: normaliseTeamSheetImages(input.images, { team_name: text(input.team_name, 120), round_label: text(input.round_label, 60) }),
    published: input.published === true,
  };
}

export function validateTeamSheet(sheet: ReturnType<typeof normaliseTeamSheet>): string | null {
  if (!sheet.team_name) return 'Choose or enter the team.';
  if (!sheet.match_date) return 'Enter the match date (for example 2026-10-10 or 10/10/2026).';
  if (sheet.published && sheet.players.length === 0 && sheet.images.length === 0) return 'Add a team sheet image (or players) before publishing.';
  if (sheet.players.filter((player) => player.captain).length > 1) return 'Only one captain can be marked.';
  const seen = new Set<string>();
  for (const player of sheet.players) {
    const key = player.name.toLowerCase();
    if (seen.has(key)) return `${player.name} is listed twice.`;
    seen.add(key);
  }
  if (sheet.document_url && !/^(https:\/\/|\/)/i.test(sheet.document_url)) return 'The team sheet file must be an uploaded file or an https link.';
  if (sheet.images.some((image) => !/^(https:\/\/|\/)/i.test(image.url))) return 'Team sheet images must be uploaded files or https links.';
  return null;
}

export function normaliseWinner(input: Record<string, unknown>): Omit<ClubWinner, 'id' | 'published_at'> {
  const category = parseWinnerCategory(input.category);
  const sort = Number(input.sort_order);
  return {
    category: category || ('' as WinnerCategory),
    title: text(input.title, 160),
    winner_name: text(input.winner_name, 160),
    show_full_name: input.show_full_name === true,
    prize: text(input.prize, 200),
    details: multiline(input.details, 1000),
    draw_date: parseClubDate(input.draw_date),
    round_label: text(input.round_label, 60),
    season_label: text(input.season_label, 40),
    player_sponsor_id: uuidOrNull(input.player_sponsor_id),
    sponsor_name: text(input.sponsor_name, 160),
    image_url: text(input.image_url, 2048),
    image_alt: text(input.image_alt, 300),
    published: input.published === true,
    sort_order: Number.isInteger(sort) && Math.abs(sort) <= 100000 ? sort : 0,
  };
}

export function validateWinner(winner: ReturnType<typeof normaliseWinner>): string | null {
  if (!WINNER_CATEGORIES.includes(winner.category)) return 'Choose a category: player sponsor award, Dino Lotto, raffle, event or other.';
  if (!winner.title) return 'Enter what was won (for example "Round 3 Player of the Match").';
  if (!winner.winner_name) return 'Enter the winner\'s name.';
  if (!winner.draw_date) return 'Enter the date (for example 2026-10-10 or 10/10/2026).';
  if (winner.image_url && !winner.image_alt) return 'Describe the photo in the alt text field.';
  if (winner.image_url && !/^(https:\/\/|\/)/i.test(winner.image_url)) return 'The photo must be an uploaded image or an https link.';
  return null;
}

export function parseWinnerCategory(value: unknown): WinnerCategory | null {
  const raw = text(value, 60).toLowerCase().replace(/[^a-z]/g, '');
  if (!raw) return null;
  const direct = WINNER_CATEGORIES.find((key) => key.replace(/_/g, '') === raw);
  if (direct) return direct;
  if (raw.includes('lotto')) return 'dino_lotto';
  if (raw.includes('sponsor') || raw.includes('playerofthematch') || raw.includes('potm') || raw.includes('award')) return 'player_sponsor_award';
  if (raw.includes('raffle')) return 'raffle';
  if (raw.includes('event')) return 'event';
  if (raw === 'other') return 'other';
  return null;
}

/** Privacy default: "Jane S." unless the committee ticked show full name. */
export function publicWinnerName(winner: Pick<ClubWinner, 'winner_name' | 'show_full_name'>): string {
  const name = text(winner.winner_name, 160);
  if (winner.show_full_name) return name;
  const parts = name.split(' ').filter(Boolean);
  if (parts.length < 2) return parts[0] || '';
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

// ---- Bulk import -----------------------------------------------------------

/** RFC 4180 CSV, or tab-separated text pasted from a spreadsheet. */
export function parseDelimited(input: string): string[][] {
  const source = input.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const firstLine = source.split('\n', 1)[0] || '';
  const delimiter = (firstLine.match(/\t/g) || []).length > (firstLine.match(/,/g) || []).length ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { cell += '"'; index++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell === '') quoted = true;
    else if (char === delimiter) { row.push(cell); cell = ''; }
    else if (char === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((cells) => cells.some((value) => value.trim() !== ''));
}

const headerKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
function recordsFrom(input: string, aliases: Record<string, string[]>): { records: Array<Record<string, string>>; missing: string[] } {
  const rows = parseDelimited(input);
  if (!rows.length) return { records: [], missing: [] };
  const header = rows[0].map(headerKey);
  const columns: Record<string, number> = {};
  for (const [field, names] of Object.entries(aliases)) {
    const index = header.findIndex((cell) => names.includes(cell));
    if (index >= 0) columns[field] = index;
  }
  const records = rows.slice(1).map((cells) => Object.fromEntries(Object.entries(columns).map(([field, index]) => [field, (cells[index] || '').trim()])));
  return { records, missing: Object.keys(aliases).filter((field) => !(field in columns)) };
}

export const TEAM_SHEET_TEMPLATE = 'team,date,round,season,opponent,venue,start_time,player\n';
export const WINNER_TEMPLATE = 'category,title,winner,date,prize,details,round,season,sponsor,show_full_name\n';

export type ImportRowIssue = { row: number; error: string };
export type PlayerDirectoryEntry = { id: string; display_name: string };

/** Matches a typed name to a Dino Coach player: exact (case and spacing insensitive) only. */
export function matchFantasyPlayer(name: string, directory: PlayerDirectoryEntry[]): string | null {
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const hits = directory.filter((player) => player.display_name.toLowerCase().replace(/[^a-z0-9]/g, '') === key);
  return hits.length === 1 ? hits[0].id : null;
}

/**
 * One spreadsheet row per player (players may also be listed together in one
 * cell separated by semicolons). Rows are grouped by team and date. Mark
 * captain, keeper and 12th with (c), (wk) and (12th) after the name.
 */
export function parseTeamSheetImport(input: string, directory: PlayerDirectoryEntry[] = []) {
  const { records, missing } = recordsFrom(input, {
    team_name: ['team', 'teamname', 'side', 'grade'],
    match_date: ['date', 'matchdate', 'day'],
    round_label: ['round', 'roundlabel', 'rnd'],
    season_label: ['season', 'seasonlabel'],
    opponent: ['opponent', 'opposition', 'versus', 'vs'],
    venue: ['venue', 'ground', 'location'],
    start_time: ['starttime', 'start', 'time'],
    player: ['player', 'players', 'name', 'playername'],
  });
  const issues: ImportRowIssue[] = [];
  if (missing.includes('team_name') || missing.includes('match_date') || missing.includes('player')) {
    return { sheets: [], issues: [{ row: 1, error: 'The first row must include team, date and player columns. Download the template to see the layout.' }] };
  }
  if (records.length > MAX_BULK_ROWS) return { sheets: [], issues: [{ row: 1, error: `Import up to ${MAX_BULK_ROWS} rows at a time.` }] };
  const groups = new Map<string, ReturnType<typeof normaliseTeamSheet>>();
  records.forEach((record, index) => {
    const rowNumber = index + 2;
    const matchDate = parseClubDate(record.match_date);
    const team = text(record.team_name, 120);
    if (!team || !matchDate) { issues.push({ row: rowNumber, error: !team ? 'Team is empty.' : `Date "${record.match_date}" is not a valid date.` }); return; }
    const key = `${team.toLowerCase()}|${matchDate}`;
    if (!groups.has(key)) groups.set(key, normaliseTeamSheet({ ...record, team_name: team, match_date: matchDate, players: [] }));
    const sheet = groups.get(key)!;
    for (const field of ['round_label', 'season_label', 'opponent', 'venue', 'start_time'] as const) {
      if (!sheet[field] && record[field]) sheet[field] = text(record[field], field === 'venue' ? 200 : field === 'opponent' ? 160 : 60);
    }
    for (const entry of (record.player || '').split(';')) {
      const parsed = parsePlayerEntry(entry);
      if (!parsed.name) continue;
      if (sheet.players.length >= MAX_TEAM_SHEET_PLAYERS) { issues.push({ row: rowNumber, error: `${team} on ${matchDate} has more than ${MAX_TEAM_SHEET_PLAYERS} players.` }); continue; }
      sheet.players.push({ ...parsed, fantasy_player_id: matchFantasyPlayer(parsed.name, directory) });
    }
  });
  const sheets = [...groups.values()];
  sheets.forEach((sheet) => {
    const error = validateTeamSheet(sheet);
    if (error) issues.push({ row: 0, error: `${sheet.team_name} ${sheet.match_date}: ${error}` });
  });
  return { sheets, issues };
}

export function parseWinnerImport(input: string) {
  const { records, missing } = recordsFrom(input, {
    category: ['category', 'type', 'kind'],
    title: ['title', 'award', 'prizefor', 'what'],
    winner_name: ['winner', 'winnername', 'name'],
    draw_date: ['date', 'drawdate', 'drawn'],
    prize: ['prize', 'amount'],
    details: ['details', 'notes', 'number', 'winningnumber'],
    round_label: ['round', 'roundlabel'],
    season_label: ['season', 'seasonlabel'],
    sponsor_name: ['sponsor', 'sponsorname', 'sponsoredby'],
    show_full_name: ['showfullname', 'fullname', 'full'],
  });
  if (['category', 'title', 'winner_name', 'draw_date'].some((field) => missing.includes(field))) {
    return { winners: [], issues: [{ row: 1, error: 'The first row must include category, title, winner and date columns. Download the template to see the layout.' }] };
  }
  if (records.length > MAX_BULK_ROWS) return { winners: [], issues: [{ row: 1, error: `Import up to ${MAX_BULK_ROWS} rows at a time.` }] };
  const issues: ImportRowIssue[] = [];
  const winners: Array<ReturnType<typeof normaliseWinner>> = [];
  records.forEach((record, index) => {
    const winner = normaliseWinner({ ...record, show_full_name: bool(record.show_full_name) });
    const error = validateWinner(winner);
    if (error) issues.push({ row: index + 2, error });
    else winners.push(winner);
  });
  return { winners, issues };
}

// ---- Public selection --------------------------------------------------------

/** Today's date in the club's time zone (YYYY-MM-DD). */
export function clubToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/**
 * The sheet that matters this week for each team: the next match (today or
 * later); otherwise the most recent match in the last 6 days.
 */
export function currentTeamSheets<T extends Pick<TeamSheet, 'team_name' | 'match_date'>>(sheets: T[], today = clubToday()): T[] {
  const byTeam = new Map<string, T>();
  const earliest = addDays(today, -6);
  for (const sheet of sheets) {
    if (sheet.match_date < earliest) continue;
    const key = sheet.team_name.toLowerCase();
    const current = byTeam.get(key);
    const rank = (value: T) => (value.match_date >= today ? [0, value.match_date] : [1, value.match_date]);
    if (!current) { byTeam.set(key, sheet); continue; }
    const [a, aDate] = rank(sheet); const [b, bDate] = rank(current);
    const better = a !== b ? a < b : a === 0 ? aDate < bDate : aDate > bDate;
    if (better) byTeam.set(key, sheet);
  }
  return [...byTeam.values()].sort((left, right) => left.match_date.localeCompare(right.match_date) || left.team_name.localeCompare(right.team_name));
}

export type DinoSelectionBadge = { team_name: string; match_date: string; round_label: string };

/** Map of Dino Coach player id -> the current team sheet naming that player. */
export function selectionsByFantasyPlayer(sheets: Array<Pick<TeamSheet, 'team_name' | 'match_date' | 'round_label' | 'players'>>): Record<string, DinoSelectionBadge> {
  const result: Record<string, DinoSelectionBadge> = {};
  for (const sheet of sheets) {
    for (const player of sheet.players) {
      if (player.fantasy_player_id && !player.twelfth && !result[player.fantasy_player_id]) {
        result[player.fantasy_player_id] = { team_name: sheet.team_name, match_date: sheet.match_date, round_label: sheet.round_label };
      }
    }
  }
  return result;
}

export function formatClubDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  return new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

export type TeamSheetRound<T> = { key: string; title: string; season_label: string; dates: string[]; sheets: T[] };

/**
 * Groups sheets into rounds for the gallery: by season and round label, or by
 * match date when no round is given. Rounds run newest first; inside a round
 * the grade folders come first (Men's, Women's, Juniors), then teams by name.
 */
export function groupTeamSheetsByRound<T extends Pick<TeamSheet, 'team_name' | 'match_date' | 'round_label' | 'season_label'>>(sheets: T[]): TeamSheetRound<T>[] {
  const rounds = new Map<string, TeamSheetRound<T>>();
  for (const sheet of sheets) {
    const key = sheet.round_label ? `${sheet.season_label.toLowerCase()}|${sheet.round_label.toLowerCase()}` : `date|${sheet.match_date}`;
    let round = rounds.get(key);
    if (!round) { round = { key, title: sheet.round_label || formatClubDate(sheet.match_date), season_label: sheet.season_label, dates: [], sheets: [] }; rounds.set(key, round); }
    if (!round.dates.includes(sheet.match_date)) round.dates.push(sheet.match_date);
    round.sheets.push(sheet);
  }
  const groupRank = (name: string) => { const index = (TEAM_SHEET_GROUPS as readonly string[]).indexOf(name); return index < 0 ? TEAM_SHEET_GROUPS.length : index; };
  const latest = (round: TeamSheetRound<T>) => round.dates.reduce((max, date) => (date > max ? date : max), '');
  return [...rounds.values()].map((round) => ({
    ...round,
    dates: [...round.dates].sort(),
    sheets: [...round.sheets].sort((a, b) => groupRank(a.team_name) - groupRank(b.team_name) || a.team_name.localeCompare(b.team_name) || a.match_date.localeCompare(b.match_date)),
  })).sort((a, b) => latest(b).localeCompare(latest(a)) || a.title.localeCompare(b.title));
}
