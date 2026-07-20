#!/usr/bin/env node
// Deterministic unit tests for lib/gallery/shared.ts (pure logic — no
// network, no database, no Supabase credentials).
//
// Run: npm run test:gallery-bulk-upload
//   (uses node --experimental-strip-types to load the TS module directly;
//    lib/gallery/shared.ts deliberately has no imports so this stays simple)

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shared = await import(pathToFileURL(path.join(repoRoot, 'lib', 'gallery', 'shared.ts')).href);

const {
  GALLERY_MEDIA_BUCKET,
  MAX_GALLERY_BATCH_FILES,
  MAX_GALLERY_FILE_BYTES,
  buildGalleryDownloadUrl,
  buildGalleryStoragePath,
  galleryDownloadFilename,
  galleryFallbackAltText,
  isPathWithinAlbum,
  isValidAlbumSlug,
  sanitizeGalleryFilenameBase,
  slugifyAlbumTitle,
  validateGalleryBatch,
  validateGalleryFileMeta,
} = shared;

const ALBUM_A = '11111111-2222-4333-8444-555555555555';
const ALBUM_B = '99999999-2222-4333-8444-555555555555';
const OBJ = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

// --- slug validation ---------------------------------------------------------
for (const good of ['finals-day-2026', 'a', 'grand-final-1', 'x1-y2']) {
  assert.ok(isValidAlbumSlug(good), `slug accepted: ${good}`);
}
for (const bad of ['', 'Finals', 'finals--day', '-finals', 'finals-', 'finals day', 'finals/day', 'a'.repeat(121), null, 42]) {
  assert.ok(!isValidAlbumSlug(bad), `slug rejected: ${String(bad)}`);
}
assert.equal(slugifyAlbumTitle('Grand Final — 2026/27 Séason!'), 'grand-final-2026-27-season');

// --- filename sanitisation ---------------------------------------------------
assert.equal(sanitizeGalleryFilenameBase('IMG_1234.JPG'), 'img_1234');
assert.equal(sanitizeGalleryFilenameBase('../../etc/passwd'), 'etc-passwd');
assert.equal(sanitizeGalleryFilenameBase('%%%.png'), 'photo');
assert.equal(sanitizeGalleryFilenameBase('a'.repeat(200) + '.jpg'), 'a'.repeat(60));
assert.equal(galleryDownloadFilename('Finals Day #1.jpeg', 'image/jpeg'), 'finals-day-1.jpg');
assert.equal(galleryDownloadFilename(null, 'image/webp'), 'photo.webp');
// extension comes from the STORED mime type, never the claimed filename
assert.equal(galleryDownloadFilename('malware.exe', 'image/png'), 'malware.png');

// --- per-file validation -----------------------------------------------------
const okFile = { filename: 'match.jpg', mimeType: 'image/jpeg', sizeBytes: 1024 };
assert.equal(validateGalleryFileMeta(okFile), null);
assert.match(validateGalleryFileMeta({ ...okFile, mimeType: 'image/svg+xml' }), /JPEG, PNG and WebP/);
assert.match(validateGalleryFileMeta({ ...okFile, mimeType: 'application/pdf' }), /JPEG, PNG and WebP/);
assert.match(validateGalleryFileMeta({ ...okFile, mimeType: 'image/heic' }), /JPEG, PNG or WebP/);
assert.match(validateGalleryFileMeta({ ...okFile, sizeBytes: 0 }), /greater than zero/);
assert.match(validateGalleryFileMeta({ ...okFile, sizeBytes: MAX_GALLERY_FILE_BYTES + 1 }), /20 MB/);
assert.equal(validateGalleryFileMeta({ ...okFile, sizeBytes: MAX_GALLERY_FILE_BYTES }), null);
assert.match(validateGalleryFileMeta({ ...okFile, filename: 'a/b.jpg' }), /invalid characters/);
assert.match(validateGalleryFileMeta({ ...okFile, filename: '.hidden.jpg' }), /invalid characters/);
assert.match(validateGalleryFileMeta({ ...okFile, filename: 'x'.repeat(300) }), /too long/);
assert.match(validateGalleryFileMeta({ ...okFile, width: -5 }), /width/);
assert.match(validateGalleryFileMeta({ ...okFile, height: 1000000 }), /height/);
assert.equal(validateGalleryFileMeta({ ...okFile, width: 4000, height: 3000 }), null);
assert.match(validateGalleryFileMeta({ ...okFile, contentHash: 'NOT-HEX' }), /hex digest/);
assert.equal(validateGalleryFileMeta({ ...okFile, contentHash: 'a'.repeat(64) }), null);

