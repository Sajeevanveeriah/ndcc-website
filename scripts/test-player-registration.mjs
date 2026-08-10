import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  createFutureSeasonRegistrationDraft,
  getRegistrationAvailability,
  isRegistrationNavigationVisible,
  publicRegistrationFromRow,
  validatePlayHQRegistrationUrl,
  validateRegistrationSettings,
} from '../lib/player-registration.ts';

const migrationPath = 'supabase/migrations/20260809163000_player_registration_cms.sql';
const migration = readFileSync(migrationPath, 'utf8');
const publicPage = readFileSync('app/player-registration/page.tsx', 'utf8');
const publicApi = readFileSync('app/api/public/player-registration/route.ts', 'utf8');
const publicReader = readFileSync('lib/public-player-registration.ts', 'utf8');
const adminApi = readFileSync('app/api/admin/club-seasons/registration/route.ts', 'utf8');
const authConfig = readFileSync('lib/auth/config.ts', 'utf8');
const navbar = readFileSync('components/layout/Navbar.tsx', 'utf8');
const joinPage = readFileSync('app/join/page.tsx', 'utf8');
const sitemap = readFileSync('app/sitemap.ts', 'utf8');
const smokeRoutes = readFileSync('scripts/smoke-routes.mjs', 'utf8');

const expectedOptions = [
  ['Senior Women\'s Registration', 'https://www.playhq.com/cricket-australia/register/f8866f'],
  ['Senior Men\'s Registration', 'https://www.playhq.com/cricket-australia/register/e7483f'],
  ['Junior Registration', 'https://www.playhq.com/cricket-australia/register/7c4466'],
];

const expectedTerms = [
  ['Respect and Behaviour', 'All players, parents, volunteers and spectators must demonstrate respectful behaviour at all times. Abusive, discriminatory, threatening or antisocial conduct towards players, officials, volunteers or opposition teams will not be tolerated. Individuals are expected to uphold the values of fair play, integrity and positive participation.'],
  ['Sportsmanship', 'Members must display good sportsmanship on and off the field. This includes accepting umpire decisions, encouraging teammates, respecting opponents, and contributing to a safe and enjoyable environment for all participants.'],
  ['Alcohol, Drugs and Smoking', 'The Club maintains a strict no-drug policy. The use, possession or distribution of illegal substances is prohibited at all Club activities. Alcohol consumption must comply with venue rules and responsible service guidelines. Smoking and vaping are not permitted in or around playing areas, training zones or junior activities.'],
  ['Child Safety and Welfare', 'The Club is committed to providing a safe environment for children. All coaches, volunteers and program coordinators must comply with Victorian Child Safe Standards and hold a valid Working With Children Check. Any behaviour that compromises child safety will result in immediate action.'],
  ['Participation and Conduct Requirements', 'Players and parents agree to follow all reasonable directions from coaches, team managers and Club officials. This includes training expectations, match-day requirements, safety instructions and adherence to Club policies.'],
  ['Disciplinary Action', 'Breaches of these Terms and Conditions may result in warnings, suspension from activities, or removal from Club programs. Serious misconduct may be referred to relevant authorities or governing bodies.'],
];

for (const [label, url] of expectedOptions) {
  assert.ok(migration.includes(label.replace("'", "''")), `migration seeds ${label}`);
  assert.equal(migration.split(url).length - 1, 1, `${url} is seeded exactly once`);
  assert.equal(validatePlayHQRegistrationUrl(url), url);
}

for (const [heading, body] of expectedTerms) {
  assert.ok(migration.includes(heading), `migration includes ${heading}`);
  assert.ok(migration.includes(body), `${heading} body is complete`);
}
assert.match(migration, /WHERE slug = '2026-27'/);
assert.doesNotMatch(migration, /WHERE id = '[0-9a-f-]{36}'/i);
assert.match(migration, /registration_options JSONB/);
assert.match(migration, /terms_sections JSONB/);
assert.match(migration, /registration_url = NULL/);
assert.match(migration, /REVOKE ALL ON TABLE club_season_registration_settings FROM anon, authenticated/);
assert.doesNotMatch(migration, /GRANT SELECT ON TABLE club_season_registration_settings TO anon, authenticated/);
assert.doesNotMatch(migration, /SECURITY DEFINER/i);

const invalidUrls = [
  'http://www.playhq.com/cricket-australia/register/f8866f',
  'https://playhq.com/cricket-australia/register/f8866f',
  'https://www.playhq.com.evil.example/cricket-australia/register/f8866f',
  'https://www.playhq.com@evil.example/cricket-australia/register/f8866f',
  'https://user:password@www.playhq.com/cricket-australia/register/f8866f',
  'https://www.playhq.com:444/cricket-australia/register/f8866f',
  'https://www.playhq.com/cricket-australia/register/',
  'https://www.playhq.com/cricket-australia/register/../org',
  'javascript:alert(1)',
  'not a URL',
];
for (const url of invalidUrls) assert.equal(validatePlayHQRegistrationUrl(url), null, `rejects ${url}`);

const validSettings = {
  pageTitle: '2026/2027 Player Registration',
  navigationLabel: '2026/2027 Player Registration',
  introText: 'Choose a registration option.',
  status: 'open',
  opensAt: null,
  closesAt: null,
  showInNavigation: true,
  options: expectedOptions.map(([label, url], index) => ({ audienceKey: `audience_${index + 1}`, label, url, sortOrder: index + 1, active: true })),
  termsTitle: 'Club Terms',
  termsSections: expectedTerms.map(([heading, body]) => ({ heading, body })),
};
const validResult = validateRegistrationSettings(validSettings);
assert.equal(validResult.success, true);
assert.equal(validateRegistrationSettings({ ...validSettings, options: validSettings.options.map((option) => ({ ...option, audienceKey: 'duplicate' })) }).success, false);
assert.equal(validateRegistrationSettings({ ...validSettings, status: 'open', options: validSettings.options.map((option) => ({ ...option, active: false })) }).success, false);
assert.equal(validateRegistrationSettings({ ...validSettings, termsSections: validSettings.termsSections.slice(0, 5) }).success, false);

