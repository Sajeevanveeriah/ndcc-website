export interface CandidateOrder {
  id: string;
  balance_due: number;
  payment_reference: string | null;
  customer_name: string;
  created_at: string;
}

function amountCents(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const rawCents = numeric * 100;
  const cents = Math.round(rawCents);
  return Number.isSafeInteger(cents) && Math.abs(rawCents - cents) < 0.000001 ? cents : null;
}

export function isExactBalanceMatch(order: CandidateOrder, transaction: ImportedTransaction): boolean {
  const balanceCents = amountCents(order.balance_due);
  const transactionCents = amountCents(transaction.amount);
  return balanceCents !== null && balanceCents > 0 && balanceCents === transactionCents;
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

  if (isExactBalanceMatch(order, transaction)) score += 40;

  const customer = (order.customer_name || '').toLowerCase();
  const payer = (transaction.payer_name || '').toLowerCase();
  if (customer && payer && (customer.includes(payer) || payer.includes(customer))) score += 15;

  const orderDate = new Date(order.created_at).getTime();
  const txDate = new Date(transaction.transaction_date).getTime();
  const diffDays = Math.abs(txDate - orderDate) / (1000 * 60 * 60 * 24);
  if (diffDays <= 7) score += 10;

  return score;
}
