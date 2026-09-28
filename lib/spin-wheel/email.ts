import { escapeEmailHtml } from '@/lib/email-html';

// Email bodies for Spin the Wheel. Every dynamic value is escaped. The bodies
// go inside emailHtml() from lib/email.

export type SpinPassEmailInput = { name: string | null; wheelName: string; spins: number; link: string };

export function spinPassEmailSubject(input: Pick<SpinPassEmailInput, 'wheelName'>): string {
  return `Your spin link - ${input.wheelName}`;
}

export function spinPassEmailBody(input: SpinPassEmailInput): string {
  const e = escapeEmailHtml;
  const greeting = input.name ? `<p>Hi ${e(input.name)},</p>` : '<p>Hi,</p>';
  const spins = input.spins === 1 ? '1 spin' : `${e(input.spins)} spins`;
  return greeting
    + `<p>You have ${spins} waiting on the ${e(input.wheelName)}.</p>`
    + `<p><a href="${e(input.link)}" style="display:inline-block;background:#880000;color:#ffffff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:bold;">Open your spins</a></p>`
    + '<p>Keep this email: the link is how you use your spins, and anyone with it can use them.</p>';
}

export type SpinWinnerEmailInput = {
  name: string | null;
  wheelName: string;
  reference: string;
  prizeName: string;
  prizeDescription: string | null;
  claimInstructions: string | null;
};

export function spinWinnerEmailSubject(input: Pick<SpinWinnerEmailInput, 'wheelName' | 'prizeName'>): string {
  return `${input.wheelName}: ${input.prizeName}`;
}

export function spinWinnerEmailBody(input: SpinWinnerEmailInput): string {
  const e = escapeEmailHtml;
  const greeting = input.name ? `<p>Hi ${e(input.name)},</p>` : '<p>Hi,</p>';
  return greeting
    + `<p>Your spin on the ${e(input.wheelName)} landed on <strong>${e(input.prizeName)}</strong>.</p>`
    + (input.prizeDescription ? `<p>${e(input.prizeDescription)}</p>` : '')
    + `<p>Result reference: <strong>${e(input.reference)}</strong></p>`
    + (input.claimInstructions
      ? `<p><strong>How to claim</strong><br>${e(input.claimInstructions).replace(/\n/g, '<br>')}</p>`
      : '<p>Please reply to this email to arrange your prize.</p>');
}
