import { toCsv } from './csv';

export type RaffleReportOrder = {
  id: string; campaign_id: string; payment_reference: string | null;
  customer_name: string; customer_email: string; customer_phone: string | null;
  quantity: number; amount_cents: number; status: string; payment_method: string;
  created_at: string; paid_at: string | null; cash_received_at: string | null;
  cash_handed_in_at: string | null; cash_received_by_member: string | null;
  customer_email_sent_at: string | null;
  member: { full_name: string } | null; staff: { full_name: string } | null;
  raffle_tickets: Array<{ ticket_number: number; ticket_reference: string }>;
  receipt_delivery_jobs: { status: string } | Array<{ status: string }> | null;
};

export function raffleDeliveryStatus(order: RaffleReportOrder): string {
  const job = Array.isArray(order.receipt_delivery_jobs) ? order.receipt_delivery_jobs[0] : order.receipt_delivery_jobs;
  const status = job?.status;
  if (status === 'delivered' || order.customer_email_sent_at) return 'Accepted by email provider';
  if (status === 'dead_letter' || status === 'cancelled') return 'Needs attention';
  if (status === 'queued' || status === 'retry' || status === 'processing') return 'Queued';
  return order.status === 'paid' ? 'Not confirmed' : 'Not issued';
}

export function filterRaffleOrders(orders: RaffleReportOrder[], campaignId: string, search: string, status: string, method: string) {
  const query = search.trim().toLowerCase();
  return orders.filter(order => order.campaign_id === campaignId
    && (status === 'all' || order.status === status)
    && (method === 'all' || order.payment_method === method)
    && (!query || [order.customer_name, order.customer_email, order.customer_phone, order.payment_reference,
      order.member?.full_name, order.staff?.full_name, ...order.raffle_tickets.map(ticket => ticket.ticket_reference)]
      .some(value => String(value || '').toLowerCase().includes(query))));
}

export function raffleSalesSummary(orders: RaffleReportOrder[]) {
  const paid = orders.filter(order => order.status === 'paid');
  return {
    paidOrders: paid.length,
    tickets: paid.reduce((sum, order) => sum + order.raffle_tickets.length, 0),
    paidCents: paid.reduce((sum, order) => sum + order.amount_cents, 0),
    outstandingCashCents: paid.filter(order => order.payment_method === 'cash' && order.cash_received_by_member && !order.cash_handed_in_at)
      .reduce((sum, order) => sum + order.amount_cents, 0),
  };
}

export function raffleOrdersCsv(orders: RaffleReportOrder[], campaignName: string) {
  return toCsv([
    ['Campaign', 'Order ID', 'Payment reference', 'Purchaser', 'Email', 'Phone', 'Quantity', 'Total AUD', 'Status', 'Payment method', 'Ticket references', 'Collector', 'Cash handover', 'Collected at UTC', 'Handed in at UTC', 'Paid at UTC', 'Created at UTC', 'Email status'],
    ...orders.map(order => [campaignName, order.id, order.payment_reference, order.customer_name, order.customer_email, order.customer_phone,
      order.quantity, (order.amount_cents / 100).toFixed(2), order.status, order.payment_method,
      [...order.raffle_tickets].sort((a, b) => a.ticket_number - b.ticket_number).map(ticket => ticket.ticket_reference).join('; '),
      order.member?.full_name || order.staff?.full_name || '',
      order.payment_method !== 'cash' ? 'Not applicable' : order.cash_received_by_member ? (order.cash_handed_in_at ? 'Handed to club' : 'Awaiting handover') : 'Received by club',
      order.cash_received_at, order.cash_handed_in_at, order.paid_at, order.created_at, raffleDeliveryStatus(order)]),
  ]);
}

export function raffleReportFilename(code: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => parts.find(value => value.type === type)?.value || '';
  return `${part('year')}${part('month')}${part('day')}-${code.replace(/[^A-Za-z0-9-]/g, '')}-Sales-Rev00.csv`;
}

// ---- Prize wheel (small raffle drawn by spinning wheel) ----
// Records, including every draw and re-spin, must be kept for 3 years.

