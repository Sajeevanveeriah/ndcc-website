// Standalone account actions already describe the reason for the change.
// Mixed edits and squad changes still require the reviewer's own explanation.
export function defaultManagerActionReason(changes: Record<string, unknown>, hasSelection = false): string {
  if (hasSelection) return '';
  const keys = Object.keys(changes);
  if (changes.deleted === true && keys.length === 1) return 'Team deleted by the administrator.';
  if (changes.deleted === false && changes.is_active === true && keys.length === 2) return 'Team restored by the administrator.';
  if (changes.reactivate === true && changes.is_active === true && keys.length === 2) return 'Team reactivated by the club.';
  return '';
}
