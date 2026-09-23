#!/usr/bin/env node
// Single entry point for every deterministic test/smoke/check script that can
// run without a live database, secrets or network access (`npm test`).
//
// Discovery:
//   1. every package.json script named `test:*`, `smoke:*` or `check:*`
//      (minus EXCLUDED below), and
//   2. the direct `node scripts/...` invocations in EXTRA_COMMANDS (tests that
//      have no package.json alias), and
//   3. a safety net: any scripts/test-*.mjs|cjs file not referenced by (1) or
//      (2) and not listed in EXCLUDED_FILES fails the run, so a new test file
//      cannot silently go unexecuted.
//
// Every test runs to completion; all failures are reported at the end.
//
// Usage:
//   npm test                      run everything (concurrency 4)
//   npm test -- --list            print the resolved test list and exit
//   npm test -- --verbose         print output of passing tests too
//   npm test -- --only=seo,dino   run only tests whose label contains a term
//   TEST_CONCURRENCY=1 npm test   run sequentially
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

const STRIP_TYPES = 'node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types';

// package.json scripts that must NOT run in `npm test`, with the reason.
export const EXCLUDED = {
  'smoke': 'needs a running server (BASE_URL, defaults to localhost:3000)',
  'smoke:season-appointments': 'needs a running server / live Supabase API',
  'test:email': 'sends real email; needs RESEND_API_KEY',
  'test:admin-login': 'logs in against live Supabase; needs credentials',
  'test:season-appointments': 'needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
  'test:migration-replay': 'needs PostgreSQL (CI database-tests job)',
  'test:apparel-catalogue': 'needs PostgreSQL (CI database-tests job)',
  'test:payments-ledger': 'needs PostgreSQL (CI database-tests job)',
  'test:gallery-albums': 'needs PostgreSQL (CI database-tests job)',
  'test:security-privilege-defaults-hardening:db': 'needs PostgreSQL (CI database-tests job)',
};
// Name patterns that are never test scripts (operational/production tooling).
const EXCLUDED_PREFIXES = ['cms:', 'production:', 'admin:provision-'];

// Test files that are intentionally not run by `npm test` (reason required).
export const EXCLUDED_FILES = {
  'test-email.mjs': EXCLUDED['test:email'],
  'test-admin-login.mjs': EXCLUDED['test:admin-login'],
  'test-season-appointments.mjs': EXCLUDED['test:season-appointments'],
  'test-migration-replay.mjs': EXCLUDED['test:migration-replay'],
  'test-apparel-catalogue.mjs': EXCLUDED['test:apparel-catalogue'],
  'test-payments-ledger.mjs': EXCLUDED['test:payments-ledger'],
  'test-gallery-albums.mjs': EXCLUDED['test:gallery-albums'],
  'test-security-privilege-defaults-hardening.mjs': EXCLUDED['test:security-privilege-defaults-hardening:db'],
};

// Tests without a package.json alias (previously listed directly in
// .github/workflows/pr-validation.yml, plus orphaned test files).
const EXTRA_COMMANDS = [
  'node scripts/test-minute-documents.cjs',
  'node scripts/test-minute-editor.cjs',
  'node scripts/test-public-event-flows.mjs',
  `${STRIP_TYPES} scripts/test-committee-calendar-subscription.mjs`,
  'node scripts/test-cookie-dough-deadline.mjs',
  'node --experimental-strip-types scripts/test-dino-coach.mjs',
  'node scripts/test-dino-standings.mjs',
  'node --experimental-strip-types scripts/test-dino-lifecycle.mjs',
  'node scripts/test-dino-admin-api.mjs',
  'node scripts/test-manager-eligibility.mjs',
  'node scripts/test-dino-manager-interactions.mjs',
  'node scripts/test-dino-wallet.cjs',
  'node scripts/test-dino-pool-only.cjs',
  'node scripts/test-dino-squad-render.mjs',
  'node scripts/test-dino-feedback.mjs',
  'node --experimental-strip-types scripts/test-cms-media.mjs',
  'node --experimental-strip-types scripts/test-media-reliability.mjs',
  'node scripts/test-email-webhook.mjs',
  'node scripts/test-playhq-preseason.mjs',
  `${STRIP_TYPES} scripts/test-news-gallery.mjs`,
  'node scripts/test-apparel-balances.mjs',
  'node scripts/test-order-payment-export.cjs',
  'node --experimental-strip-types scripts/test-dino-email-delivery.mjs',
  'node scripts/test-consolidated-receipts.mjs',
  'node scripts/test-reverse-raffle.mjs',
  'node --experimental-strip-types scripts/test-reverse-raffle-selection.mjs',
  'node scripts/test-reverse-raffle-selection-ui.cjs',
  'node --experimental-strip-types scripts/test-kitchen-export.mjs',
  // Previously orphaned (not run anywhere).
  `${STRIP_TYPES} scripts/test-apparel-payment-notification-flow.mjs`,
  `${STRIP_TYPES} scripts/test-dino-baseline-import.mjs`,
  `${STRIP_TYPES} scripts/test-dino-public-surfaces.mjs`,
  `${STRIP_TYPES} scripts/test-dino-public-toggle.mjs`,
  `${STRIP_TYPES} scripts/test-dino-security-regressions.mjs`,
];

