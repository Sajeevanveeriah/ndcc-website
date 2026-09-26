import { formatDinoDollars, formatEntryFee, formatMinuteOfDay, isoWeekdayLabel } from '@/lib/dino-coach/domain';
import { previousSeasonYearsLabel, seasonYearsLabel } from '@/lib/fantasy-season-helpers';

export type FantasyModuleStatus = 'available' | 'planned';
export type FantasyModule = { title: string; description: string; href: string; status: FantasyModuleStatus };

export const FANTASY_MODULES: FantasyModule[] = [
  { title: 'Rules', description: 'Read the current Dino Coach rules and pilot notice.', href: '/fantasy/rules', status: 'available' },
  { title: 'Player catalogue', description: 'Search NDCC players and published Dino Dollar prices.', href: '/fantasy/players', status: 'available' },
  { title: 'Player leaderboard', description: 'View published Dino Coach player scoring.', href: '/fantasy/leaderboard', status: 'available' },
  { title: 'Register / sign in', description: 'Create or access your Dino Coach manager account.', href: '/fantasy/register', status: 'available' },
  { title: 'My squad', description: 'Fill the 15 fantasy slots and nominate captain and vice-captain.', href: '/fantasy/squad', status: 'available' },
  { title: 'Transfers', description: 'Make unlimited free transfers during the open weekly window.', href: '/fantasy/transfers', status: 'available' },
  { title: 'Manager leaderboard', description: 'Compare points and current squad market value.', href: '/fantasy/manager-leaderboard', status: 'available' },
];

// Values shown in the rules come from the selected season and its
// fantasy_dino_settings row when available; each falls back to the published
// copy so the page never shows a blank or placeholder.
export type FantasyRuleValues = {
  seasonLabel?: string | null;
  sourceSeasonLabel?: string | null;
  entryFee?: string | null;
  budget?: string | null;
  transferWindow?: string | null;
  roundRobinPrize?: string | null;
};

const RULE_DEFAULTS = {
  seasonLabel: '2026/2027',
  sourceSeasonLabel: '2025/2026',
  entryFee: 'AUD 25.00',
  budget: '15,000,000 Dino Dollars',
  transferWindow: 'Monday 09:00 inclusive to Saturday 11:00 exclusive in Australia/Melbourne time',
  roundRobinPrize: '300 Dino Dollars',
};

