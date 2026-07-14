#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const explicitBase = process.env.SMOKE_BASE_URL || process.env.BASE_URL || '';
const checks = [
  { route: '/', file: 'app/page.tsx', label: 'home core content', all: ['Our Sponsors'] },
  { route: '/about', file: 'app/about/page.tsx', label: 'about content', all: ['About'] },
  { route: '/fixtures', file: 'app/fixtures/page.tsx', label: 'fixtures content', all: ['Fixtures'] },
  { route: '/sponsors', file: 'app/sponsors/page.tsx', label: 'sponsor cards', all: ['Sponsors'] },
  { route: '/news', file: 'app/news/page.tsx', label: 'news fallback', all: ['News'] },
  { route: '/publications', file: 'app/publications/page.tsx', label: 'publications listing', all: ['Publications'] },
  { route: '/events', file: 'app/events/page.tsx', label: 'events fallback', all: ['Events'] },
  { route: '/calendar', file: 'app/calendar/page.tsx', label: 'calendar content', all: ['Club Calendar'] },
  { route: '/gallery', file: 'app/gallery/page.tsx', label: 'gallery fallback achievements', all: ['Gallery'] },
  { route: '/join', file: 'app/join/page.tsx', label: 'social membership', all: ['Membership'] },
  { route: '/contact', file: 'app/contact/page.tsx', label: 'contact form', all: ['Send Us a Message'] },
];

let failed = 0;
if (!explicitBase) {
  for (const check of checks) {
    const text = readFileSync(check.file, 'utf8');
    const ok = check.all.every((needle) => text.includes(needle));
    console.log(`${ok ? 'PASS' : 'FAIL'} ${check.file} ${check.label}`);
    if (!ok) failed += 1;
  }
  if (failed) process.exit(1);
  console.log(`Content smoke source check passed for ${checks.length} page source file(s). Set SMOKE_BASE_URL to exercise a running server.`);
  process.exit(0);
}

const baseUrl = explicitBase.replace(/\/$/, '');
for (const check of checks) {
  const url = `${baseUrl}${check.route}`;
  try {
    const response = await fetch(url);
    const html = await response.text();
    const allPass = check.all.every((needle) => html.includes(needle));
    const badPublicText = /AbortError|temporarily unavailable|under development/i.test(html);
    const ok = response.ok && html.trim().length > 0 && allPass && !badPublicText;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${check.route} ${check.label} -> ${response.status}`);
    if (!ok) failed += 1;
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${check.route} ${check.label} -> ${error instanceof Error ? error.message : 'request failed'}`);
  }
}
if (failed) { console.error(`Content smoke check failed for ${failed} check(s).`); process.exit(1); }
console.log(`Content smoke check passed for ${checks.length} check(s).`);
