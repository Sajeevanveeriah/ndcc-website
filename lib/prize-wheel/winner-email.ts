import { escapeEmailHtml } from '@/lib/email-html';

export type WinnerEmailInput = {
  customerName: string;
  campaignName: string;
  prizePosition: number;
  prizeName: string;
  ticketNumber: number;
  ticketReference: string;
  drawLabel: string;
  collected: boolean;
};

export function winnerEmailSubject(input: WinnerEmailInput): string {
  return `NDCC ${input.campaignName} - you won prize ${input.prizePosition}`;
}

/** Body for emailHtml(); every dynamic value is escaped. */
export function winnerEmailBody(input: WinnerEmailInput): string {
  const e = escapeEmailHtml;
  return `<p>Hi ${e(input.customerName)},</p>`
    + `<p>Congratulations. Your ticket <strong>${e(input.ticketNumber)}</strong> (${e(input.ticketReference)}) was drawn live at ${e(input.drawLabel)} and won <strong>prize ${e(input.prizePosition)}: ${e(input.prizeName)}</strong> in the ${e(input.campaignName)}.</p>`
    + (input.collected
      ? '<p>Our records show this prize has been collected. Thank you for supporting the club.</p>'
      : '<p>Please reply to this email to arrange collection of your prize.</p>');
}
