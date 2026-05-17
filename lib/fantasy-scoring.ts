export const FANTASY_IMPORT_COLUMNS = [
  'round_number',
  'match_date',
  'opponent',
  'player_name',
  'runs',
  'wickets',
  'maidens',
  'catches',
  'runouts',
  'stumpings',
  'ducks',
  'not_out',
  'player_of_match',
] as const;

export type FantasyImportColumn = (typeof FANTASY_IMPORT_COLUMNS)[number];

export type FantasyPlayerLookup = {
  id: string;
  display_name: string;
};

export type FantasyRoundLookup = {
  id: string;
  round_number: number;
  name?: string | null;
};

export type FantasyScoringRule = {
  key: string;
  points: number | string;
  enabled: boolean;
};

export type FantasyStatLine = {
  round_number: number;
  match_date: string;
  opponent: string;
  player_name: string;
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

export type FantasyImportPreviewRow = {
  rowNumber: number;
  raw: Record<FantasyImportColumn, string>;
  parsed: FantasyStatLine | null;
  playerId: string | null;
  playerDisplayName: string | null;
  roundId: string | null;
  roundName: string | null;
  points: number;
  errors: string[];
};

export type FantasyImportPreview = {
  columns: readonly FantasyImportColumn[];
  rows: FantasyImportPreviewRow[];
  summary: {
    rowsParsed: number;
    validRows: number;
    errorRows: number;
    matchedPlayers: number;
    matchedRounds: number;
    totalPreviewPoints: number;
  };
  errors: string[];
};

const NUMBER_COLUMNS: FantasyImportColumn[] = [
  'round_number',
  'runs',
  'wickets',
  'maidens',
  'catches',
  'runouts',
  'stumpings',
  'ducks',
];

const STAT_NUMBER_COLUMNS: Array<keyof Pick<FantasyStatLine, 'runs' | 'wickets' | 'maidens' | 'catches' | 'runouts' | 'stumpings' | 'ducks'>> = [
  'runs',
  'wickets',
  'maidens',
  'catches',
  'runouts',
  'stumpings',
  'ducks',
];

function normaliseLookup(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  const text = csvText.replace(/^\uFEFF/, '');

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') {
      cell += char;
    }
  }

  if (inQuotes) {
    throw new Error('CSV has an unterminated quoted field.');
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((items) => items.some((item) => item.trim() !== ''));
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseBoolean(value: string) {
  const normalised = value.trim().toLowerCase();
  if (normalised === 'true') return true;
  if (normalised === 'false') return false;
  return null;
}

function parseInteger(value: string) {
  if (!/^\d+$/.test(value.trim())) return null;
  return Number(value.trim());
}

export function calculateFantasyPoints(statLine: FantasyStatLine, rules: FantasyScoringRule[]) {
  const enabledRules = new Map(
    rules
      .filter((rule) => rule.enabled)
      .map((rule) => [rule.key, Number(rule.points)]),
  );

  let total = 0;
  for (const key of STAT_NUMBER_COLUMNS) {
    const points = enabledRules.get(key);
    if (typeof points === 'number' && Number.isFinite(points)) {
      total += statLine[key] * points;
    }
  }

  const notOutBonus = enabledRules.get('not_out_bonus');
  if (statLine.not_out && typeof notOutBonus === 'number' && Number.isFinite(notOutBonus)) {
    total += notOutBonus;
  }

  const playerOfMatchBonus = enabledRules.get('player_of_match_bonus');
  if (statLine.player_of_match && typeof playerOfMatchBonus === 'number' && Number.isFinite(playerOfMatchBonus)) {
    total += playerOfMatchBonus;
  }

  return total;
}

export function buildFantasyImportPreview({
  csvText,
  players,
  rounds,
  scoringRules,
}: {
  csvText: string;
  players: FantasyPlayerLookup[];
  rounds: FantasyRoundLookup[];
  scoringRules: FantasyScoringRule[];
}): FantasyImportPreview {
  const errors: string[] = [];
  let csvRows: string[][] = [];

  try {
    csvRows = parseCsvRows(csvText);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : 'CSV could not be parsed.');
  }

  if (!csvText.trim()) {
    errors.push('CSV content is required.');
  }

  if (errors.length > 0) {
    return emptyPreview(errors);
  }

  if (csvRows.length < 2) {
    errors.push('CSV must include a header row and at least one data row.');
    return emptyPreview(errors);
  }

  const header = csvRows[0].map((column) => column.trim());
  const missingColumns = FANTASY_IMPORT_COLUMNS.filter((column) => !header.includes(column));
  if (missingColumns.length > 0) {
    errors.push(`Missing required column${missingColumns.length === 1 ? '' : 's'}: ${missingColumns.join(', ')}.`);
  }

  const indexByColumn = new Map(header.map((column, index) => [column, index]));
  const playerByName = new Map(players.map((player) => [normaliseLookup(player.display_name), player]));
  const roundByNumber = new Map(rounds.map((round) => [round.round_number, round]));
  const duplicateTracker = new Map<string, number>();

  const rows = csvRows.slice(1).map((values, index) => {
    const rowNumber = index + 2;
    const raw = Object.fromEntries(
      FANTASY_IMPORT_COLUMNS.map((column) => {
        const columnIndex = indexByColumn.get(column);
        return [column, typeof columnIndex === 'number' ? String(values[columnIndex] ?? '').trim() : ''];
      }),
    ) as Record<FantasyImportColumn, string>;
    const rowErrors: string[] = [];

    if (values.length !== header.length) {
      rowErrors.push('column count does not match header');
    }

    const parsedNumbers = new Map<FantasyImportColumn, number>();
    for (const column of NUMBER_COLUMNS) {
      const value = parseInteger(raw[column]);
      if (value === null) {
        rowErrors.push(`invalid number: ${column}`);
      } else {
        parsedNumbers.set(column, value);
      }
    }

    if (!isValidDate(raw.match_date)) {
      rowErrors.push('invalid date');
    }

    const notOut = parseBoolean(raw.not_out);
    const playerOfMatch = parseBoolean(raw.player_of_match);
    if (notOut === null) rowErrors.push('invalid boolean: not_out');
    if (playerOfMatch === null) rowErrors.push('invalid boolean: player_of_match');

    if (!raw.opponent) rowErrors.push('opponent is required');
    if (!raw.player_name) rowErrors.push('missing player');

    const player = raw.player_name ? playerByName.get(normaliseLookup(raw.player_name)) : undefined;
    if (raw.player_name && !player) rowErrors.push('missing player');

    const roundNumber = parsedNumbers.get('round_number');
    const round = typeof roundNumber === 'number' ? roundByNumber.get(roundNumber) : undefined;
    if (typeof roundNumber === 'number' && !round) rowErrors.push('missing round');

    const duplicateKey = [raw.round_number, raw.match_date, normaliseLookup(raw.opponent), normaliseLookup(raw.player_name)].join('|');
    const firstDuplicateRow = duplicateTracker.get(duplicateKey);
    if (firstDuplicateRow) {
      rowErrors.push(`duplicate row: matches row ${firstDuplicateRow}`);
    } else {
      duplicateTracker.set(duplicateKey, rowNumber);
    }

    const parsed = buildParsedLine(raw, parsedNumbers, notOut, playerOfMatch);
    const points = parsed && rowErrors.length === 0 ? calculateFantasyPoints(parsed, scoringRules) : 0;

    return {
      rowNumber,
      raw,
      parsed,
      playerId: player?.id ?? null,
      playerDisplayName: player?.display_name ?? null,
      roundId: round?.id ?? null,
      roundName: round?.name ?? null,
      points,
      errors: rowErrors,
    } satisfies FantasyImportPreviewRow;
  });

  return {
    columns: FANTASY_IMPORT_COLUMNS,
    rows,
    summary: {
      rowsParsed: rows.length,
      validRows: rows.filter((row) => row.errors.length === 0).length,
      errorRows: rows.filter((row) => row.errors.length > 0).length,
      matchedPlayers: new Set(rows.filter((row) => row.playerId).map((row) => row.playerId)).size,
      matchedRounds: new Set(rows.filter((row) => row.roundId).map((row) => row.roundId)).size,
      totalPreviewPoints: rows.reduce((total, row) => total + row.points, 0),
    },
    errors,
  };
}

