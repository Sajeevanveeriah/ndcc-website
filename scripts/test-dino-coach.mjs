import assert from 'node:assert/strict';
import {
  DEFAULT_SCORING_CONFIG, DEFAULT_SLOT_COUNTS, buildSquadSlots,
  calculateBasePerformancePoints, calculateAssignedRolePoints, calculateInitialPrice,
  calculateRollingPerformance, calculatePriceMovement, isAdultOnDate,
  isTransferWindowOpen, moderateTeamName, validateSquadAssignments,
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
});

test('scales initial price from floor to the best-player ceiling', () => {
  assert.equal(calculateInitialPrice(100, 100, 50000, 200000), 200000);
  assert.equal(calculateInitialPrice(50, 100, 50000, 200000), 125000);
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

console.log('Dino Coach deterministic rule suite passed.');
