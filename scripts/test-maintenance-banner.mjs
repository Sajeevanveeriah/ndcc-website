// Site-wide maintenance banner: phase rules, wording, admin validation and wiring.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MAINTENANCE_MESSAGE_MAX, cleanMessage, formatMaintenanceWindow, maintenanceBannerText, maintenancePhase,
  nextMaintenanceChange, publicMaintenanceBanner, validateMaintenanceInput,
} from '../lib/maintenance-banner.ts';

// Saturday 3 October 2026, 8:00 pm to 10:00 pm AEST (UTC+10; daylight saving starts on the 4th).
const start = '2026-10-03T10:00:00.000Z';
const end = '2026-10-03T12:00:00.000Z';
const before = Date.parse(start) - 3_600_000;
const during = Date.parse(start) + 60_000;
const after = Date.parse(end);
const banner = { startsAt: start, endsAt: end, message: null };

// Phases: advance notice, in progress from the start, gone from the end.
assert.equal(maintenancePhase(banner, before), 'upcoming');
assert.equal(maintenancePhase(banner, Date.parse(start)), 'active', 'the start instant is in progress');
assert.equal(maintenancePhase(banner, during), 'active');
assert.equal(maintenancePhase(banner, after), 'ended', 'the end instant hides the banner');
assert.equal(maintenancePhase({ startsAt: start, endsAt: null }, after + 86_400_000), 'active', 'no end time: until further notice');
assert.equal(nextMaintenanceChange(banner, before), Date.parse(start));
assert.equal(nextMaintenanceChange(banner, during), Date.parse(end));
assert.equal(nextMaintenanceChange(banner, after), null);
assert.equal(nextMaintenanceChange({ startsAt: start, endsAt: null }, during), null);

// Wording with Melbourne times and the time zone.
assert.equal(formatMaintenanceWindow(banner), 'Saturday 3 October, 8:00 pm to 10:00 pm AEST');
assert.equal(formatMaintenanceWindow({ startsAt: start, endsAt: '2026-10-04T13:30:00.000Z' }), 'Saturday 3 October, 8:00 pm AEST to Monday 5 October, 12:30 am AEDT', 'across days and the daylight saving change');
assert.equal(formatMaintenanceWindow({ startsAt: start, endsAt: null }), 'from Saturday 3 October, 8:00 pm AEST until further notice');
assert.deepEqual(maintenanceBannerText(banner, 'upcoming'), {
  heading: 'Scheduled maintenance',
  detail: 'The website may be unavailable: Saturday 3 October, 8:00 pm to 10:00 pm AEST.',
});
assert.deepEqual(maintenanceBannerText({ ...banner, message: 'Online payments will be paused.' }, 'active'), {
  heading: 'Maintenance in progress',
  detail: 'Some parts of the website may not work: Saturday 3 October, 8:00 pm to 10:00 pm AEST. Online payments will be paused.',
});
assert.equal(maintenanceBannerText({ startsAt: start, endsAt: null, message: null }, 'upcoming').detail,
  'The website may be unavailable from Saturday 3 October, 8:00 pm AEST until further notice.');
assert.equal(maintenanceBannerText(banner, 'ended'), null);

// Public banner from the stored row: only while on, complete and not over.
const row = { maintenance_banner_enabled: true, maintenance_starts_at: start, maintenance_ends_at: end, maintenance_message: '  Card\npayments\tpaused  ' };
assert.deepEqual(publicMaintenanceBanner(row, before), { startsAt: start, endsAt: end, message: 'Card payments paused', checkedAt: before });
assert.equal(publicMaintenanceBanner({ ...row, maintenance_banner_enabled: false }, before), null, 'off');
assert.equal(publicMaintenanceBanner(row, after), null, 'over');
assert.equal(publicMaintenanceBanner({ ...row, maintenance_starts_at: null }, before), null, 'no start time');
assert.equal(publicMaintenanceBanner({ ...row, maintenance_ends_at: 'soon' }, before), null, 'bad end time');
assert.equal(publicMaintenanceBanner(null, before), null);
assert.equal(publicMaintenanceBanner({ ...row, maintenance_ends_at: null }, after).endsAt, null, 'open-ended stays on');
assert.equal(cleanMessage('a\u0000b\u007fc'), 'a b c', 'control characters removed');
assert.equal(cleanMessage('   '), null);

