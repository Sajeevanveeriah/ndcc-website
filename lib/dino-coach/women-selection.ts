/** Club-confirmed season eligibility, never inferred from names or cricket roles. */
export function womenSelectionStatus(
  selection: ReadonlyArray<{ playerId: string; positionType: string }>,
  players: ReadonlyArray<{ id: string; women_eligible?: boolean | null }>,
  enabled: boolean,
) {
  const eligible = new Set(players.filter(player => player.women_eligible === true).map(player => player.id));
  const women = new Set(selection.filter(pick => eligible.has(pick.playerId)).map(pick => pick.playerId));
  const starters = new Set(selection.filter(pick => pick.positionType === 'starter' && eligible.has(pick.playerId)).map(pick => pick.playerId));
  const errors: string[] = [];
  if (enabled && women.size < 2) errors.push('Select at least two women in your 15-player squad.');
  if (enabled && starters.size < 1) errors.push('Select at least one woman in your playing XI.');
  return { squadCount: women.size, starterCount: starters.size, valid: errors.length === 0, errors };
}
