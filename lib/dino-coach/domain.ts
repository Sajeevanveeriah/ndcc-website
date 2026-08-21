export type DinoRole = 'WK' | 'BAT' | 'AR' | 'BOWL';
export type DinoPositionType = 'starter' | 'bench';

export type DinoSlotCounts = {
  starter: Record<DinoRole, number>;
  bench: Record<DinoRole, number>;
};

export type DinoSquadSlot = {
  key: string;
  role: DinoRole;
  positionType: DinoPositionType;
  label: string;
  order: number;
};

export type DinoScoringConfig = {
  runPoints: number;
  wicketPoints: number;
  catchPoints: number;
  runoutPoints: number;
  maidenPoints: number;
  fiftyBonus: number;
  centuryBonus: number;
  fiveWicketBonus: number;
  sevenWicketBonus: number;
  stumpingPoints: number;
  notOutPoints: number;
  batsmanRunMultiplier: number;
  allRounderRunMultiplier: number;
  allRounderWicketMultiplier: number;
  bowlerWicketMultiplier: number;
  wicketKeeperRunMultiplier: number;
  wicketKeeperCatchMultiplier: number;
  captainMultiplier: number;
  viceCaptainMultiplier: number;
  benchScores: boolean;
  stackBattingMilestones: boolean;
  stackBowlingMilestones: boolean;
};

export type DinoStatLine = {
  runs?: number | null;
  wickets?: number | null;
  maidens?: number | null;
  catches?: number | null;
  runouts?: number | null;
  stumpings?: number | null;
  notOut?: boolean | null;
  not_out?: boolean | null;
};

export type DinoSquadAssignment = {
  slotKey: string;
  playerId: string;
  assignedRole: DinoRole;
  positionType: DinoPositionType;
  isCaptain: boolean;
  isViceCaptain: boolean;
  purchasePriceDinoDollars: number;
};

export const DEFAULT_SLOT_COUNTS: DinoSlotCounts = {
  starter: { BAT: 4, AR: 2, WK: 1, BOWL: 4 },
  bench: { WK: 1, BAT: 1, BOWL: 1, AR: 1 },
};

export const DEFAULT_SCORING_CONFIG: DinoScoringConfig = {
  runPoints: 1,
  wicketPoints: 10,
  catchPoints: 10,
  runoutPoints: 10,
  maidenPoints: 5,
  fiftyBonus: 20,
  centuryBonus: 50,
  fiveWicketBonus: 25,
  sevenWicketBonus: 50,
  stumpingPoints: 10,
  notOutPoints: 10,
  batsmanRunMultiplier: 1.75,
  allRounderRunMultiplier: 1.5,
  allRounderWicketMultiplier: 1.5,
  bowlerWicketMultiplier: 2,
  wicketKeeperRunMultiplier: 1.5,
  wicketKeeperCatchMultiplier: 1.5,
  captainMultiplier: 2,
  viceCaptainMultiplier: 2,
  benchScores: false,
  stackBattingMilestones: false,
  stackBowlingMilestones: false,
};

const ROLE_LABELS: Record<DinoRole, string> = { BAT: 'Batsman', AR: 'All-rounder', WK: 'Wicket keeper', BOWL: 'Bowler' };
const STARTER_ROLE_ORDER: DinoRole[] = ['BAT', 'AR', 'WK', 'BOWL'];
const BENCH_ROLE_ORDER: DinoRole[] = ['WK', 'BAT', 'BOWL', 'AR'];

function finite(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}
function nonNegative(value: unknown) { return Math.max(0, finite(value)); }
function rolePrefix(role: DinoRole) { return role === 'BAT' ? 'BAT' : role === 'AR' ? 'AR' : role === 'WK' ? 'WK' : 'BOWL'; }

export function buildSquadSlots(counts: DinoSlotCounts = DEFAULT_SLOT_COUNTS): DinoSquadSlot[] {
  const slots: DinoSquadSlot[] = [];
  let order = 0;
  for (const role of STARTER_ROLE_ORDER) {
    for (let index = 1; index <= Math.max(0, Number(counts.starter?.[role] ?? 0)); index += 1) {
      order += 1;
      slots.push({ key: `XI_${rolePrefix(role)}_${index}`, role, positionType: 'starter', label: `${ROLE_LABELS[role]} ${index}`, order });
    }
  }
  for (const role of BENCH_ROLE_ORDER) {
    for (let index = 1; index <= Math.max(0, Number(counts.bench?.[role] ?? 0)); index += 1) {
      order += 1;
      slots.push({ key: `BENCH_${rolePrefix(role)}_${index}`, role, positionType: 'bench', label: `Bench ${ROLE_LABELS[role]}${Number(counts.bench?.[role] ?? 0) > 1 ? ` ${index}` : ''}`, order });
    }
  }
  return slots;
}

