import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const webhook = read('app/api/stripe/webhook/route.ts');
const players = read('app/api/fantasy/players/route.ts');
const squad = read('app/api/fantasy/squad/route.ts');
const transfers = read('app/api/fantasy/transfers/route.ts');
const server = read('lib/dino-coach/server.ts');
const releaseRunner = read('app/api/internal/fantasy/release-run/route.ts');
const transferSecurityMigration = read('supabase/migrations/20260821055500_dino_coach_transfer_function_hardening.sql');

assert.match(webhook, /rpc\('apply_dino_entry_payment_event'/,
  'Dino Coach payment audit and eligibility must be committed atomically by one database function.');
assert.doesNotMatch(webhook, /from\('fantasy_entry_payment_events'\)\.insert/,
  'The webhook must not write the audit row separately from the entry status.');
assert.match(webhook, /escapeEmailHtml\(entry\.fantasy_managers\.display_name\)/,
  'Manager-controlled display names must be escaped before inclusion in email HTML.');

assert.match(server, /toPublicDinoCoachSettings/,
  'Dino Coach must define an explicit public settings projection.');
for (const [name, source] of [['players', players], ['squad', squad], ['transfers', transfers]]) {
  assert.match(source, /toPublicDinoCoachSettings\(/, `${name} response must use the public settings projection.`);
}
const publicProjection = server.match(/export function toPublicDinoCoachSettings[\s\S]*?\n}/)?.[0] || '';
assert.match(publicProjection, /blocked_team_name_terms: _privateModerationTerms/,
  'Public settings must remove moderation terms.');
assert.match(publicProjection, /notification_recipients: _privateNotificationRecipients/,
  'Public settings must remove committee recipients.');

assert.match(releaseRunner, /export async function POST\(/,
  'The privileged release runner must use POST.');
assert.match(releaseRunner, /authorization.*Bearer/is,
  'The one-time release token must be carried in the Authorization header.');
assert.doesNotMatch(releaseRunner, /searchParams\.get\('token'\)/,
  'Release tokens must never be accepted in a URL query string.');

assert.doesNotMatch(transferSecurityMigration, /SET search_path\s*=\s*public/i,
  'Dino Coach SECURITY DEFINER transfer functions must not trust a writable schema search path.');
assert.match(transferSecurityMigration, /SECURITY DEFINER SET search_path = ''/,
  'Dino Coach transfer functions must use an empty search path.');
assert.match(transferSecurityMigration, /public\.fantasy_dino_settings/,
  'Objects used by hardened transfer functions must be schema-qualified.');

console.log('PASS Dino Coach security regressions');