function isExcludedScript(name) {
  return Object.hasOwn(EXCLUDED, name) || EXCLUDED_PREFIXES.some((p) => name.startsWith(p));
}

export function resolveTests() {
  const tests = [];
  for (const name of Object.keys(pkg.scripts ?? {})) {
    if (!/^(test|smoke|check)(:|$)/.test(name)) continue;
    if (name === 'test' || isExcludedScript(name)) continue;
    // `check:unused` (knip) is advisory and reported separately.
    if (name === 'check:unused') continue;
    tests.push({ label: `npm run ${name}`, command: `npm run --silent ${name}`, source: pkg.scripts[name] });
  }
  for (const command of EXTRA_COMMANDS) {
    tests.push({ label: command.replace(STRIP_TYPES, 'node --experimental-strip-types'), command, source: command });
  }
  return tests;
}

function findUnreferencedTestFiles(tests) {
  const referenced = tests.map((t) => t.source).join('\n');
  return readdirSync(path.join(repoRoot, 'scripts'))
    .filter((f) => /^test-.*\.(mjs|cjs)$/.test(f))
    .filter((f) => !referenced.includes(`scripts/${f}`) && !Object.hasOwn(EXCLUDED_FILES, f));
}

function run(test) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(test.command, {
      cwd: repoRoot,
      shell: true,
      env: { ...process.env, FORCE_COLOR: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (d) => { output += d; });
    child.stderr.on('data', (d) => { output += d; });
    const timeoutMs = Number(process.env.TEST_TIMEOUT_MS || 300_000);
    const timer = setTimeout(() => {
      output += `\n[run-all-tests] timed out after ${timeoutMs}ms`;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ ...test, code: code ?? 1, signal, output, ms: Date.now() - started });
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const only = args.find((a) => a.startsWith('--only='))?.slice('--only='.length).split(',').filter(Boolean);
  let tests = resolveTests();
  const unreferenced = findUnreferencedTestFiles(tests);

  if (args.includes('--list')) {
    for (const t of tests) console.log(t.label);
    console.log(`\n${tests.length} tests. Excluded package scripts:`);
    for (const [name, why] of Object.entries(EXCLUDED)) console.log(`  ${name}: ${why}`);
    if (unreferenced.length) console.log(`\nUnreferenced test files: ${unreferenced.join(', ')}`);
    return;
  }
  if (only?.length) tests = tests.filter((t) => only.some((term) => t.label.includes(term)));

  const concurrency = Math.max(1, Number(process.env.TEST_CONCURRENCY || Math.min(4, os.availableParallelism?.() ?? 4)));
  console.log(`Running ${tests.length} test scripts (concurrency ${concurrency})...\n`);
  const results = [];
  let next = 0;
  async function worker() {
    while (next < tests.length) {
      const test = tests[next++];
      const result = await run(test);
      results.push(result);
      const ok = result.code === 0;
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${result.label}  (${(result.ms / 1000).toFixed(1)}s)`);
      if (verbose || !ok) {
        const indented = result.output.trim().split('\n').map((l) => `      ${l}`).join('\n');
        if (indented.trim()) console.log(indented);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  const failed = results.filter((r) => r.code !== 0);
  console.log(`\n${results.length - failed.length}/${results.length} test scripts passed.`);
  if (unreferenced.length) {
    console.log(`\nFAIL  test files not run by npm test and not in EXCLUDED_FILES: ${unreferenced.join(', ')}`);
  }
  if (failed.length) {
    console.log('\nFailed:');
    for (const f of failed) console.log(`  - ${f.label} (exit ${f.code}${f.signal ? `, ${f.signal}` : ''})`);
  }
  if (failed.length || unreferenced.length) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
