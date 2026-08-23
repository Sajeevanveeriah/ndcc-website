import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const layout = readFileSync('app/fantasy/layout.tsx', 'utf8');
const statusRoute = readFileSync('app/api/public/dino-coach-status/route.ts', 'utf8');
const navbar = readFileSync('components/layout/Navbar.tsx', 'utf8');
const sitemap = readFileSync('app/sitemap.ts', 'utf8');

for (const source of [layout, statusRoute, sitemap]) {
  assert.match(source, /public_launch_enabled/, 'Public visibility reads the CMS launch flag.');
}
assert.match(layout, /notFound\(\)/, 'Disabled Dino Coach routes return not found.');
assert.match(statusRoute, /enabled: false/, 'The public status endpoint fails closed.');
assert.match(navbar, /dinoCoachEnabled/, 'Navigation honours the public launch state.');
assert.match(sitemap, /if \(await isDinoCoachPublic\(\)\)/, 'Sitemap includes Dino Coach only when public.');

console.log('Dino Coach public toggle structural tests passed.');
