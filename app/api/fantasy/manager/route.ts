/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getAuthUserFromRequest, type FantasyManagerRecord } from '@/lib/fantasy-manager-auth';
import { resolveRequestSeason } from '@/lib/fantasy-seasons';
import { getDinoCoachSettings } from '@/lib/dino-coach/server';
import { isAdultOnDate, moderateTeamName } from '@/lib/dino-coach/domain';
import { sendRegistrationEmail } from '@/lib/dino-coach/registration-email';

export const dynamic = 'force-dynamic';

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function publicManagerSelect() {
  return 'id, auth_user_id, display_name, email, team_name, is_active, team_name_status, team_name_locked, age_verified_at, rules_version_accepted' as const;
}

export async function GET(request: Request) {
  const user = await getAuthUserFromRequest(request);
  if (!user?.email) {
    console.warn('[fantasy-manager] GET without authenticated Supabase user.');
    return NextResponse.json({ success: false, error: 'Sign in is required.' }, { status: 401 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('fantasy_managers')
    .select(publicManagerSelect())
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (error) {
    console.error('[fantasy-manager] GET database error', { userId: user.id, message: error.message });
    return NextResponse.json({ success: false, error: 'Could not load your fantasy manager profile. Please try again or contact the club.' }, { status: 500 });
  }

  const season = await resolveRequestSeason(request);
  const entry = data && season ? await supabase.from('fantasy_entries')
    .select('id,status,entry_fee_cents,currency,payment_reference,paid_at')
    .eq('manager_id', data.id).eq('season_id', season.id).maybeSingle() : null;
  if (entry?.error) return NextResponse.json({ success: false, error: 'Could not load your payment status.' }, { status: 503 });
  if (entry?.data?.id) await sendRegistrationEmail(supabase, entry.data.id).catch(error => console.error('[fantasy-manager] Welcome retry deferred', error.message));
  return NextResponse.json({ success: true, user: { email: user.email }, manager: data ?? null, entry: entry?.data ?? null }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const user = await getAuthUserFromRequest(request);
  if (!user?.email) {
    console.warn('[fantasy-manager] POST without authenticated Supabase user.');
    return NextResponse.json({ success: false, error: 'Sign in is required before creating a fantasy manager profile.' }, { status: 401 });
  }

  const supabase = createServerClient();
  const existing = await supabase
    .from('fantasy_managers')
    .select(publicManagerSelect())
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (existing.error) {
    console.error('[fantasy-manager] Existing manager lookup failed', { userId: user.id, message: existing.error.message });
    return NextResponse.json({ success: false, error: 'Could not check your existing fantasy manager profile.' }, { status: 500 });
  }
  const existingManager = existing.data as any;

  const body = await request.json().catch(() => ({}));
  const season = await resolveRequestSeason(request, body);
  if (!season) return NextResponse.json({ success: false, error: 'No Dino Coach season is available.' }, { status: 404 });
  const settings = await getDinoCoachSettings(season.id);
  if (!existingManager && (!settings.public_launch_enabled || !settings.registration_open)) {
    return NextResponse.json({ success: false, error: 'Dino Coach registration is currently closed.' }, { status: 403 });
  }
  const displayName = cleanText(body.displayName || user.user_metadata?.display_name);
  const teamName = cleanText(body.teamName || user.user_metadata?.team_name);
  const dateOfBirth = cleanText(body.dateOfBirth || user.user_metadata?.date_of_birth);
  const acceptedRulesVersion = cleanText(body.rulesVersion || user.user_metadata?.rules_version);
  if (!displayName || !teamName) {
    return NextResponse.json({ success: false, error: 'Display name and team name are required.' }, { status: 400 });
  }
  if (displayName.length > 80 || teamName.length > 80) {
    return NextResponse.json({ success: false, error: 'Display name and team name must be 80 characters or fewer.' }, { status: 400 });
  }
  if (!isAdultOnDate(dateOfBirth, new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' }), settings.minimum_age)) {
    return NextResponse.json({ success: false, error: `Dino Coach is only available to participants aged ${settings.minimum_age} or older.` }, { status: 400 });
  }
  if (acceptedRulesVersion !== settings.rules_version || body.rulesAccepted !== true) {
    return NextResponse.json({ success: false, error: `Accept the current Dino Coach rules (${settings.rules_version}) to register.` }, { status: 400 });
  }
  if (existingManager?.team_name_locked && teamName !== existingManager.team_name) {
    return NextResponse.json({ success: false, error: 'This team name was replaced and locked by the league manager.' }, { status: 403 });
  }
  const moderation = moderateTeamName(teamName, settings.blocked_team_name_terms || []);

  const payload = {
    auth_user_id: user.id,
    email: user.email.toLowerCase(),
    display_name: displayName,
    team_name: teamName,
    date_of_birth: dateOfBirth,
    age_verified_at: new Date().toISOString(),
    team_name_status: moderation.status,
    rules_version_accepted: settings.rules_version,
    rules_accepted_at: new Date().toISOString(),
    is_active: existingManager ? existingManager.is_active : true,
  };

  const { data, error } = await supabase
    .from('fantasy_managers')
    .upsert(payload, { onConflict: 'auth_user_id' })
    .select(publicManagerSelect())
    .single();

  if (error) {
    console.error('[fantasy-manager] Upsert failed', { userId: user.id, code: error.code, message: error.message });
    const duplicateMessage = error.code === '23505'
      ? 'A fantasy manager already exists for this account or email. Sign in with the original account or contact the club.'
      : 'Could not save your fantasy manager profile. Please try again or contact the club.';
    return NextResponse.json({ success: false, error: duplicateMessage }, { status: error.code === '23505' ? 409 : 500 });
  }

  const manager = data as unknown as FantasyManagerRecord;
  const isNewManager = !existing.data;
  if (isNewManager || teamName !== existingManager?.team_name) {
    await supabase.from('fantasy_team_name_moderation').insert({ manager_id: manager.id, submitted_name: teamName, resulting_name: moderation.status === 'approved' ? teamName : null, status: moderation.status, reason: moderation.matchedTerm ? 'Matched a committee-managed blocked term.' : 'Passed deterministic blocked-term checks.' });
  }
  const entrySaved = await supabase.from('fantasy_entries').upsert({ manager_id: manager.id, season_id: season.id, status: 'payment_required', entry_fee_cents: settings.entry_fee_cents, currency: settings.entry_fee_currency, metadata: { product: 'Dino Coach', rules_version: settings.rules_version } }, { onConflict: 'manager_id,season_id', ignoreDuplicates: true });
  if (entrySaved.error) return NextResponse.json({ success: false, error: 'Your profile was saved, but the entry could not be created. Please save again.' }, { status: 503 });
  const entryForEmail = await supabase.from('fantasy_entries').select('id').eq('manager_id', manager.id).eq('season_id', season.id).single();
  const emailResult = entryForEmail.data
    ? await sendRegistrationEmail(supabase, entryForEmail.data.id).catch(error => {
      console.error('[fantasy-manager] Welcome queued for retry', error.message);
      return { status: 'retry_scheduled' };
    }) : { status: 'retry_scheduled' };

  console.info('[fantasy-manager] Manager profile saved', { userId: user.id, managerId: manager.id, created: isNewManager });
  return NextResponse.json({
    success: true,
    manager,
    created: isNewManager,
    email: emailResult ? { status: emailResult.status } : undefined,
  });
}
