#!/usr/bin/env node
// Stored CMS paths to optimised/de-duplicated public files must resolve to the
// current file before rendering: the next/image optimiser does not follow the
// permanent redirects in next.config.mjs.
//
// Run: npm run test:asset-redirect-mapping

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const redirects = JSON.parse(readFileSync(path.join(repoRoot, 'lib', 'asset-redirects.json'), 'utf8'));
// lib/media-url.ts imports the JSON map; inline it so the module loads directly.
const source = readFileSync(path.join(repoRoot, 'lib', 'media-url.ts'), 'utf8')
  .replace("import assetRedirects from './asset-redirects.json' with { type: 'json' };", `const assetRedirects = ${JSON.stringify(redirects)};`);
const { normaliseMediaUrl } = await import(`data:text/javascript;base64,${Buffer.from(
  source.replace(/: Record<string, string>/g, '').replace(/\(path: string\): string/g, '(path)').replace(/\(value: string\): string/g, '(value)'),
).toString('base64')}`);

const entries = Object.entries(redirects);
assert.ok(entries.length > 0, 'redirect map should not be empty');
for (const [from, to] of entries) {
  assert.equal(normaliseMediaUrl(from), to, `${from} maps to its current file`);
  assert.ok(existsSync(path.join(repoRoot, 'public', to)), `${to} exists in public/`);
}
const [sampleFrom, sampleTo] = entries.find(([from]) => from.startsWith('/images/'));
assert.equal(normaliseMediaUrl(`${sampleFrom}?v=2`), `${sampleTo}?v=2`, 'query strings are kept');
assert.equal(normaliseMediaUrl(`https://www.ndcc.com.au${sampleFrom}`), `https://www.ndcc.com.au${sampleTo}`);
assert.equal(normaliseMediaUrl(sampleFrom.slice(1)), sampleTo, 'bare images/ paths are normalised first');
assert.equal(normaliseMediaUrl('/images/not-redirected.webp'), '/images/not-redirected.webp');
assert.equal(normaliseMediaUrl('https://example.com/images/x.png'), 'https://example.com/images/x.png');

console.log(`asset redirect mapping passed for ${entries.length} paths`);
