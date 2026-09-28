import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_SCORING_CONFIG, DEFAULT_SLOT_COUNTS, buildSquadSlots,
  calculateBasePerformancePoints, calculateAssignedRolePoints, calculateInitialPrice,
  calculateRollingPerformance, calculatePriceMovement, calculateReviewedPrice, isAdultOnDate,
  isTransferWindowOpen, moderateTeamName, validateSquadAssignments,
  fantasyWeekFromMatchDate, classifyRoundKind, evaluateReleaseReadiness,
  resolveExactIdentityCandidate,
  dinoEntryStatusForStripeEvent,
} from '../lib/dino-coach/domain.ts';

const test = (name, fn) => {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}`); throw error; }
};

test('builds the exact 11 plus 4 slot structure', () => {
  const slots = buildSquadSlots(DEFAULT_SLOT_COUNTS);
  assert.equal(slots.length, 15);
  assert.deepEqual(slots.filter((slot) => slot.positionType === 'starter').reduce((m, s) => ({ ...m, [s.role]: (m[s.role] || 0) + 1 }), {}), { BAT: 4, AR: 2, WK: 1, BOWL: 4 });
  assert.deepEqual(slots.filter((slot) => slot.positionType === 'bench').reduce((m, s) => ({ ...m, [s.role]: (m[s.role] || 0) + 1 }), {}), { WK: 1, BAT: 1, BOWL: 1, AR: 1 });
});

test('enforces adult eligibility on the eighteenth birthday boundary', () => {
  assert.equal(isAdultOnDate('2008-08-21', '2026-08-21', 18), true);
  assert.equal(isAdultOnDate('2008-08-22', '2026-08-21', 18), false);
});

test('uses role-neutral base scoring for global price performance', () => {
  const stat = { runs: 100, wickets: 5, maidens: 2, catches: 1, runouts: 1, stumpings: 1, notOut: true };
  assert.equal(calculateBasePerformancePoints(stat, DEFAULT_SCORING_CONFIG), 275);
});

test('applies assigned role and captain multipliers after base activities', () => {
  const stat = { runs: 100, wickets: 5, maidens: 2, catches: 1, runouts: 1, stumpings: 1, notOut: true };
  assert.equal(calculateAssignedRolePoints(stat, 'BAT', DEFAULT_SCORING_CONFIG, false), 350);
  assert.equal(calculateAssignedRolePoints(stat, 'BOWL', DEFAULT_SCORING_CONFIG, false), 325);
  assert.equal(calculateAssignedRolePoints(stat, 'WK', DEFAULT_SCORING_CONFIG, false), 330);
  assert.equal(calculateAssignedRolePoints(stat, 'AR', DEFAULT_SCORING_CONFIG, true), 700);
});

test('does not stack 50 and 100 or 5 and 7 wicket milestone bonuses', () => {
  assert.equal(calculateBasePerformancePoints({ runs: 100 }, DEFAULT_SCORING_CONFIG), 150);
  assert.equal(calculateBasePerformancePoints({ wickets: 7 }, DEFAULT_SCORING_CONFIG), 120);
});

test('calculates rolling price movement at 1000 Dino Dollars per point', () => {
  assert.equal(calculateRollingPerformance(80, [100, 100], 0.5, 0.25), 90);
  assert.equal(calculatePriceMovement(82, 95, 1000), 13000);
  assert.equal(calculatePriceMovement(82, 77, 1000), -5000);
  // Rolling reviews mirror settle_dino_price_windows: round 4 is measured against round 2.
  const round2 = calculateRollingPerformance(30, [50, 70]); // 0.5 x 30 + 0.5 x 60
  assert.equal(round2, 45);
  assert.equal(calculateReviewedPrice(500000, 30, round2, 10000, 100000, 2000000), 650000);
  const round4 = calculateRollingPerformance(30, [20, 40], 0.5, 0.25, round2); // 0.5 x 30 + 0.5 x 30
  assert.equal(round4, 30);
  assert.equal(calculateReviewedPrice(650000, round2, round4, 10000, 100000, 2000000), 500000);
  assert.equal(calculateRollingPerformance(20, [80]), 35); // one game: 0.75 x 20 + 0.25 x 80
  assert.equal(calculateRollingPerformance(20, [], 0.5, 0.25, 35), 35); // no games: unchanged
  assert.equal(calculateReviewedPrice(500000, 0, 0.25, 10000, 100000, 2000000), 503000); // rounds upwards
  assert.equal(calculateReviewedPrice(1990000, 30, 40, 10000, 100000, 2000000), 2000000); // ceiling
  assert.equal(calculateReviewedPrice(150000, 40, 30, 10000, 100000, 2000000), 100000); // floor
});

test('scales initial price from floor to the best-player ceiling', () => {
  assert.equal(calculateInitialPrice(100, 100, 50000, 200000), 200000);
  assert.equal(calculateInitialPrice(50, 100, 50000, 200000), 125000);
  assert.equal(calculateInitialPrice(1, 3, 100000, 2000000), 733000, 'Opening prices round to the nearest 1,000, not upwards');
  assert.equal(calculateInitialPrice(2, 3, 100000, 2000000), 1367000);
  assert.equal(calculateInitialPrice(0, 100, 100499, 2000000), 100499, 'Rounding never goes below the floor');
  assert.match(readFileSync('app/api/admin/fantasy/settings/route.ts', 'utf8'), /v % 1000 === 0\)\) throw new Error\('The price floor and ceiling must be whole thousands/, 'Settings require whole-thousand price limits');
  // The database opening-price functions round the same way (nearest 1,000).
  const nearestMigration = readFileSync('supabase/migrations/20260926232018_dino_coach_nearest_thousand_opening_prices.sql', 'utf8');
  assert.equal((nearestMigration.match(/ROUND\(\(/g) || []).length, 9);
  assert.doesNotMatch(nearestMigration, /CEIL|ceil\(/);
  for (const fn of ['publish_dino_coach_baseline_import', 'recalculate_dino_coach_applied_baseline', 'apply_dino_coach_provisional_baseline']) {
    assert.match(nearestMigration, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(`));
  }
  assert.equal(calculateInitialPrice(0, 100, 50000, 200000), 50000);
});

