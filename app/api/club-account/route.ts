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
  const lookup = await db.from('club_members').select('id,email,full_name,membership_status,auth_user_id,created_at')
    .is('auth_user_id', null).ilike('email', exactEmailPattern(user.email || '')).order('created_at').limit(25);
  if (lookup.error) return undefined;
  const pick = selectClaimCandidate((lookup.data || []) as ClaimCandidate[], user.email || '', fullName);
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
  if (data) return reply({ success: true, profile: data, email: user.email });
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