const rawRow = {
  page_title: validSettings.pageTitle,
  navigation_label: 'CMS label changed live',
  intro_text: validSettings.introText,
  status: 'open',
  opens_at: null,
  closes_at: null,
  show_in_navigation: true,
  registration_options: [
    { audience_key: 'valid', label: 'Updated CMS option', registration_url: expectedOptions[0][1], sort_order: 1, is_active: true },
    { audience_key: 'invalid', label: 'Unsafe option', registration_url: 'https://www.playhq.com.evil.example/cricket-australia/register/nope', sort_order: 2, is_active: true },
  ],
  terms_title: validSettings.termsTitle,
  terms_sections: validSettings.termsSections,
};
const publicDto = publicRegistrationFromRow(rawRow, '2026/2027 Season', new Date('2026-08-09T00:00:00Z'));
assert.equal(publicDto.navigationLabel, 'CMS label changed live');
assert.deepEqual(publicDto.options, [{ label: 'Updated CMS option', url: expectedOptions[0][1] }]);
assert.equal('audienceKey' in publicDto.options[0], false);
assert.equal('id' in publicDto, false);
assert.equal(isRegistrationNavigationVisible(publicDto), true);
assert.equal(isRegistrationNavigationVisible({ ...publicDto, showInNavigation: false }), false);
assert.equal(isRegistrationNavigationVisible({ ...publicDto, availability: 'closed' }), false);
assert.equal(getRegistrationAvailability('archived', null, null), 'closed');
assert.equal(getRegistrationAvailability('open', null, '2026-08-08T00:00:00Z', new Date('2026-08-09T00:00:00Z')), 'closed');
assert.equal(getRegistrationAvailability('open', '2026-08-10T00:00:00Z', null, new Date('2026-08-09T00:00:00Z')), 'opening_soon');
for (const unpublishedRow of [
  { ...rawRow, status: 'closed' },
  { ...rawRow, status: 'archived' },
  { ...rawRow, status: 'open', closes_at: '2026-08-08T00:00:00Z' },
  { ...rawRow, status: 'open', opens_at: '2026-08-10T00:00:00Z' },
]) {
  const unpublishedDto = publicRegistrationFromRow(unpublishedRow, '2026/2027 Season', new Date('2026-08-09T00:00:00Z'));
  assert.deepEqual(unpublishedDto.options, [], 'unpublished settings redact registration destinations');
  assert.equal(unpublishedDto.showInNavigation, false, 'unpublished settings suppress effective navigation visibility');
}

const futureDraft = createFutureSeasonRegistrationDraft('2027/2028 Season', validResult.success ? validResult.data : null);
assert.equal(futureDraft.status, 'closed');
assert.equal(futureDraft.showInNavigation, false);
assert.ok(futureDraft.options.every((option) => option.url === '' && option.active === false));
assert.equal(futureDraft.termsSections.length, 6);

assert.match(publicReader, /eq\('is_current', true\)/);
assert.match(publicReader, /eq\('status', 'active'\)/);
assert.match(publicReader, /import 'server-only'/);
assert.match(publicReader, /return null/);
assert.match(publicApi, /force-no-store/);
assert.match(publicPage, /registration\.options\.map/);
assert.match(publicPage, /section\.heading/);
assert.match(publicPage, /section\.body/);
assert.match(publicPage, /target="_blank"/);
assert.match(publicPage, /rel="noopener noreferrer"/);
assert.doesNotMatch(publicPage, /dangerouslySetInnerHTML/);

assert.match(authConfig, /FULL_ACCESS_ROLES/);
assert.match(authConfig, /CLUB_ADMIN_ROLES[^\n]+FULL_ACCESS_ROLES[^\n]+committee/);
assert.doesNotMatch(authConfig.match(/CLUB_ADMIN_ROLES[^\n]+/)?.[0] || '', /fantasy_manager|fantasy_support/);
assert.match(adminApi, /requirePermission\('season\.registration'\)/);
assert.doesNotMatch(adminApi, /FANTASY_ADMIN_ROLES|CLUB_ADMIN_ROLES/);
assert.match(adminApi, /validateRegistrationSettings/);
assert.match(adminApi, /\.upsert\(/);

assert.match(navbar, /\/api\/public\/player-registration/);
assert.match(navbar, /registrationNavigation\?\.label/);
assert.match(navbar, /registration\.availability !== 'closed'/);
assert.equal(joinPage.split('href="/player-registration"').length - 1, 2);
assert.doesNotMatch(joinPage, /PLAYHQ_ORG_URL/);
assert.match(joinPage, /OrderPaymentOptions/);
assert.match(joinPage, /returnPath="\/join"/);
assert.match(joinPage, /Submit Social Membership/);
for (const source of [sitemap, smokeRoutes]) assert.match(source, /\/player-registration/);

function walk(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}
for (const path of [...walk('app'), ...walk('components')].filter((entry) => /\.(ts|tsx)$/.test(entry))) {
  const source = readFileSync(path, 'utf8');
  if (source.startsWith("'use client'")) {
    assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/, `${path} must not reference the service-role key`);
    assert.doesNotMatch(source, /public-player-registration/, `${path} must not import the server-only registration reader`);
  }
}

console.log('Player registration checks passed.');
