/** Bank details are public payment instructions, never settlement evidence. */
export function configuredBankDetails() {
  const account_name = (process.env.NDCC_BANK_ACCOUNT_NAME || '').trim();
  const bsb = (process.env.NDCC_BANK_BSB || '').trim();
  const account_number = (process.env.NDCC_BANK_ACCOUNT_NUMBER || '').trim();
  return account_name && bsb && account_number ? { account_name, bsb, account_number } : null;
}
export const BANK_TRANSFER_LABEL = 'Bank transfer selected - awaiting receipt confirmation';
export const TRANSFER_PAYABLE_STATUSES = ['unpaid', 'pending', 'pending_bank_transfer', 'part_paid'];

// Unconfirmed reverse raffle bank-deposit holds release their numbers after
// this long. Must match public.reverse_raffle_bank_hold_interval() in SQL.
export const BANK_TRANSFER_HOLD_HOURS = 48;
export const BANK_TRANSFER_HOLD_MS = BANK_TRANSFER_HOLD_HOURS * 3_600_000;

/** True when a bank-deposit selection made at `selectedAt` no longer holds numbers. */
export function bankHoldExpired(selectedAt: string | null | undefined, now = Date.now()): boolean {
  if (!selectedAt) return false;
  const selected = Date.parse(selectedAt);
  return Number.isFinite(selected) && selected < now - BANK_TRANSFER_HOLD_MS;
}

/** Shown when unconfirmed bank-deposit holds keep a buyer at the per-email cap. */
export function bankHoldLimitMessage(reference?: string | null): string {
  const held = reference ? ` (reference ${reference})` : '';
  return `You already have raffle numbers held for a bank deposit${held}. Pay using that reference, or wait for the hold to be released: unconfirmed bank deposit holds are released ${BANK_TRANSFER_HOLD_HOURS} hours after they are made. Then try again.`;
}
