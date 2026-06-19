#!/usr/bin/env node
const required = ['AUTH_TEST_BASE_URL', 'AUTH_TEST_EMAIL', 'AUTH_TEST_PASSWORD'];
const missing = required.filter((key) => !process.env[key]);

if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const baseUrl = process.env.AUTH_TEST_BASE_URL.replace(/\/$/, '');

function cookieHeaderFrom(response) {
  const setCookie = response.headers.get('set-cookie');
  if (!setCookie) return '';

  return setCookie
    .split(/,(?=\s*[^;,]+=)/)
    .map((cookie) => cookie.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

async function readJson(response) {
  try { return await response.json(); } catch { return null; }
}

async function login(password) {
  const response = await fetch(`${baseUrl}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.AUTH_TEST_EMAIL, password }),
    redirect: 'manual',
  });
  return { response, json: await readJson(response), cookie: cookieHeaderFrom(response) };
}

async function session(cookie) {
  const response = await fetch(`${baseUrl}/api/admin/auth/session`, {
    headers: { Cookie: cookie },
    cache: 'no-store',
  });
  return { response, json: await readJson(response) };
}

async function assertAuthenticated(label, cookie) {
  const result = await session(cookie);
  if (!result.response.ok || result.json?.authenticated !== true) {
    console.error(`${label} session check failed with HTTP ${result.response.status}.`);
    process.exit(1);
  }
}

const jarA = await login(process.env.AUTH_TEST_PASSWORD);
if (!jarA.response.ok || !jarA.json?.success || !jarA.cookie) {
  console.error(`Admin login A failed with HTTP ${jarA.response.status}.`);
  process.exit(1);
}
await assertAuthenticated('A', jarA.cookie);

const dashboardA = await fetch(`${baseUrl}/api/admin/dashboard`, { headers: { Cookie: jarA.cookie }, cache: 'no-store' });
if (!dashboardA.ok) {
  console.error(`Dashboard check failed with HTTP ${dashboardA.status}.`);
  process.exit(1);
}

const jarB = await login(process.env.AUTH_TEST_PASSWORD);
if (!jarB.response.ok || !jarB.json?.success || !jarB.cookie) {
  console.error(`Admin login B failed with HTTP ${jarB.response.status}.`);
  process.exit(1);
}

await assertAuthenticated('A after B login', jarA.cookie);
await assertAuthenticated('B', jarB.cookie);
await assertAuthenticated('A refresh', jarA.cookie);
await assertAuthenticated('B refresh', jarB.cookie);

const logoutA = await fetch(`${baseUrl}/api/admin/auth/logout`, { method: 'POST', headers: { Cookie: jarA.cookie }, cache: 'no-store' });
if (!logoutA.ok) {
  console.error(`Logout A failed with HTTP ${logoutA.status}.`);
  process.exit(1);
}
const sessionAfterLogoutA = await session(jarA.cookie);
if (sessionAfterLogoutA.response.status !== 401 || sessionAfterLogoutA.json?.authenticated !== false) {
  console.error(`A was not unauthenticated after logout; HTTP ${sessionAfterLogoutA.response.status}.`);
  process.exit(1);
}
await assertAuthenticated('B after A logout', jarB.cookie);

const invalid = await login(`${process.env.AUTH_TEST_PASSWORD}-invalid`);
if (invalid.response.status !== 401) {
  console.error(`Invalid password returned HTTP ${invalid.response.status}, expected 401.`);
  process.exit(1);
}

console.log('Admin login integration test passed without printing password or cookies.');
console.log('Two concurrent sessions coexist; logging out A preserved B.');
