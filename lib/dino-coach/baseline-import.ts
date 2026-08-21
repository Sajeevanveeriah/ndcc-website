export const BASELINE_IMPORT_COLUMNS = [
  'player_name',
  'playhq_player_id',
  'source_status',
  'appearances',
  'role_neutral_points',
  'source_reference',
] as const;

export type DinoBaselineSourceStatus =
  | 'verified_playhq'
  | 'verified_no_prior_appearance'
  | 'international_manual'
  | 'international_premium';

export type DinoBaselineRosterPlayer = {
  id: string;
  displayName: string;
  playhqPlayerId: string | null;
  isInternational: boolean;
};

export type DinoBaselinePreviewRow = {
  rowNumber: number;
  playerId: string | null;
  playerDisplayName: string | null;
  submittedPlayerName: string;
  playhqPlayerId: string | null;
  sourceStatus: DinoBaselineSourceStatus | null;
  appearances: number | null;
  roleNeutralPoints: number | null;
  priorAveragePoints: number | null;
  sourceReference: string;
  identityDecision: 'stable_id' | 'unique_normalised_name' | 'ambiguous' | 'unmatched';
  errors: string[];
};

export type DinoBaselineImportPreview = {
  rows: DinoBaselinePreviewRow[];
  errors: string[];
  missingPlayerNames: string[];
  summary: {
    rowsParsed: number;
    validRows: number;
    errorRows: number;
    coveredPlayers: number;
    missingPlayers: number;
  };
};

const FINAL_STATUSES = new Set<DinoBaselineSourceStatus>([
  'verified_playhq',
  'verified_no_prior_appearance',
  'international_manual',
  'international_premium',
]);

function normalisePlayerIdentity(value: string) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const text = csvText.replace(/^\uFEFF/, '');
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (char !== '\r') cell += char;
  }
  if (quoted) throw new Error('CSV has an unterminated quoted field.');
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((items) => items.some((item) => item.trim()));
}

