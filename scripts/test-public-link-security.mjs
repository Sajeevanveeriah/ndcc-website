#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalisePublicLinkUrl,
  resolvePublicLinkUrl,
} from '../lib/public-link-url.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

test('root-relative site paths are accepted and canonicalised', () => {
  assert.equal(normalisePublicLinkUrl('/join'), '/join');
  assert.equal(normalisePublicLinkUrl('  /fixtures/../teams?grade=1#top  '), '/teams?grade=1#top');
  assert.equal(normalisePublicLinkUrl('/about club'), '/about%20club');
});

test('absolute HTTPS URLs are accepted and canonicalised', () => {
  assert.equal(
    normalisePublicLinkUrl(' HTTPS://Example.COM:443/a/../b?q=1#top '),
    'https://example.com/b?q=1#top',
  );
  assert.equal(normalisePublicLinkUrl('https://example.com:444/path'), 'https://example.com:444/path');
});

test('scriptable, insecure and non-navigation schemes are rejected', () => {
  for (const unsafe of [
    'javascript:alert(document.domain)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'http://example.com/path',
    'mailto:committee@example.com',
    '#fragment',
    '?next=/admin',
  ]) {
    assert.equal(normalisePublicLinkUrl(unsafe), null, `${unsafe} must be rejected`);
  }
});

test('protocol-relative and backslash authority confusion is rejected', () => {
  for (const unsafe of [
    '//evil.example/path',
    '///evil.example/path',
    '/\\evil.example/path',
    'https:\\evil.example/path',
    'https://example.com\\@evil.example/path',
    'https:///evil.example/path',
    '/%5cevil.example/path',
  ]) {
    assert.equal(normalisePublicLinkUrl(unsafe), null, `${unsafe} must be rejected`);
  }
});

test('credentials, controls and malformed URLs are rejected', () => {
  for (const unsafe of [
    'https://user:pass@example.com/path',
    'https://user@example.com/path',
    'https://example.com/%0Ajavascript:alert(1)',
    'https://example.com/%zz',
    'https://example.com/\npath',
    'https://',
    '',
  ]) {
    assert.equal(normalisePublicLinkUrl(unsafe), null, `${JSON.stringify(unsafe)} must be rejected`);
  }
  assert.equal(normalisePublicLinkUrl(null), null);
});

test('unsafe legacy values fall back only to a separately validated URL', () => {
  assert.equal(resolvePublicLinkUrl('javascript:alert(1)', '/contact'), '/contact');
  assert.equal(resolvePublicLinkUrl('javascript:alert(1)', 'data:text/html,unsafe'), null);
});

test('admin create and update writes use the central link policy', () => {
  const route = readFileSync(path.join(repoRoot, 'app/api/admin/resources/[resource]/route.ts'), 'utf8');
  const post = route.slice(route.indexOf('export async function POST'), route.indexOf('export async function PATCH'));
  const patch = route.slice(route.indexOf('export async function PATCH'), route.indexOf('export async function DELETE'));
  assert.match(route, /normalisePublicLinkUrl\(value\)/);
  assert.match(post, /validateAndNormalisePublicLinks\(config, payload, true\)/);
  assert.match(patch, /validateAndNormalisePublicLinks\(config, payload, false\)/);
  assert.match(route, /page_link_cards:\s*\[\{ field: 'href'/);
  assert.match(route, /content_blocks:\s*\[\{ field: 'cta_url'/);
  assert.match(route, /club_settings:[^\n]*facebook_url[^\n]*instagram_url[^\n]*playhq_url/);
  assert.match(route, /teams:\s*\[\{ field: 'playhq_url'/);
  assert.match(route, /sponsors:\s*\[\{ field: 'website'/);
  assert.match(route, /calendar_events:[^\n]*external_url[^\n]*cta_url/);
  assert.match(route, /publications:[^\n]*document_url[^\n]*external_url/);
});

test('page-card and content-block public reads fail closed', () => {
  const pageLinks = readFileSync(path.join(repoRoot, 'lib/structured-content.ts'), 'utf8');
  const contentBlocks = readFileSync(path.join(repoRoot, 'lib/content-blocks.ts'), 'utf8');
  const contentApi = readFileSync(path.join(repoRoot, 'app/api/content-blocks/route.ts'), 'utf8');
  assert.match(pageLinks, /normalisePageLinkCards\(\(data as PageLinkCard\[\]\) \|\| \[\]\)/);
  assert.match(pageLinks, /if \(!href\) return \[\]/);
  assert.match(contentBlocks, /resolvePublicLinkUrl\(db\?\.cta_url, fallback\?\.cta_url\)/);
  assert.match(contentApi, /normaliseContentBlockLinks\(data \?\? \[\]\)/);
});

test('social, PlayHQ and sponsor public reads fail closed', () => {
  const settings = readFileSync(path.join(repoRoot, 'lib/club-settings.ts'), 'utf8');
  const teams = readFileSync(path.join(repoRoot, 'app/teams/page.tsx'), 'utf8');
  const sponsors = readFileSync(path.join(repoRoot, 'lib/public-data.ts'), 'utf8');
  for (const field of ['facebook_url', 'instagram_url', 'playhq_url']) {
    assert.match(settings, new RegExp(`resolvePublicLinkUrl\\(row\\.${field}, fallbackClubSettings\\.${field}\\)`));
  }
  assert.match(teams, /playhq_url: normalisePublicLinkUrl\(team\.playhq_url\)/);
  assert.match(sponsors, /website: normalisePublicLinkUrl\(sponsor\.website\) \?\? ''/);
});

test('calendar and publication public reads fail closed', () => {
  const calendarQueries = readFileSync(path.join(repoRoot, 'lib/calendar/queries.ts'), 'utf8');
  const publications = readFileSync(path.join(repoRoot, 'lib/public-publications.ts'), 'utf8');
  assert.match(calendarQueries, /external_url: normalisePublicLinkUrl\(event\.external_url\)/);
  assert.match(calendarQueries, /cta_url: normalisePublicLinkUrl\(event\.cta_url\)/);
  assert.match(publications, /document_url: normalisePublicLinkUrl\(publication\.document_url\)/);
  assert.match(publications, /external_url: normalisePublicLinkUrl\(publication\.external_url\)/);
});

test('the security regression is wired into package scripts and PR validation', () => {
  const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const workflow = readFileSync(path.join(repoRoot, '.github/workflows/pr-validation.yml'), 'utf8');
  assert.match(packageJson.scripts['test:public-link-security'], /test-public-link-security\.mjs/);
  assert.match(workflow, /npm run test:public-link-security/);
});

console.log(`Public link URL security checks passed (${passed} checks).`);