// Admin validation.
const now = before;
const ok = (raw) => { const result = validateMaintenanceInput(raw, now); assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
const bad = (raw, pattern) => { const result = validateMaintenanceInput(raw, now); assert.equal(result.ok, false); assert.match(result.error, pattern); };
assert.deepEqual(ok({ enabled: true, starts_at: start, ends_at: end, message: ' Hi ' }), { enabled: true, starts_at: start, ends_at: end, message: 'Hi' });
assert.deepEqual(ok({ enabled: true, starts_at: start, ends_at: '' }), { enabled: true, starts_at: start, ends_at: null, message: null });
assert.deepEqual(ok({ enabled: false, starts_at: '', ends_at: '' }), { enabled: false, starts_at: null, ends_at: null, message: null }, 'switching off needs no times');
bad({ starts_at: start }, /Choose whether/);
bad({ enabled: true, starts_at: '' }, /start time/);
bad({ enabled: true, starts_at: 'tomorrow' }, /valid start and end/);
bad({ enabled: true, starts_at: end, ends_at: start }, /after the start/);
bad({ enabled: true, starts_at: start, ends_at: start }, /after the start/);
bad({ enabled: false, starts_at: end, ends_at: start }, /after the start/);
bad({ enabled: true, starts_at: '2026-09-01T00:00:00Z', ends_at: '2026-09-01T01:00:00Z' }, /already passed/);
bad({ enabled: true, starts_at: start, message: 'x'.repeat(MAINTENANCE_MESSAGE_MAX + 1) }, /300 characters/);
bad({ enabled: true, starts_at: start, message: 5 }, /must be text/);
assert.equal(validateMaintenanceInput({ enabled: false, starts_at: '2026-09-01T00:00:00Z', ends_at: '2026-09-01T01:00:00Z' }, now).ok, true, 'a past window can be saved while off');

// Wiring: every page gets the banner through the shared header.
const navbar = readFileSync('components/layout/Navbar.tsx', 'utf8');
assert.match(navbar, /<MaintenanceBanner banner=\{nav\.maintenance \?\? null\} \/>\s*\{\/\* Utility bar/, 'banner is the first thing in the fixed header');
const component = readFileSync('components/layout/MaintenanceBanner.tsx', 'utf8');
assert.match(component, /useState\(\(\) => \(banner \? maintenancePhase\(banner, banner\.checkedAt\) : 'ended'\)\)/, 'first render uses the server read time, so it matches the server HTML');
assert.match(component, /setProperty\(HEIGHT_VAR/, 'publishes its height so page content is not covered');
const layout = readFileSync('app/layout.tsx', 'utf8');
assert.match(layout, /<main id="main-content" className="flex-1 site-main-offset">/);
const css = readFileSync('app/globals.css', 'utf8');
assert.match(css, /\.site-main-offset \{ padding-top: calc\(6rem \+ var\(--site-banner-h, 0px\)\); \}/);
assert.match(css, /\.site-main-offset \{ padding-top: calc\(7rem \+ var\(--site-banner-h, 0px\)\); \}/);
const nav = readFileSync('lib/server/nav-visibility.ts', 'utf8');
assert.match(nav, /getPublicMaintenanceBanner\(\),/);
assert.match(nav, /\|\| maintenance\.failed;/, 'a failed read is never cached as "no banner"');
assert.match(nav, /maintenance: maintenance\.banner,/);
const route = readFileSync('app/api/admin/maintenance-banner/route.ts', 'utf8');
assert.equal((route.match(/requirePermissionResult\('club\.details'\)/g) || []).length, 2, 'GET and PUT need the club details permission');
assert.match(route, /revalidatePublicContent\('clubSettings'\)/, 'saving refreshes every cached page');
const migration = readFileSync('supabase/migrations/20260930010000_maintenance_banner.sql', 'utf8');
assert.match(migration, /add column if not exists maintenance_banner_enabled boolean not null default false/, 'off by default');

console.log('PASS: maintenance banner phases, Melbourne wording, admin validation and site-wide wiring.');
