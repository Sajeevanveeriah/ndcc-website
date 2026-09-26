export type MemberPurchase = {
  id: string; reference: string; category: string; created_at: string;
  items: Array<{ name: string; quantity: number }>;
  total: number | null; paid: number | null; balance: number | null;
  payment_status: string; order_status: string; processed: boolean; can_pay: boolean;
  bank_transfer_selected: boolean;
  tickets: Array<{ number: number; reference: string }>;
};
// Escape LIKE metacharacters so a verified email can only match itself.
export const exactEmailPattern = (email: string) => email.trim().replace(/[\\%_]/g, char => `\\${char}`);
function amount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
export function memberPurchase(row: Record<string, unknown>, raffle = false): MemberPurchase {
  const total = amount(raffle ? row.amount_cents : row.total_amount);
  const status = String(raffle ? row.status : row.payment_status || 'unknown');
  const orderStatus = String(row.order_status || 'submitted');
  const balance = raffle ? null : amount(row.balance_due);
  return {
    id: String(row.id), reference: String(row.payment_reference || ''),
    category: raffle ? 'raffle' : String(row.order_category || 'other'), created_at: String(row.created_at),
    items: raffle ? [{ name: 'Raffle tickets', quantity: Number(row.quantity) }] : Array.isArray(row.items)
      ? row.items.map(item => ({ name: String(item?.name || 'Item'), quantity: Number(item?.quantity || 0) })) : [],
    total: total === null ? null : raffle ? total / 100 : total,
    paid: raffle ? status === 'paid' && total !== null ? total / 100 : null : amount(row.amount_paid),
    balance, payment_status: status, order_status: orderStatus, processed: row.processed === true,
    bank_transfer_selected: Boolean(row.bank_transfer_selected_at),
    can_pay: raffle ? Boolean(row.bank_transfer_selected_at) && status === 'pending_payment' : balance !== null && balance > 0
      && ['unpaid', 'part_paid', 'pending_bank_transfer', 'pending'].includes(status) && orderStatus !== 'cancelled',
    tickets: raffle && status === 'paid' && Array.isArray(row.raffle_tickets)
      ? row.raffle_tickets.map(ticket => ({ number: Number(ticket.ticket_number), reference: String(ticket.ticket_reference) })) : [],
  };
}
