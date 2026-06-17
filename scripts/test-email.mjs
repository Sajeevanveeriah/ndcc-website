import { Resend } from 'resend';

const DEFAULT_CONTACT_EMAIL = 'ndcc.secretary1@gmail.com';
const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const NAMED_EMAIL_PATTERN = /^([^<>\r\n]+) <([^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)>$/;

const args = process.argv.slice(2);
const shouldSend = args.includes('--send');
const recipient = args.find((arg) => !arg.startsWith('--')) || process.env.NDCC_TEST_EMAIL_TO || '';
const from = (process.env.RESEND_FROM_EMAIL || process.env.RESEND_FROM || '').trim();

function senderValid(value) {
  return EMAIL_PATTERN.test(value) || NAMED_EMAIL_PATTERN.test(value);
}

function maskEmail(value) {
  const [local = '', domain = ''] = value.split('@');
  if (!local || !domain) return '[invalid email]';
  return `${local.slice(0, 2)}***@${domain}`;
}

function emailHtml(title, body) {
  return `<!DOCTYPE html><html lang="en"><body style="font-family:Arial,sans-serif;"><h1>${title}</h1>${body}<p style="color:#666;font-size:12px;">NDCC website email test</p></body></html>`;
}

if (!recipient || !EMAIL_PATTERN.test(recipient)) {
  console.error('Missing valid recipient. Pass an email argument or set NDCC_TEST_EMAIL_TO.');
  process.exit(1);
}

const config = {
  resendApiKeyPresent: Boolean(process.env.RESEND_API_KEY),
  senderPresent: Boolean(from),
  senderValid: Boolean(from && senderValid(from)),
  contactToPresent: Boolean(process.env.CONTACT_TO_EMAIL),
  effectiveContactRecipient: maskEmail(process.env.CONTACT_TO_EMAIL || DEFAULT_CONTACT_EMAIL),
  recipient: maskEmail(recipient),
};

console.log('Email test configuration:', config);

if (!shouldSend) {
  console.log('Dry run only. Re-run with --send to send test emails.');
  process.exit(0);
}

if (!process.env.RESEND_API_KEY || !from || !senderValid(from)) {
  console.error('Cannot send: RESEND_API_KEY and a valid RESEND_FROM_EMAIL/RESEND_FROM are required.');
  process.exit(1);
}

const resend = new Resend(process.env.RESEND_API_KEY);

async function send(label, payload) {
  const result = await resend.emails.send(payload);
  if (result.error) {
    console.error(`${label}: failed`, { message: result.error.message });
    process.exitCode = 1;
    return;
  }
  console.log(`${label}: sent`, { id: result.data?.id });
}

await send('Admin-style contact notification test', {
  from,
  to: recipient,
  replyTo: recipient,
  subject: 'NDCC contact notification email test',
  html: emailHtml('Contact notification test', '<p>This is an admin-style contact notification test from the NDCC website CLI.</p>'),
  tags: [{ name: 'category', value: 'cli-contact-test' }],
});

await send('Acknowledgement-style test', {
  from,
  to: recipient,
  subject: 'NDCC acknowledgement email test',
  html: emailHtml('Acknowledgement test', '<p>This is an acknowledgement-style email test from the NDCC website CLI.</p>'),
  tags: [{ name: 'category', value: 'cli-ack-test' }],
});
