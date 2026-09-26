import 'server-only';
import { Resend, type CreateEmailOptions, type Tag } from 'resend';
import { escapeEmailHtml } from './email-html';
import { FALLBACK_NOTIFICATION_RECIPIENTS } from './notification-recipients-fallback';
import { getClubSettings } from './club-settings';
import { fallbackClubSettings } from './club-settings-types';

export { escapeEmailHtml } from './email-html';

const DEFAULT_CONTACT_EMAIL = FALLBACK_NOTIFICATION_RECIPIENTS.contact[0];

type EmailFooterContact = { location: string; email: string; phone: string | null };

// The footer shown before club settings existed. Used when club settings are
// unavailable so emails never lose their contact details.
const FALLBACK_FOOTER_CONTACT: EmailFooterContact = {
  location: 'Grinter Reserve, 141 Coppards Road, Moolap VIC 3224',
  email: DEFAULT_CONTACT_EMAIL,
  phone: null,
};

function emailFooterContactHtml(contact: EmailFooterContact): string {
  const email = escapeEmailHtml(contact.email);
  const phone = contact.phone ? ` &bull; ${escapeEmailHtml(contact.phone)}` : '';
  return `${escapeEmailHtml(contact.location)}<br>
              <a href="mailto:${email}" style="color:#800000;">${email}</a>${phone}`;
}

const FALLBACK_FOOTER_CONTACT_HTML = emailFooterContactHtml(FALLBACK_FOOTER_CONTACT);

async function clubFooterContact(): Promise<EmailFooterContact | null> {
  try {
    const settings = await getClubSettings();
    // getClubSettings returns the shared fallback object when the row cannot be read.
    if (settings === fallbackClubSettings) return null;
    const location = [settings.ground_name, settings.address].filter(Boolean).join(', ');
    if (!location || !settings.email || !EMAIL_PATTERN.test(settings.email)) return null;
    return { location, email: settings.email, phone: settings.phone };
  } catch {
    return null;
  }
}

/** Swap the fallback footer written by emailHtml() for the live club settings. */
async function withClubFooterContact(html: string): Promise<string> {
  if (!html.includes(FALLBACK_FOOTER_CONTACT_HTML)) return html;
  const contact = await clubFooterContact();
  return contact ? html.replace(FALLBACK_FOOTER_CONTACT_HTML, () => emailFooterContactHtml(contact)) : html;
}

let _resend: Resend | null = null;

type EmailAddress = string | string[];

export type EmailSendResult =
  | { status: 'sent'; id?: string }
  | { status: 'simulated'; reason: string }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; reason: string };

export interface EmailPayload {
  to: EmailAddress;
  subject: string;
  html: string;
  replyTo?: EmailAddress;
  cc?: EmailAddress;
  bcc?: EmailAddress;
  tags?: Tag[];
  idempotencyKey?: string;
  attachments?: Array<{ filename: string; contentType?: string } & (
    | { content: Buffer | string; path?: never }
    | { path: string; content?: never }
  )>;
}

function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

type SenderConfig = {
  address: string | null;
  source: 'RESEND_FROM_EMAIL' | 'RESEND_FROM' | 'missing';
  valid: boolean;
  preview: string | null;
  reason: string | null;
};

