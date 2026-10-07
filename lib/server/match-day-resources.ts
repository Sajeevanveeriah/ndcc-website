import 'server-only';
import { normaliseTeamSheet, normaliseWinner, validateTeamSheet, validateWinner, WINNER_CATEGORY_LABELS } from '@/lib/match-day';
import { TEAM_SHEET_COLUMNS, WINNER_COLUMNS } from '@/lib/server/match-day';
import type { MatchDayResource } from '@/lib/server/match-day-admin';

export const teamSheetResource: MatchDayResource = {
  resource: 'teamSheets',
  table: 'team_sheets',
  columns: TEAM_SHEET_COLUMNS,
  order: [{ column: 'match_date', ascending: false }, { column: 'team_name', ascending: true }],
  normalise: (input) => normaliseTeamSheet(input),
  validate: (row) => validateTeamSheet(row as ReturnType<typeof normaliseTeamSheet>),
  async findExisting(db, row) {
    const { data } = await db.from('team_sheets').select('id').ilike('team_name', String(row.team_name).replace(/[%_\\]/g, '\\$&')).eq('match_date', String(row.match_date)).maybeSingle();
    return data ? { id: String(data.id) } : null;
  },
  label: (row) => `${row.team_name || 'Team sheet'} ${row.match_date || ''}`.trim(),
};

export const winnerResource: MatchDayResource = {
  resource: 'clubWinners',
  table: 'club_winners',
  columns: WINNER_COLUMNS,
  order: [{ column: 'draw_date', ascending: false }, { column: 'sort_order', ascending: true }],
  normalise: (input) => normaliseWinner(input),
  validate: (row) => validateWinner(row as ReturnType<typeof normaliseWinner>),
  label: (row) => `${WINNER_CATEGORY_LABELS[row.category as keyof typeof WINNER_CATEGORY_LABELS] || 'Winner'}: ${row.title || ''}`.trim(),
};
