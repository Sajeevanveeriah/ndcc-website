#!/usr/bin/env node
// Verifies gallery originals lose camera metadata (GPS, device details) while
// keeping format, dimensions and orientation. No network or database needed.
//
// Run: npm run test:gallery-sanitise

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// lib/server/gallery-sanitise.ts uses the @/ alias and a bare sharp import;
// point both at real files so the temp copy resolves outside the repo.
const sharpEntry = createRequire(path.join(repoRoot, 'package.json')).resolve('sharp');
const source = readFileSync(path.join(repoRoot, 'lib', 'server', 'gallery-sanitise.ts'), 'utf8')
  .replace("from 'sharp'", `from '${pathToFileURL(sharpEntry).href}'`)
  .replace("'@/lib/gallery/shared'", `'${pathToFileURL(path.join(repoRoot, 'lib', 'gallery', 'shared.ts')).href}'`);
const tmp = mkdtempSync(path.join(os.tmpdir(), 'ndcc-gallery-'));
process.on('exit', () => rmSync(tmp, { recursive: true, force: true }));
writeFileSync(path.join(tmp, 'gallery-sanitise.ts'), source);
const { sanitiseGalleryImage } = await import(pathToFileURL(path.join(tmp, 'gallery-sanitise.ts')).href);

const base = sharp({ create: { width: 64, height: 32, channels: 3, background: '#880000' } });
const exif = { IFD0: { Make: 'TestPhone', Model: 'GPS-Cam' }, IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '38/1 10/1 0/1' } };

for (const [mime, encode] of [
  ['image/jpeg', (s) => s.jpeg()],
  ['image/png', (s) => s.png()],
  ['image/webp', (s) => s.webp()],
]) {
  const input = await encode(base.clone().withExif(exif).withMetadata({ orientation: 6 })).toBuffer();
  const before = await sharp(input).metadata();
  assert.ok(before.exif, `${mime} fixture should carry EXIF`);

  const output = await sanitiseGalleryImage(input, mime);
  const after = await sharp(output).metadata();
  assert.equal(after.exif, undefined, `${mime} EXIF must be stripped`);
  assert.equal(after.format, mime.split('/')[1], `${mime} format preserved`);
  // Orientation 6 is baked in: the 64x32 image becomes 32x64 with no tag.
  assert.equal(after.width, 32);
  assert.equal(after.height, 64);
  assert.ok(!after.orientation || after.orientation === 1);
}

const png = await base.clone().png().toBuffer();
await assert.rejects(() => sanitiseGalleryImage(png, 'image/jpeg'), /do not match/);
await assert.rejects(() => sanitiseGalleryImage(Buffer.from('not an image'), 'image/png'));
await assert.rejects(() => sanitiseGalleryImage(png, 'image/gif'), /Unsupported/);

const panel = readFileSync(path.join(repoRoot, 'components', 'admin', 'gallery', 'BulkUploadPanel.tsx'), 'utf8');
assert.match(panel, /\/api\/admin\/gallery\/uploads\/sanitise/, 'bulk upload must clean each file before finalising');

console.log('gallery sanitise tests passed');
