// Dino Coach hardening: squad POST error handling, settings-driven copy
// (season years, entry fee, budget, transfer window, prize) and the Dino
// sign-up/sign-in form's email normalisation and password rule.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function load(file, mocks = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, resolveJsonModule: true, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (name in mocks) return mocks[name];
    throw new Error(`Unexpected import: ${name}`);
  }, module, module.exports);
  return module.exports;
}

const domain = load('lib/dino-coach/domain.ts');
const seasonHelpers = load('lib/fantasy-season-helpers.ts');
const fantasy = load('lib/fantasy.ts', { '@/lib/dino-coach/domain': domain, '@/lib/fantasy-season-helpers': seasonHelpers });

// ---- Formatting helpers ----
assert.equal(domain.formatEntryFee(2500, 'AUD'), 'AUD 25.00');
assert.equal(domain.formatEntryFee('3000', 'aud'), 'AUD 30.00');
for (const bad of [0, -100, 12.5, null, undefined, 'abc']) assert.equal(domain.formatEntryFee(bad, 'AUD'), null);
assert.equal(domain.formatEntryFee(2500, ''), null);
assert.equal(domain.formatMinuteOfDay(660), '11:00');
assert.equal(domain.formatMinuteOfDay(0), '00:00');
assert.equal(domain.formatMinuteOfDay(1440), null);
assert.equal(seasonHelpers.seasonYearsLabel({ name: 'NDCC Fantasy 2026/2027', slug: '2026-27' }), '2026/2027');
assert.equal(seasonHelpers.seasonYearsLabel({ name: 'Dino Coach', slug: '2027-28' }), '2027/2028');
assert.equal(seasonHelpers.seasonYearsLabel({ name: 'Legacy / Unverified', slug: 'legacy-unverified' }), null);
assert.equal(seasonHelpers.seasonYearsLabel({ name: '2026/2028' }), null, 'Non-consecutive years are not a season');
assert.equal(seasonHelpers.seasonYearsLabel(null), null);
assert.equal(seasonHelpers.previousSeasonYearsLabel('2026/2027'), '2025/2026');
assert.equal(seasonHelpers.previousSeasonYearsLabel('junk'), null);
console.log('PASS formatting helpers: entry fee, clock, season years');

