import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [home, footer] = await Promise.all([
  readFile(new URL('../app/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/layout/Footer.tsx', import.meta.url), 'utf8'),
]);

assert.match(home, /if \(!\(await isDinoCoachPublic\(\)\)\) return null;/);
assert.match(home, /<Suspense fallback=\{null\}>\s*<FantasyTeaserSection \/>/);
assert.match(footer, /!link\.href\.startsWith\('\/fantasy'\)/);
assert.match(footer, /await isDinoCoachPublic\(\)/);

console.log('Dino Coach public surface checks passed.');
