import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import * as icons from 'lucide-react';

function load(path, imports = {}, globals = {}) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(source, { exports, URL, require: (key) => {
    assert(key in imports, `Unexpected import: ${key}`);
    return imports[key];
  }, ...globals });
  return exports;
}
const rules = load('lib/cookie-dough.ts');
const end = rules.COOKIE_DOUGH_ENDS_AT;
assert.equal(new Date(end).toISOString(), '2026-09-30T11:00:00.000Z');
assert.equal(rules.isCookieDoughOpen(end - 1), true);
assert.equal(rules.isCookieDoughOpen(end), false);
assert.equal(rules.isCookieDoughOpen(end + 1), false);
assert.equal(new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', hour: '2-digit', hourCycle: 'h23' }).format(end), '21');
for (const href of ['/fundraising/cookie-dough', '/fundraising/cookie-dough/?source=nav', 'https://ndcc.com.au/fundraising/cookie-dough']) assert(rules.isCookieDoughLink(href));
assert.equal(rules.isCookieDoughLink('/events'), false);
assert.equal(rules.isCookieDoughLink('https://example.org/fundraising/cookie-dough'), false);

// Exercise a tab left open, suspended, resumed, then unmounted.
let now = end - 10;
let visible;
let cleanup;
let scheduled;
const listeners = new Map();
const events = { addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: (name) => listeners.delete(name) };
const hook = load('components/common/CookieDoughVisibility.tsx', {
  react: { useState: (value) => [value, (next) => { visible = next; }], useEffect: (callback) => { cleanup = callback(); } },
  'react/jsx-runtime': {},
  '@/lib/cookie-dough': { ...rules, isCookieDoughOpen: () => rules.isCookieDoughOpen(now) },
}, { Date: { now: () => now }, window: events, document: events, setTimeout: (callback, delay) => { scheduled = { callback, delay }; return 1; }, clearTimeout: () => {} });
hook.useCookieDoughOpen(true);
assert.equal(visible, true);
assert.equal(scheduled.delay, 10);
now = end;
scheduled.callback();
assert.equal(visible, false);
now = end - 30 * 86_400_000;
listeners.get('focus')();
assert.equal(scheduled.delay, 86_400_000);
now = end + 1;
listeners.get('visibilitychange')();
assert.equal(visible, false);
cleanup();
assert.equal(listeners.size, 0);
const passthrough = ({ children }) => React.createElement('div', null, children);
const pageImports = {
  'react/jsx-runtime': jsx,
  'next/navigation': { notFound: () => { throw new Error('404'); } },
  'next/image': { default: () => null },
  'next/link': { default: 'a' },
  'lucide-react': icons,
  '@/components/common/CookieDoughVisibility': { default: passthrough },
  '@/components/common/ScrollReveal': { default: passthrough, ScrollRevealItem: passthrough },
  '@/lib/cookie-dough': { ...rules, isCookieDoughOpen: () => rules.isCookieDoughOpen(now) },
  '@/lib/public-links': { COOKIE_DOUGH_FUNDRAISER_LINK: { href: 'https://example.org/campaign' } },
  '@/lib/server/site-promotions': {
    getCookieDoughCampaign: async () => (rules.isCookieDoughOpen(now)
      ? { endsAt: end, deadlineLabel: rules.COOKIE_DOUGH_DEADLINE_LABEL, href: 'https://example.org/campaign' }
      : null),
  },
};
const page = load('app/fundraising/cookie-dough/page.tsx', pageImports);
const feature = load('components/home/CookieDoughFundraiserFeature.tsx', pageImports);
now = end - 1;
const openPage = renderToStaticMarkup(await page.default());
assert.match(openPage, /Ends 30 September 2026 at 9 pm/);
assert.match(openPage, /href="https:\/\/example\.org\/campaign"/, 'campaign link comes from the promotion');
assert.match(renderToStaticMarkup(feature.default()), /Ends 30 September 2026 at 9 pm/);
now = end;
await assert.rejects(() => page.default(), /404/);
assert.equal(feature.default(), null);
assert.equal(page.dynamic, 'force-dynamic');
console.log('PASS Melbourne cutoff before/at/after, link variants, open-tab expiry, timeout cap, resume and cleanup');
console.log('PASS fundraiser and homepage render deadline before cutoff, then return 404 and remove promotion');
