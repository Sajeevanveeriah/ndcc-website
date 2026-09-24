import { NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/fantasy-manager-auth';
import { createServerClient } from '@/lib/supabase-server';
import { readLimitedJsonObject } from '@/lib/order-input-validation';
import { enforceRateLimit } from '@/lib/server/request-guards';
import { parseClubMember } from '@/lib/club-members';
export const dynamic = 'force-dynamic';
const fields = 'id,full_name,email,phone,member_type,membership_status,updated_at';
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function GET(request: Request) {
  const user = await getAuthUserFromRequest(request);
  if (!user?.email_confirmed_at || !user.email) return reply({ success: false, error: 'Sign in with a confirmed email to access your club account.' }, 401);
  const { data, error } = await createServerClient().from('club_members').select(fields).eq('auth_user_id', user.id).maybeSingle();
  if (error) return reply({ success: false, error: 'Your club profile could not be loaded. Please retry.' }, 503);
  return reply({ success: true, profile: data, email: user.email });
}
export async function POST(request: Request) {
  const user = await getAuthUserFromRequest(request);
  if (!user?.email_confirmed_at || !user.email) return reply({ success: false, error: 'Sign in with a confirmed email before saving your details.' }, 401);
  if (!await enforceRateLimit(`club-profile:${user.id}`, 15, 60_000)) return reply({ success: false, error: 'Please wait a minute before saving again.' }, 429);
  const body = await readLimitedJsonObject(request);
  const input = body.ok ? parseClubMember(body.value, user.email) : null;
  if (!input || !body.ok || body.value.privacyAccepted !== true) return reply({ success: false, error: 'Enter your name, a valid phone if supplied, membership interest and accept the privacy statement.' }, 400);
  // No caller-controlled ID, ownership or membership status is accepted.
  const { data, error } = await createServerClient().from('club_members').upsert({ ...input, auth_user_id: user.id, privacy_accepted_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'auth_user_id' }).select(fields).single();
  if (error) return reply({ success: false, error: 'Your details could not be saved. Please retry.' }, 503);
  return reply({ success: true, profile: data });
}
