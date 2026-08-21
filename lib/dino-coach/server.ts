import 'server-only';
import { createServerClient } from '@/lib/supabase-server';
import { DEFAULT_SCORING_CONFIG, DEFAULT_SLOT_COUNTS, type DinoScoringConfig, type DinoSlotCounts } from './domain';

export type DinoCoachSettings = {
  season_id: string;
  brand_name: string;
  virtual_currency_name: string;
  rules_version: string;
  entry_fee_cents: number;
  entry_fee_currency: 'AUD';
  minimum_age: number;
  budget_dino_dollars: number;
  initial_price_floor_dino_dollars: number;
  initial_price_ceiling_dino_dollars: number;
  price_point_value_dino_dollars: number;
  price_changes_start_round: number;
  transfer_timezone: string;
  transfer_open_weekday: number;
  transfer_open_minute: number;
  transfer_close_weekday: number;
  transfer_close_minute: number;
  round_robin_prize_dino_dollars: number;
  squad_value_prize_label: string;
  squad_value_prize_description: string | null;
  pilot_notice: string;
  slot_counts: DinoSlotCounts;
  scoring_config: DinoScoringConfig;
  blocked_team_name_terms: string[];
  registration_open: boolean;
  team_selection_open: boolean;
  public_launch_enabled: boolean;
};

export async function getDinoCoachSettings(seasonId: string): Promise<DinoCoachSettings> {
  const { data, error } = await createServerClient().from('fantasy_dino_settings').select('*').eq('season_id', seasonId).single();
  if (error || !data) throw new Error(error?.message || 'Dino Coach settings are unavailable.');
  return {
    ...data,
    entry_fee_cents: Number(data.entry_fee_cents), minimum_age: Number(data.minimum_age),
    budget_dino_dollars: Number(data.budget_dino_dollars),
    initial_price_floor_dino_dollars: Number(data.initial_price_floor_dino_dollars),
    initial_price_ceiling_dino_dollars: Number(data.initial_price_ceiling_dino_dollars),
    price_point_value_dino_dollars: Number(data.price_point_value_dino_dollars),
    price_changes_start_round: Number(data.price_changes_start_round),
    transfer_open_weekday: Number(data.transfer_open_weekday), transfer_open_minute: Number(data.transfer_open_minute),
    transfer_close_weekday: Number(data.transfer_close_weekday), transfer_close_minute: Number(data.transfer_close_minute),
    round_robin_prize_dino_dollars: Number(data.round_robin_prize_dino_dollars),
    slot_counts: { ...DEFAULT_SLOT_COUNTS, ...(data.slot_counts || {}) },
    scoring_config: { ...DEFAULT_SCORING_CONFIG, ...(data.scoring_config || {}) },
  } as DinoCoachSettings;
}

export async function getDinoReleaseReadiness(seasonId: string) {
  const { data, error } = await createServerClient().rpc('dino_coach_release_readiness', { target_season_id: seasonId });
  if (error) throw new Error(error.message);
  return data?.[0] ?? null;
}