// --- batch validation --------------------------------------------------------
assert.match(validateGalleryBatch([]), /At least one/);
assert.match(validateGalleryBatch(Array.from({ length: MAX_GALLERY_BATCH_FILES + 1 }, (_, i) => ({ filename: `f${i}.jpg`, mimeType: 'image/jpeg', sizeBytes: 10 }))), /maximum of 100/i);
assert.equal(validateGalleryBatch([okFile, { filename: 'other.png', mimeType: 'image/png', sizeBytes: 5 }]), null);
// duplicate by identical hash
assert.match(validateGalleryBatch([
  { ...okFile, contentHash: 'ab'.repeat(16) },
  { filename: 'renamed.jpg', mimeType: 'image/jpeg', sizeBytes: 999, contentHash: 'ab'.repeat(16) },
]), /Duplicate/);
// duplicate by name+size when no hash
assert.match(validateGalleryBatch([okFile, { ...okFile }]), /Duplicate/);
// bounded total batch size (50 files x 20 MB = 1000 MB > 800 MB cap)
assert.match(validateGalleryBatch(Array.from({ length: 50 }, (_, i) => ({ filename: `f${i}.jpg`, mimeType: 'image/jpeg', sizeBytes: MAX_GALLERY_FILE_BYTES }))), /Total batch size/);

// --- storage path generation and containment ---------------------------------
const generated = buildGalleryStoragePath(ALBUM_A, 2026, OBJ, 'My Finals Photo.JPG', 'image/jpeg');
assert.equal(generated, `albums/${ALBUM_A}/2026/${OBJ}-my-finals-photo.jpg`);
assert.ok(isPathWithinAlbum(generated, ALBUM_A), 'generated path stays inside its album prefix');
assert.ok(!isPathWithinAlbum(generated, ALBUM_B), 'path never validates against another album');
assert.throws(() => buildGalleryStoragePath('not-a-uuid', 2026, OBJ, 'x.jpg', 'image/jpeg'));
assert.throws(() => buildGalleryStoragePath(ALBUM_A, 2026, OBJ, 'x.svg', 'image/svg+xml'));

for (const evil of [
  `albums/${ALBUM_A}/2026/../${OBJ}-x.jpg`,
  `albums/${ALBUM_A}/2026/${OBJ}-x.jpg/../../secret.jpg`,
  `/albums/${ALBUM_A}/2026/${OBJ}-x.jpg`,
  `albums/${ALBUM_B}/2026/${OBJ}-x.jpg`,
  `albums/${ALBUM_A}/2026/${OBJ}-x.svg`,
  `albums/${ALBUM_A}/2026/${OBJ}-x.jpg%00`,
  `albums/${ALBUM_A}//2026/${OBJ}-x.jpg`,
  `other-bucket/${ALBUM_A}/2026/${OBJ}-x.jpg`,
  `albums/${ALBUM_A}/2026/plain-name.jpg`,
  '',
  null,
  42,
]) {
  assert.ok(!isPathWithinAlbum(evil, ALBUM_A), `path rejected: ${String(evil)}`);
}

// --- download URL + alt fallback ---------------------------------------------
assert.equal(
  buildGalleryDownloadUrl('https://x.supabase.co/storage/v1/object/public/gallery-media/a.jpg', 'finals.jpg'),
  'https://x.supabase.co/storage/v1/object/public/gallery-media/a.jpg?download=finals.jpg'
);
assert.equal(
  buildGalleryDownloadUrl('https://x.supabase.co/img.jpg?v=1', 'a b.jpg'),
  'https://x.supabase.co/img.jpg?v=1&download=a%20b.jpg'
);
assert.equal(galleryFallbackAltText('Finals', 1, 42), 'Finals gallery photograph 1 of 42');
assert.equal(galleryFallbackAltText('  ', 3, 9), 'Gallery photograph 3 of 9');

assert.equal(GALLERY_MEDIA_BUCKET, 'gallery-media');

console.log('Gallery bulk-upload logic checks passed.');
