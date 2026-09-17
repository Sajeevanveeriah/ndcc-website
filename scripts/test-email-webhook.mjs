import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { Resend } from 'resend';

const key = Buffer.from('isolated webhook regression signing key');
const secret = `whsec_${key.toString('base64')}`;
const rows = new Map();
let failDatabase = false;
const exports = {};
const imports = {
  'next/server': { NextResponse: Response },
  resend: { Resend },
  '@/lib/supabase-server': { createServerClient: () => ({ from: () => ({ upsert: async (row) => {
    if (failDatabase) return { error: { message: 'offline' } };
    if (!rows.has(row.event_id)) rows.set(row.event_id, row);
    return { error: null };
  } }) }) },
};
vm.runInNewContext(ts.transpileModule(readFileSync('app/api/resend/webhook/route.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, require: (name) => { if (!(name in imports)) throw Error(name); return imports[name]; },
  process: { env: { RESEND_WEBHOOK_SECRET: secret } }, Buffer, Date, Set, Number, console });

function request({ id = 'msg_test', type = 'email.delivered', old = false, tamper = false } = {}) {
  const body = JSON.stringify({ type, created_at: new Date().toISOString(), data: { email_id: 'email_test' } });
  const timestamp = String(Math.floor(Date.now() / 1000) - (old ? 3600 : 0));
  const signature = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
  return new Request('https://example.test/api/resend/webhook', { method: 'POST', body: tamper ? `${body} ` : body,
    headers: { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': `v1,${signature}` } });
}
assert.equal((await exports.POST(request())).status, 200);
assert.equal(rows.size, 1);
assert.equal(rows.get('msg_test').event_type, 'email.delivered');
assert.equal((await exports.POST(request())).status, 200);
assert.equal(rows.size, 1, 'duplicate provider delivery must not duplicate evidence');
assert.equal((await exports.POST(request({ tamper: true }))).status, 400);
assert.equal((await exports.POST(request({ old: true }))).status, 400);
assert.equal((await exports.POST(new Request('https://example.test', { method: 'POST', body: '{}' }))).status, 400);
assert.equal((await exports.POST(request({ id: 'ignored', type: 'email.opened' }))).status, 200);
assert.equal(rows.size, 1, 'tracking events must not be stored');
failDatabase = true;
assert.equal((await exports.POST(request({ id: 'retry' }))).status, 503, 'provider must retry an event that was not durably recorded');
assert.equal(rows.size, 1);
console.log('Email webhook signature, expiry, duplicate, data-minimisation and retry checks passed.');