// ---- Rules copy ----
const flat = sections => sections.flatMap(section => section.items).join('\n');
const defaults = flat(fantasy.fantasyRuleSections());
assert.equal(flat(fantasy.FANTASY_RULE_SECTIONS), defaults);
for (const text of ['2026/2027 season', 'Entry costs AUD 25.00', 'The squad budget is 15,000,000 Dino Dollars.', 'Monday 09:00 inclusive to Saturday 11:00 exclusive in Australia/Melbourne time', 'supplied 2025/2026 statistics', 'leader prize is 300 Dino Dollars']) {
  assert.ok(defaults.includes(text), `Default rules keep: ${text}`);
}
const liveSettings = { entry_fee_cents: 3000, entry_fee_currency: 'AUD', budget_dino_dollars: 16000000, round_robin_prize_dino_dollars: 500, transfer_timezone: 'Australia/Melbourne', transfer_open_weekday: 2, transfer_open_minute: 0, transfer_close_weekday: 6, transfer_close_minute: 660 };
const values = fantasy.fantasyRuleValuesFrom({ name: 'NDCC Fantasy 2027/2028', slug: '2027-28' }, liveSettings);
const live = flat(fantasy.fantasyRuleSections(values));
for (const text of ['2027/2028 season', 'Entry costs AUD 30.00', 'The squad budget is 16,000,000 Dino Dollars.', 'Tuesday 00:00 inclusive to Saturday 11:00 exclusive in Australia/Melbourne time', 'supplied 2026/2027 statistics', 'leader prize is 500 Dino Dollars']) {
  assert.ok(live.includes(text), `Settings drive: ${text}`);
}
assert.ok(!live.includes('2026/2027 season') && !live.includes('AUD 25.00') && !live.includes('15,000,000 Dino Dollars'));
const partial = flat(fantasy.fantasyRuleSections(fantasy.fantasyRuleValuesFrom(null, { entry_fee_cents: null, transfer_open_weekday: 0 })));
assert.equal(partial, defaults, 'Missing or invalid values keep the published copy');
assert.ok(!/\$\{|undefined|null/.test(live), 'No template or placeholder text leaks into the rules');
console.log('PASS rules copy: settings-driven values with published fallbacks');

// ---- Pages use settings, not hardcoded values ----
const read = file => fs.readFileSync(file, 'utf8');
const home = read('app/fantasy/page.tsx');
assert.match(home, /Entry is \{entryFee\}/);
assert.match(home, /Pay \{entryFee\} through Stripe-hosted Checkout\./);
assert.match(home, /for the \{seasonYears\} season/);
assert.doesNotMatch(read('app/fantasy/register/page.tsx'), /AUD 25\.00/);
assert.match(read('app/fantasy/rules/page.tsx'), /fantasyRuleSections\(fantasyRuleValuesFrom\(seasonContext\.selected, dinoSettings\)\)/);
assert.match(read('app/fantasy/_components/SquadBuilder.tsx'), /money\(Number\(settings\.budget_dino_dollars\)\)/);
const email = read('lib/dino-coach/registration-email.ts');
assert.match(email, /Your starting budget is \$\{budgetText\} virtual Dino Dollars\./);
assert.match(email, /from\('fantasy_dino_settings'\)\.select\('budget_dino_dollars'\)/);
assert.match(read('lib/dino-coach/pricing.ts'), /published \$\{seasonSummary\.sourceSeason\} season summary/);
const reconciliation = read('app/admin/fantasy/reconciliation/page.tsx');
assert.match(reconciliation, /previousSeasonYearsLabel\(seasonYearsLabel\(current\)\)/);
console.log('PASS pages, email, pricing and reconciliation read settings or season data');

// ---- Dino auth form ----
const form = read('app/fantasy/_components/FantasyAuthForms.tsx');
assert.match(form, /const MIN_PASSWORD_LENGTH = 8;/);
assert.match(form, /return value\.trim\(\)\.toLowerCase\(\);/);
assert.match(form, /signUp\(\{\s*email: authEmail,/);
assert.match(form, /signInWithPassword\(\{ email: authEmail, password \}\)/);
assert.match(form, /resend\(\{ type: 'signup', email: targetEmail,/);
assert.match(form, /const targetEmail = normaliseAuthEmail\(email\);\n\s+if \(!targetEmail\)/);
assert.match(form, /resetPasswordForEmail\(targetEmail,/);
assert.match(form, /mode === 'register' && password\.length < MIN_PASSWORD_LENGTH/);
assert.doesNotMatch(form, /password\.length < 6/);
assert.doesNotMatch(form, /mode === 'login' && password\.length </, 'Existing shorter passwords can still sign in');
assert.match(form, /Entry payment required: \$\{entryFee\}\./);
assert.match(form, /Pay \$\{entryFee\} entry/);
assert.doesNotMatch(form, /15 million Dino Dollar budget/);
console.log('PASS Dino auth form: normalised email for sign in, sign up, resend and reset; 8-character sign-up passwords');

// ---- Squad POST error handling ----
let settingsFailure = null;
const squad = load('app/api/fantasy/squad/route.ts', {
  '@/lib/server/fantasy-mutation': { readFantasyMutation: async request => ({ body: await request.json() }) },
  '@/lib/dino-coach/manager-eligibility': { managerEligibilityIssues: () => [] },
  '@/lib/dino-coach/player-stats-server': {},
  'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } },
  '@/lib/fantasy-manager-auth': { resolveFantasyManagerAuth: async () => ({ auth: { manager: { id: 'owner' } } }) },
  '@/lib/supabase-server': { createServerClient: () => ({ from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { status: 'paid' }, error: null }) }) }) },
  '@/lib/fantasy-seasons': { resolveRequestSeason: async () => ({ id: 'season', is_current: true }), seasonAllowsTeamChanges: () => true },
  '@/lib/fantasy-game': { getActivePlayersWithLatestPrices: async () => [], getRoundLockState: async () => ({ locked: false, roundId: null }) },
  '@/lib/dino-coach/domain': domain,
  '@/lib/dino-coach/server': { getDinoCoachSettings: async () => { if (settingsFailure) throw settingsFailure; return { rules_version: 'r1', public_launch_enabled: false, team_selection_open: false }; }, toPublicDinoCoachSettings: value => value },
  '@/lib/server/public-errors': { logRouteError: () => {}, publicRpcErrorMessage: (_error, fallback) => fallback },
});
(async () => {
  const post = () => squad.POST({ json: async () => ({ selection: [] }), url: 'https://example.invalid/api/fantasy/squad' });
  const closed = await post();
  assert.equal(closed.status, 403, 'Normal validation still runs');
  settingsFailure = new Error('private settings failure');
  const failed = await post();
  assert.equal(failed.status, 500);
  assert.equal(failed.body.success, false);
  assert.ok(!JSON.stringify(failed.body).includes('private settings failure'));
  console.log('PASS squad POST: settings failures return friendly JSON');
})().catch(error => { console.error(error); process.exitCode = 1; });
