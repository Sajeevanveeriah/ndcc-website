// Snail racing exports for the committee: a CSV of every snail with its
// buyer and payment position, and a race card for the SnailRace game.
// Pure functions: the admin page supplies the rows it already loaded.

import { toCsv } from '@/lib/csv';
import { PAYMENT_METHOD_CHOICE_LABELS, effectivePaymentChoice } from '@/lib/payments/method-choice';
import { SNAIL_RACE_LIMITS, allocateRaces, snailRaceSetting, type SnailEntry } from './snail-race';

export type SnailExportEvent = {
  id: string;
  title: string;
  date: string;
  ticket_price?: number | string | null;
  snail_race_count?: number | null;
  snails_per_race?: number | null;
  race_sponsorship_price?: number | string | null;
};

export type SnailExportRegistration = {
  id: string;
  event_id: string;
  name: string;
  email: string;
  phone?: string | null;
  payment_status?: string | null;
  payment_reference?: string | null;
  order_id?: string | null;
  created_at: string;
  snail_entries?: SnailEntry[] | null;
  race_sponsorships?: number | null;
};

export type SnailExportOrder = {
  id: string;
  payment_status?: string | null;
  total_amount?: number | string | null;
  amount_paid?: number | string | null;
  balance_due?: number | string | null;
  deleted_at?: string | null;
  payment_method_choice?: string | null;
  bank_transfer_selected_at?: string | null;
  bar_payment_selected_at?: string | null;
};

export type SnailExportRow = {
  snail_number: number;
  snail_name: string;
  player_name: string;
  purchaser_name: string;
  purchaser_email: string;
  purchaser_phone: string;
  payment_reference: string;
  payment_method: string;
  payment_status: string;
  paid: boolean;
  order_total: string;
  amount_paid: string;
  balance_due: string;
  race_sponsorships: number;
  purchased_at: string;
};

// Registrations in these states no longer hold their snails.
const RELEASED = new Set(['cancelled', 'failed', 'refunded', 'expired']);

const money = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : '';
};

/** Snails in purchase order, numbered from 1. Cancelled or deleted orders are left out. */
export function snailExportRows(
  event: SnailExportEvent,
  registrations: SnailExportRegistration[],
  orders: SnailExportOrder[],
): SnailExportRow[] {
  const ordersById = new Map(orders.map((order) => [order.id, order]));
  const rows: SnailExportRow[] = [];
  const entries = registrations
    .filter((registration) => registration.event_id === event.id && (registration.snail_entries?.length ?? 0) > 0)
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id));
  for (const registration of entries) {
    const order = registration.order_id ? ordersById.get(registration.order_id) : undefined;
    const status = order?.payment_status || registration.payment_status || '';
    if (RELEASED.has(status) || order?.deleted_at) continue;
    const choice = order ? effectivePaymentChoice(order) : null;
    const paid = status === 'paid' || status === 'not_required';
    for (const snail of registration.snail_entries ?? []) {
      rows.push({
        snail_number: rows.length + 1,
        snail_name: snail.snail_name,
        player_name: snail.player_name,
        purchaser_name: registration.name,
        purchaser_email: registration.email,
        purchaser_phone: registration.phone || '',
        payment_reference: registration.payment_reference || '',
        payment_method: choice ? PAYMENT_METHOD_CHOICE_LABELS[choice] : 'Not stated',
        payment_status: status,
        paid,
        order_total: order ? money(order.total_amount) : '',
        amount_paid: order ? money(order.amount_paid ?? (paid ? order.total_amount : 0)) : '',
        balance_due: order ? money(order.balance_due ?? (paid ? 0 : order.total_amount)) : '',
        race_sponsorships: Number(registration.race_sponsorships) || 0,
        purchased_at: registration.created_at,
      });
    }
  }
  return rows;
}

export const SNAIL_CSV_HEADER = [
  'snail_number', 'snail_name', 'player_name', 'purchaser_name', 'purchaser_email', 'purchaser_phone',
  'payment_reference', 'payment_method', 'payment_status', 'paid', 'order_total', 'amount_paid', 'balance_due',
  'order_race_sponsorships', 'purchased_at',
];

export function snailCsv(rows: SnailExportRow[]): string {
  return toCsv([
    SNAIL_CSV_HEADER,
    ...rows.map((row) => [
      row.snail_number, row.snail_name, row.player_name, row.purchaser_name, row.purchaser_email, row.purchaser_phone,
      row.payment_reference, row.payment_method, row.payment_status, row.paid ? 'yes' : 'no', row.order_total,
      row.amount_paid, row.balance_due, row.race_sponsorships, row.purchased_at,
    ]),
  ]);
}

/** Race sponsorships per order (one row per sponsoring order). */
export function sponsorshipTotals(
  event: SnailExportEvent,
  registrations: SnailExportRegistration[],
  orders: SnailExportOrder[],
): { orders: number; races: number; paidRaces: number } {
  const ordersById = new Map(orders.map((order) => [order.id, order]));
  let ordersCount = 0;
  let races = 0;
  let paidRaces = 0;
  for (const registration of registrations) {
    const count = Number(registration.race_sponsorships) || 0;
    if (registration.event_id !== event.id || count <= 0) continue;
    const order = registration.order_id ? ordersById.get(registration.order_id) : undefined;
    const status = order?.payment_status || registration.payment_status || '';
    if (RELEASED.has(status) || order?.deleted_at) continue;
    ordersCount += 1;
    races += count;
    if (status === 'paid') paidRaces += count;
  }
  return { orders: ordersCount, races, paidRaces };
}

/**
 * Race card for the SnailRace game (names up to 24 characters, typed or
 * pasted one per lane). `races[n].names` is in lane order.
 */
export function snailRaceCard(event: SnailExportEvent, rows: SnailExportRow[], { paidOnly = false } = {}) {
  const plannedRaces = snailRaceSetting(event.snail_race_count, SNAIL_RACE_LIMITS.maxRaceCount);
  const snailsPerRace = snailRaceSetting(event.snails_per_race, SNAIL_RACE_LIMITS.maxSnailsPerRace);
  const included = paidOnly ? rows.filter((row) => row.paid) : rows;
  const races = allocateRaces(included, snailsPerRace, plannedRaces);
  return {
    format: 'ndcc-snail-race-card',
    version: 1,
    generated_at: new Date().toISOString(),
    event: { id: event.id, title: event.title, date: event.date },
    settings: { planned_races: plannedRaces, snails_per_race: snailsPerRace, paid_only: paidOnly },
    totals: { snails: included.length, races: races.length, unpaid_snails: included.filter((row) => !row.paid).length },
    note: 'Suggested card: races are filled up to the snails-per-race setting and snails are dealt across them in purchase order. More snails sold means more races.',
    races: races.map((race, index) => ({
      race: index + 1,
      names: race.map((row) => row.snail_name),
      runners: race.map((row, lane) => ({
        lane: lane + 1,
        snail_number: row.snail_number,
        snail_name: row.snail_name,
        player_name: row.player_name,
        purchaser_name: row.purchaser_name,
        paid: row.paid,
        payment_reference: row.payment_reference,
      })),
    })),
  };
}