export type WheelReportPrize = { id: string; position: number; name: string; retail_value_cents: number; quantity: number };
export type WheelReportDraw = {
  id: string; prize_id: string; draw_number: number; winning_number: number; ticket_id: string | null;
  respin_reason: string | null; random_value?: string; operator_id?: string; created_at: string;
};
export type WheelReportTicket = { id: string; ticket_number: number; ticket_reference: string; order: { customer_name: string; customer_email: string } | null };
export type WheelReportCollection = { draw_id: string; collected_at: string; staff: { full_name: string } | null; note: string | null };

export function wheelPrizeCostCents(prizes: WheelReportPrize[]): number {
  return prizes.reduce((sum, prize) => sum + prize.retail_value_cents * prize.quantity, 0);
}

export function wheelReportSummary(orders: RaffleReportOrder[], prizes: WheelReportPrize[]) {
  const sales = raffleSalesSummary(orders);
  const prizeCostCents = wheelPrizeCostCents(prizes);
  return { ...sales, prizeCostCents, netCents: sales.paidCents - prizeCostCents };
}

export function wheelDrawsCsvRows(prizes: WheelReportPrize[], draws: WheelReportDraw[], tickets: WheelReportTicket[],
  collections: WheelReportCollection[], operators: Record<string, string> = {}) {
  const prizeById = new Map(prizes.map(prize => [prize.id, prize]));
  const ticketById = new Map(tickets.map(ticket => [ticket.id, ticket]));
  const collectionByDraw = new Map(collections.map(item => [item.draw_id, item]));
  return [
    ['Draw number', 'Drawn at UTC', 'Prize position', 'Prize', 'Prize retail value AUD', 'Winning number', 'Outcome', 'Re-spin reason',
      'Ticket reference', 'Winner', 'Winner email', 'Random source', 'Operator', 'Collected at UTC', 'Collection recorded by', 'Collection note'],
    ...[...draws].sort((a, b) => a.draw_number - b.draw_number).map(draw => {
      const prize = prizeById.get(draw.prize_id);
      const ticket = draw.ticket_id ? ticketById.get(draw.ticket_id) : null;
      const collection = collectionByDraw.get(draw.id);
      return [draw.draw_number, draw.created_at, prize?.position ?? '', prize?.name ?? '',
        prize ? ((prize.retail_value_cents * prize.quantity) / 100).toFixed(2) : '', draw.winning_number,
        draw.ticket_id ? 'Winning ticket' : 'No winner - re-spin required', draw.respin_reason || 'First spin',
        ticket?.ticket_reference || '', ticket?.order?.customer_name || '', ticket?.order?.customer_email || '',
        draw.random_value || '', (draw.operator_id && operators[draw.operator_id]) || draw.operator_id || '',
        collection?.collected_at || '', collection?.staff?.full_name || '', collection?.note || ''];
    }),
  ];
}

/** One CSV with summary, draw log and sales sections. */
export function wheelReportCsv(input: {
  campaignName: string; campaignCode: string; orders: RaffleReportOrder[]; prizes: WheelReportPrize[]; draws: WheelReportDraw[];
  tickets: WheelReportTicket[]; collections: WheelReportCollection[]; operators?: Record<string, string>;
}) {
  const summary = wheelReportSummary(input.orders, input.prizes);
  const money = (cents: number) => (cents / 100).toFixed(2);
  const sales = raffleOrdersCsv(input.orders, input.campaignName).replace(/^﻿/, '');
  return toCsv([
    ['Prize wheel report', input.campaignName, input.campaignCode],
    ['Record retention', 'Keep this report and all draw records for at least 3 years.'],
    ['Paid tickets', summary.tickets],
    ['Ticket sales AUD', money(summary.paidCents)],
    ['Prize cost (retail value) AUD', money(summary.prizeCostCents)],
    ['Net AUD', money(summary.netCents)],
    [],
    ['Draw log'],
    ...wheelDrawsCsvRows(input.prizes, input.draws, input.tickets, input.collections, input.operators),
    [],
    ['Sales'],
  ]) + sales;
}
