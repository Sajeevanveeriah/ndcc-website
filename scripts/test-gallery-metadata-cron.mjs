#!/usr/bin/env node
// Offline regression test for the gallery metadata backfill cron
// (app/api/cron/gallery-metadata/route.ts): permanently failing originals must
// not stall the backfill. Uses an in-memory table; no database or network.
//
// Run: npm run test:gallery-metadata-cron

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function load(path, dependencies) {
  const code = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports;
}

// 25 permanently broken originals uploaded first, then 10 healthy ones.
let clock = Date.parse('2026-01-01T00:00:00Z');
const tick = () => new Date(clock += 1000).toISOString();
const rows = [];
for (let i = 0; i < 35; i += 1) {
  const stamp = tick();
  rows.push({ id: `img-${String(i).padStart(2, '0')}`, storage_path: `a/${i}.jpg`, mime_type: 'image/jpeg', uploaded_at: stamp, updated_at: stamp, metadata_stripped_at: null, broken: i < 25 });
}
const writes = [];

function table() {
  const filters = [];
  const orders = [];
  let limit = Infinity;
  let patch = null;
  const query = {
    select() { return query; },
    is(column, value) { filters.push((row) => row[column] === value); return query; },
    not(column, op, value) { assert.equal(op, 'is'); filters.push((row) => row[column] !== value); return query; },
    eq(column, value) { filters.push((row) => row[column] === value); return query; },
    order(column, { ascending }) { orders.push([column, ascending]); return query; },
    limit(value) { limit = value; return query; },
    update(value) { patch = value; return query; },
    then(resolve, reject) {
      const matched = rows.filter((row) => filters.every((f) => f(row)));
      if (patch) {
        // Mirrors trg_gallery_images_updated_at: every update sets updated_at = now().
        for (const row of matched) Object.assign(row, patch, { updated_at: tick() });
        writes.push({ patch, ids: matched.map((r) => r.id) });
        return Promise.resolve({ data: null, error: null }).then(resolve, reject);
      }
      const sorted = [...matched].sort((a, b) => {
        for (const [column, asc] of orders) {
          if (a[column] < b[column]) return asc ? -1 : 1;
          if (a[column] > b[column]) return asc ? 1 : -1;
        }
        return 0;
      });
      return Promise.resolve({ data: sorted.slice(0, limit).map(({ id, storage_path, mime_type }) => ({ id, storage_path, mime_type })), error: null }).then(resolve, reject);
    },
  };
  return query;
}

const storage = {
  async download(path) {
    const row = rows.find((r) => r.storage_path === path);
    return row.broken ? { data: null, error: { message: 'Object not found' } } : { data: new Blob([Buffer.from('jpeg')]), error: null };
  },
  async upload() { return { error: null }; },
};
const supabase = { from: (name) => { assert.equal(name, 'gallery_images'); return table(); }, storage: { from: () => storage } };

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
process.env.CRON_SECRET = 'cron-secret';
const route = load('app/api/cron/gallery-metadata/route.ts', {
  'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
  '@/lib/supabase-server': { createServerClient: () => supabase },
  '@/lib/cron-auth': { isAuthorizedCronRequest: (header, secret) => header === `Bearer ${secret}` },
  '@/lib/gallery/shared': { GALLERY_MEDIA_BUCKET: 'gallery', GALLERY_ALLOWED_MIME_TYPES: { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' } },
  '@/lib/server/gallery-sanitise': { sanitiseGalleryImage: async (buffer) => Buffer.from(`clean-${buffer.length}`) },
});
const run = async () => {
  const origError = console.error;
  console.error = () => {};
  try {
    const response = await route.GET(new Request('https://example.invalid/api/cron/gallery-metadata', { headers: { authorization: 'Bearer cron-secret' } }));
    assert.equal(response.status, 200);
    return response.json();
  } finally { console.error = origError; }
};

// Run 1: the 25 oldest pending rows are all broken. They fail, nothing is
// stamped as stripped, and each is moved to the back of the queue.
let result = await run();
assert.deepEqual(result, { success: false, cleaned: 0, failed: 25, remaining: 25 });
assert.ok(rows.filter((r) => r.broken).every((r) => r.metadata_stripped_at === null), 'a failure is never recorded as stripped');
const touches = writes.filter((w) => Object.keys(w.patch).join() === 'updated_at');
assert.equal(touches.length, 25, 'every failure is deprioritised');
assert.ok(touches.every((w) => w.ids.length === 1), 'each touch targets only its own row');

// Run 2: the healthy rows are reached instead of re-selecting the failures.
result = await run();
assert.equal(result.cleaned, 10, 'the backfill is not stalled by failing files');
assert.ok(rows.filter((r) => !r.broken).every((r) => r.metadata_stripped_at), 'healthy originals are stamped');

// Run 3: only the broken files remain; they are still retried (not dropped).
result = await run();
assert.equal(result.cleaned, 0);
assert.equal(result.failed, 25);

// Unauthorised requests never touch the table.
const before = writes.length;
const denied = await route.GET(new Request('https://example.invalid/api/cron/gallery-metadata'));
assert.equal(denied.status, 401);
assert.equal(writes.length, before);

const source = readFileSync('app/api/cron/gallery-metadata/route.ts', 'utf8');
assert.match(source, /\.order\('updated_at', \{ ascending: true \}\)/, 'queue is ordered so touched failures go last');
assert.doesNotMatch(source.slice(source.indexOf('async function deprioritise')), /metadata_stripped_at:/, 'deprioritise never stamps metadata_stripped_at');

console.log('PASS gallery metadata cron: failing originals move to the back, healthy ones are cleaned, nothing is falsely stamped');
