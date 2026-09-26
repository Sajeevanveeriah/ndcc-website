import 'server-only';
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { isWheelCampaignRow, loadWheelDraws, loadWheelPrizes, loadWheelUnavailableNumbers, WHEEL_CAMPAIGN_COLUMNS, type WheelCampaign } from './server';
import type { WheelDrawRow, WheelPrizeRow } from './rules';

type Db = ReturnType<typeof createServerClient>;

export const adminReply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type WheelAdminTicket = {
  id: string; ticket_number: number; ticket_reference: string; voided_at: string | null; raffle_order_id: string;
  order: { customer_name: string; customer_email: string; status: string; payment_method: string } | null;
};

export type WheelAdminDetail = {
  campaign: WheelCampaign;
  prizes: WheelPrizeRow[];
  draws: WheelDrawRow[];
  tickets: WheelAdminTicket[];
  unavailable: number[];
  collections: Array<{ draw_id: string; collected_at: string; recorded_by: string; note: string | null; staff: { full_name: string } | null }>;
  emails: Array<{ draw_id: string; sent_at: string }>;
  operators: Record<string, string>;
};

const one = <T,>(value: T | T[] | null | undefined): T | null => Array.isArray(value) ? value[0] ?? null : value ?? null;

export async function loadWheelCampaign(db: Db, id: string): Promise<WheelCampaign | null> {
  const { data, error } = await db.from('raffle_campaigns').select(WHEEL_CAMPAIGN_COLUMNS).eq('id', id).maybeSingle();
  return !error && isWheelCampaignRow(data) ? data : null;
}

export async function loadWheelAdminDetail(db: Db, id: string): Promise<WheelAdminDetail | null> {
  const campaign = await loadWheelCampaign(db, id);
  if (!campaign) return null;
  const [prizes, draws, unavailable, ticketResult, collectionResult, emailResult] = await Promise.all([
    loadWheelPrizes(db, id),
    loadWheelDraws(db, id),
    loadWheelUnavailableNumbers(db, id),
    db.from('raffle_tickets').select('id,ticket_number,ticket_reference,voided_at,raffle_order_id,raffle_orders(customer_name,customer_email,status,payment_method)').eq('campaign_id', id).order('ticket_number'),
    db.from('raffle_wheel_collections').select('draw_id,collected_at,recorded_by,note,staff:committee_users!recorded_by(full_name),raffle_draws!inner(campaign_id)').eq('raffle_draws.campaign_id', id),
    db.from('raffle_wheel_winner_emails').select('draw_id,sent_at,raffle_draws!inner(campaign_id)').eq('raffle_draws.campaign_id', id),
  ]);
  if (!prizes || !draws || !unavailable || ticketResult.error || collectionResult.error || emailResult.error) return null;
  const tickets = (ticketResult.data || []).map((row: Record<string, unknown>) => ({
    id: String(row.id), ticket_number: Number(row.ticket_number), ticket_reference: String(row.ticket_reference),
    voided_at: (row.voided_at as string | null) ?? null, raffle_order_id: String(row.raffle_order_id),
    order: one(row.raffle_orders as WheelAdminTicket['order'] | WheelAdminTicket['order'][]),
  }));
  const operatorIds = [...new Set(draws.map(draw => draw.operator_id).filter(Boolean) as string[])];
  const operators: Record<string, string> = {};
  if (operatorIds.length) {
    const { data } = await db.from('committee_users').select('id,full_name').in('id', operatorIds);
    for (const row of data || []) operators[row.id] = row.full_name;
  }
  return {
    campaign, prizes, draws, tickets, unavailable, operators,
    collections: (collectionResult.data || []).map((row: Record<string, unknown>) => ({
      draw_id: String(row.draw_id), collected_at: String(row.collected_at), recorded_by: String(row.recorded_by),
      note: (row.note as string | null) ?? null, staff: one(row.staff as { full_name: string } | { full_name: string }[] | null),
    })),
    emails: (emailResult.data || []).map((row: Record<string, unknown>) => ({ draw_id: String(row.draw_id), sent_at: String(row.sent_at) })),
  };
}

/** Map a database rule violation to a safe operator-facing message. */
export function wheelDatabaseMessage(message: string | undefined, fallback: string): string {
  const text = String(message || '');
  const known = [
    'Prize wheel raffles drawn on the same day may not exceed $1,000 in total prizes.',
    'Prize wheel price, numbers, prizes and times are locked once sales begin.',
    'Prize wheel prizes are locked once sales begin.',
    'Prize wheel prizes must total the declared prize pool (maximum $500).',
    'A prize wheel needs between 1 prize and one prize per wheel division.',
    'Too many prize wheel campaigns on this date.',
    'The draw cannot start before the advertised draw time.',
    'The draw must happen within 8 hours or on the same day as the first sale.',
    'A card checkout may still be completing. Wait a few minutes and try again.',
    'This prize has already been drawn.',
    'Draw prizes in order: first draw wins first prize.',
    'The latest spin for this prize has a winner.',
    'There is no winner to replace for this prize.',
    'This prize has already been collected.',
    'No eligible tickets remain for this draw.',
    'Only the current winner of a prize can collect it.',
    'Prize wheel sales are closed.',
    'Prize wheel number unavailable',
    'Ticket price changed. Reload before accepting payment',
    'This sale reference was already used with different details',
  ];
  const match = known.find(item => text.includes(item));
  if (match) return match === 'Prize wheel number unavailable' ? 'One or more selected numbers are already sold or held.' : match;
  if (text.includes('raffle_campaigns_wheel_rules')) return 'The campaign breaks a small raffle rule (8 hour window, $500 prizes or the 2x-6x ticket value rule).';
  return fallback;
}
