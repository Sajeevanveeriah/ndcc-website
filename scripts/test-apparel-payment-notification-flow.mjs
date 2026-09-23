import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readStripeWebhookSource } from './lib/stripe-webhook-source.mjs';
import { readSplitSource } from './lib/split-source.mjs';

const orderRoute = readFileSync('app/api/orders/route.ts', 'utf8');
// MerchandiseClient was split into app/merchandise/components/ (F64).
const merchandise = readSplitSource('app/merchandise/MerchandiseClient.tsx', 'app/merchandise/components');
const webhook = readStripeWebhookSource();

assert.match(orderRoute, /payment_method !== 'stripe'/, 'Stripe orders suppress the initial unpaid staff email.');
assert.match(merchandise, /payment_method: paymentMethod/, 'The selected payment path is sent with the order.');
assert.match(merchandise, /name="payment_method"/, 'Customers make an explicit payment-method choice.');
assert.match(webhook, /sendPaidStaffOrderNotificationForPayment/, 'Settled Stripe orders retain the paid staff email.');

console.log('Apparel payment notification flow structural tests passed.');
