import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

// The build must not download fonts: Inter is committed under app/fonts/inter
// (the exact files Google Fonts served before) and loaded with next/font/local.
const layout = readFileSync('app/layout.tsx', 'utf8');
const css = readFileSync('app/fonts/inter/inter.css', 'utf8');
const tailwind = readFileSync('tailwind.config.ts', 'utf8');

assert.doesNotMatch(layout, /next\/font\/google/, 'No build-time Google Fonts download');
assert.match(layout, /from 'next\/font\/local'/);
assert.match(layout, /src: '\.\/fonts\/inter\/inter-latin\.woff2'/);
assert.match(layout, /weight: '400 900'/);
assert.match(layout, /variable: '--font-inter'/);
assert.match(layout, /display: 'swap'/);
assert.match(layout, /import '\.\/fonts\/inter\/inter\.css';/);
assert.doesNotMatch(css, /https?:\/\//, 'Font CSS must not reference another host');

const files = {
  'inter-latin.woff2': 'c940764593d0fe5d596be327ca7558855e018039fb78509aa21921fd3644c3e4',
  'inter-latin-ext.woff2': null, 'inter-cyrillic.woff2': null, 'inter-cyrillic-ext.woff2': null,
  'inter-greek.woff2': null, 'inter-greek-ext.woff2': null, 'inter-vietnamese.woff2': null,
};
for (const [name, sha] of Object.entries(files)) {
  const path = `app/fonts/inter/${name}`;
  assert.ok(existsSync(path), `${path} is committed`);
  const bytes = readFileSync(path);
  assert.equal(bytes.subarray(0, 4).toString('latin1'), 'wOF2', `${name} is a WOFF2 file`);
  if (sha) assert.equal(createHash('sha256').update(bytes).digest('hex'), sha, `${name} is unchanged`);
  if (name !== 'inter-latin.woff2') assert.ok(css.includes(`url('./${name}')`), `${name} is declared in inter.css`);
}
assert.match(readFileSync('app/fonts/inter/OFL.txt', 'utf8'), /SIL Open Font License, Version 1\.1/);
assert.match(css, /font-family: 'Inter Fallback'; src: local\('Arial'\); ascent-override: 90\.44%; descent-override: 22\.52%; line-gap-override: 0\.00%; size-adjust: 107\.12%;/);
for (const key of ['display', 'body']) {
  assert.match(tailwind, new RegExp(`${key}: \\['var\\(--font-inter\\)', '"Inter Subsets"', '"Inter Fallback"', 'system-ui', 'sans-serif'\\]`));
}
console.log('Self-hosted Inter: no Google Fonts download, committed WOFF2 files, licence, all scripts and the metric fallback declared.');
