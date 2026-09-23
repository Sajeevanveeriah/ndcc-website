// The Stripe webhook route is a thin dispatcher; its per-domain handlers live
// in lib/payments/webhook/. Source-level regression tests assert against the
// concatenation of all of them, route first, so ordering assertions on the
// dispatcher (signature verification before any handler) still read the
// route's own POST body.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const STRIPE_WEBHOOK_SOURCE_FILES = [
  'app/api/stripe/webhook/route.ts',
  'lib/payments/webhook/shared.ts',
  'lib/payments/webhook/financial.ts',
  'lib/payments/webhook/dino.ts',
  'lib/payments/webhook/raffle.ts',
  'lib/payments/webhook/orders.ts',
];

export function readStripeWebhookSource() {
  return STRIPE_WEBHOOK_SOURCE_FILES
    .map((file) => readFileSync(path.join(repoRoot, file), 'utf8'))
    .join('\n');
}
