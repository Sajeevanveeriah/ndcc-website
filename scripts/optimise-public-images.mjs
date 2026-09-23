#!/usr/bin/env node
// Optimise large raster images under public/ and record permanent redirects.
//
// Dry run (default) prints the plan and changes nothing:
//   node scripts/optimise-public-images.mjs [--db-paths <file>]
// Apply the plan (convert, de-duplicate, rewrite code path strings, update
// lib/asset-redirects.json):
//   node scripts/optimise-public-images.mjs --apply [--db-paths <file>]
//
// --db-paths points at a list of paths referenced by production database rows
// (one "/images/..." path per line). It only influences which file is kept as
// the canonical copy of an exact duplicate. The script is idempotent: files it
// has already converted or removed are no longer candidates, and existing
// redirect entries are preserved with chains collapsed to the final target.
//
// Every removed or renamed path gets an entry in lib/asset-redirects.json, which
// next.config.mjs serves as permanent (308) redirects. Database rows are
// repointed separately with the SQL in supabase/recovery/.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const publicDir = path.join(root, 'public');
const redirectsFile = path.join(root, 'lib/asset-redirects.json');

const SIZE_THRESHOLD = 300 * 1024;
const MAX_DIMENSION = 2400;
const WEBP_QUALITY = 85;
const MIN_SAVING = 0.2;
const RASTER = /\.(png|jpe?g)$/i;
const IMAGE = /\.(png|jpe?g|webp|gif)$/i;

// Directories whose files are never converted or de-duplicated.
const EXCLUDED_PREFIXES = [
  '/downloads/', // user downloads keep their published format
  '/icons/', // PWA manifest / apple-touch icons must stay PNG
  '/fonts/',
  '/media/',
  '/documents/',
];
// Individual files that must keep their current format.
const KEEP = new Map([
  ['/images/logo.jpg', 'Open Graph/Twitter/JSON-LD logo; embedded as JPEG in receipt and raffle ticket PDFs'],
  ['/images/reverse-raffle-logo.png', 'embedded as PNG in raffle ticket PDFs (lib/raffle-ticket.ts)'],
]);
// Superseded documents: removed only when nothing references them.
const SUPERSEDED = [
  {
    source: '/documents/20260918-Dino-Coach-User-Manual-Rev00.pdf',
    destination: '/documents/20260919-Dino-Coach-User-Manual-Rev01.pdf',
  },
];

const CODE_ROOTS = ['app', 'lib', 'components', 'data', 'scripts', 'middleware.ts', 'next.config.mjs'];
const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|css|md|py|sql)$/;
const CODE_SKIP = new Set(['lib/asset-redirects.json', 'scripts/optimise-public-images.mjs']);
// Lines carrying this marker keep their literal path (e.g. deny-lists that must
// still recognise a legacy path).
const KEEP_MARKER = 'optimise-images:keep-path';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const dbPathsArg = args.includes('--db-paths') ? args[args.indexOf('--db-paths') + 1] : process.env.NDCC_DB_PATHS;

const toPublic = (abs) => `/${path.relative(publicDir, abs).split(path.sep).join('/')}`;
const toAbs = (publicPath) => path.join(publicDir, ...publicPath.slice(1).split('/'));
const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function readDbPaths() {
  if (!dbPathsArg) return new Set();
  return new Set(fs.readFileSync(dbPathsArg, 'utf8').split('\n')
    .map((line) => line.trim().split(/\s/)[0])
    .filter((line) => line.startsWith('/') && !line.includes('*')));
}

function codeFiles() {
  const files = [];
  for (const entry of CODE_ROOTS) {
    const abs = path.join(root, entry);
    if (!fs.existsSync(abs)) continue;
    const list = fs.statSync(abs).isDirectory() ? walk(abs) : [abs];
    for (const file of list) {
      const rel = path.relative(root, file).split(path.sep).join('/');
      if (CODE_EXT.test(rel) && !CODE_SKIP.has(rel)) files.push({ rel, text: fs.readFileSync(file, 'utf8') });
    }
  }
  return files;
}

const sha256 = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const isExcluded = (publicPath) => KEEP.has(publicPath) || EXCLUDED_PREFIXES.some((prefix) => publicPath.startsWith(prefix));
const timestampOf = (publicPath) => Number(/-(\d{10,13})\.[a-z]+$/i.exec(publicPath)?.[1] ?? 0);

async function thumbnail(file) {
  return sharp(file, { limitInputPixels: false }).rotate().resize(32, 32, { fit: 'fill' }).greyscale().raw().toBuffer();
}

async function looksIdentical(a, b) {
  const [ma, mb] = await Promise.all([sharp(a, { limitInputPixels: false }).metadata(), sharp(b).metadata()]);
  if (Math.abs(ma.width / ma.height - mb.width / mb.height) > 0.01) return false;
  const [ta, tb] = await Promise.all([thumbnail(a), thumbnail(b)]);
  let diff = 0;
  for (let i = 0; i < ta.length; i += 1) diff += Math.abs(ta[i] - tb[i]);
  return diff / ta.length < 6;
}

const dbPaths = readDbPaths();
const code = codeFiles();
const referenceCount = (publicPath) => (dbPaths.has(publicPath) ? 1 : 0)
  + code.filter((file) => file.text.includes(publicPath)).length;

const existingRedirects = fs.existsSync(redirectsFile) ? JSON.parse(fs.readFileSync(redirectsFile, 'utf8')) : {};
const newRedirects = {};
const removals = [];
const writes = [];
const left = [];
const summary = { deduped: 0, converted: 0, reusedExisting: 0, documents: 0 };

