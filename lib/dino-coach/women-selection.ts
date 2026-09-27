/** Club-confirmed section membership, never inferred from names or cricket roles.
 * Legacy function/flag names are retained for compatibility with existing clients.
 * A player recorded in both club sections represents both sections.
 */
export function womenSelectionStatus(
  selection: ReadonlyArray<{ playerId: string; positionType: string }>,
  players: ReadonlyArray<{ id: string; women_eligible?: boolean | null; men_eligible?: boolean | null }>,
  enabled: boolean,
) {
  const womenIds = new Set(players.filter(player => player.women_eligible === true).map(player => player.id));
  const menIds = new Set(players.filter(player => player.men_eligible === true).map(player => player.id));
  const selected = new Set(selection.map(pick => pick.playerId));
  const squadCount = [...selected].filter(id => womenIds.has(id)).length;
  const menCount = [...selected].filter(id => menIds.has(id)).length;
  const errors: string[] = [];
  if (enabled && (squadCount < 1 || menCount < 1)) errors.push('All teams must include at least one player from the men’s and women’s sections in the squad');
  return { squadCount, menCount, valid: errors.length === 0, errors };
}
