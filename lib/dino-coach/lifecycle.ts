export type InitialSquadState = {
  first_squad_completed_at?: string | null;
  initial_squad_due_at?: string | null;
  deleted_at?: string | null;
  is_active: boolean;
};
export function initialSquadStatus(manager: InitialSquadState) {
  if (manager.deleted_at) return 'deleted';
  if (!manager.is_active) return 'disabled';
  if (manager.first_squad_completed_at) return 'complete';
  return 'pending';
}
// Retained for safely draining jobs created before initial expiry was removed.
export function shouldCancelInitialNotice(kind: string) {
  return kind === 'reminder' || kind === 'expired';
}

// A correction to a previously locked squad must remain eligible for scoring.
export function editableSquadStatus(status?: string): 'submitted' | 'draft' {
  return status === 'submitted' || status === 'locked' ? 'submitted' : 'draft';
}
