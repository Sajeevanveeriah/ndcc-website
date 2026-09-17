export type InitialSquadState = {
  first_squad_completed_at?: string | null;
  initial_squad_due_at: string;
  deleted_at?: string | null;
  is_active: boolean;
};
export function initialSquadStatus(manager: InitialSquadState, now = new Date()) {
  if (manager.deleted_at) return 'deleted';
  if (!manager.is_active) return 'disabled';
  if (manager.first_squad_completed_at) return 'complete';
  return new Date(manager.initial_squad_due_at).getTime() <= now.getTime() ? 'expired' : 'pending';
}
export function shouldCancelInitialNotice(kind: string, dueAt: string, manager: InitialSquadState, now = new Date()) {
  const state = initialSquadStatus(manager, now);
  return ['complete', 'deleted', 'disabled'].includes(state)
    || new Date(dueAt).getTime() !== new Date(manager.initial_squad_due_at).getTime()
    || (kind === 'reminder' && state === 'expired') || (kind === 'expired' && state !== 'expired');
}

// A correction to a previously locked squad must remain eligible for scoring.
export function editableSquadStatus(status?: string): 'submitted' | 'draft' {
  return status === 'submitted' || status === 'locked' ? 'submitted' : 'draft';
}
