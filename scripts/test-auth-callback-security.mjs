#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_AUTH_CALLBACK_PATH,
  resolveAuthCallbackRedirect,
} from '../lib/auth/callback-redirect.ts';

const origin = 'https://ndcc.example';

function callbackUrl(next, extra = '') {
  const url = new URL(`/api/auth/callback?code=provider-code${extra}`, origin);
  if (next !== null) url.searchParams.set('next', next);
  return url;
}

for (const unsafeNext of [
  '//attacker.example/collect',
  '///attacker.example/collect',
  '/\\attacker.example/collect',
  'https://attacker.example/collect',
  'javascript:alert(1)',
  'fantasy/account',
]) {
  const redirect = resolveAuthCallbackRedirect(callbackUrl(unsafeNext));
  assert.equal(redirect.origin, origin, `${unsafeNext} must remain on the request origin`);
  assert.equal(redirect.pathname, DEFAULT_AUTH_CALLBACK_PATH, `${unsafeNext} must use the safe fallback`);
  assert.equal(redirect.searchParams.get('code'), 'provider-code', 'provider parameters stay on the club origin');
  assert.equal(redirect.searchParams.has('next'), false, '`next` must not be forwarded');
}

const safeRedirect = resolveAuthCallbackRedirect(callbackUrl('/fantasy/account?panel=team#details', '&type=recovery'));
assert.equal(safeRedirect.origin, origin);
assert.equal(safeRedirect.pathname, '/fantasy/account');
assert.equal(safeRedirect.searchParams.get('panel'), 'team');
assert.equal(safeRedirect.searchParams.get('type'), 'recovery');
assert.equal(safeRedirect.hash, '#details');

const defaultRedirect = resolveAuthCallbackRedirect(callbackUrl(null));
assert.equal(defaultRedirect.href, `${origin}${DEFAULT_AUTH_CALLBACK_PATH}?code=provider-code`);

const route = readFileSync('app/api/auth/callback/route.ts', 'utf8');
assert.match(route, /resolveAuthCallbackRedirect\(url\)/, 'the live callback route must use the safe resolver');
assert.match(route, /Cache-Control', 'no-store'/, 'auth redirects must not be cached');

console.log('Auth callback redirect security checks passed.');
