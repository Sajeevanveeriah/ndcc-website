#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const failures = [];
const sponsors = JSON.parse(readFileSync('data/sponsors/verified-sponsors-20260619.json', 'utf8'));
const missing = sponsors.filter((sponsor) => sponsor.logo_local_path?.startsWith('/') && !existsSync(`public${sponsor.logo_local_path}`));
if (missing.length) failures.push(`Missing assets: ${missing.map((s) => s.logo_local_path).join(', ')}`);

// Permanent asset redirects (served by next.config.mjs redirects()).
const redirects = JSON.parse(readFileSync('lib/asset-redirects.json', 'utf8'));
function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile()) out.push(`/${path.relative('public', full).split(path.sep).join('/')}`);
  }
  return out;
}
const publicFiles = walk('public');
const publicFilesLower = new Set(publicFiles.map((file) => file.toLowerCase()));
for (const [source, destination] of Object.entries(redirects)) {
  if (!source.startsWith('/') || !destination.startsWith('/')) failures.push(`Redirect paths must be site-relative: ${source} -> ${destination}`);
  if (!existsSync(`public${destination}`)) failures.push(`Redirect target missing from public/: ${source} -> ${destination}`);
  if (redirects[destination]) failures.push(`Redirect chain: ${source} -> ${destination} -> ${redirects[destination]}`);
  // Redirects run before public files, so a source that still exists (even with
  // different letter case) would shadow a real asset.
  if (publicFilesLower.has(source.toLowerCase())) failures.push(`Redirect source still exists as a public file: ${source}`);
}

// Large raster images slow every page that uses them; user downloads are exempt.
const LARGE_LIMIT = 1024 * 1024;
const large = publicFiles
  .filter((file) => /\.(png|jpe?g)$/i.test(file) && !file.startsWith('/downloads/'))
  .filter((file) => statSync(`public${file}`).size > LARGE_LIMIT);
for (const file of large) failures.push(`Raster image over 1 MB (run scripts/optimise-public-images.mjs): ${file}`);

// Sponsorship downloads: each listed file must exist and its published size
// label must match the real file, and link text must be a human title rather
// than the raw source filename.
const assetsSource = readFileSync('lib/assets.ts', 'utf8');
const downloadsBlock = assetsSource.slice(assetsSource.indexOf('export const sponsorshipDownloads2026_27'));
const downloadEntries = [...downloadsBlock.matchAll(/title: '([^']+)',\s*href: '([^']+)',\s*sourceFile: '([^']+)',\s*bytes: (\d+),/g)];
if (downloadEntries.length === 0) failures.push('No sponsorship downloads found in lib/assets.ts');
for (const [, title, href, sourceFile, bytes] of downloadEntries) {
  const file = `public${href}`;
  if (!existsSync(file)) { failures.push(`Download missing from public/: ${href}`); continue; }
  const actual = statSync(file).size;
  if (actual !== Number(bytes)) failures.push(`Download size for ${href} is ${actual} bytes but lib/assets.ts says ${bytes}`);
  if (title === sourceFile.replace(/\.pdf$/i, '') || /\bRev\d+\b/i.test(title)) failures.push(`Download title must be human-readable, not a filename: ${title}`);
}

if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
console.log(`Public asset check passed for ${sponsors.length} sponsor logo reference(s), ${downloadEntries.length} sponsorship download(s), ${Object.keys(redirects).length} asset redirect(s) and ${large.length} raster image(s) over 1 MB outside public/downloads.`);
