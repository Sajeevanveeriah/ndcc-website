import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { getAuthUserFromRequest } from '@/lib/account/server-auth';
import { createServerClient } from '@/lib/supabase-server';
import { readLimitedJsonObject } from '@/lib/order-input-validation';
import { enforceRateLimit } from '@/lib/server/request-guards';
import { parseClubMember } from '@/lib/club-members';
import { selectClaimCandidate, type ClaimCandidate } from '@/lib/club-account/claim';
import { exactEmailPattern } from '@/lib/club-account/purchases';
export const dynamic = 'force-dynamic';
const fields = 'id,full_name,email,phone,member_type,membership_status,privacy_accepted_at,updated_at';
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
type Db = ReturnType<typeof createServerClient>;
// Link an unclaimed committee-created record with the same verified email
// instead of creating a duplicate. Only auth_user_id changes; the conditional
// update means a record claimed concurrently by someone else is never taken.
// Returns undefined when the lookup itself failed.
async function claimExistingRecord(db: Db, user: User, fullName?: string) {
  // Only records a committee member created and no account has ever owned:
  // an account-owned record always has privacy acceptance, and a record with
  // a deletion request must never pass to a new sign-in with the same email.
  const lookup = await db.from('club_members').select('id,email,full_name,membership_status,auth_user_id,created_at,created_by,privacy_accepted_at')
    .is('auth_user_id', null).is('privacy_accepted_at', null).not('created_by', 'is', null)
    .ilike('email', exactEmailPattern(user.email || '')).order('created_at').limit(25);
  if (lookup.error) return undefined;
  let candidates = (lookup.data || []) as ClaimCandidate[];
  if (candidates.length) {
    const requests = await db.from('club_account_deletion_requests').select('member_id').in('member_id', candidates.map((row) => row.id));
    // A missing table (migration not applied) means no deletion history yet.
    if (requests.error && !/club_account_deletion_requests/.test(requests.error.message || '')) return undefined;
    const deleted = new Set((requests.data || []).map((row: { member_id: string | null }) => row.member_id));
    candidates = candidates.filter((row) => !deleted.has(row.id));
  }
  const pick = selectClaimCandidate(candidates, user.email || '', fullName);
  if (!pick) return null;
  const claimed = await db.from('club_members').update({ auth_user_id: user.id, updated_at: new Date().toISOString() })
    .eq('id', pick.id).is('auth_user_id', null).select(fields).maybeSingle();
  return claimed.error ? null : claimed.data;
}
export async function GET(request: Request) {
  const user = await getAuthUserFromRequest(request);
  if (!user?.email_confirmed_at || !user.email) return reply({ success: false, error: 'Sign in with a confirmed email to access your club account.' }, 401);
  const db = createServerClient();
  const { data, error } = await db.from('club_members').select(fields).eq('auth_user_id', user.id).maybeSingle();
  if (error) return reply({ success: false, error: 'Your club profile could not be loaded. Please retry.' }, 503);
  if (data) {
    // Keep the club contact record on the confirmed sign-in email, so a
    // confirmed email change reaches committee exports and club emails.
    const confirmedEmail = user.email.trim().toLowerCase();
    if (typeof data.email === 'string' && data.email.trim().toLowerCase() !== confirmedEmail) {
      const synced = await db.from('club_members').update({ email: confirmedEmail, updated_at: new Date().toISOString() })
        .eq('auth_user_id', user.id).select(fields).maybeSingle();
      if (!synced.error && synced.data) return reply({ success: true, profile: synced.data, email: user.email });
    }
    return reply({ success: true, profile: data, email: user.email });
  }
  const claimed = await claimExistingRecord(db, user);
  return reply({ success: true, profile: claimed || null, email: user.email, ...(claimed ? { claimed: true } : {}) });
}
export async function POST(request: Request) {
  const user = await getAuthUserFromRequest(request);
  if (!user?.email_confirmed_at || !user.email) return reply({ success: false, error: 'Sign in with a confirmed email before saving your details.' }, 401);
  if (!await enforceRateLimit(`club-profile:${user.id}`, 15, 60_000)) return reply({ success: false, error: 'Please wait a minute before saving again.' }, 429);
  const body = await readLimitedJsonObject(request);
  const input = body.ok ? parseClubMember(body.value, user.email) : null;
  if (!input || !body.ok || body.value.privacyAccepted !== true) return reply({ success: false, error: 'Enter your name, a valid phone if supplied, membership interest and accept the privacy statement.' }, 400);
  const db = createServerClient();
  const owned = await db.from('club_members').select('id').eq('auth_user_id', user.id).maybeSingle();
  if (owned.error) return reply({ success: false, error: 'Your details could not be saved. Please retry.' }, 503);
  // Claim first so the upsert below updates the existing committee record.
  if (!owned.data && await claimExistingRecord(db, user, input.full_name) === undefined) return reply({ success: false, error: 'Your details could not be saved. Please retry.' }, 503);
  // No caller-controlled ID, ownership or membership status is accepted.
  const { data, error } = await db.from('club_members').upsert({ ...input, auth_user_id: user.id, privacy_accepted_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'auth_user_id' }).select(fields).single();
  if (error) return reply({ success: false, error: 'Your details could not be saved. Please retry.' }, 503);
  return reply({ success: true, profile: data });
}
