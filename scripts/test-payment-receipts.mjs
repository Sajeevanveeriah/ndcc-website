import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  buildPaymentReceiptFilename,
  buildPaymentReceiptPdf,
} from '../lib/payment-receipt-pdf.ts';

const repoRoot = path.resolve(import.meta.dirname, '..');
const sample = {
  purchaserName: 'Sajeevan Veeriah',
  purchaserEmail: 'sajeevanveeriah@gmail.com',
  paymentDate: '2026-08-23T08:30:00.000Z',
  issuedDate: '2026-08-23T08:31:00.000Z',
  amountCents: 7500,
  paymentType: 'Social Membership',
  paymentMethod: 'Stripe Checkout',
  reference: 'NDCC-TEST-20260823',
  descriptionLines: ['1 x 2026/2027 Social Membership'],
  isTest: true,
};

const pdf = await buildPaymentReceiptPdf(sample);
assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-');
assert.match(pdf.toString('latin1'), /\/MediaBox \[0 0 595\.32 841\.92\]/);
assert.match(pdf.toString('latin1'), /\/Filter \/DCTDecode/);
assert.match(pdf.toString('latin1'), /%%EOF\s*$/);
assert.ok(pdf.length > 100_000, 'Receipt should contain a high-resolution rendered page.');
assert.equal(
  buildPaymentReceiptFilename(sample),
  '20260823-NDCC-Payment-Receipt-NDCC-TEST-20260823.pdf',
);
assert.equal(
  buildPaymentReceiptFilename({ paymentDate: sample.paymentDate, reference: 'Order / unsafe ! ref' }),
  '20260823-NDCC-Payment-Receipt-Order-unsafe-ref.pdf',
);

await assert.rejects(
  buildPaymentReceiptPdf({ ...sample, amountCents: 0 }),
  /positive whole number of cents/,
);
await assert.rejects(
  buildPaymentReceiptPdf({ ...sample, descriptionLines: [] }),
  /payment description is required/,
);
await assert.rejects(
  buildPaymentReceiptPdf({ ...sample, paymentDate: 'not-a-date' }),
  /valid date/,
);

if (process.env.RECEIPT_TEST_OUTPUT) {
  await writeFile(path.resolve(process.env.RECEIPT_TEST_OUTPUT), pdf);
}

const [webhook, receipts, delivery, dinoReceipt, raffle, raffleTicket, generator, fontConfig, bundledFont] = await Promise.all([
  readFile(path.join(repoRoot, 'app/api/stripe/webhook/route.ts'), 'utf8'),
  readFile(path.join(repoRoot, 'lib/payment-receipts.ts'), 'utf8'),
  readFile(path.join(repoRoot, 'lib/payments/receipt-delivery.ts'), 'utf8'),
  readFile(path.join(repoRoot, 'lib/dino-coach/payment-receipt.ts'), 'utf8'),
  readFile(path.join(repoRoot, 'lib/raffle-email.ts'), 'utf8'),
  readFile(path.join(repoRoot, 'lib/raffle-ticket.ts'), 'utf8'),
  readFile(path.join(repoRoot, 'lib/payment-receipt-pdf.ts'), 'utf8'),
  readFile(path.join(repoRoot, 'public/fonts/fonts.conf'), 'utf8'),
  readFile(path.join(repoRoot, 'public/fonts/NotoSans-Regular.ttf')),
]);

assert.match(webhook, /enqueuePaymentReceiptJob/);
assert.match(webhook, /attemptPaymentReceiptDelivery/);
assert.match(webhook, /queueAndAttemptReceipt\(supabase, 'order_payment', paymentId\)/);
assert.match(webhook, /queueAndAttemptReceipt\(supabase, 'raffle_order', order\.id\)/);
assert.match(webhook, /queueAndAttemptReceipt\(supabase, 'dino_entry', entry\.id\)/);
assert.doesNotMatch(webhook, /sendOrderPaymentReceiptForPayment|sendPaidRaffleEmails|buildPaymentReceiptPdf/);
assert.ok(
  webhook.indexOf('constructEvent(') < webhook.indexOf('handleDinoCoachCheckout(event)'),
  'Stripe signature verification must happen before any payment handler runs.',
);
assert.match(delivery, /sendOrderPaymentReceiptForPayment/);
assert.match(delivery, /sendPaidRaffleEmails/);
assert.match(delivery, /sendDinoCoachPaymentReceiptForEntry/);
assert.match(delivery, /finish_payment_receipt_job/);
assert.match(receipts, /website-payment-receipt-\$\{paymentId\}/);
assert.match(receipts, /customer_receipt_sent_at/);
assert.match(receipts, /membership: 'Social Membership'/);
assert.match(receipts, /event: 'Event Registration'/);
assert.match(receipts, /paymentKind === 'partial'/);
assert.match(dinoReceipt, /dino-coach-receipt-\$\{entryId\}/);
assert.match(dinoReceipt, /customer_receipt_sent_at/);
assert.match(dinoReceipt, /payment_receipt_sent_at/);
assert.match(raffle, /contentType: 'application\/pdf'/);
assert.match(raffle, /payment receipt are attached/);
assert.match(raffle, /raffle-customer-receipt-\$\{orderId\}/);
assert.match(raffleTicket, /getServerSharp/);
assert.doesNotMatch(raffleTicket, /import sharp from 'sharp'/);
assert.doesNotMatch(generator, /Player Sponsorship|sponsorship may|business expense/i);
assert.match(generator, /public\/fonts\/NotoSans-Regular\.ttf/);
assert.match(generator, /getServerSharp/);
assert.doesNotMatch(generator, /import sharp from 'sharp'/);
assert.match(fontConfig, /Noto Sans/);
assert.ok(bundledFont.length > 20_000, 'Bundled receipt font should not be empty or truncated.');
assert.match(generator, /not currently registered for GST/);
assert.match(generator, /not a tax-deductible donation receipt/i);
assert.match(
  generator,
  /y="\$\{1760 \+ index \* 54\}" class="value description"/,
  'Payment descriptions must start below the section divider.',
);
assert.match(
  generator,
  /<line x1="150" y1="1698" x2="1618" y2="1698"/,
  'The payment-description divider must leave clear space below its heading.',
);

console.log('Payment receipt PDF and all Stripe-backed website payment integrations passed.');