function milestonePoints(stat: DinoStatLine, scoring: DinoScoringConfig) {
  const runs = nonNegative(stat.runs);
  const wickets = nonNegative(stat.wickets);
  let batting = 0;
  if (runs >= 100) batting = scoring.centuryBonus + (scoring.stackBattingMilestones ? scoring.fiftyBonus : 0);
  else if (runs >= 50) batting = scoring.fiftyBonus;
  let bowling = 0;
  if (wickets >= 7) bowling = scoring.sevenWicketBonus + (scoring.stackBowlingMilestones ? scoring.fiveWicketBonus : 0);
  else if (wickets >= 5) bowling = scoring.fiveWicketBonus;
  return batting + bowling;
}

export function calculateBasePerformancePoints(stat: DinoStatLine, scoring: DinoScoringConfig = DEFAULT_SCORING_CONFIG) {
  const notOut = stat.notOut === true || stat.not_out === true;
  const total = nonNegative(stat.runs) * scoring.runPoints
    + nonNegative(stat.wickets) * scoring.wicketPoints
    + nonNegative(stat.catches) * scoring.catchPoints
    + nonNegative(stat.runouts) * scoring.runoutPoints
    + nonNegative(stat.maidens) * scoring.maidenPoints
    + nonNegative(stat.stumpings) * scoring.stumpingPoints
    + (notOut ? scoring.notOutPoints : 0)
    + milestonePoints(stat, scoring);
  return Number(total.toFixed(2));
}

export function calculateAssignedRolePoints(stat: DinoStatLine, role: DinoRole, scoring: DinoScoringConfig = DEFAULT_SCORING_CONFIG, doublePoints = false, leadershipMultiplier?: number) {
  const runs = nonNegative(stat.runs);
  const wickets = nonNegative(stat.wickets);
  const catches = nonNegative(stat.catches);
  const notOut = stat.notOut === true || stat.not_out === true;
  let runMultiplier = 1;
  let wicketMultiplier = 1;
  let catchMultiplier = 1;
  if (role === 'BAT') runMultiplier = scoring.batsmanRunMultiplier;
  if (role === 'AR') { runMultiplier = scoring.allRounderRunMultiplier; wicketMultiplier = scoring.allRounderWicketMultiplier; }
  if (role === 'BOWL') wicketMultiplier = scoring.bowlerWicketMultiplier;
  if (role === 'WK') { runMultiplier = scoring.wicketKeeperRunMultiplier; catchMultiplier = scoring.wicketKeeperCatchMultiplier; }
  const total = runs * scoring.runPoints * runMultiplier
    + wickets * scoring.wicketPoints * wicketMultiplier
    + catches * scoring.catchPoints * catchMultiplier
    + nonNegative(stat.runouts) * scoring.runoutPoints
    + nonNegative(stat.maidens) * scoring.maidenPoints
    + nonNegative(stat.stumpings) * scoring.stumpingPoints
    + (notOut ? scoring.notOutPoints : 0)
    + milestonePoints(stat, scoring);
  const multiplied = doublePoints ? total * finite(leadershipMultiplier ?? scoring.captainMultiplier) : total;
  return Number(multiplied.toFixed(2));
}

export function calculateInitialPrice(playerAverage: number, bestAverage: number, floorDinoDollars: number, ceilingDinoDollars: number) {
  const floor = Math.max(0, Math.round(floorDinoDollars));
  const ceiling = Math.max(floor, Math.round(ceilingDinoDollars));
  const best = Math.max(0, finite(bestAverage));
  if (best <= 0) return floor;
  const ratio = Math.max(0, Math.min(1, finite(playerAverage) / best));
  return Math.round(floor + ratio * (ceiling - floor));
}

export function calculateRollingPerformance(priorBaseline: number, recentPoints: number[], baselineWeight = 0.5, recentGameWeight = 0.25) {
  const baseline = finite(priorBaseline);
  const game1 = Number.isFinite(recentPoints?.[0]) ? Number(recentPoints[0]) : baseline;
  const game2 = Number.isFinite(recentPoints?.[1]) ? Number(recentPoints[1]) : baseline;
  return Number((baseline * baselineWeight + game1 * recentGameWeight + game2 * recentGameWeight).toFixed(4));
}

export function calculatePriceMovement(previousRolling: number, newRolling: number, pointValueDinoDollars = 1000) {
  return Math.round((finite(newRolling) - finite(previousRolling)) * finite(pointValueDinoDollars));
}

