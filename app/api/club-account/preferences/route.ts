import { NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/account/server-auth';
import { createServerClient } from '@/lib/supabase-server';
import { readLimitedJsonObject } from '@/lib/order-input-validation';
import { enforceRateLimit } from '@/lib/server/request-guards';
import { emptyPreferences, parsePreferences } from '@/lib/club-account/preferences';
export const dynamic = 'force-dynamic';
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const unavailable = () => reply({ success: false, error: 'Your preferences could not be loaded or saved. Please retry.' }, 503);
async function member(request: Request) {
  const user = await getAuthUserFromRequest(request);
  if (!user?.email_confirmed_at || !user.email) return { user: null, id: null };
  const result = await createServerClient().from('club_members').select('id').eq('auth_user_id', user.id).maybeSingle();
  if (result.error) throw result.error;
  return { user, id: result.data?.id as string | undefined };
}
export async function GET(request: Request) {
  try {
    const identity = await member(request);
    if (!identity.user) return reply({ success: false, error: 'Sign in with a confirmed email.' }, 401);
    if (!identity.id) return reply({ success: true, preferences: emptyPreferences(), profile_required: true });
    const { data, error } = await createServerClient().from('club_account_preferences')
      .select('interests,volunteering,email_updates,updated_at').eq('member_id', identity.id).maybeSingle();
    if (error) return unavailable();
    return reply({ success: true, preferences: data || emptyPreferences(), profile_required: false });
  } catch { return unavailable(); }
}
export async function PUT(request: Request) {
  try {
    const identity = await member(request);
    if (!identity.user) return reply({ success: false, error: 'Sign in with a confirmed email.' }, 401);
    if (!identity.id) return reply({ success: false, error: 'Save your contact details before choosing your interests.' }, 409);
    if (!await enforceRateLimit(`club-preferences:${identity.user.id}`, 15, 60_000)) return reply({ success: false, error: 'Please wait a minute before saving again.' }, 429);
    const body = await readLimitedJsonObject(request, 4096);
    const input = body.ok ? parsePreferences(body.value) : null;
    if (!input) return reply({ success: false, error: 'Choose valid interests, volunteering options and an email preference.' }, 400);
    const { data, error } = await createServerClient().from('club_account_preferences')
      .upsert({ ...input, member_id: identity.id, updated_at: new Date().toISOString() }, { onConflict: 'member_id' })
      .select('interests,volunteering,email_updates,updated_at').single();
    if (error) return unavailable();
    return reply({ success: true, preferences: data });
  } catch { return unavailable(); }
}
