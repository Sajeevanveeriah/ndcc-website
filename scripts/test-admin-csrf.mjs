#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ADMIN_CSRF_HEADER_VALUE,
  resolveTrustedAdminOrigins,
  validateAdminCsrfRequest,
} from '../lib/auth/csrf.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const productionEnvironment = {
  NODE_ENV: 'production',
  VERCEL_ENV: 'production',
  NEXT_PUBLIC_SITE_URL: 'https://www.ndcc.com.au',
};
const validRequest = {
  method: 'POST',
  pathname: '/api/admin/resources/orders',
  hasSessionCookie: true,
  origin: 'https://www.ndcc.com.au',
  secFetchSite: 'same-origin',
  contentType: 'application/json; charset=utf-8',
  csrfHeader: null,
};

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

test('exact canonical production Origin is accepted', () => {
  assert.deepEqual(validateAdminCsrfRequest(validRequest, productionEnvironment), { ok: true });
});

test('missing and cross-origin Origin values are rejected', () => {
  assert.equal(validateAdminCsrfRequest({ ...validRequest, origin: null }, productionEnvironment).ok, false);
  assert.equal(validateAdminCsrfRequest({ ...validRequest, origin: 'https://attacker.example' }, productionEnvironment).ok, false);
  assert.equal(validateAdminCsrfRequest({ ...validRequest, origin: 'https://ndcc.com.au.attacker.example' }, productionEnvironment).ok, false);
});

test('same-site sibling origins and unsafe Fetch Metadata are rejected', () => {
  const sibling = { ...validRequest, origin: 'https://shop.ndcc.com.au', secFetchSite: 'same-site' };
  assert.equal(validateAdminCsrfRequest(sibling, productionEnvironment).ok, false);
  assert.equal(validateAdminCsrfRequest({ ...validRequest, secFetchSite: 'cross-site' }, productionEnvironment).ok, false);
});

test('production fails closed without a canonical trusted site URL', () => {
  const result = validateAdminCsrfRequest(validRequest, { NODE_ENV: 'production', VERCEL_ENV: 'production' });
  assert.deepEqual(result, { ok: false, reason: 'trusted_origin_unavailable' });
});

test('preview uses only its deployment-provided Vercel origin', () => {
  const origins = resolveTrustedAdminOrigins({
    NODE_ENV: 'production',
    VERCEL_ENV: 'preview',
    VERCEL_URL: 'ndcc-preview-123.vercel.app',
  });
  assert.deepEqual([...origins], ['https://ndcc-preview-123.vercel.app']);
});

test('local development remains usable when the copied env contains the production URL', () => {
  const developmentEnvironment = {
    NODE_ENV: 'development',
    NEXT_PUBLIC_SITE_URL: 'https://www.ndcc.com.au',
  };
  const origins = resolveTrustedAdminOrigins(developmentEnvironment);
  assert.deepEqual([...origins], ['https://www.ndcc.com.au', 'http://localhost:3000']);
  assert.deepEqual(validateAdminCsrfRequest({
    ...validRequest,
    origin: 'http://localhost:3000',
  }, developmentEnvironment), { ok: true });
});

test('text/plain JSON is rejected while JSON is accepted', () => {
  assert.equal(validateAdminCsrfRequest({ ...validRequest, contentType: 'text/plain' }, productionEnvironment).ok, false);
  assert.equal(validateAdminCsrfRequest(validRequest, productionEnvironment).ok, true);
});

test('multipart upload requires the dedicated custom header and path', () => {
  const multipart = {
    ...validRequest,
    pathname: '/api/admin/media/upload',
    contentType: 'multipart/form-data; boundary=test',
  };
  assert.equal(validateAdminCsrfRequest(multipart, productionEnvironment).ok, false);
  assert.equal(validateAdminCsrfRequest({ ...multipart, csrfHeader: ADMIN_CSRF_HEADER_VALUE }, productionEnvironment).ok, true);
  assert.equal(validateAdminCsrfRequest({ ...multipart, pathname: '/api/admin/resources/orders', csrfHeader: ADMIN_CSRF_HEADER_VALUE }, productionEnvironment).ok, false);
});

test('bodyless mutations require the custom header except DELETE', () => {
  const bodyless = { ...validRequest, pathname: '/api/admin/auth/logout', contentType: null };
  assert.equal(validateAdminCsrfRequest(bodyless, productionEnvironment).ok, false);
  assert.equal(validateAdminCsrfRequest({ ...bodyless, csrfHeader: ADMIN_CSRF_HEADER_VALUE }, productionEnvironment).ok, true);
  assert.equal(validateAdminCsrfRequest({ ...bodyless, method: 'DELETE' }, productionEnvironment).ok, true);
});

test('safe, unauthenticated and explicitly public requests remain unaffected', () => {
  assert.equal(validateAdminCsrfRequest({ ...validRequest, method: 'GET', origin: null }, productionEnvironment).ok, true);
  assert.equal(validateAdminCsrfRequest({ ...validRequest, hasSessionCookie: false, origin: null }, productionEnvironment).ok, true);
  assert.equal(validateAdminCsrfRequest({ ...validRequest, pathname: '/api/admin/auth/login', origin: null }, productionEnvironment).ok, true);
});

