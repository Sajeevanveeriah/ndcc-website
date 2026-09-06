// One provider message per payment. BCC keeps club routing private and avoids
// sending a second copy when a club officer is also the purchaser.
export const CLUB_RECEIPT_RECIPIENTS = [
  'ndcc.secretary1@gmail.com',
  'ndsc.cricket@gmail.com',
] as const;

export function receiptRecipients(purchaser: string, department: readonly string[] = []) {
  const to = purchaser.trim().toLowerCase();
  const bcc = [...new Set([...CLUB_RECEIPT_RECIPIENTS, ...department]
    .map(email => email.trim().toLowerCase()).filter(email => email && email !== to))];
  return { to, ...(bcc.length ? { bcc } : {}) };
}