function buildParsedLine(
  raw: Record<FantasyImportColumn, string>,
  parsedNumbers: Map<FantasyImportColumn, number>,
  notOut: boolean | null,
  playerOfMatch: boolean | null,
): FantasyStatLine | null {
  const requiredNumbers = NUMBER_COLUMNS.map((column) => parsedNumbers.get(column));
  if (requiredNumbers.some((value) => typeof value !== 'number') || notOut === null || playerOfMatch === null || !isValidDate(raw.match_date)) {
    return null;
  }

  return {
    round_number: parsedNumbers.get('round_number') as number,
    match_date: raw.match_date,
    opponent: raw.opponent,
    player_name: raw.player_name,
    runs: parsedNumbers.get('runs') as number,
    wickets: parsedNumbers.get('wickets') as number,
    maidens: parsedNumbers.get('maidens') as number,
    catches: parsedNumbers.get('catches') as number,
    runouts: parsedNumbers.get('runouts') as number,
    stumpings: parsedNumbers.get('stumpings') as number,
    ducks: parsedNumbers.get('ducks') as number,
    not_out: notOut,
    player_of_match: playerOfMatch,
  };
}

function emptyPreview(errors: string[]): FantasyImportPreview {
  return {
    columns: FANTASY_IMPORT_COLUMNS,
    rows: [],
    summary: {
      rowsParsed: 0,
      validRows: 0,
      errorRows: 0,
      matchedPlayers: 0,
      matchedRounds: 0,
      totalPreviewPoints: 0,
    },
    errors,
  };
}