test('enforces Monday 09:00 inclusive to Saturday 11:00 exclusive Melbourne transfer window', () => {
  const config = { timezone: 'Australia/Melbourne', openWeekday: 1, openMinute: 540, closeWeekday: 6, closeMinute: 660 };
  assert.equal(isTransferWindowOpen(new Date('2026-10-04T21:59:59Z'), config), false);
  assert.equal(isTransferWindowOpen(new Date('2026-10-04T22:00:00Z'), config), true);
  assert.equal(isTransferWindowOpen(new Date('2026-10-09T23:59:59Z'), config), true);
  assert.equal(isTransferWindowOpen(new Date('2026-10-10T00:00:00Z'), config), false);
});

test('flags configured offensive team names for league-manager review', () => {
  assert.equal(moderateTeamName('Dino Legends', ['fuck', 'shit']).status, 'approved');
  assert.equal(moderateTeamName('F.u.c.k XI', ['fuck', 'shit']).status, 'review_required');
});

test('validates all 15 assigned slots independent of real-world player role', () => {
  const slots = buildSquadSlots(DEFAULT_SLOT_COUNTS);
  const assignments = slots.map((slot, index) => ({
    slotKey: slot.key, playerId: `p${index + 1}`, assignedRole: slot.role,
    positionType: slot.positionType, isCaptain: index === 0, isViceCaptain: index === 1,
    purchasePriceDinoDollars: 100000,
  }));
  const result = validateSquadAssignments(assignments, slots, 2000000);
  assert.equal(result.valid, true);
  assert.equal(result.budgetUsedDinoDollars, 1500000);
  assert.equal(validateSquadAssignments(assignments.slice(0, 14), slots, 2000000).valid, false);
});

test('maps grade-local rounds into a shared Dino Coach week by match date', () => {
  assert.equal(fantasyWeekFromMatchDate('2025-10-04', '2025-10-01'), 1);
  assert.equal(fantasyWeekFromMatchDate('2025-10-05', '2025-10-01'), 1);
  assert.equal(fantasyWeekFromMatchDate('2025-10-11', '2025-10-01'), 2);
  assert.equal(fantasyWeekFromMatchDate('2025-10-18', '2025-10-01'), 3);
});

test('classifies every configured final as scoring but price-ineligible', () => {
  for (const label of ['Preliminary Final', 'Quarter Final', 'Semi Final', 'Grand Final']) {
    assert.deepEqual(classifyRoundKind(label), { roundKind: label.toLowerCase().replaceAll(' ', '_'), pricingEligible: false });
  }
  assert.deepEqual(classifyRoundKind('Round 12'), { roundKind: 'regular', pricingEligible: true });
});