function parseNonNegativeInteger(value: string) {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseNonNegativePoints(value: string) {
  if (!/^\d+(?:\.\d{1,4})?$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildDinoBaselineImportPreview(
  csvText: string,
  roster: DinoBaselineRosterPlayer[],
): DinoBaselineImportPreview {
  const errors: string[] = [];
  let parsedRows: string[][] = [];
  try { parsedRows = parseCsvRows(csvText); }
  catch (error) { errors.push(error instanceof Error ? error.message : 'CSV could not be parsed.'); }
  if (!csvText.trim()) errors.push('CSV content is required.');
  if (errors.length) return emptyPreview(roster, errors);
  if (parsedRows.length < 2) return emptyPreview(roster, ['CSV must include a header row and at least one player row.']);

  const header = parsedRows[0].map((value) => value.trim());
  const missingColumns = BASELINE_IMPORT_COLUMNS.filter((column) => !header.includes(column));
  if (missingColumns.length) errors.push(`Missing required column${missingColumns.length === 1 ? '' : 's'}: ${missingColumns.join(', ')}.`);
  const indexes = new Map(header.map((column, index) => [column, index]));
  const byStableId = new Map<string, DinoBaselineRosterPlayer[]>();
  const byName = new Map<string, DinoBaselineRosterPlayer[]>();
  for (const player of roster) {
    if (player.playhqPlayerId) byStableId.set(player.playhqPlayerId, [...(byStableId.get(player.playhqPlayerId) ?? []), player]);
    const key = normalisePlayerIdentity(player.displayName);
    byName.set(key, [...(byName.get(key) ?? []), player]);
  }
  const usedPlayers = new Map<string, number>();
  const usedSourceIds = new Map<string, number>();

  const rows = parsedRows.slice(1).map((values, rowIndex): DinoBaselinePreviewRow => {
    const rowNumber = rowIndex + 2;
    const read = (column: typeof BASELINE_IMPORT_COLUMNS[number]) => {
      const index = indexes.get(column);
      return typeof index === 'number' ? String(values[index] ?? '').trim() : '';
    };
    const submittedPlayerName = read('player_name');
    const submittedSourceId = read('playhq_player_id');
    const rawStatus = read('source_status');
    const sourceReference = read('source_reference');
    const rowErrors: string[] = [];
    if (values.length !== header.length) rowErrors.push('Column count does not match the header.');

    let player: DinoBaselineRosterPlayer | null = null;
    let identityDecision: DinoBaselinePreviewRow['identityDecision'] = 'unmatched';
    const stableMatches = submittedSourceId ? byStableId.get(submittedSourceId) ?? [] : [];
    if (stableMatches.length === 1) { player = stableMatches[0]; identityDecision = 'stable_id'; }
    else if (stableMatches.length > 1) { identityDecision = 'ambiguous'; rowErrors.push('PlayHQ player ID is already linked to multiple roster players.'); }
    else {
      const nameMatches = byName.get(normalisePlayerIdentity(submittedPlayerName)) ?? [];
      if (nameMatches.length === 1) { player = nameMatches[0]; identityDecision = 'unique_normalised_name'; }
      else if (nameMatches.length > 1) { identityDecision = 'ambiguous'; rowErrors.push('Player name is ambiguous in the current roster.'); }
      else rowErrors.push('Player name does not exactly match the current roster.');
    }

    if (player?.playhqPlayerId && submittedSourceId && player.playhqPlayerId !== submittedSourceId) {
      rowErrors.push('Submitted PlayHQ player ID conflicts with the existing stable PlayHQ ID.');
    }
    if (player) {
      const priorRow = usedPlayers.get(player.id);
      if (priorRow) rowErrors.push(`Duplicate roster player; first supplied on row ${priorRow}.`);
      else usedPlayers.set(player.id, rowNumber);
    }
    if (submittedSourceId) {
      const priorRow = usedSourceIds.get(submittedSourceId);
      if (priorRow) rowErrors.push(`Duplicate PlayHQ player ID; first supplied on row ${priorRow}.`);
      else usedSourceIds.set(submittedSourceId, rowNumber);
    }

    const sourceStatus = FINAL_STATUSES.has(rawStatus as DinoBaselineSourceStatus)
      ? rawStatus as DinoBaselineSourceStatus
      : null;
    if (!sourceStatus) rowErrors.push('Source status is not an allowed final outcome.');
    const appearances = parseNonNegativeInteger(read('appearances'));
    const roleNeutralPoints = parseNonNegativePoints(read('role_neutral_points'));
    if (appearances === null) rowErrors.push('Appearances must be a non-negative whole number.');
    if (roleNeutralPoints === null) rowErrors.push('Role-neutral points must be a non-negative number with at most four decimal places.');
    if (!sourceReference) rowErrors.push('A source reference is required.');

    if (sourceStatus === 'verified_playhq') {
      if (!submittedSourceId) rowErrors.push('Verified PlayHQ history requires a PlayHQ player ID.');
      if (appearances !== null && appearances < 1) rowErrors.push('Verified PlayHQ history requires at least one appearance.');
      if (player?.isInternational) rowErrors.push('Use an international source status for an international player.');
    }
    if (sourceStatus === 'verified_no_prior_appearance') {
      if ((appearances ?? -1) !== 0 || (roleNeutralPoints ?? -1) !== 0) rowErrors.push('Verified no-prior-appearance rows require zero appearances and zero points.');
      if (player?.isInternational) rowErrors.push('Use an international source status for an international player.');
    }
    if (sourceStatus === 'international_manual') {
      if (!player?.isInternational) rowErrors.push('International manual status cannot be used for a domestic player.');
      if (appearances !== null && appearances < 1) rowErrors.push('International manual history requires at least one appearance.');
    }
    if (sourceStatus === 'international_premium') {
      if (!player?.isInternational) rowErrors.push('International premium status cannot be used for a domestic player.');
      if ((appearances ?? -1) !== 0 || (roleNeutralPoints ?? -1) !== 0) rowErrors.push('International premium rows require zero appearances and zero points.');
    }

    const priorAveragePoints = appearances && roleNeutralPoints !== null
      ? Number((roleNeutralPoints / appearances).toFixed(4))
      : 0;
    return {
      rowNumber,
      playerId: rowErrors.some((error) => /ambiguous|does not exactly match/i.test(error)) ? null : player?.id ?? null,
      playerDisplayName: player?.displayName ?? null,
      submittedPlayerName,
      playhqPlayerId: submittedSourceId || player?.playhqPlayerId || null,
      sourceStatus,
      appearances,
      roleNeutralPoints,
      priorAveragePoints,
      sourceReference,
      identityDecision,
      errors: rowErrors,
    };
  });

  const validPlayerIds = new Set(rows.filter((row) => row.errors.length === 0 && row.playerId).map((row) => row.playerId as string));
  const missingPlayerNames = roster.filter((player) => !validPlayerIds.has(player.id)).map((player) => player.displayName).sort((a, b) => a.localeCompare(b));
  return {
    rows,
    errors,
    missingPlayerNames,
    summary: {
      rowsParsed: rows.length,
      validRows: rows.filter((row) => row.errors.length === 0).length,
      errorRows: rows.filter((row) => row.errors.length > 0).length,
      coveredPlayers: validPlayerIds.size,
      missingPlayers: missingPlayerNames.length,
    },
  };
}

function emptyPreview(roster: DinoBaselineRosterPlayer[], errors: string[]): DinoBaselineImportPreview {
  return {
    rows: [],
    errors,
    missingPlayerNames: roster.map((player) => player.displayName).sort((a, b) => a.localeCompare(b)),
    summary: { rowsParsed: 0, validRows: 0, errorRows: 0, coveredPlayers: 0, missingPlayers: roster.length },
  };
}
