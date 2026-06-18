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

const loginResponse = await fetch(`${baseUrl}/api/admin/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: process.env.AUTH_TEST_EMAIL,
    password: process.env.AUTH_TEST_PASSWORD,
  }),
  redirect: 'manual',
});

let loginJson;
try {
  loginJson = await loginResponse.json();
} catch {
  loginJson = null;
}

if (!loginResponse.ok || !loginJson?.success) {
  console.error(`Admin login failed with HTTP ${loginResponse.status}.`);
  process.exit(1);
}

const cookieHeader = cookieHeaderFrom(loginResponse);
if (!cookieHeader) {
  console.error('Admin login did not return an auth cookie.');
  process.exit(1);
}

const sessionResponse = await fetch(`${baseUrl}/api/admin/auth/session`, {
  headers: { Cookie: cookieHeader },
  cache: 'no-store',
});

let sessionJson;
try {
  sessionJson = await sessionResponse.json();
} catch {
  sessionJson = null;
}

if (!sessionResponse.ok || sessionJson?.authenticated !== true) {
  console.error(`Admin session check failed with HTTP ${sessionResponse.status}.`);
  process.exit(1);
}

console.log(`Admin login test passed for ${process.env.AUTH_TEST_EMAIL}.`);
console.log('Session endpoint confirmed authenticated=true.');
