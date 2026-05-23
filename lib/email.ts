import nodemailer from 'nodemailer';

const SENDER = '"NDCC Dinos" <ndcc.secretary1@gmail.com>';
const ADMIN_EMAIL = 'ndcc.secretary1@gmail.com';

function isConfigured(): boolean {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

function createTransport() {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

/**
 * Send an email to the user and a copy to the admin inbox.
 * Fails silently — email errors never block form submission success.
 */
export async function sendEmail(payload: EmailPayload): Promise<void> {
  if (!isConfigured()) {
    console.warn('Email not configured — skipping send.');
    return;
  }
  try {
    const transport = createTransport();
    await transport.sendMail({
      from: SENDER,
      to: payload.to,
      bcc: ADMIN_EMAIL,
      subject: payload.subject,
      html: payload.html,
    });
  } catch (err) {
    console.error('Email send failed:', err);
  }
}

/** Reusable HTML wrapper — NDCC branded, plain and readable. */
export function emailHtml(title: string, body: string): string {
  return `
<!DOCTYPE html>
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

/** Reusable bank transfer details block for payment emails. */
export function bankDetailsHtml(reference: string, amount?: number): string {
  const amountLine = amount != null
    ? `<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Amount</td><td style="padding:6px 0;font-size:14px;font-weight:bold;">$${amount.toFixed(2)} AUD</td></tr>`
    : '';
  return `
<div style="background:#f3f4f6;border-radius:6px;padding:20px;margin:20px 0;">
  <p style="margin:0 0 12px;font-size:14px;font-weight:bold;color:#4a0000;">Bank Transfer Payment Details</p>
  <table cellpadding="0" cellspacing="0" style="width:100%;">
    <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Account name</td><td style="padding:6px 0;font-size:14px;">${process.env.NDCC_BANK_ACCOUNT_NAME || 'NDCC'}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">BSB</td><td style="padding:6px 0;font-size:14px;">${process.env.NDCC_BANK_BSB || ''}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Account number</td><td style="padding:6px 0;font-size:14px;">${process.env.NDCC_BANK_ACCOUNT_NUMBER || ''}</td></tr>
    ${amountLine}
    <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Reference</td><td style="padding:6px 0;font-size:14px;font-weight:bold;color:#800000;">${reference}</td></tr>
  </table>
  <p style="margin:12px 0 0;font-size:12px;color:#9ca3af;">Use your reference number exactly as shown so we can match your payment.</p>
</div>`;
}
