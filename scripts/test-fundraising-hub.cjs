#!/usr/bin/env node
// Static source checks for the Fund Raiser hub (/fundraising). No database,
// secrets or network: it reads app/fundraising/page.tsx and asserts that the
// hub uses the Navbar's server visibility snapshot, lists a gated fundraiser
// only inside its visibility gate, has page metadata, and links only to
// routes that exist in the app directory.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const source = read('app/fundraising/page.tsx');
// Split on CRLF too so the checks pass on Windows checkouts (core.autocrlf).
const lines = source.split(/\r?\n/);
let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

check('hub reads the same server visibility as the Navbar', () => {
  assert.match(source, /import \{ getNavVisibility \} from '@\/lib\/server\/nav-visibility';/);
  assert.match(source, /const nav = await getNavVisibility\(\);/);
});

check('hub has metadata, canonical path and 60 second revalidation', () => {
  assert.match(source, /export const metadata: Metadata = pageMetadata\(\s*'\/fundraising',\s*'Fund Raiser',/);
  assert.match(source, /export const revalidate = 60;/);
  assert.doesNotMatch(source, /force-dynamic/);
});

// Each gated fundraiser's link must sit inside the `if (...)` block whose
// condition depends on that fundraiser's visibility.
function enclosingIf(href) {
  const index = lines.findIndex((line) => line.includes(`href: '${href}'`));
  assert.notEqual(index, -1, `hub links to ${href}`);
  for (let i = index; i >= 0; i -= 1) {
    if (/^ {2}\}/.test(lines[i]) && i !== index) break;
    const match = /^ {2}if \((.+)\) \{$/.exec(lines[i]);
    if (match) return match[1];
  }
  return null;
}

check('only enabled fundraisers are listed', () => {
  assert.equal(enclosingIf('/raffle'), 'nav.rafflePublic');

  assert.equal(enclosingIf('/reverse-raffle'), 'reverseCampaign');
  assert.match(source, /nav\.reverseRafflePublic \? getPublicRaffleCampaign\(REVERSE_RAFFLE_CAMPAIGN_CODE\) : null/);

  assert.equal(enclosingIf('/prize-wheel'), 'wheelCampaign');
  assert.match(source, /nav\.prizeWheelPublic === true \? getPublicWheelCampaign\(\)/);

  assert.equal(enclosingIf('/spin-the-wheel'), 'spinWheel');
  assert.match(source, /nav\.spinWheelPublic === true \? getPublicSpinWheel\(\)/);

  assert.equal(enclosingIf('/fundraising/cookie-dough'), 'cookieDough');
  assert.match(source, /cookieDoughOpen \? getCookieDoughCampaign\(\)/);
  assert.match(source, /const cookieDoughOpen = isCookieDoughOpen\(Date\.now\(\), cookieEndsAt\);/);
  // Same open rule as the Navbar's useCookieDoughOpen arguments.
  assert.match(source, /nav\.cookieDoughOpen === undefined \? COOKIE_DOUGH_ENDS_AT : nav\.cookieDoughOpen \? \(nav\.cookieDoughEndsAt \?\? null\) : 0/);
  assert.match(read('components/layout/Navbar.tsx'), /nav\.cookieDoughOpen === undefined \? COOKIE_DOUGH_ENDS_AT : nav\.cookieDoughOpen \? \(nav\.cookieDoughEndsAt \?\? null\) : 0/);

  // Pot Club and the shop/events are always in the main navigation.
  for (const href of ['/pot-club', '/merchandise', '/events']) assert.equal(enclosingIf(href), null, `${href} is always listed`);
});

check('every hub link points at an existing route', () => {
  const hrefs = [...source.matchAll(/href(?::\s*|=)['"](\/[^'"#?]*)['"]/g)].map((match) => match[1]);
  assert.ok(hrefs.length >= 8, 'hub has its card and breadcrumb links');
  for (const href of new Set(hrefs)) {
    // A listing page may sit in a (list) route group (same URL, own loading UI).
    const candidates = href === '/' ? ['app/page.tsx'] : [`app${href}/page.tsx`, `app${href}/(list)/page.tsx`];
    assert.ok(candidates.some((page) => fs.existsSync(path.join(root, page))), `${href} has ${candidates.join(' or ')}`);
  }
  assert.ok(!hrefs.includes('/raffle/cash'), 'member cash sales are not a public hub card');
});

check('hub keeps one main landmark and one h1', () => {
  assert.doesNotMatch(source, /<main/);
  assert.equal((source.match(/<h1/g) || []).length, 1);
  assert.match(source, /<nav aria-label="Breadcrumb" className="nd-crumbs">/);
});

check('raffle breadcrumb links back to the hub', () => {
  assert.match(read('app/raffle/RaffleClient.tsx'), /<Link href="\/">Home<\/Link> \/ <Link href="\/fundraising">Fund Raiser<\/Link> \/ <span aria-current="page">Raffle<\/span>/);
});

console.log(`PASS fundraising hub: ${passed} static checks.`);