const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const NAMED_EMAIL_PATTERN = /^([^<>\r\n]+) <([^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)>$/;

function normalizeSenderValue(value: string): string {
  const trimmed = value.trim();
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if ((first === '"' || first === "'") && first === last) return trimmed.slice(1, -1).trim();
  return trimmed;
}

function isValidSenderAddress(value: string): boolean {
  if (EMAIL_PATTERN.test(value)) return true;

  const namedMatch = value.match(NAMED_EMAIL_PATTERN);
  return Boolean(namedMatch?.[1].trim() && EMAIL_PATTERN.test(namedMatch[2]));
}

function maskEmail(value: string): string {
  const [local = '', domain = ''] = value.split('@');
  if (!local || !domain) return '[invalid email]';
  return `${local.slice(0, 2)}***@${domain}`;
}

function maskRecipients(to: EmailAddress): string | string[] {
  return Array.isArray(to) ? to.map(maskEmail) : maskEmail(to);
}

function maskSenderPreview(value: string): string {
  const namedMatch = value.match(NAMED_EMAIL_PATTERN);
  if (!namedMatch) return maskEmail(value);

  const name = namedMatch[1].trim();
  return `${name[0] ?? '*'}*** <${maskEmail(namedMatch[2])}>`;
}

function getFromAddress(): SenderConfig {
  const candidates = [
    ['RESEND_FROM_EMAIL', process.env.RESEND_FROM_EMAIL],
    ['RESEND_FROM', process.env.RESEND_FROM],
  ] as const;

  for (const [source, rawValue] of candidates) {
    if (rawValue == null) continue;

    const address = normalizeSenderValue(rawValue);
    if (!address) continue;

    const valid = isValidSenderAddress(address);
    return {
      address: valid ? address : null,
      source,
      valid,
      preview: valid ? maskSenderPreview(address) : null,
      reason: valid ? null : `${source} must be formatted as email@example.com or Name <email@example.com>.`,
    };
  }

  return {
    address: null,
    source: 'missing',
    valid: false,
    preview: null,
    reason: 'RESEND_FROM_EMAIL/RESEND_FROM not set.',
  };
}

function hasRecipients(to: EmailAddress): boolean {
  if (Array.isArray(to)) return to.some((recipient) => recipient.trim().length > 0);
  return to.trim().length > 0;
}

function parseEmailList(value?: string): string[] {
  return (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getContactEmailRecipients() {
  const configuredTo = process.env.CONTACT_TO_EMAIL?.trim() || '';
  const effectiveRecipient = configuredTo || DEFAULT_CONTACT_EMAIL;
  return {
    contactToPresent: Boolean(configuredTo),
    contactCcPresent: parseEmailList(process.env.CONTACT_CC_EMAILS).length > 0,
    contactBccPresent: parseEmailList(process.env.CONTACT_BCC_EMAILS).length > 0,
    effectiveContactRecipient: effectiveRecipient,
    effectiveContactRecipientPreview: maskEmail(effectiveRecipient),
    cc: parseEmailList(process.env.CONTACT_CC_EMAILS),
    bcc: parseEmailList(process.env.CONTACT_BCC_EMAILS),
    fallbackUsed: !configuredTo,
  };
}

export function getTransactionalReplyTo(): string {
  const configured = String(process.env.RECEIPT_REPLY_TO_EMAIL || '').trim();
  if (EMAIL_PATTERN.test(configured)) return configured;
  const contact = getContactEmailRecipients().effectiveContactRecipient;
  return EMAIL_PATTERN.test(contact) ? contact : DEFAULT_CONTACT_EMAIL;
}

export function getEmailConfigStatus() {
  const sender = getFromAddress();
  const contact = getContactEmailRecipients();
  return {
    resendApiKeyPresent: Boolean(process.env.RESEND_API_KEY),
    resendFromPresent: sender.source !== 'missing',
    resendFromSource: sender.source,
    resendFromValid: sender.valid,
    resendFromPreview: sender.preview,
    contactToPresent: contact.contactToPresent,
    contactCcPresent: contact.contactCcPresent,
    contactBccPresent: contact.contactBccPresent,
    effectiveContactRecipientPreview: contact.effectiveContactRecipientPreview,
    contactFallbackUsed: contact.fallbackUsed,
    testMode: process.env.EMAIL_TEST_MODE === 'true',
    ready: Boolean(process.env.RESEND_API_KEY && sender.address),
    contactReady: Boolean(process.env.RESEND_API_KEY && sender.address && contact.effectiveContactRecipient),
  };
}

function validatePayload(payload: EmailPayload): string | null {
  if (!payload || !hasRecipients(payload.to)) return 'Recipient email is required.';
  if (!payload.subject?.trim()) return 'Email subject is required.';
  if (!payload.html?.trim()) return 'Email HTML body is required.';
  if (payload.idempotencyKey && payload.idempotencyKey.length > 256) return 'Email idempotency key is too long.';
  return null;
}

/**
 * Send an email through Resend when email configuration is complete.
 * Existing callers can continue passing only to, subject, and html.
 */
export async function sendEmail(payload: EmailPayload): Promise<EmailSendResult> {
  const validationError = validatePayload(payload);
  if (validationError) {
    console.warn(`[email] ${validationError} Skipping send.`);
    return { status: 'skipped', reason: validationError };
  }

  if (!process.env.RESEND_API_KEY) {
    const reason = 'RESEND_API_KEY not set.';
    console.warn(`[email] ${reason} Skipping send.`);
    return { status: 'skipped', reason };
  }

  const sender = getFromAddress();
  if (!sender.address) {
    const reason = sender.reason || 'RESEND_FROM_EMAIL/RESEND_FROM not set.';
    console.warn(`[email] ${reason} Skipping send.`);
    return { status: 'skipped', reason };
  }

  if (process.env.EMAIL_TEST_MODE === 'true') {
    console.log('[email] TEST MODE - send simulated:', {
      to: maskRecipients(payload.to),
      subject: payload.subject,
      tags: payload.tags ?? [],
    });
    return { status: 'simulated', reason: 'EMAIL_TEST_MODE is enabled; send simulated.' };
  }

  const email: CreateEmailOptions = {
    from: sender.address,
    to: payload.to,
    subject: payload.subject,
    html: await withClubFooterContact(payload.html),
    ...(payload.replyTo ? { replyTo: payload.replyTo } : {}),
    ...(payload.cc ? { cc: payload.cc } : {}),
    ...(payload.bcc ? { bcc: payload.bcc } : {}),
    ...(payload.tags ? { tags: payload.tags } : {}),
    ...(payload.attachments ? { attachments: payload.attachments } : {}),
  };
  const sendOptions = payload.idempotencyKey
    ? { idempotencyKey: payload.idempotencyKey }
    : undefined;

  try {
    const result = await getResend().emails.send(email, sendOptions);

    if (result.error) {
      const reason = result.error.message || 'Resend returned an email send error.';
      console.error('[email] Resend failed:', { name: result.error.name, message: reason });
      return { status: 'failed', reason };
    }

    return { status: 'sent', id: result.data?.id };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Unknown Resend send error.';
    console.error('[email] Resend failed:', { message: reason });
    return { status: 'failed', reason };
  }
}

export function emailHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FBF7F0;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FBF7F0;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
        <tr>
          <td style="background:#800000;padding:24px;border-bottom:5px solid #ADD8E6;">
            <p style="margin:0;font-size:22px;font-weight:bold;color:#ffffff;letter-spacing:2px;text-transform:uppercase;">NDCC Dinos</p>
            <p style="margin:4px 0 0;font-size:14px;color:#ffffff;">Newcomb and District Cricket Club</p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px;font-size:16px;line-height:1.65;color:#1f2937;">
            <h1 style="margin:0 0 20px;font-size:26px;line-height:1.2;color:#4a0000;">${escapeEmailHtml(title)}</h1>
            ${body}
            <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:14px;color:#4b5563;">
              Newcomb and District Cricket Club &bull; ${FALLBACK_FOOTER_CONTACT_HTML}
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function bankDetailsHtml(reference: string, amount?: number): string {
  if (![process.env.NDCC_BANK_ACCOUNT_NAME, process.env.NDCC_BANK_BSB, process.env.NDCC_BANK_ACCOUNT_NUMBER].every(value => value?.trim())) return '';
  const amountRow = amount != null
    ? `<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Amount</td><td style="padding:6px 0;font-size:14px;font-weight:bold;color:#800000;">$${amount.toFixed(2)} AUD</td></tr>`
    : '';
  return `
<div style="background:#f3f4f6;border-radius:6px;padding:20px;margin:20px 0;">
  <p style="margin:0 0 12px;font-size:14px;font-weight:bold;color:#4a0000;">Bank Transfer Payment Details</p>
  <table cellpadding="0" cellspacing="0" style="width:100%;">
    <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;width:140px;">Account name</td><td style="padding:6px 0;font-size:14px;">${escapeEmailHtml(process.env.NDCC_BANK_ACCOUNT_NAME || 'NDCC')}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">BSB</td><td style="padding:6px 0;font-size:14px;">${escapeEmailHtml(process.env.NDCC_BANK_BSB || '')}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Account number</td><td style="padding:6px 0;font-size:14px;">${escapeEmailHtml(process.env.NDCC_BANK_ACCOUNT_NUMBER || '')}</td></tr>
    ${amountRow}
    <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Reference</td><td style="padding:6px 0;font-size:14px;font-weight:bold;color:#800000;">${escapeEmailHtml(reference)}</td></tr>
  </table>
  <p style="margin:12px 0 0;font-size:14px;color:#4b5563;">Use your reference number exactly as shown so we can match your payment. Bank deposits remain unconfirmed until the club records receipt.</p>
  <p style="margin:12px 0 0;font-size:14px;"><a href="https://ndcc.com.au/pay-balance?reference=${encodeURIComponent(reference)}">Record your bank transfer choice</a> using your order reference and email.</p>
</div>`;
}

