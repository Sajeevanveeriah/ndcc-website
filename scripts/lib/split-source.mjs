// Source-level regression tests for files that were split into a sibling
// components/ directory (app/admin/orders/page.tsx, app/merchandise/
// MerchandiseClient.tsx). Returns the entry file followed by every .ts/.tsx
// file in the directory (sorted), so assertions keep covering the same code.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function readSplitSource(entryFile, componentsDir) {
  const dir = path.join(repoRoot, componentsDir);
  const parts = readdirSync(dir)
    .filter((name) => /\.(?:ts|tsx)$/.test(name))
    .sort()
    .map((name) => readFileSync(path.join(dir, name), 'utf8'));
  return [readFileSync(path.join(repoRoot, entryFile), 'utf8'), ...parts].join('\n');
}
