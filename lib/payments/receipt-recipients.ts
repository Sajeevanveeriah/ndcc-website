import { FALLBACK_NOTIFICATION_RECIPIENTS } from '@/lib/notification-recipients-fallback';

// One provider message per payment. BCC keeps club routing private and avoids
// sending a second copy when a club officer is also the purchaser.
// The live club copy list is CMS-managed (event type receipt_copy, see
// lib/notification-recipients.ts); this constant is only its fallback.
export const CLUB_RECEIPT_RECIPIENTS = FALLBACK_NOTIFICATION_RECIPIENTS.receipt_copy;

export function receiptRecipients(
  purchaser: string,
  department: readonly string[] = [],
  clubCopies: readonly string[] = CLUB_RECEIPT_RECIPIENTS,
) {
  const to = purchaser.trim().toLowerCase();
  const bcc = [...new Set([...clubCopies, ...department]
    .map(email => email.trim().toLowerCase()).filter(email => email && email !== to))];
  return { to, ...(bcc.length ? { bcc } : {}) };
}
