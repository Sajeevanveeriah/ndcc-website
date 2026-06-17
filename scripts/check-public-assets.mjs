import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const exts = new Set(['.ts', '.tsx', '.js', '.jsx', '.md', '.json', '.mjs']);
const ignoredDirs = new Set(['.git', '.next', 'node_modules']);
const assetPattern = /["'`](\/(?:images|downloads)\/[^"'`?#)\s]+)/g;
const missing = [];
const allowedDocumentationDirs = new Set(['docs']);
const allowedMissing = new Set([
  '/images/sponsors/logo.png', // Admin form example placeholder, not a public asset reference.
  '/images/Craig_Hillgrove.png',
  '/images/Kelsey_Allan.png',
  '/images/cms/2026/05/caitlin-rose-neil-1778495351649.png',
  '/images/cms/2026/05/jodie-clark-1778495304142.png',
  '/images/cms/2026/05/skye-green-1778495377710.png',
]);

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!exts.has(path.extname(entry.name))) continue;
    const relativeFile = path.relative(root, full);
    if (relativeFile === 'README.md' || allowedDocumentationDirs.has(relativeFile.split(path.sep)[0])) continue;
    const text = fs.readFileSync(full, 'utf8');
    let match;
    while ((match = assetPattern.exec(text))) {
      const publicPath = path.join(root, 'public', match[1]);
      if (!fs.existsSync(publicPath) && !allowedMissing.has(match[1])) {
        missing.push(`${relativeFile} -> ${match[1]}`);
      }
    }
  }
}

walk(root);

if (missing.length > 0) {
  console.error('Missing public asset references:');
  for (const item of missing) console.error(`- ${item}`);
  process.exit(1);
}

console.log('All hardcoded /images and /downloads references exist.');
