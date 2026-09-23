const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(path, imports = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: name => { assert(name in imports, name); return imports[name]; }, Uint8Array, TextDecoder, Response, Request, URL, Date, console });
  return exports;
}
const files = load('lib/meeting-minute-files.ts');
const csrf = load('lib/auth/csrf.ts');
const pdf = Buffer.from('%PDF-1.4\nQA document\n%%EOF');
const id = '11111111-1111-4111-8111-111111111111';
let user = { id: 'editor', role: 'admin' }, row = null, stored = new Map(), uploadFailure = false, saveFailure = false;
const client = {
  from() {
    let write;
    return { select() { return this; }, eq() { return this; }, update(data) { write = data; return this; }, insert(data) { write = data; return this; },
      async single() { if (write) { if (saveFailure) return { error: true }; row = { ...row, ...write }; } return { data: row, error: row ? null : true }; } };
  },
  storage: { from(bucket) { assert.equal(bucket, files.MINUTE_BUCKET); return {
    async upload(path, bytes) { if (uploadFailure) return { error: true }; stored.set(path, bytes); return {}; },
    async remove(paths) { paths.forEach(path => stored.delete(path)); return {}; },
    async download(path) { return stored.has(path) ? { data: new Blob([stored.get(path)]) } : { error: true }; }
  }; } }
};
const imports = {
  'node:crypto': require('node:crypto'),
  'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200 }) } },
  '@/lib/meeting-minute-files': files,
  '@/lib/auth/guard': { requirePermission: async (_p, roles) => user && (!roles || roles.includes(user.role)) ? user : null },
  '@/lib/supabase-server': { createServerClient: () => client },
  '@/lib/order-input-validation': { readLimitedJsonObject: async request => ({ ok: true, value: await request.json() }) },
  '@/lib/validation/uuid': load('lib/validation/uuid.ts'),
};
const route = load('app/api/meeting-minutes/route.ts', imports);
const document = load('app/api/meeting-minutes/[id]/document/route.ts', imports);
function request({ text = '', file = null, remove = false, editing = false } = {}) {
  const form = new FormData();
  Object.entries({ title: 'Test minutes', meeting_date: '2026-09-21', content: text, status: 'draft', remove_attachment: String(remove) }).forEach(([k,v]) => form.set(k,v));
  if (editing) form.set('id', row?.id || id);
  if (file) form.set('file', new Blob([file.bytes]), file.name);
  return new Request('https://example.com/api/meeting-minutes', { method: editing ? 'PATCH' : 'POST', body: form });
}
(async () => {
  assert.equal(files.validateMinuteFile('Minutes.PDF', pdf), 'application/pdf');
  assert.throws(() => files.validateMinuteFile('bad.pdf', Buffer.from('<html>wrong</html>')));
  assert.throws(() => files.validateMinuteFile('bad.exe', pdf));
  assert.throws(() => files.validateMinuteFile('huge.pdf', new Uint8Array(files.MINUTE_FILE_LIMIT + 1)));
  assert.throws(() => files.validateMinuteFile('empty.pdf', new Uint8Array()));
  assert.equal(files.validateMinuteFile('minutes.doc', Buffer.from([208,207,17,224,161,177,26,225])), 'application/msword');
  assert.match(files.validateMinuteFile('minutes.docx', Buffer.from('PK\x03\x04[Content_Types].xml word/document.xml')), /wordprocessingml/);
  assert.throws(() => files.validateMinuteFile('macro.docx', Buffer.from('PK\x03\x04[Content_Types].xml word/document.xml vbaProject.bin')));
  const surface = { method: 'POST', pathname: '/api/meeting-minutes', hasSessionCookie: true, origin: 'https://www.ndcc.com.au', secFetchSite: 'same-origin', contentType: 'multipart/form-data; boundary=test', csrfHeader: '1' };
  const env = { NODE_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'https://www.ndcc.com.au' };
  assert.equal(csrf.validateAdminCsrfRequest(surface, env).ok, true);
  assert.equal(csrf.validateAdminCsrfRequest({ ...surface, csrfHeader: null }, env).ok, false);
  assert.equal(csrf.validateAdminCsrfRequest({ ...surface, origin: 'https://evil.example' }, env).ok, false);
  assert.equal(csrf.validateAdminCsrfRequest({ ...surface, pathname: '/api/admin/users' }, env).ok, false);
  assert.equal((await route.POST(request())).status, 400);
  user = null; assert.equal((await route.POST(request({ text: 'Typed' }))).status, 403);
  user = { id: 'editor', role: 'admin' };
  assert.equal((await route.POST(request({ text: 'Typed minutes' }))).status, 200); assert.equal(row.content, 'Typed minutes');
  assert.equal((await route.POST(request({ file: { name: 'minutes.pdf', bytes: pdf } }))).status, 200);
  const originalPath = row.attachment_path; assert(stored.has(originalPath)); assert.equal(row.content, '');
  assert.equal((await route.PATCH(request({ editing: true, text: 'Extra notes' }))).status, 200); assert.equal(row.attachment_path, originalPath);
  const downloaded = await document.GET(null, { params: Promise.resolve({ id: row.id }) });
  assert.equal(downloaded.status, 200); assert.equal(downloaded.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), pdf);
  user = { role: 'committee' }; assert.equal((await document.GET(null, { params: Promise.resolve({ id: row.id }) })).status, 404);
  row.status = 'published'; assert.equal((await document.GET(null, { params: Promise.resolve({ id: row.id }) })).status, 200);
  user = null; assert.equal((await document.GET(null, { params: Promise.resolve({ id: row.id }) })).status, 403);
  user = { id: 'editor', role: 'admin' };
  assert.equal((await route.PATCH(request({ editing: true, remove: true }))).status, 400); assert.equal(row.attachment_path, originalPath);
  assert.equal((await route.PATCH(request({ editing: true, file: { name: 'bad.pdf', bytes: Buffer.from('bad') } }))).status, 400); assert.equal(row.attachment_path, originalPath);
  uploadFailure = true;
  assert.equal((await route.PATCH(request({ editing: true, file: { name: 'new.pdf', bytes: pdf } }))).status, 400); assert.equal(row.attachment_path, originalPath);
  uploadFailure = false; saveFailure = true; const count = stored.size;
  assert.equal((await route.PATCH(request({ editing: true, file: { name: 'new.pdf', bytes: pdf } }))).status, 500); assert.equal(stored.size, count); assert.equal(row.attachment_path, originalPath);
  saveFailure = false;
  assert.equal((await route.PATCH(request({ editing: true, file: { name: 'new.pdf', bytes: pdf } }))).status, 200); assert.notEqual(row.attachment_path, originalPath);
  assert.equal((await route.PATCH(request({ editing: true, text: 'Typed replacement', remove: true }))).status, 200); assert.equal(row.attachment_path, null);
  const oversized = new Request('https://example.com', { method: 'POST', body: new Uint8Array(files.MINUTE_FILE_LIMIT + 256 * 1024 + 1) });
  await assert.rejects(() => files.readMinuteForm(oversized), /4 MB/);
  console.log('PASS document formats, size limits, CSRF, typed/uploaded minutes, download bytes, draft privacy, replacement/removal and failure recovery');
})().catch(error => { console.error(error); process.exit(1); });