test('cookie-authenticated committee minutes mutations use the same origin boundary', () => {
  const minutesRequest = {
    ...validRequest,
    pathname: '/api/meeting-minutes',
  };
  assert.deepEqual(validateAdminCsrfRequest(minutesRequest, productionEnvironment), { ok: true });
  assert.equal(validateAdminCsrfRequest({
    ...minutesRequest,
    origin: 'https://attacker.example',
  }, productionEnvironment).ok, false);
  assert.equal(validateAdminCsrfRequest({
    ...minutesRequest,
    pathname: '/api/meeting-minutes/11111111-1111-4111-8111-111111111111/actions',
    origin: null,
  }, productionEnvironment).ok, false);

  const minutesRoute = readFileSync(path.join(repoRoot, 'app/api/meeting-minutes/route.ts'), 'utf8');
  const actionsRoute = readFileSync(path.join(repoRoot, 'app/api/meeting-minutes/[id]/actions/route.ts'), 'utf8');
  assert.match(minutesRoute, /readLimitedJsonObject\(request, 64 \* 1024\)/);
  assert.match(minutesRoute, /MINUTE_STATUSES/);
  assert.match(minutesRoute, /UUID_PATTERN\.test\(id\)/);
  assert.doesNotMatch(minutesRoute, /const \{ id, \.\.\.payload \} = await request\.json/);
  assert.match(actionsRoute, /readLimitedJsonObject\(request, 8 \* 1024\)/);
  assert.match(actionsRoute, /notes\.trim\(\)\.length > 2_000/);
});

test('middleware covers the admin API without trusting Host', () => {
  const source = readFileSync(path.join(repoRoot, 'middleware.ts'), 'utf8');
  assert.match(source, /validateAdminCsrfRequest/);
  assert.match(source, /request\.headers\.get\('origin'\)/);
  assert.match(source, /request\.headers\.get\('sec-fetch-site'\)/);
  assert.doesNotMatch(source, /headers\.get\(['"]host['"]\)/i);
  assert.match(source, /['"]\/api\/admin\/:path\*['"]/);
  assert.match(source, /['"]\/api\/meeting-minutes\/:path\*['"]/);
});

test('state-changing apparel export is POST-only and downloaded as a blob', () => {
  const route = readFileSync(path.join(repoRoot, 'app/api/admin/merch/export/route.ts'), 'utf8');
  const page = readFileSync(path.join(repoRoot, 'app/admin/apparel/page.tsx'), 'utf8');
  assert.match(route, /export async function POST\(\)/);
  assert.doesNotMatch(route, /export async function GET\(\)/);
  assert.match(page, /fetch\(['"]\/api\/admin\/merch\/export['"][\s\S]*?method:\s*['"]POST['"]/);
  assert.match(page, /response\.blob\(\)/);
  assert.doesNotMatch(page, /<a href=['"]\/api\/admin\/merch\/export['"]/);
});

test('multipart upload and bodyless clients send the custom header', () => {
  const upload = readFileSync(path.join(repoRoot, 'components/admin/ImageUploadField.tsx'), 'utf8');
  const apparel = readFileSync(path.join(repoRoot, 'app/admin/apparel/page.tsx'), 'utf8');
  const adminClient = readFileSync(path.join(repoRoot, 'lib/admin-client.ts'), 'utf8');
  const navbar = readFileSync(path.join(repoRoot, 'components/layout/Navbar.tsx'), 'utf8');
  const layout = readFileSync(path.join(repoRoot, 'app/admin/layout.tsx'), 'utf8');
  const payments = readFileSync(path.join(repoRoot, 'app/admin/payments/page.tsx'), 'utf8');
  assert.match(upload, /['"]X-NDCC-CSRF['"]:\s*['"]1['"]/);
  assert.match(apparel, /['"]X-NDCC-CSRF['"]:\s*['"]1['"]/);
  assert.match(adminClient, /headers\.set\(['"]X-NDCC-CSRF['"],\s*['"]1['"]\)/);
  assert.match(navbar, /['"]X-NDCC-CSRF['"]:\s*['"]1['"]/);
  assert.match(layout, /['"]X-NDCC-CSRF['"]:\s*['"]1['"]/);
  assert.match(payments, /['"]X-NDCC-CSRF['"]:\s*['"]1['"]/);
});

test('the security regression is wired into package scripts and PR validation', () => {
  const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const workflow = readFileSync(path.join(repoRoot, '.github/workflows/pr-validation.yml'), 'utf8');
  assert.match(packageJson.scripts['test:admin-csrf'], /test-admin-csrf\.mjs/);
  assert.match(workflow, /npm run test:admin-csrf/);
});

console.log(`Admin CSRF and unsafe-export security tests passed (${passed} checks).`);
