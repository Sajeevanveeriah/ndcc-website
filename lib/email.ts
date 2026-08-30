import 'server-only';
import { Resend, type CreateEmailOptions, type Tag } from 'resend';
import { escapeEmailHtml } from './email-html';

export { escapeEmailHtml } from './email-html';

const DEFAULT_CONTACT_EMAIL = 'ndcc.secretary1@gmail.com';

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
  attachments?: Array<{ filename: string; content: Buffer | string; contentType?: string }>;
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

// Backwards-compatible alias for older internal callers.
export const getContactEmailConfig = getContactEmailRecipients;

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
    html: payload.html,
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
<body style="margin:0;padding:0;background:#f8f8f8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f8f8;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
        <tr>
          <td style="background:#800000;padding:24px 32px;">
            <p style="margin:0;font-size:22px;font-weight:bold;color:#ffffff;letter-spacing:2px;text-transform:uppercase;">NDCC Dinos</p>
            <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.7);">Newcomb and District Cricket Club</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <h1 style="margin:0 0 20px;font-size:20px;color:#4a0000;">${escapeEmailHtml(title)}</h1>
            ${body}
            <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">
              Newcomb and District Cricket Club &bull; Grinter Reserve, 141 Coppards Road, Moolap VIC 3224<br>
              <a href="mailto:ndcc.secretary1@gmail.com" style="color:#800000;">ndcc.secretary1@gmail.com</a>
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
  <p style="margin:12px 0 0;font-size:12px;color:#9ca3af;">Use your reference number exactly as shown so we can match your payment.</p>
</div>`;
}
