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
