/** Bank details are public payment instructions, never settlement evidence. */
export function configuredBankDetails() {
  const account_name = (process.env.NDCC_BANK_ACCOUNT_NAME || '').trim();
  const bsb = (process.env.NDCC_BANK_BSB || '').trim();
  const account_number = (process.env.NDCC_BANK_ACCOUNT_NUMBER || '').trim();
  return account_name && bsb && account_number ? { account_name, bsb, account_number } : null;
}
export const BANK_TRANSFER_LABEL = 'Bank transfer selected - awaiting receipt confirmation';
export const TRANSFER_PAYABLE_STATUSES = ['unpaid', 'pending', 'pending_bank_transfer', 'part_paid'];
