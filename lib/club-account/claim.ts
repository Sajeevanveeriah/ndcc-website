// Linking an existing committee-created club record to a new sign-in.
//
// Committee staff can add club_members rows before the person has an account
// (auth_user_id is null). When that person signs in with the same verified
// email, the account claims that record instead of creating a duplicate.
// The claim only ever sets auth_user_id: membership status, review history
// and every other committee-owned field are left exactly as they were.
export type ClaimCandidate = {
  id: string;
  email: string | null;
  full_name?: string | null;
  membership_status: string | null;
  auth_user_id: string | null;
  created_at: string | null;
};

const STATUS_PRIORITY: Record<string, number> = { active: 0, pending: 1, inactive: 2 };
const normalEmail = (value: unknown) => typeof value === 'string' ? value.trim().toLowerCase() : '';
const normalName = (value: unknown) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toLowerCase() : '';
const time = (value: string | null) => { const parsed = Date.parse(value || ''); return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY; };

/**
 * Choose at most one unclaimed record to link.
 * - Only unclaimed rows whose email equals the verified email
 *   (case-insensitive, trimmed) are eligible.
 * - When a full name is known (profile save) and some candidates match it,
 *   only those are considered, so a shared family email links the right person.
 * - Active records win over pending, then inactive; the oldest record wins a tie.
 * - Every other candidate is left untouched for the committee to review.
 */
export function selectClaimCandidate(candidates: ClaimCandidate[], verifiedEmail: string, fullName?: string | null): ClaimCandidate | null {
  const email = normalEmail(verifiedEmail);
  if (!email) return null;
  let eligible = candidates.filter(row => row && typeof row.id === 'string' && row.id && row.auth_user_id === null && normalEmail(row.email) === email);
  const name = normalName(fullName);
  if (name) {
    const named = eligible.filter(row => normalName(row.full_name) === name);
    if (named.length) eligible = named;
  }
  if (!eligible.length) return null;
  return [...eligible].sort((a, b) =>
    (STATUS_PRIORITY[a.membership_status || ''] ?? 3) - (STATUS_PRIORITY[b.membership_status || ''] ?? 3)
    || time(a.created_at) - time(b.created_at)
    || a.id.localeCompare(b.id))[0];
}
