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

export const FANTASY_RULE_SECTIONS = [
  { title: 'Entry and pilot', items: [
    'Dino Coach is the Newcomb and District Cricket Club fantasy competition for the 2026/2027 season.',
    'Entry costs AUD 25.00. Managers must be at least 18, accept the current rules and have an approved team name before payment eligibility can unlock team selection.',
    'Dino Coach is running as a pilot for the 2026/2027 season. Feedback and suggestions are welcome. If a scoring defect, data issue, technical fault or unintended rules outcome is identified, the league manager may make a reasonable adjustment to protect the fairness and operation of the competition. Material changes will be communicated to participants and recorded. Changes will not be applied secretly.',
  ] },
  { title: 'Squad and assigned roles', items: [
    'Each manager selects exactly 15 real NDCC players: a playing XI of 4 BAT, 2 AR, 1 WK and 4 BOWL, plus a bench of 1 BAT, 1 AR, 1 WK and 1 BOWL.',
    'A real player can be assigned to any fantasy slot. Their real-world cricket role does not restrict selection; the assigned fantasy slot controls scoring.',
    'Junior-only players are excluded. Juniors who also play senior cricket may be selected, subject to league-manager eligibility confirmation. The league manager maintains the eligible player pool for this season.',
    'Cricket roles are inferred from season batting and bowling contributions, with club-confirmed wicket keepers overriding the statistics. Players without enough evidence are labelled not yet classified. These labels do not restrict fantasy slots.',
    'Exactly one captain and one vice-captain are required. Both must be in the playing XI and both receive the same 2x multiplier.',
    'Bench players score zero. The squad budget is 10,000,000 Dino Dollars.',
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
    'Transfers are unlimited, free and carry no points penalty. The server-authoritative window is Monday 09:00 inclusive to Saturday 11:00 exclusive in Australia/Melbourne time.',
    'Opening player prices reflect the supplied 2025/2026 statistics and are rounded upwards to the next 1,000 Dino Dollars. The highest-ranked player starts at 2,000,000 Dino Dollars. Players without historical statistics start at 100,000 Dino Dollars.',
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
    'The round-robin leader prize is 300 Dino Dollars. The highest total squad-value prize label and description are published by the committee; no real-money value is implied.',
    'Leaderboard ties are resolved by total points, then current squad market value, then team name alphabetically.',
  ] },
];
