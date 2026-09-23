export type EligibilityManager = {
  is_active: boolean;
  deleted_at?: string | null;
  first_squad_completed_at?: string | null;
  initial_squad_due_at: string | null;
  age_verified_at?: string | null;
  team_name_status?: string | null;
  rules_version_accepted?: string | null;
};
export type EligibilityEntry = { status: string; is_demo?: boolean; fee_waived?: boolean } | null;
export type EligibilityIssue = { code: string; message: string };

// Keep each independent gate visible. Reactivation restores account access;
// it must never imply that a participant accepted new rules or paid an entry.
export function managerEligibilityIssues(manager: EligibilityManager, entry: EligibilityEntry, rulesVersion: string): EligibilityIssue[] {
  const issues: EligibilityIssue[] = [];
  if (manager.deleted_at) issues.push({ code: 'deleted', message: 'Your team is deleted. Contact the club to restore it.' });
  else if (!manager.is_active) issues.push({ code: 'disabled', message: 'Your account is paused. Contact the club to reactivate it.' });
  if (!manager.age_verified_at) issues.push({ code: 'age', message: 'Open My account and complete your age verification.' });
  if (!['approved', 'replaced'].includes(manager.team_name_status || '')) issues.push({ code: 'team_name', message: 'Your team name needs committee approval. Contact the club.' });
  if (manager.rules_version_accepted !== rulesVersion) issues.push({ code: 'rules', message: 'Please read and accept the updated Dino Coach rules before saving your team. Open My account to accept them.' });
  if (!entry || !(entry.status === 'paid' || entry.is_demo || entry.fee_waived)) issues.push({ code: 'payment', message: 'Your entry payment is not confirmed. Open My account to check your payment status.' });
  return issues;
}

export function teamNameStatusAfterProfileSave(previous: { team_name: string; team_name_status?: string } | null, name: string, moderatedStatus: string) {
  return previous?.team_name === name && ['approved', 'replaced', 'review_required'].includes(previous.team_name_status || '') ? previous.team_name_status! : moderatedStatus;
}