test('blocks release until every selectable player is resolved and positively published', () => {
  assert.equal(evaluateReleaseReadiness({ selectable: 134, resolved: 134, positivePublished: 134, ambiguous: 0, duplicateLinks: 0 }).ready, true);
  assert.equal(evaluateReleaseReadiness({ selectable: 134, resolved: 133, positivePublished: 134, ambiguous: 0, duplicateLinks: 0 }).ready, false);
  assert.equal(evaluateReleaseReadiness({ selectable: 134, resolved: 134, positivePublished: 133, ambiguous: 0, duplicateLinks: 0 }).ready, false);
  assert.equal(evaluateReleaseReadiness({ selectable: 134, resolved: 134, positivePublished: 134, ambiguous: 1, duplicateLinks: 0 }).ready, false);
});

test('auto-links only a unique exact normalised player identity', () => {
  const roster = [
    { id: '1', displayName: 'Saj Veeriah' },
    { id: '2', displayName: 'Alex Smith' },
  ];
  assert.deepEqual(resolveExactIdentityCandidate('  SAJ   VEERIAH ', roster), { status: 'unique_exact', playerId: '1' });
  assert.deepEqual(resolveExactIdentityCandidate('Unknown Player', roster), { status: 'unmatched', playerId: null });
  assert.deepEqual(resolveExactIdentityCandidate('Alex Smith', [...roster, { id: '3', displayName: 'Alex Smith' }]), { status: 'ambiguous', playerId: null });
});

test('maps only Checkout lifecycle events; financial state is derived atomically in SQL', () => {
  assert.equal(dinoEntryStatusForStripeEvent('checkout.session.completed', { paymentStatus: 'paid' }), 'paid');
  assert.equal(dinoEntryStatusForStripeEvent('checkout.session.expired', {}), 'expired');
  assert.equal(dinoEntryStatusForStripeEvent('checkout.session.async_payment_failed', {}), 'failed');
  assert.equal(dinoEntryStatusForStripeEvent('charge.refunded', {}), null);
  assert.equal(dinoEntryStatusForStripeEvent('charge.dispute.created', {}), null);
  assert.equal(dinoEntryStatusForStripeEvent('charge.dispute.closed', {}), null);
});

test('uses the configured vice-captain multiplier independently', () => {
  const scoring = { ...DEFAULT_SCORING_CONFIG, captainMultiplier: 3, viceCaptainMultiplier: 2 };
  assert.equal(calculateAssignedRolePoints({ runs: 10 }, 'AR', scoring, true, scoring.viceCaptainMultiplier), 30);
});

test('uses Dino Coach branding on current participant surfaces', () => {
  const participantSurfaces = [
    'app/page.tsx',
    'app/fantasy/register/page.tsx',
    'app/fantasy/login/page.tsx',
    'app/fantasy/account/page.tsx',
    'app/fantasy/reset-password/page.tsx',
    'app/fantasy/team/page.tsx',
    'app/fantasy/leagues/page.tsx',
    'app/fantasy/leaderboard/page.tsx',
    'app/fantasy/manager-leaderboard/page.tsx',
    'app/fantasy/_components/FantasyAuthForms.tsx',
    'components/auth/ResetPasswordForm.tsx',
    'app/admin/fantasy/page.tsx',
    'app/admin/fantasy/import/page.tsx',
    'components/fantasy/FantasyBackLink.tsx',
    'lib/constants.ts',
  ];
  for (const path of participantSurfaces) {
    assert.doesNotMatch(readFileSync(path, 'utf8'), /Fantasy Cricket/iu, `${path} still exposes legacy branding`);
    assert.doesNotMatch(readFileSync(path, 'utf8'), /(?:Fantasy|fantasy) (?:manager|account|registration|sign-in|team|classic league)/u, `${path} still exposes legacy participant copy`);
  }
});

test('aligns CMS-managed fantasy navigation with Dino Coach branding', () => {
  const migration = readFileSync('supabase/migrations/20260821025951_dino_coach_cms_brand_alignment.sql', 'utf8');
  assert.match(migration, /update public\.page_link_cards/iu);
  assert.match(migration, /title = 'Dino Coach'/u);
  assert.match(migration, /href = '\/fantasy'/u);
});

test('private league invitation codes use cryptographic randomness', () => {
  const source = readFileSync('app/api/fantasy/leagues/route.ts', 'utf8');
  assert.match(source, /randomBytes\(LEAGUE_CODE_LENGTH \* 2\)/u);
  assert.match(source, /LEAGUE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'/u, 'new codes avoid look-alike characters');
  assert.match(source, /LEAGUE_CODE_LENGTH = 12/u);
  assert.match(source, /\^\[A-Z0-9\]\{4,12\}\$/u, 'existing 8-character codes can still be joined');
  assert.doesNotMatch(source, /Math\.random\(\)/u);
});

console.log('Dino Coach deterministic rule suite passed.');
