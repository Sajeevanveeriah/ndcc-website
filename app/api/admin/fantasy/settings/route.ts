import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { getDinoCoachSettings, getDinoReleaseReadiness } from '@/lib/dino-coach/server';

export const dynamic = 'force-dynamic';
async function currentSeason() { const { data, error } = await createServerClient().from('fantasy_seasons').select('id,name,slug').eq('is_current', true).single(); if (error) throw new Error(error.message); return data; }

export async function GET() {
  if (!await requirePermission('fantasy.home')) return NextResponse.json({ success: false, error: 'Admin sign in is required.' }, { status: 403 });
  try { const season = await currentSeason(); const [settings, readiness] = await Promise.all([getDinoCoachSettings(season.id), getDinoReleaseReadiness(season.id).catch(() => null)]); return NextResponse.json({ success: true, season, settings, readiness }); }
  catch (error) { return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Could not load Dino Coach settings.' }, { status: 500 }); }
}

export async function PATCH(request: Request) {
  const user = await requirePermission('fantasy.home');
  if (!user) return NextResponse.json({ success: false, error: 'Admin sign in is required.' }, { status: 403 });
  const body = await request.json().catch(() => ({})); const season = await currentSeason();
  const numeric = (key: string, minimum: number) => { const value = Number(body[key]); if (!Number.isFinite(value) || value < minimum) throw new Error(`${key} is invalid.`); return value; };
  try {
    const payload = {
      brand_name: String(body.brand_name || 'Dino Coach').trim(), rules_version: String(body.rules_version || '').trim(),
      entry_fee_cents: numeric('entry_fee_cents', 1), minimum_age: numeric('minimum_age', 18),
      notification_recipients: Array.isArray(body.notification_recipients) ? body.notification_recipients.map(String).map((v: string) => v.trim()).filter(Boolean) : [],
      budget_dino_dollars: numeric('budget_dino_dollars', 1), initial_price_floor_dino_dollars: numeric('initial_price_floor_dino_dollars', 1),
      initial_price_ceiling_dino_dollars: numeric('initial_price_ceiling_dino_dollars', 1), price_point_value_dino_dollars: numeric('price_point_value_dino_dollars', 1),
      price_changes_start_round: numeric('price_changes_start_round', 1), round_robin_prize_dino_dollars: numeric('round_robin_prize_dino_dollars', 0),
      squad_value_prize_label: String(body.squad_value_prize_label || '').trim(), squad_value_prize_description: String(body.squad_value_prize_description || '').trim() || null,
      pilot_notice: String(body.pilot_notice || '').trim(), blocked_team_name_terms: Array.isArray(body.blocked_team_name_terms) ? body.blocked_team_name_terms.map(String) : [],
      transfer_timezone: 'Australia/Melbourne', transfer_open_weekday: 1, transfer_open_minute: 540, transfer_close_weekday: 6, transfer_close_minute: 660,
      slot_counts: body.slot_counts, scoring_config: body.scoring_config, rollover_strategy: String(body.rollover_strategy || 'previous_regular_season'),
      updated_by: user.id,
    };
    if (!payload.rules_version || !payload.pilot_notice || payload.initial_price_ceiling_dino_dollars < payload.initial_price_floor_dino_dollars) throw new Error('Rules version, pilot notice and a valid floor/ceiling are required.');
    const supabase = createServerClient(); const saved = await supabase.from('fantasy_dino_settings').update(payload).eq('season_id', season.id).select().single();
    if (saved.error) throw new Error(saved.error.message);
    const flags = await supabase.rpc('set_dino_coach_launch_state', { target_season_id: season.id, launch_enabled: body.public_launch_enabled === true, registration_enabled: body.registration_open === true, selection_enabled: body.team_selection_open === true });
    if (flags.error) throw new Error(flags.error.message);
    return NextResponse.json({ success: true, settings: saved.data, readiness: await getDinoReleaseReadiness(season.id) });
  } catch (error) { return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Could not save Dino Coach settings.' }, { status: 400 }); }
}
