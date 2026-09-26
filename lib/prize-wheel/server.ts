import 'server-only';
import { cache } from 'react';
import { createServerClient } from '@/lib/supabase-server';
import { isRaffleVisibleAt, type RaffleVisibilityRow } from '@/lib/raffle-visibility-rules';
import {
  isWheelCampaignCode,
  isWheelPubliclyCurrent,
  publicWinnerInitial,
  wheelDrawState,
  type WheelDrawRow,
  type WheelPrizeRow,
} from '@/lib/prize-wheel/rules';

// Every read here degrades to "no prize wheel" when the prize wheel migration
// is not applied yet (missing columns/tables), so the rest of the site keeps
// working exactly as before.

export type WheelCampaign = RaffleVisibilityRow & {
  id: string;
  name: string;
  code: string;
  kind: 'wheel';
  price_cents: number;
  draw_at: string;
  draw_label: string;
  sales_open_at: string;
  wheel_divisions: number;
  prize_pool_cents: number;
  created_at?: string;
};

export const WHEEL_CAMPAIGN_COLUMNS = 'id,name,code,kind,price_cents,draw_at,draw_label,sales_open_at,wheel_divisions,prize_pool_cents,active,public_visibility_mode,public_opens_at,created_at';

type Db = ReturnType<typeof createServerClient>;

export function isWheelCampaignRow(row: unknown): row is WheelCampaign {
  const value = row as Partial<WheelCampaign> | null;
  return Boolean(value && value.kind === 'wheel' && isWheelCampaignCode(value.code)
    && Number.isInteger(value.wheel_divisions) && Number.isInteger(value.price_cents)
    && typeof value.draw_at === 'string' && typeof value.sales_open_at === 'string');
}

/** Pick the public campaign: the next upcoming draw, otherwise the latest recent draw. */
export function choosePublicWheelCampaign<T extends WheelCampaign>(rows: readonly T[], now: Date = new Date()): T | null {
  const current = rows.filter(row => isWheelCampaignRow(row) && isRaffleVisibleAt(row, now) && isWheelPubliclyCurrent(row, now));
  const upcoming = current.filter(row => new Date(row.draw_at).getTime() > now.getTime())
    .sort((a, b) => new Date(a.draw_at).getTime() - new Date(b.draw_at).getTime());
  if (upcoming.length) return upcoming[0];
  return current.sort((a, b) => new Date(b.draw_at).getTime() - new Date(a.draw_at).getTime())[0] || null;
}

async function getPublicWheelCampaignUncached(): Promise<WheelCampaign | null> {
  try {
    const { data, error } = await createServerClient().from('raffle_campaigns')
      .select(WHEEL_CAMPAIGN_COLUMNS).eq('active', true).eq('kind', 'wheel');
    if (error || !Array.isArray(data)) return null;
    return choosePublicWheelCampaign(data as unknown as WheelCampaign[]);
  } catch {
    return null;
  }
}

// Request-scoped deduplication for navigation, sitemap and the page itself.
export const getPublicWheelCampaign = cache(getPublicWheelCampaignUncached);

export async function isPrizeWheelPublic(): Promise<boolean> {
  return Boolean(await getPublicWheelCampaign());
}

/**
 * Sitemap variant: throws on a failed read instead of reporting the wheel as
 * hidden, so a transient outage is never cached as "no prize wheel".
 */
export async function isPrizeWheelPublicStrict(): Promise<boolean> {
  const { data, error } = await createServerClient().from('raffle_campaigns')
    .select(WHEEL_CAMPAIGN_COLUMNS).eq('active', true).eq('kind', 'wheel');
  if (error || !Array.isArray(data)) throw new Error('Prize wheel visibility unavailable');
  return Boolean(choosePublicWheelCampaign(data as unknown as WheelCampaign[]));
}

export async function loadWheelPrizes(db: Db, campaignId: string): Promise<WheelPrizeRow[] | null> {
  const { data, error } = await db.from('raffle_wheel_prizes')
    .select('id,position,name,description,retail_value_cents,quantity').eq('campaign_id', campaignId).order('position');
  return error || !Array.isArray(data) ? null : data as WheelPrizeRow[];
}

export async function loadWheelDraws(db: Db, campaignId: string): Promise<WheelDrawRow[] | null> {
  const { data, error } = await db.from('raffle_draws')
    .select('id,prize_id,draw_number,winning_number,ticket_id,respin_reason,random_value,operator_id,created_at')
    .eq('campaign_id', campaignId).order('draw_number');
  return error || !Array.isArray(data) ? null : data as WheelDrawRow[];
}

export async function loadWheelUnavailableNumbers(db: Db, campaignId: string): Promise<number[] | null> {
  const { data, error } = await db.rpc('wheel_raffle_unavailable_numbers', { target_campaign: campaignId });
  if (error || !Array.isArray(data)) return null;
  return data.map((row: { ticket_number: number }) => row.ticket_number).filter(Number.isInteger);
}

export type PublicWheelResult = { position: number; prizeName: string; ticketNumber: number; winnerInitial: string };

/** Current winners only: prize, ticket number and first-name initial. */
export async function loadPublicWheelResults(db: Db, campaignId: string, prizes: WheelPrizeRow[]): Promise<PublicWheelResult[]> {
  const draws = await loadWheelDraws(db, campaignId);
  if (!draws?.length) return [];
  const winners = wheelDrawState(prizes, draws).prizes.filter(state => state.status === 'won' && state.latest?.ticket_id);
  if (!winners.length) return [];
  const ticketIds = winners.map(state => state.latest!.ticket_id as string);
  const { data, error } = await db.from('raffle_tickets')
    .select('id,ticket_number,raffle_orders(customer_name)').in('id', ticketIds);
  if (error || !Array.isArray(data)) return [];
  const byId = new Map(data.map((row: { id: string; ticket_number: number; raffle_orders: { customer_name: string } | { customer_name: string }[] | null }) => {
    const order = Array.isArray(row.raffle_orders) ? row.raffle_orders[0] : row.raffle_orders;
    return [row.id, { ticketNumber: row.ticket_number, winnerInitial: publicWinnerInitial(order?.customer_name) }];
  }));
  return winners.flatMap(state => {
    const ticket = byId.get(state.latest!.ticket_id as string);
    return ticket ? [{ position: state.prize.position, prizeName: state.prize.name, ...ticket }] : [];
  });
}
