#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeEmailHtml } from '../lib/email-html.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(path.join(repoRoot, file), 'utf8');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

console.log('Checks:');

test('the shared helper neutralises every HTML metacharacter', () => {
  const attack = `</strong><img src=x onerror="alert('email-xss')"> & more`;
  assert.equal(
    escapeEmailHtml(attack),
    '&lt;/strong&gt;&lt;img src=x onerror=&quot;alert(&#39;email-xss&#39;)&quot;&gt; &amp; more',
  );
});

test('the shared helper handles nullish and non-string values safely', () => {
  assert.equal(escapeEmailHtml(null), '');
  assert.equal(escapeEmailHtml(undefined), '');
  assert.equal(escapeEmailHtml(42), '42');
});

test('the email wrapper escapes its title and bank-detail text fields', () => {
  const source = read('lib/email.ts');
  assert.match(source, /export \{ escapeEmailHtml \} from '\.\/email-html'/);
  assert.match(source, /\$\{escapeEmailHtml\(title\)\}/);
  assert.match(source, /escapeEmailHtml\(process\.env\.NDCC_BANK_ACCOUNT_NAME/);
  assert.match(source, /escapeEmailHtml\(process\.env\.NDCC_BANK_BSB/);
  assert.match(source, /escapeEmailHtml\(process\.env\.NDCC_BANK_ACCOUNT_NUMBER/);
  assert.match(source, /\$\{escapeEmailHtml\(reference\)\}/);
});

test('public form email templates escape user and catalogue content', () => {
  const volunteers = read('app/api/volunteers/route.ts');
  const memberships = read('app/api/memberships/route.ts');
  const events = read('app/api/events/route.ts');
  const kitchen = read('app/api/kitchen/orders/route.ts');

  assert.match(volunteers, /escapeEmailHtml\(sanitiseInput\(name\)\)/);
  assert.match(volunteers, /const safeRole = sanitiseInput\(role\)/);
  assert.match(volunteers, /escapeEmailHtml\(safeRole\)/);
  assert.match(memberships, /escapeEmailHtml\(sanitiseInput\(full_name\)\)/);
  assert.match(memberships, /escapeEmailHtml\(plan\.name\)/);
  assert.match(events, /escapeEmailHtml\(sanitiseInput\(name\)\)/);
  assert.match(events, /escapeEmailHtml\(eventRow\.title\)/);
  assert.match(events, /escapeEmailHtml\(eventRow\.location\)/);
  assert.match(kitchen, /escapeEmailHtml\(sanitiseInput\(customer_name\)\)/);
  assert.match(kitchen, /escapeEmailHtml\(i\.name\)/);
});

test('admin diagnostics and fantasy alerts escape stored text', () => {
  const diagnostics = read('app/api/admin/email-diagnostics/route.ts');
  const fantasy = read('lib/playhq/fantasy-orchestrator.ts');

  assert.match(diagnostics, /escapeEmailHtml\(user\.full_name\)/);
  assert.match(fantasy, /escapeEmailHtml\(season\.slug\)/);
  assert.match(fantasy, /escapeEmailHtml\(latestError\)/);
});

console.log(`\ntest-email-html-security: ${passed} tests passed`);