export function fantasyRuleSections(values: FantasyRuleValues = {}) {
  const v = {
    seasonLabel: values.seasonLabel || RULE_DEFAULTS.seasonLabel,
    sourceSeasonLabel: values.sourceSeasonLabel || RULE_DEFAULTS.sourceSeasonLabel,
    entryFee: values.entryFee || RULE_DEFAULTS.entryFee,
    budget: values.budget || RULE_DEFAULTS.budget,
    transferWindow: values.transferWindow || RULE_DEFAULTS.transferWindow,
    roundRobinPrize: values.roundRobinPrize || RULE_DEFAULTS.roundRobinPrize,
  };
  return [
  { title: 'Entry and pilot', items: [
    `Dino Coach is the Newcomb and District Cricket Club fantasy competition for the ${v.seasonLabel} season.`,
    'Registration remains open throughout the season. Late entrants compete in the same season-long league, buy at current published prices and earn points from their first eligible locked round. Earlier rounds are not backdated.',
    `Entry costs ${v.entryFee}. Managers must be at least 18, accept the current rules and have an approved team name before payment eligibility can unlock team selection.`,
    `Dino Coach is running as a pilot for the ${v.seasonLabel} season. Feedback and suggestions are welcome. If a scoring defect, data issue, technical fault or unintended rules outcome is identified, the league manager may make a reasonable adjustment to protect the fairness and operation of the competition. Material changes will be communicated to participants and recorded. Changes will not be applied secretly.`,
  ] },
  { title: 'Squad and assigned roles', items: [
    'Each manager selects exactly 15 real NDCC players: a playing XI of 4 BAT, 2 AR, 1 WK and 4 BOWL, plus a bench of 1 BAT, 1 AR, 1 WK and 1 BOWL.',
    'A real player can be assigned to any fantasy slot. Their real-world cricket role does not restrict selection; the assigned fantasy slot controls scoring.',
    'Junior-only players are excluded. Juniors who also play senior cricket may be selected, subject to league-manager eligibility confirmation. The league manager maintains the eligible player pool for this season.',
    'Cricket roles are inferred from season batting and bowling contributions, with club-confirmed wicket keepers overriding the statistics. Players without enough evidence are labelled not yet classified. These labels do not restrict fantasy slots.',
    'Exactly one captain and one vice-captain are required. Both must be in the playing XI and both receive the same 2x multiplier.',
    `Bench players score zero. The squad budget is ${v.budget}.`,
  ] },
  { title: 'Money and the player pool', items: [
    'Buy players from the shared player pool and sell them back to that pool. Transfers between managers are not available. The same cricketer can appear in several teams.',
    `The starting budget is ${v.budget} for existing and new teams. Existing purchase costs are preserved, giving existing teams an extra 5,000,000 available to spend.`,
    'The Team wallet shows saved spending and saved money available. My squad also previews the balance as you select or remove players. Save draft or Submit squad confirms those edits.',
    'Buying charges the current published price. Selling refunds the original purchase cost displayed for that player. Price changes affect market value, not your cash balance or retained purchase costs.',
    'Use Transfers to sell a player, buy into an empty slot or sell and buy a replacement together. Individual sales and purchases leave a draft: fill all 15 slots, check captain and vice-captain and submit before the round deadline.',
    'The weekly window, season controls, account eligibility and round locks apply to sales, purchases and replacements. Submitted managers must make squad edits within the transfer window too.',
    'Player cards show recorded batting, bowling and fielding totals with their source period. Historical totals are shown until published match records exist for the selected season. Not recorded means unknown, not zero; cards do not invent ratings out of 100.',
  ] },
  { title: 'Scoring', items: [
    'BAT (batter): 1.75 points per run, 10 per wicket and 10 per catch.',
    'AR (all-rounder): 1.5 points per run, 15 per wicket and 10 per catch.',
    'BOWL (bowler): 1 point per run, 20 per wicket and 10 per catch.',
    'WK (wicket keeper): 1.5 points per run, 10 per wicket and 15 per catch.',
    'Every playing role earns 10 points per run-out, 10 per stumping, 5 per maiden and 10 for a not-out innings.',
    'Batting bonuses: 50-99 runs earns 20 extra points; 100 or more earns 50 extra points. Only the highest batting bonus applies in an innings.',
    'Bowling bonuses: 5-6 wickets earns 25 extra points; 7 or more earns 50 extra points. Only the highest bowling bonus applies in an innings.',
    'Captain and vice-captain each earn double their points, including bonuses. Bench players earn zero. There is no duck penalty or player-of-the-match bonus.',
  ] },
  { title: 'Transfers and prices', items: [
    `Transfers are unlimited, free and carry no points penalty. The server-authoritative window is ${v.transferWindow}.`,
    `Opening player prices reflect the supplied ${v.sourceSeasonLabel} statistics and are rounded upwards to the next 1,000 Dino Dollars. The highest-ranked player starts at 2,000,000 Dino Dollars. Players without historical statistics start at 100,000 Dino Dollars.`,
    'All price reviews and manual price changes are rounded upwards to whole 1,000 Dino Dollars. Prices are reviewed automatically after every two regular rounds: rounds 2, 4, 6 and so on. Settlement becomes eligible on the following Monday at 09:00 Melbourne time and runs at the next daily pricing check once published results are available.',
    'Strong performances can increase a player price; weaker performances can reduce it. Prices stay between 100,000 and 2,000,000 Dino Dollars. A non-appearance does not count as a zero-score appearance. Finals do not change prices.',
    'Price reviews use published results available when the review runs. Late results enter a later review. Completed reviews are not charged or applied twice.',
    'The league manager can make manual price and eligibility corrections. Price overrides are recorded with the old price, new price, reason and administrator. Automatic changes resume at the next review.',
  ] },
  { title: 'Standings', items: [
    'Player Standings rank real NDCC cricketers by their published base performance points, without fantasy-slot or captain bonuses. Use this page to compare on-field performances.',
    'Manager Standings rank the people playing Dino Coach by the points earned by their selected playing XI, including assigned-slot scoring and captain and vice-captain bonuses. Bench players do not add points. Current squad market value is used to break points ties.',
  ] },
  { title: 'Team names, prizes and ties', items: [
    'Team names must be suitable for a community cricket club. Names requiring review may be replaced and locked by the league manager.',
    `The round-robin leader prize is ${v.roundRobinPrize}. The highest total squad-value prize label and description are published by the committee; no real-money value is implied.`,
    'Leaderboard ties are resolved by total points, then current squad market value, then team name alphabetically.',
  ] },
];
}

export const FANTASY_RULE_SECTIONS = fantasyRuleSections();

type RuleSeason = { name?: string | null; slug?: string | null } | null | undefined;
type RuleSettings = {
  entry_fee_cents?: unknown; entry_fee_currency?: unknown; budget_dino_dollars?: unknown; round_robin_prize_dino_dollars?: unknown;
  transfer_timezone?: unknown; transfer_open_weekday?: unknown; transfer_open_minute?: unknown; transfer_close_weekday?: unknown; transfer_close_minute?: unknown;
} | null | undefined;

// Rule values from the selected season and its Dino Coach settings. Anything
// missing or invalid is left out so fantasyRuleSections keeps its default copy.
export function fantasyRuleValuesFrom(season: RuleSeason, settings: RuleSettings): FantasyRuleValues {
  const seasonLabel = seasonYearsLabel(season);
  const numeric = (value: unknown) => {
    const number = typeof value === 'string' && value.trim() ? Number(value) : value;
    return typeof number === 'number' && Number.isFinite(number) ? number : null;
  };
  const budget = numeric(settings?.budget_dino_dollars);
  const prize = numeric(settings?.round_robin_prize_dino_dollars);
  const openDay = isoWeekdayLabel(numeric(settings?.transfer_open_weekday));
  const closeDay = isoWeekdayLabel(numeric(settings?.transfer_close_weekday));
  const openClock = formatMinuteOfDay(numeric(settings?.transfer_open_minute));
  const closeClock = formatMinuteOfDay(numeric(settings?.transfer_close_minute));
  const timezone = typeof settings?.transfer_timezone === 'string' && settings.transfer_timezone.trim() ? settings.transfer_timezone.trim() : null;
  return {
    seasonLabel,
    sourceSeasonLabel: previousSeasonYearsLabel(seasonLabel),
    entryFee: formatEntryFee(settings?.entry_fee_cents, settings?.entry_fee_currency),
    budget: budget !== null && budget > 0 ? formatDinoDollars(budget) : null,
    roundRobinPrize: prize !== null && prize >= 0 ? formatDinoDollars(prize) : null,
    transferWindow: openDay && closeDay && openClock && closeClock && timezone ? `${openDay} ${openClock} inclusive to ${closeDay} ${closeClock} exclusive in ${timezone} time` : null,
  };
}