export function isAdultOnDate(dateOfBirth: string, referenceDate: string, minimumAge = 18) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || !/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)) return false;
  const [birthYear, birthMonth, birthDay] = dateOfBirth.split('-').map(Number);
  const [year, month, day] = referenceDate.split('-').map(Number);
  const threshold = new Date(Date.UTC(year - minimumAge, month - 1, day));
  const birth = new Date(Date.UTC(birthYear, birthMonth - 1, birthDay));
  return birth.getUTCFullYear() === birthYear && birth.getUTCMonth() === birthMonth - 1 && birth.getUTCDate() === birthDay && birth.getTime() <= threshold.getTime();
}

const WEEKDAY_TO_ISO: Record<string, number> = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6, Sunday: 7 };
export type TransferWindowConfig = { timezone: string; openWeekday: number; openMinute: number; closeWeekday: number; closeMinute: number };
export function isTransferWindowOpen(atTime: Date, config: TransferWindowConfig) {
  if (!(atTime instanceof Date) || Number.isNaN(atTime.getTime())) return false;
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone: config.timezone, weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(atTime);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  const weekday = WEEKDAY_TO_ISO[get('weekday')] ?? 0;
  const minute = Number(get('hour')) * 60 + Number(get('minute'));
  if (!weekday || !Number.isFinite(minute)) return false;
  const afterOpen = weekday > config.openWeekday || (weekday === config.openWeekday && minute >= config.openMinute);
  const beforeClose = weekday < config.closeWeekday || (weekday === config.closeWeekday && minute < config.closeMinute);
  return afterOpen && beforeClose;
}

function normaliseModerationText(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/0/g, 'o').replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/4|@/g, 'a')
    .replace(/5|\$/g, 's').replace(/7/g, 't').replace(/8/g, 'b').replace(/9/g, 'g')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}
function moderationTokens(value: string) {
  const raw = normaliseModerationText(value).split(/\s+/).filter(Boolean);
  const tokens: string[] = [];
  let singles = '';
  const flushSingles = () => { if (singles) tokens.push(singles); singles = ''; };
  for (const token of raw) { if (token.length === 1) singles += token; else { flushSingles(); tokens.push(token); } }
  flushSingles();
  return tokens;
}
export function moderateTeamName(teamName: string, blockedTerms: string[]) {
  const cleanName = String(teamName || '').trim().replace(/\s+/g, ' ');
  const tokens = moderationTokens(cleanName);
  const terms = blockedTerms.map((term) => normaliseModerationText(String(term))).filter((term) => term.length >= 3);
  const matchedTerm = terms.find((term) => tokens.some((token) => token === term || (term.length >= 4 && token.startsWith(term))));
  return matchedTerm ? { status: 'review_required' as const, cleanName, matchedTerm } : { status: 'approved' as const, cleanName, matchedTerm: null };
}

export function validateSquadAssignments(assignments: DinoSquadAssignment[], slots: DinoSquadSlot[], budgetLimitDinoDollars: number, options: { allowIncomplete?: boolean } = {}) {
  const errors: string[] = [];
  const slotByKey = new Map(slots.map((slot) => [slot.key, slot]));
  const expectedCount = slots.length;
  if (!options.allowIncomplete && assignments.length !== expectedCount) errors.push(`Squad must fill all ${expectedCount} slots.`);
  if (options.allowIncomplete && assignments.length > expectedCount) errors.push(`Squad cannot exceed ${expectedCount} players.`);
  const playerIds = assignments.map((item) => item.playerId).filter(Boolean);
  const slotKeys = assignments.map((item) => item.slotKey).filter(Boolean);
  if (new Set(playerIds).size !== playerIds.length) errors.push('Squad cannot contain duplicate players.');
  if (new Set(slotKeys).size !== slotKeys.length) errors.push('A squad slot cannot be filled more than once.');
  for (const item of assignments) {
    const slot = slotByKey.get(item.slotKey);
    if (!slot) { errors.push(`Unknown squad slot ${item.slotKey}.`); continue; }
    if (item.assignedRole !== slot.role || item.positionType !== slot.positionType) errors.push(`Assignment for ${item.slotKey} does not match the configured slot role.`);
    if (!item.playerId) errors.push(`Assignment for ${item.slotKey} has no player.`);
    if (!Number.isFinite(item.purchasePriceDinoDollars) || item.purchasePriceDinoDollars < 0) errors.push(`Assignment for ${item.slotKey} has an invalid price.`);
  }
  const captains = assignments.filter((item) => item.isCaptain);
  const viceCaptains = assignments.filter((item) => item.isViceCaptain);
  if (!options.allowIncomplete) { if (captains.length !== 1) errors.push('One captain is required.'); if (viceCaptains.length !== 1) errors.push('One vice-captain is required.'); }
  else { if (captains.length > 1) errors.push('Only one captain can be selected.'); if (viceCaptains.length > 1) errors.push('Only one vice-captain can be selected.'); }
  if (captains[0]?.playerId && captains[0].playerId === viceCaptains[0]?.playerId) errors.push('Captain and vice-captain cannot be the same player.');
  if (captains.some((item) => item.positionType !== 'starter')) errors.push('Captain must be in the playing XI.');
  if (viceCaptains.some((item) => item.positionType !== 'starter')) errors.push('Vice-captain must be in the playing XI.');
  const budgetUsedDinoDollars = assignments.reduce((sum, item) => sum + Math.max(0, Math.round(finite(item.purchasePriceDinoDollars))), 0);
  if (budgetUsedDinoDollars > Math.round(finite(budgetLimitDinoDollars))) errors.push('Squad exceeds the Dino Dollar budget.');
  return { valid: errors.length === 0, errors, budgetUsedDinoDollars };
}

