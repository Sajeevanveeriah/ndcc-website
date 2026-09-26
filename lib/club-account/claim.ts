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
  created_by?: string | null;
  privacy_accepted_at?: string | null;
};

const normalEmail = (value: unknown) => typeof value === 'string' ? value.trim().toLowerCase() : '';
const normalName = (value: unknown) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toLowerCase() : '';

/**
 * Choose at most one unclaimed record to link, or none when the match is not
 * unambiguous. A shared family email is not proof of identity, so:
 * - Only unclaimed, never-owned committee rows (no privacy acceptance)
 *   whose email equals the verified email (case-insensitive, trimmed) are
 *   eligible.
 * - Without a name (first sign-in), a record is linked only when exactly one
 *   eligible record exists.
 * - With a name (profile save), only records whose full name matches are
 *   considered; exactly one must match.
 * - Every other case links nothing and leaves the records for the committee.
 */
export function selectClaimCandidate(candidates: ClaimCandidate[], verifiedEmail: string, fullName?: string | null): ClaimCandidate | null {
  const email = normalEmail(verifiedEmail);
  if (!email) return null;
  // Never-owned committee records only (see the route's lookup filter).
  let eligible = candidates.filter(row => row && typeof row.id === 'string' && row.id && row.auth_user_id === null && !row.privacy_accepted_at
    && (row.created_by === undefined || Boolean(row.created_by)) && normalEmail(row.email) === email);
  const name = normalName(fullName);
  if (name) eligible = eligible.filter(row => normalName(row.full_name) === name);
  return eligible.length === 1 ? eligible[0] : null;
}
