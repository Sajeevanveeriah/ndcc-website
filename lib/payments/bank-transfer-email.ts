import 'server-only';
import { bankDetailsHtml, emailHtml, escapeEmailHtml, getTransactionalReplyTo, sendEmail, type EmailSendResult } from '@/lib/email';
import { BANK_TRANSFER_HOLD_HOURS } from '@/lib/payments/bank-transfer';

export type BankTransferInstructionKind = 'raffle' | 'dino' | 'donation';

export type BankTransferInstructions = {
  kind: BankTransferInstructionKind;
  /** Order, raffle order or Dino entry id: one message per selection. */
  sourceId: string;
  to: string;
  name: string;
  reference: string;
  amountCents: number;
  productLabel: string;
  /** Dino selections can be undone by an administrator; a new selection is a new message. */
  selectedAt?: string | null;
  /** Reverse raffle numbers held for this deposit. */
  selectedNumbers?: number[] | null;
};

/**
 * Emails the purchaser the reference, amount and bank instructions they saw
 * on screen. The idempotency key is fixed per selection, so a retried request
 * never sends a second copy. Never throws; callers treat email as best-effort.
 */
export async function sendBankTransferInstructions(input: BankTransferInstructions): Promise<EmailSendResult> {
  try {
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) return { status: 'skipped', reason: 'Invalid amount.' };
    const amount = input.amountCents / 100;
    const details = bankDetailsHtml(input.reference, amount, { recordChoiceLink: false });
    if (!details) return { status: 'skipped', reason: 'Bank details are not configured.' };
    const numbers = (input.selectedNumbers || []).filter(value => Number.isSafeInteger(value));
    const numbersHtml = numbers.length
      ? `<p>Your selected numbers: <strong>${escapeEmailHtml(numbers.join(', '))}</strong>. They are held for ${BANK_TRANSFER_HOLD_HOURS} hours. If the club has not confirmed your deposit by then, they may be released to other buyers.</p>`
      : '';
    const body = `<p>Hi ${escapeEmailHtml(input.name)},</p>
<p>You chose to pay for your ${escapeEmailHtml(input.productLabel)} by bank deposit. Please transfer <strong>$${amount.toFixed(2)} AUD</strong> using the reference below.</p>
${numbersHtml}
${details}
<p>Your payment is not complete until the club confirms the deposit has been received.</p>`;
    const selection = input.selectedAt ? Date.parse(input.selectedAt) : NaN;
    const idempotencyKey = `bank-instructions/${input.kind}/${input.sourceId}${Number.isFinite(selection) ? `/${selection}` : ''}`;
    return await sendEmail({
      to: input.to,
      replyTo: getTransactionalReplyTo(),
      subject: `Bank deposit details - ${input.reference}`,
      html: emailHtml('Bank deposit details', body),
      idempotencyKey,
      tags: [{ name: 'category', value: 'bank_transfer_instructions' }],
    });
  } catch (error) {
    return { status: 'failed', reason: error instanceof Error ? error.message : 'Bank deposit instructions could not be sent.' };
  }
}
