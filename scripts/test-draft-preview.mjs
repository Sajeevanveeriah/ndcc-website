import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canRenderRecord, isPubliclyVisible, previewBannerLabel, previewPath, safeReturnPath, PREVIEW_PERMISSIONS } from '../lib/preview.ts';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const now = Date.parse('2026-10-01T00:00:00Z');
const draft = { published: false, published_at: null };
const scheduled = { published: true, published_at: '2026-10-02T00:00:00Z' };
const live = { published: true, published_at: '2026-09-30T00:00:00Z' };
const legacy = { published: true, published_at: null };

// Outside draft mode the public rule is unchanged.
assert.equal(canRenderRecord(draft, false, now), false);
assert.equal(canRenderRecord(scheduled, false, now), false);
assert.equal(canRenderRecord(live, false, now), true);
assert.equal(canRenderRecord(legacy, false, now), true, 'records without a schedule stay visible');
assert.equal(canRenderRecord(null, true, now), false);
assert.equal(isPubliclyVisible({ published: true, published_at: 'garbage' }, now), false);
// Draft mode renders anything, always with a banner unless already public.
assert.equal(canRenderRecord(draft, true, now), true);
assert.equal(canRenderRecord(scheduled, true, now), true);
assert.equal(previewBannerLabel(draft, true, now), 'Preview - not published');
assert.equal(previewBannerLabel(scheduled, true, now), 'Preview - not published yet (scheduled)');
assert.match(previewBannerLabel(live, true, now), /already published/);
assert.equal(previewBannerLabel(draft, false, now), null, 'no banner outside draft mode');

// Preview targets and redirects.
const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
assert.equal(previewPath('news', id), `/news/${id}`);
assert.equal(previewPath('event', id), `/events/${id}`);
assert.equal(previewPath('content', id, 'about'), '/about');
assert.equal(previewPath('content', id, 'footer'), '/');
assert.equal(previewPath('content', id, 'unknown'), '/');
assert.equal(previewPath('news', '../../admin'), null);
assert.deepEqual(PREVIEW_PERMISSIONS, { news: 'news', event: 'events', content: 'content' });
for (const unsafe of ['https://evil.example', '//evil.example', '/\\evil', '/admin/users', '/api/admin/preview', 'javascript:alert(1)', `/${'a'.repeat(400)}`]) {
  assert.equal(safeReturnPath(unsafe), '/', `${unsafe} is not a valid return path`);
}
assert.equal(safeReturnPath(`/news/${id}`), `/news/${id}`);

// Route and page wiring: draft mode only after a permission check; pages gate on draftMode().
const route = read('app/api/admin/preview/route.ts');
assert.ok(route.indexOf('requirePermission(PREVIEW_PERMISSIONS[type])') < route.indexOf('draft.enable()'), 'permission is checked before enabling draft mode');
assert.match(route, /draft\.disable\(\)/);
for (const page of ['app/news/[id]/page.tsx', 'app/events/[id]/page.tsx']) {
  const source = read(page);
  assert.match(source, /export const dynamic = 'force-static'/, `${page} stays statically generated for the public`);
  assert.match(source, /\(await draftMode\(\)\)\.isEnabled/, `${page} reads draft mode`);
  assert.match(source, /if \(preview\) \{/, `${page} only bypasses publication rules in draft mode`);
  assert.match(source, /PreviewBanner/, `${page} shows the preview banner`);
  assert.match(source, /robots: \{ index: false, follow: false \}/, `${page} keeps previews out of search`);
}
assert.match(read('app/events/[id]/page.tsx'), /\.eq\('published', true\)/, 'public event detail still requires published');
assert.match(read('lib/public-news.ts'), /Draft-mode only/);
const blocks = read('lib/content-blocks.ts');
assert.match(blocks, /preview \? base : base\.eq\('is_active', true\)/, 'hidden page sections show only while previewing');
assert.match(blocks, /catch \{\s*return false;/, 'outside a request, draft mode is treated as off');

// Scheduled publishing for events and sponsors, with a pre-migration fallback.
const data = read('lib/public-data.ts');
assert.match(data, /published_at\.is\.null,published_at\.lte\.\$\{minute\}/);
assert.equal((data.match(/if \(isMissingPublishedAtColumn\(error\)\)/g) || []).length, 2, 'events and sponsors fall back when the column is missing');

console.log('Draft-mode gating, preview redirects, banner and scheduled visibility checks passed.');
