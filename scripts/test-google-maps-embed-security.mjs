#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normaliseGoogleMapsEmbedUrl,
  resolveGoogleMapsEmbedUrl,
} from '../lib/google-maps-embed.ts';

const valid = 'https://www.google.com/maps/embed?pb=approved-map';
assert.equal(normaliseGoogleMapsEmbedUrl(valid), valid);
assert.equal(normaliseGoogleMapsEmbedUrl('  https://WWW.GOOGLE.COM/maps/embed?q=Grinter  '), 'https://www.google.com/maps/embed?q=Grinter');

for (const unsafe of [
  'javascript:alert(document.domain)',
  'data:text/html,<script>alert(1)</script>',
  'http://www.google.com/maps/embed?pb=x',
  'https://google.com/maps/embed?pb=x',
  'https://www.google.com.evil.example/maps/embed?pb=x',
  'https://www.google.com/maps/place/Grinter',
  'https://user:pass@www.google.com/maps/embed?pb=x',
  'https://www.google.com:443/maps/embed?pb=x',
  'https://www.google.com:444/maps/embed?pb=x',
  'https://www.google.com/maps/embed#javascript:alert(1)',
  '//www.google.com/maps/embed?pb=x',
]) {
  assert.equal(normaliseGoogleMapsEmbedUrl(unsafe), null, `${unsafe} must be rejected`);
}

assert.equal(resolveGoogleMapsEmbedUrl('javascript:alert(1)', valid), valid, 'unsafe stored values fall back safely');
assert.equal(resolveGoogleMapsEmbedUrl('javascript:alert(1)', 'data:text/html,unsafe'), null, 'unsafe fallback is never rendered');

const route = readFileSync('app/api/admin/resources/[resource]/route.ts', 'utf8');
assert.match(route, /normaliseGoogleMapsEmbedUrl\(payload\.google_maps_embed_url\)/, 'admin writes validate map URLs');
assert.match(route, /Google Maps embed URL must be an approved/, 'invalid admin values receive a validation error');

const settings = readFileSync('lib/club-settings.ts', 'utf8');
assert.match(settings, /resolveGoogleMapsEmbedUrl\(/, 'legacy stored values are revalidated before rendering');

const contact = readFileSync('app/contact/page.tsx', 'utf8');
assert.match(contact, /sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"/, 'map iframe is sandboxed');
assert.match(contact, /referrerPolicy="strict-origin-when-cross-origin"/, 'map iframe limits referrer disclosure');

console.log('Google Maps embed URL security checks passed.');
