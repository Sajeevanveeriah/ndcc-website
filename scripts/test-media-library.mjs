import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkMediaReferences, likePatternForPath, MEDIA_REFERENCE_COLUMNS } from '../lib/media-references.ts';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const path = 'ab/ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12.webp';

assert.equal(likePatternForPath('a_b%c'), '%a\\_b\\%c%', 'LIKE wildcards are matched literally');

// Known URL columns are all covered.
const covered = new Set(MEDIA_REFERENCE_COLUMNS.map(({ table, column }) => `${table}.${column}`));
for (const key of ['news.image_url', 'news.content', 'events.image_url', 'sponsors.logo_url', 'gallery_images.image_url', 'gallery_albums.cover_image_url', 'content_blocks.image_url', 'site_promotions.image_url', 'publications.document_url']) {
  assert.ok(covered.has(key), `${key} is checked before deleting media`);
}

const queried = [];
const fake = (hits = {}, errors = {}) => async (table, column, pattern) => {
  queried.push(pattern);
  const key = `${table}.${column}`;
  if (errors[key]) return { count: null, error: errors[key] };
  return { count: hits[key] ?? 0, error: null };
};

assert.deepEqual(await checkMediaReferences(path, fake()), { status: 'unreferenced' });
assert.ok(queried.every((pattern) => pattern === `%${path}%`), 'every column is searched for the storage path');

const referenced = await checkMediaReferences(path, fake({ 'news.image_url': 2, 'sponsors.logo_url': 1 }));
assert.equal(referenced.status, 'referenced');
assert.deepEqual(referenced.references, [{ label: 'News cover image', count: 2 }, { label: 'Sponsor logo', count: 1 }]);

// Optional tables that are not migrated yet cannot hold references.
assert.deepEqual(await checkMediaReferences(path, fake({}, { 'site_promotions.image_url': { code: 'PGRST205', message: "Could not find the table 'public.site_promotions'" } })), { status: 'unreferenced' });
assert.deepEqual(await checkMediaReferences(path, fake({}, { 'events.image_url': { code: '42703', message: 'column does not exist' } })), { status: 'unreferenced' });

// Any other failure blocks deletion.
assert.equal((await checkMediaReferences(path, fake({}, { 'news.content': { code: '57014', message: 'canceling statement due to statement timeout' } }))).status, 'unknown');
assert.equal((await checkMediaReferences(path, async () => { throw new Error('network'); })).status, 'unknown');
assert.equal((await checkMediaReferences(path, async () => ({ count: null, error: null }))).status, 'unknown', 'a missing count is not proof of no use');
assert.equal((await checkMediaReferences('ab', fake())).status, 'unknown', 'too-short paths are refused');

const route = read('app/api/admin/media/route.ts');
assert.match(route, /report\.status === 'referenced'[\s\S]*?\}, 409\)/, 'referenced files are refused with 409');
assert.match(route, /report\.status === 'unknown'[\s\S]*503/, 'unverifiable files are kept');
assert.ok(route.indexOf('findMediaReferences') < route.indexOf('.remove(['), 'references are checked before storage removal');
const upload = read('app/api/admin/media/upload/route.ts');
assert.ok(upload.indexOf('getPublicUrl') < upload.lastIndexOf('recordMediaAsset('), 'library rows are recorded only after publication');
assert.match(read('lib/server/media-library.ts'), /catch \{\s*console\.warn/, 'library recording never fails an upload');
assert.match(read('components/admin/ImageUploadField.tsx'), /Choose from library/);

console.log('Media library reference check, delete blocking and upload recording checks passed.');
