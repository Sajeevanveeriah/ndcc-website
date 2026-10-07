#!/usr/bin/env node
// CMS "fewer steps" regressions: save labels follow the chosen publication
// state, ?new= deep links open editors, the Media Library and editor fields
// upload (button, multiple files, drag and drop) through the shared signed
// upload flow, list rows publish in one click, inline previews stay
// client-side, and every admin nav link is gated by a permission or role.
//
// Usage: npm run test:cms-fewer-steps
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { publicationState, saveButtonLabel } from '../lib/admin-save-label.ts';
import { readNewEditorParam, withoutNewEditorParam } from '../lib/admin-open-editor.ts';
import { CMS_IMAGE_TYPES, CMS_MEDIA_TYPES, CMS_PDF_TYPES, cmsClientUploadLimit, cmsUploadErrorMessage, cmsUploadProblem } from '../lib/admin-upload-rules.ts';

const read = (file) => readFileSync(file, 'utf8');
let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

function loadTsModule(filename, requireMap = {}) {
  const output = ts.transpileModule(read(filename), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  const module = { exports: {} };
  const localRequire = (id) => {
    if (id in requireMap) return requireMap[id];
    throw new Error(`Unexpected test-time require ${id} from ${filename}`);
  };
  new Function('require', 'module', 'exports', output)(localRequire, module, module.exports);
  return module.exports;
}

const now = Date.parse('2026-10-07T00:00:00.000Z');
const past = '2026-10-06T00:00:00.000Z';
const future = '2026-10-08T00:00:00.000Z';

test('publication state follows published and published_at', () => {
  assert.equal(publicationState(false, null, now), 'draft');
  assert.equal(publicationState(false, future, now), 'draft', 'unpublished is a draft even with a date');
  assert.equal(publicationState(undefined, null, now), 'draft');
  assert.equal(publicationState(true, null, now), 'published');
  assert.equal(publicationState(true, past, now), 'published');
  assert.equal(publicationState(true, future, now), 'scheduled');
  assert.equal(publicationState(true, 'not a date', now), 'published');
});

test('save label matches the chosen state', () => {
  assert.equal(saveButtonLabel('draft'), 'Save draft');
  assert.equal(saveButtonLabel('published'), 'Publish now');
  assert.equal(saveButtonLabel('scheduled'), 'Schedule');
  // Editing something that is already live.
  assert.equal(saveButtonLabel('published', true), 'Save changes');
  assert.equal(saveButtonLabel('draft', true), 'Unpublish and save draft');
  assert.equal(saveButtonLabel('scheduled', true), 'Schedule');
});

test('news, events, publications and calendar editors use the save-label helper', () => {
  for (const file of ['app/admin/news/page.tsx', 'app/admin/events/page.tsx', 'app/admin/publications/page.tsx', 'components/admin/calendar/CalendarEventFormModal.tsx']) {
    const source = read(file);
    assert.match(source, /from '@\/lib\/admin-save-label'/, `${file} imports the helper`);
    assert.match(source, /saveButtonLabel\(/, `${file} uses saveButtonLabel`);
  }
  assert.doesNotMatch(read('app/admin/news/page.tsx'), /'Publish Article'/, 'news no longer says Publish for drafts');
  assert.doesNotMatch(read('app/admin/publications/page.tsx'), /'Create & Publish'/);
  assert.match(read('app/admin/calendar/page.tsx'), /wasPublished=\{/);
});

test('?new= deep links parse and are removed after use', () => {
  assert.deepEqual(readNewEditorParam(''), { open: false });
  assert.deepEqual(readNewEditorParam('?tab=x'), { open: false });
  assert.deepEqual(readNewEditorParam('?new=1'), { open: true, type: null });
  assert.deepEqual(readNewEditorParam('?new=weekly_match_report', ['weekly_match_report']), { open: true, type: 'weekly_match_report' });
  assert.deepEqual(readNewEditorParam('?new=<script>', ['weekly_match_report']), { open: true, type: null }, 'unknown types never preset');
  assert.equal(withoutNewEditorParam('https://example.test/admin/publications?new=1&q=a#top'), '/admin/publications?q=a#top');
  assert.equal(withoutNewEditorParam('https://example.test/admin/news?new=1'), '/admin/news');
});

test('news, events and publications open the editor from ?new=', () => {
  for (const file of ['app/admin/news/page.tsx', 'app/admin/events/page.tsx']) {
    assert.match(read(file), /if \(consumeNewEditorParam\(\)\.open\) openCreate\(\);/, `${file} opens a blank editor`);
  }
  const publications = read('app/admin/publications/page.tsx');
  assert.match(publications, /consumeNewEditorParam\(TYPE_OPTIONS\.map\(\(option\) => option\.value\)\)/);
  assert.match(publications, /openCreate\(request\.type/);
  assert.match(publications, /\.\.\.\(type \? \{ publication_type: type \} : \{\}\)/, 'type preset reaches the form');
  assert.match(publications, /value: 'weekly_match_report'/);
});

test('dashboard quick actions link straight to the editors', () => {
  const dashboard = read('app/admin/page.tsx');
  for (const [href, label] of [
    ['/admin/news?new=1', 'Write News Article'],
    ['/admin/events?new=1', 'Create New Event'],
    ['/admin/match-day?tab=team-sheets', 'Add team sheet'],
    ['/admin/match-day?tab=winners', 'Add winner'],
    ['/admin/publications?new=weekly_match_report', 'Add match report'],
  ]) {
    const index = dashboard.indexOf(`href="${href}"`);
    assert.ok(index > 0, `quick action ${href}`);
    assert.ok(dashboard.slice(index, index + 400).includes(label), `${href} is labelled ${label}`);
  }
});

test('upload rules match the existing limits', () => {
  assert.deepEqual([...CMS_MEDIA_TYPES].sort(), [...CMS_IMAGE_TYPES, ...CMS_PDF_TYPES].sort());
  const server = read('lib/server/cms-media.ts');
  for (const type of CMS_MEDIA_TYPES) assert.ok(server.includes(`'${type}'`), `server accepts ${type}`);
  const MB = 1024 * 1024;
  assert.equal(cmsClientUploadLimit('application/pdf'), 10 * MB);
  assert.equal(cmsClientUploadLimit('image/gif'), 4 * MB);
  assert.equal(cmsClientUploadLimit('image/jpeg'), 20 * MB, 'resized in the browser before the server 4 MB limit');
  assert.equal(cmsUploadProblem({ type: 'image/png', size: 1000 }), null);
  assert.equal(cmsUploadProblem({ type: 'application/pdf', size: 9 * MB }), null);
  assert.match(cmsUploadProblem({ type: 'application/pdf', size: 11 * MB }), /Maximum is 10 MB/);
  assert.match(cmsUploadProblem({ type: 'image/gif', size: 5 * MB }), /Maximum is 4 MB/);
  assert.match(cmsUploadProblem({ type: 'text/html', size: 10 }), /not supported/);
  assert.match(cmsUploadProblem({ type: 'image/png', size: 10 }, CMS_PDF_TYPES), /not a PDF/);
  assert.match(cmsUploadProblem({ type: 'application/pdf', size: 10 }, CMS_IMAGE_TYPES), /JPEG, PNG, WebP or GIF image\./);
  assert.match(cmsUploadErrorMessage(new Error('HTTP 413')), /too large for the server/);
  assert.equal(cmsUploadErrorMessage(new Error('Forbidden.')), 'Forbidden.');
});

test('image field drop zone uses the same upload path and checks', () => {
  const field = read('components/admin/ImageUploadField.tsx');
  assert.match(field, /data-drop-zone/);
  for (const handler of ['onDragEnter', 'onDragOver', 'onDragLeave', 'onDrop']) assert.match(field, new RegExp(`${handler}:`), handler);
  assert.match(field, /\{\.\.\.dropHandlers\}/);
  assert.match(field, /void uploadFile\(files\[0\]\)/, 'drops go through uploadFile');
  assert.match(field, /uploadCmsMedia\(file\)/);
  assert.match(field, /cmsUploadProblem\(file, acceptedTypes\)/, 'dropped files get the type and size checks');
  assert.match(field, /aria-describedby=\{dropHintId\}/, 'the keyboard upload button describes the drop zone');
  assert.match(field, /role="status" aria-live="polite"/);
  assert.match(field, /Or drag and drop/);
});

test('Media Library uploads multiple files sequentially and refreshes', () => {
  const media = read('app/admin/media/page.tsx');
  assert.match(media, /Upload files/);
  assert.match(media, /type="file"\s+multiple/);
  assert.match(media, /accept=\{CMS_MEDIA_TYPES\.join\(','\)\}/);
  assert.match(media, /from '@\/lib\/admin-media-upload'/);
  assert.match(media, /for \(let index = 0; index < files\.length; index \+= 1\)[\s\S]*?await uploadCmsMedia\(file\)/, 'one file at a time');
  assert.match(media, /cmsUploadProblem\(file, CMS_MEDIA_TYPES\)/);
  assert.match(media, /if \(uploaded > 0\) await load\(0\)/, 'list refreshes after uploads');
  assert.match(media, /aria-live="polite"/);
  // Anyone who can open /admin/media (content permission) may upload.
  const permissions = read('lib/auth/permissions.ts');
  assert.match(permissions, /content: \{[^\n]*aliases: \[[^\]]*'\/admin\/media'/);
  assert.match(permissions, /MEDIA_UPLOAD_PERMISSIONS[\s\S]*'content'/);
});

test('list rows publish and unpublish in one click with confirmation', () => {
  for (const [file, resource] of [['app/admin/news/page.tsx', 'news'], ['app/admin/events/page.tsx', 'events'], ['app/admin/publications/page.tsx', 'publications']]) {
    const source = read(file);
    assert.match(source, new RegExp(`const setPublished = async[\\s\\S]*?'/api/admin/resources/${resource}'[\\s\\S]*?method: 'PATCH'[\\s\\S]*?revision: [a-z]+\\.revision, published`), `${file} PATCHes one row`);
    assert.match(source, /onClick=\{\(\) => void setPublished\(/);
    assert.match(source, /unpublished and saved as a draft/);
    assert.match(source, /<p role="status"/, `${file} announces the result`);
    assert.match(source, /<BatchActionsBar/, `${file} keeps batch actions`);
  }
});

test('inline previews render the unsaved form client-side only', () => {
  const preview = read('components/admin/InlinePreview.tsx');
  assert.doesNotMatch(preview, /fetch\(|adminFetch|\/api\//, 'no network or routes');
  assert.match(preview, /aria-pressed=\{previewing\}/);
  assert.match(preview, /Nothing has been saved or published/);
  for (const [file, id] of [['app/admin/news/page.tsx', 'news'], ['app/admin/events/page.tsx', 'event'], ['app/admin/publications/page.tsx', 'publication']]) {
    const source = read(file);
    assert.match(source, /<InlinePreview/);
    assert.match(source, new RegExp(`id="${id}-editor-fields" className="space-y-4" hidden=\\{preview\\.previewing\\}`), `${file} keeps the form mounted`);
    assert.match(source, new RegExp(`controls="${id}-editor-fields"`));
  }
  assert.doesNotMatch(read('app/admin/publications/page.tsx'), /previewOpen/, 'nested preview modal replaced');
});

test('every admin nav link is gated by a permission or a role flag', () => {
  const config = loadTsModule('lib/auth/config.ts');
  const permissions = loadTsModule('lib/auth/permissions.ts', { './config': config });
  const layout = read('app/admin/layout.tsx');
  const links = [...layout.matchAll(/\{ href: '([^']+)', label: '([^']+)'([^\n]*)\}/g)].map(([, href, label, rest]) => ({
    href, label, roleGated: /usersOnly: true|fullAccessOnly: true|adminOnly: true/.test(rest),
  }));
  assert.ok(links.length > 40, `found ${links.length} nav links`);
  for (const link of links) {
    if (link.href === '/admin/change-password') continue;
    const permission = permissions.permissionForAdminPath(link.href);
    assert.ok(permission || link.roleGated, `${link.href} (${link.label}) resolves to a permission or is role-gated`);
  }
  const byHref = Object.fromEntries(links.map((link) => [link.href, link]));
  // Newly listed standalone tools, with the same role rules as their APIs.
  assert.ok(byHref['/admin/operations']?.roleGated, 'operations is full-access only');
  assert.match(layout, /href: '\/admin\/operations'[^\n]*fullAccessOnly: true/);
  assert.match(layout, /href: '\/admin\/payments\/bank-transfers'[^\n]*adminOnly: true/);
  assert.equal(permissions.permissionForAdminPath('/admin/payments/bank-transfers'), 'payments');
  assert.match(layout, /if \(link\.adminOnly && user\.role !== 'admin'\) return false;/);
  assert.match(read('app/api/admin/payments/bank-transfers/route.ts'), /admin\.role !== 'admin'/);
  assert.match(read('app/api/admin/operations/route.ts'), /FULL_ACCESS_ROLES/);
  // Redirect aliases and sub-pages reachable from a parent page stay out of the nav.
  for (const href of ['/admin/club-settings', '/admin/content-blocks', '/admin/fantasy/import', '/admin/fantasy/managers', '/admin/fantasy/rounds', '/admin/fantasy/scoring', '/admin/fantasy/settings', '/admin/memberships/directory']) {
    assert.equal(byHref[href], undefined, `${href} is not duplicated in the nav`);
  }
});

console.log(`CMS fewer-steps checks passed (${passed} groups).`);
