import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [home, footer, navVisibility] = await Promise.all([
  readFile(new URL('../app/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/layout/Footer.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../lib/server/nav-visibility.ts', import.meta.url), 'utf8'),
]);

// The Dino Coach box sits in the Get involved card and shows only while the
// public launch gate is on (a failed check hides it).
assert.match(home, /isDinoCoachPublic\(\)\.catch\(\(\) => false\)/);
assert.match(home, /\{dinoCoach && \(\s*<div className="nd-dino">/);
assert.match(home, /dinoCoach=\{false\}/, 'the loading fallback never shows the Dino Coach box');
assert.match(footer, /!link\.href\.startsWith\('\/fantasy'\)/);
// The footer reads both public feature gates from the shared server snapshot
// (lib/server/nav-visibility.ts) before rendering links.
assert.match(footer, /await getSiteChromeSnapshot\(\)/, 'footer awaits the shared visibility snapshot before rendering links');
assert.match(navVisibility, /isDinoCoachPublic\(\),\s*isRafflePublic\(\),/, 'snapshot evaluates both public feature gates');

console.log('Dino Coach public surface checks passed.');
