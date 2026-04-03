export interface CandidateOrder {
  id: string;
  total_amount: number;
  payment_reference: string | null;
  customer_name: string;
  created_at: string;
}

export interface ImportedTransaction {
  id: string;
  amount: number;
  transaction_reference: string;
  payer_name: string;
  transaction_date: string;
}

export function scoreOrderMatch(order: CandidateOrder, transaction: ImportedTransaction): number {
  let score = 0;

  const orderRef = (order.payment_reference || '').toLowerCase();
  const txRef = (transaction.transaction_reference || '').toLowerCase();
  if (orderRef && txRef && txRef.includes(orderRef)) score += 100;

  if (Number(order.total_amount) === Number(transaction.amount)) score += 40;

  const customer = (order.customer_name || '').toLowerCase();
  const payer = (transaction.payer_name || '').toLowerCase();
  if (customer && payer && (customer.includes(payer) || payer.includes(customer))) score += 15;

  const orderDate = new Date(order.created_at).getTime();
  const txDate = new Date(transaction.transaction_date).getTime();
  const diffDays = Math.abs(txDate - orderDate) / (1000 * 60 * 60 * 24);
  if (diffDays <= 7) score += 10;

  return score;
}
