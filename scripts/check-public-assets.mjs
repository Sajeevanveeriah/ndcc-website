#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).trim().split('\n').filter((f) => /\.(tsx?|jsx?|json)$/.test(f) && !f.startsWith('app/admin/') && !f.startsWith('components/admin/'));
const paths = new Set();
const re = /['"`]((?:\/images|\/downloads)\/[A-Za-z0-9][^'"`\s<>{}|\\^]*)['"`]/g;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(re)) {
    let assetPath = m[1].replace(/^\/images\/cms\//, '/images/');
    if (assetPath.includes('YYYY')) continue;
    paths.add(assetPath);
  }
}
const missing = [...paths].filter((path) => !existsSync(join('public', path)));
if (missing.length) {
  console.error('Missing public assets:');
  for (const path of missing.sort()) console.error(`- ${path}`);
  process.exit(1);
}
console.log(`Checked ${paths.size} public asset references.`);