// F02: exact duplicates.
const images = walk(publicDir).map(toPublic).filter((p) => IMAGE.test(p) && !isExcluded(p));
const byHash = new Map();
for (const publicPath of images) {
  const hash = sha256(toAbs(publicPath));
  byHash.set(hash, [...(byHash.get(hash) ?? []), publicPath]);
}
const canonicalPaths = new Set(images);
for (const group of byHash.values()) {
  if (group.length < 2) continue;
  const ranked = [...group].sort((a, b) => referenceCount(b) - referenceCount(a)
    || timestampOf(a) - timestampOf(b) || a.localeCompare(b));
  const [canonical, ...duplicates] = ranked;
  for (const duplicate of duplicates) {
    newRedirects[duplicate] = canonical;
    removals.push(duplicate);
    canonicalPaths.delete(duplicate);
    summary.deduped += 1;
    console.log(`DEDUPE   ${duplicate}\n      -> ${canonical}`);
  }
}

// F01/F03: convert large rasters (referenced or not) to WebP.
for (const publicPath of [...canonicalPaths].sort()) {
  if (!RASTER.test(publicPath)) continue;
  const abs = toAbs(publicPath);
  const size = fs.statSync(abs).size;
  if (size <= SIZE_THRESHOLD) continue;
  const target = publicPath.replace(RASTER, '.webp');
  const targetAbs = toAbs(target);
  if (fs.existsSync(targetAbs)) {
    if (await looksIdentical(abs, targetAbs)) {
      newRedirects[publicPath] = target;
      removals.push(publicPath);
      summary.reusedExisting += 1;
      console.log(`REUSE    ${publicPath} (${kb(size)})\n      -> existing ${target} (${kb(fs.statSync(targetAbs).size)})`);
    } else {
      left.push(`${publicPath}: ${target} already exists with different content`);
    }
    continue;
  }
  const buffer = await sharp(abs, { limitInputPixels: false })
    .rotate()
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY, effort: 6 })
    .toBuffer();
  if (buffer.length > size * (1 - MIN_SAVING)) {
    left.push(`${publicPath}: WebP ${kb(buffer.length)} is not 20% smaller than ${kb(size)}`);
    continue;
  }
  writes.push({ target, buffer });
  newRedirects[publicPath] = target;
  removals.push(publicPath);
  summary.converted += 1;
  console.log(`CONVERT  ${publicPath} (${kb(size)})\n      -> ${target} (${kb(buffer.length)})`);
}

// Superseded documents.
for (const { source, destination } of SUPERSEDED) {
  if (!fs.existsSync(toAbs(source))) continue;
  const basename = path.posix.basename(source);
  const referenced = dbPaths.has(source) || code.some((file) => file.text.includes(basename));
  if (referenced) { left.push(`${source}: still referenced`); continue; }
  newRedirects[source] = destination;
  removals.push(source);
  summary.documents += 1;
  console.log(`SUPERSEDE ${source}\n      -> ${destination}`);
}

for (const [publicPath, reason] of KEEP) if (fs.existsSync(toAbs(publicPath))) left.push(`${publicPath}: kept (${reason})`);

// Merge with existing redirects and collapse chains to the final destination.
const merged = { ...existingRedirects, ...newRedirects };
const resolve = (destination) => {
  const seen = new Set();
  while (merged[destination] && !seen.has(destination)) { seen.add(destination); destination = merged[destination]; }
  return destination;
};
const finalRedirects = Object.fromEntries(Object.keys(merged).sort().map((source) => [source, resolve(merged[source])]));

// Rewrite path strings in code to the final destinations.
const codeChanges = [];
for (const file of code) {
  const lines = file.text.split('\n');
  let changed = false;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].includes(KEEP_MARKER)) continue;
    for (const [source, destination] of Object.entries(finalRedirects)) {
      if (lines[i].includes(source)) { lines[i] = lines[i].split(source).join(destination); changed = true; }
    }
  }
  if (changed) codeChanges.push({ rel: file.rel, text: lines.join('\n') });
}

const bytesBefore = removals.reduce((sum, p) => sum + fs.statSync(toAbs(p)).size, 0);
const bytesAfter = writes.reduce((sum, w) => sum + w.buffer.length, 0);
console.log('\nLeft unchanged:');
for (const line of left) console.log(`  ${line}`);
console.log(`\n${apply ? 'Applied' : 'Dry run'}: ${summary.converted} converted, ${summary.reusedExisting} mapped to existing WebP, ${summary.deduped} duplicates removed, ${summary.documents} superseded documents; ${Object.keys(newRedirects).length} new redirects (${Object.keys(finalRedirects).length} total); ${removals.length} files removed (${kb(bytesBefore)}) and ${writes.length} written (${kb(bytesAfter)}); ${codeChanges.length} code files with path updates${codeChanges.length ? `: ${codeChanges.map((c) => c.rel).join(', ')}` : ''}.`);

if (!apply) {
  console.log('Re-run with --apply to write these changes.');
  process.exit(0);
}
for (const { target, buffer } of writes) fs.writeFileSync(toAbs(target), buffer);
for (const publicPath of removals) {
  const destination = finalRedirects[publicPath];
  if (!fs.existsSync(toAbs(destination))) throw new Error(`Refusing to remove ${publicPath}: ${destination} is missing`);
  fs.unlinkSync(toAbs(publicPath));
}
for (const { rel, text } of codeChanges) fs.writeFileSync(path.join(root, rel), text);
fs.writeFileSync(redirectsFile, `${JSON.stringify(finalRedirects, null, 2)}\n`);