export function formatDinoDollars(value: number, currencyName = 'Dino Dollars') { return `${Math.round(finite(value)).toLocaleString('en-AU')} ${currencyName}`; }

export type DinoRoundKind = 'regular' | 'preliminary_final' | 'quarter_final' | 'semi_final' | 'grand_final' | 'other_final';

export function fantasyWeekFromMatchDate(matchDate: string, seasonStartDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(matchDate) || !/^\d{4}-\d{2}-\d{2}$/.test(seasonStartDate)) return null;
  const match = Date.parse(`${matchDate}T00:00:00.000Z`);
  const start = Date.parse(`${seasonStartDate}T00:00:00.000Z`);
  if (!Number.isFinite(match) || !Number.isFinite(start) || match < start) return null;
  return Math.floor((match - start) / 604800000) + 1;
}

export function classifyRoundKind(name: string): { roundKind: DinoRoundKind; pricingEligible: boolean } {
  const value = String(name || '').trim().toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
  if (/\bpreliminary final\b/.test(value)) return { roundKind: 'preliminary_final', pricingEligible: false };
  if (/\bquarter final\b/.test(value)) return { roundKind: 'quarter_final', pricingEligible: false };
  if (/\bsemi final\b/.test(value)) return { roundKind: 'semi_final', pricingEligible: false };
  if (/\bgrand final\b/.test(value)) return { roundKind: 'grand_final', pricingEligible: false };
  if (/\bfinal\b/.test(value)) return { roundKind: 'other_final', pricingEligible: false };
  return { roundKind: 'regular', pricingEligible: true };
}

export type DinoReleaseCounts = {
  selectable: number;
  resolved: number;
  positivePublished: number;
  ambiguous: number;
  duplicateLinks: number;
};

export function evaluateReleaseReadiness(counts: DinoReleaseCounts) {
  const blockers: string[] = [];
  if (!Number.isInteger(counts.selectable) || counts.selectable <= 0) blockers.push('No selectable players are configured.');
  if (counts.resolved !== counts.selectable) blockers.push(`${counts.selectable - counts.resolved} selectable player outcome(s) are unresolved.`);
  if (counts.positivePublished !== counts.selectable) blockers.push(`${counts.selectable - counts.positivePublished} selectable player price(s) are not positive and published.`);
  if (counts.ambiguous > 0) blockers.push(`${counts.ambiguous} ambiguous identity decision(s) remain.`);
  if (counts.duplicateLinks > 0) blockers.push(`${counts.duplicateLinks} duplicate PlayHQ source link(s) remain.`);
  return { ready: blockers.length === 0, blockers };
}

export function normalisePlayerIdentity(value: string) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

export function resolveExactIdentityCandidate(
  playhqDisplayName: string,
  roster: Array<{ id: string; displayName: string }>,
) {
  const target = normalisePlayerIdentity(playhqDisplayName);
  const matches = target ? roster.filter((candidate) => normalisePlayerIdentity(candidate.displayName) === target) : [];
  if (matches.length === 1) return { status: 'unique_exact' as const, playerId: matches[0].id };
  if (matches.length > 1) return { status: 'ambiguous' as const, playerId: null };
  return { status: 'unmatched' as const, playerId: null };
}

export function dinoEntryStatusForStripeEvent(eventType: string, evidence: {
  paymentStatus?: string | null; amount?: number | null; amountRefunded?: number | null; disputeStatus?: string | null;
}) {
  if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(eventType)) return evidence.paymentStatus === 'paid' ? 'paid' : null;
  if (eventType === 'checkout.session.expired') return 'expired';
  if (eventType === 'checkout.session.async_payment_failed') return 'failed';
  if (eventType === 'charge.refunded') return Number(evidence.amountRefunded) >= Number(evidence.amount) ? 'refunded' : null;
  if (eventType === 'charge.dispute.created') return 'disputed';
  if (eventType === 'charge.dispute.closed' && evidence.disputeStatus === 'won') return 'paid';
  return null;
}
