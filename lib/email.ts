import { Resend } from 'resend';

const FROM_ADDRESS = process.env.RESEND_FROM || 'NDCC Dinos <noreply@ndcc.com.au>';
const ADMIN_EMAIL = 'ndcc.secretary1@gmail.com';

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

function isConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

/**
 * Fire-and-forget email. Failure never blocks a form submission.
 * Every email BCCs the admin inbox automatically.
 */
export async function sendEmail(payload: EmailPayload): Promise<void> {
  if (!isConfigured()) {
    console.warn('[email] RESEND_API_KEY not set — skipping.');
    return;
  }
  try {
    await getResend().emails.send({
      from: FROM_ADDRESS,
      to: payload.to,
      bcc: ADMIN_EMAIL,
      subject: payload.subject,
      html: payload.html,
    });
  } catch (err) {
    console.error('[email] Resend failed:', err);
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
            <h1 style="margin:0 0 20px;font-size:20px;color:#4a0000;">${title}</h1>
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
    <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;width:140px;">Account name</td><td style="padding:6px 0;font-size:14px;">${process.env.NDCC_BANK_ACCOUNT_NAME || 'NDCC'}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">BSB</td><td style="padding:6px 0;font-size:14px;">${process.env.NDCC_BANK_BSB || ''}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Account number</td><td style="padding:6px 0;font-size:14px;">${process.env.NDCC_BANK_ACCOUNT_NUMBER || ''}</td></tr>
    ${amountRow}
    <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Reference</td><td style="padding:6px 0;font-size:14px;font-weight:bold;color:#800000;">${reference}</td></tr>
  </table>
  <p style="margin:12px 0 0;font-size:12px;color:#9ca3af;">Use your reference number exactly as shown so we can match your payment.</p>
</div>`;
}
