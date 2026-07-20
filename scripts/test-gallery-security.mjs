#!/usr/bin/env node
// Structural security checks for the gallery album / bulk upload feature.
// CI-safe: reads source files only, no credentials required.
//
// Run: npm run test:gallery-security

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20260720090000_gallery_albums_bulk_upload.sql', 'utf8');

// Storage bucket configuration: public read, strict MIME allowlist, 20 MB cap.
assert.match(migration, /'gallery-media'/);
assert.match(migration, /20971520/);
assert.match(migration, /image\/jpeg/);
assert.match(migration, /image\/png/);
assert.match(migration, /image\/webp/);
assert.doesNotMatch(migration, /svg/i, 'SVG must never be an allowed gallery MIME type');
assert.doesNotMatch(migration, /application\/pdf/);
// No permissive write policies on storage.objects for anon/authenticated.
assert.doesNotMatch(migration, /create\s+policy[\s\S]{0,300}?on\s+storage\.objects/i, 'migration must not create storage.objects policies');
assert.doesNotMatch(migration, /(insert|update|delete)\s+on\s+storage\.objects/i, 'no write grants on storage.objects');
assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /ON DELETE SET NULL/);
assert.match(migration, /Rollback/);

// Every admin gallery endpoint enforces the committee session guard.
const routes = [
  'app/api/admin/gallery/albums/route.ts',
  'app/api/admin/gallery/uploads/prepare/route.ts',
  'app/api/admin/gallery/uploads/finalize/route.ts',
  'app/api/admin/gallery/uploads/cleanup/route.ts',
];
for (const file of routes) {
  const source = readFileSync(file, 'utf8');
  assert.match(source, /requireSession\(GALLERY_ADMIN_ROLES\)/, `${file} uses requireSession with gallery roles`);
  assert.match(source, /status: 403/, `${file} rejects missing sessions`);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/, `${file} never touches the raw service key`);
}
const roles = readFileSync('lib/gallery/roles.ts', 'utf8');
assert.doesNotMatch(roles, /fantasy_manager/, 'fantasy_manager has no gallery write access');

const prepare = readFileSync('app/api/admin/gallery/uploads/prepare/route.ts', 'utf8');
assert.match(prepare, /validateGalleryBatch/);
assert.match(prepare, /buildGalleryStoragePath\(albumId, year, randomUUID\(\)/, 'object paths are server-generated');
assert.match(prepare, /createSignedUploadUrl/);
assert.doesNotMatch(prepare, /upsert:\s*true/, 'signed uploads must never allow overwrite');

const finalize = readFileSync('app/api/admin/gallery/uploads/finalize/route.ts', 'utf8');
assert.match(finalize, /isPathWithinAlbum/, 'finalisation revalidates the album prefix');
assert.match(finalize, /createSignedUrl\(entry\.path, 60\)/, 'finalisation verifies object existence in Storage');
assert.match(finalize, /validateGalleryFileMeta/, 'finalisation revalidates MIME/size');
assert.match(finalize, /duplicates/, 'duplicate finalisation is reported, not re-inserted');
assert.ok(!/gallery_albums'\)[\s\S]{0,120}\.update\(/.test(finalize), 'finalisation never updates the album row (no auto-publish)');

const cleanup = readFileSync('app/api/admin/gallery/uploads/cleanup/route.ts', 'utf8');
assert.match(cleanup, /isPathWithinAlbum/, 'cleanup restricts paths to the album prefix');
assert.match(cleanup, /confirmCount/, 'permanent deletion needs an explicit count confirmation');
assert.doesNotMatch(cleanup, /\.list\(/, 'cleanup never deletes by prefix listing');

// Album publication rules.
const albums = readFileSync('app/api/admin/gallery/albums/route.ts', 'utf8');
assert.match(albums, /payload\.published = false/, 'new albums are always created as drafts');
assert.match(albums, /confirmPublication !== true/, 'publishing requires the consent acknowledgement');
assert.match(albums, /publish_confirmed_at/, 'publication is audited');

// Client bundle hygiene: no service-role usage in any client component.
for (const file of [
  'components/admin/gallery/BulkUploadPanel.tsx',
  'components/admin/gallery/AlbumsPanel.tsx',
  'components/admin/gallery/ImagesPanel.tsx',
  'app/gallery/[slug]/AlbumClient.tsx',
  'app/gallery/GalleryClient.tsx',
  'lib/gallery/shared.ts',
  'lib/supabase.ts',
]) {
  const source = readFileSync(file, 'utf8');
  assert.doesNotMatch(source, /SERVICE_ROLE/i, `${file} must not reference the service-role key`);
  assert.doesNotMatch(source, /GITHUB_CONTENTS_TOKEN/, `${file} must not reference GitHub credentials`);
}

// Bulk uploader behaviour: bounded retries, no retry storm, direct-to-Storage.
const uploader = readFileSync('components/admin/gallery/BulkUploadPanel.tsx', 'utf8');
assert.match(uploader, /MAX_UPLOAD_ATTEMPTS = 3/);
assert.match(uploader, /uploadToSignedUrl/, 'browser uploads use the official signed-upload method');
assert.match(uploader, /UPLOAD_CONCURRENCY = 3/);
assert.match(uploader, /permanent \|\| attempt === MAX_UPLOAD_ATTEMPTS/, 'auth/permission failures are not retried');
assert.match(uploader, /beforeunload/, 'leaving mid-upload warns the user');
assert.match(uploader, /if \(running\) return; \/\/ duplicate-press protection/);
assert.match(uploader, /PUBLISH_CONSENT_TEXT/);
assert.doesNotMatch(uploader, /\/api\/admin\/media\/upload/, 'bulk uploads never post bytes to a Vercel route');

// Public album page: downloads only when allowed, original file preferred.
const albumClient = readFileSync('app/gallery/[slug]/AlbumClient.tsx', 'utf8');
assert.match(albumClient, /albumAllowsDownload && activePhoto\.allow_download/, 'download button is permission-gated');
assert.match(albumClient, /original_url/, 'downloads use the original file when available');
assert.match(albumClient, /buildGalleryDownloadUrl/);
assert.match(albumClient, /rel="noopener"/);
assert.match(albumClient, /ArrowLeft/); // keyboard navigation
assert.match(albumClient, /Escape/);
assert.match(albumClient, /triggerRef\.current\?\.focus\(\)/, 'focus returns to the opening tile');
assert.match(albumClient, /aria-modal="true"/);

// Public queries stay published-only.
const publicData = readFileSync('lib/public-data.ts', 'utf8');
assert.match(publicData, /from\('gallery_albums'\)[\s\S]{0,200}\.eq\('published', true\)/, 'public album list is published-only');
assert.match(publicData, /getPublicAlbumBySlug/);
assert.match(publicData, /is\('album_id', null\)/, 'flat gallery keeps serving ungrouped images');

// Existing GitHub-backed uploader remains structurally intact for CMS use.
const legacyUploader = readFileSync('components/admin/ImageUploadField.tsx', 'utf8');
assert.match(legacyUploader, /\/api\/admin\/media\/upload/);
assert.match(legacyUploader, /Upload image/);
const legacyRoute = readFileSync('app/api/admin/media/upload/route.ts', 'utf8');
assert.match(legacyRoute, /requireSession/);
assert.match(legacyRoute, /api\.github\.com/);

// The consent text is the exact agreed wording.
const types = readFileSync('components/admin/gallery/types.ts', 'utf8');
assert.match(types, /I confirm the club has authority to publish these photographs and that any required consent has been obtained\./);

console.log('Gallery security structural checks passed.');
