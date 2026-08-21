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
    'Exactly one captain and one vice-captain are required. Both must be in the playing XI and both receive the same 2x multiplier.',
    'Bench players score zero. The squad must fit within the published Dino Dollar budget.',
  ] },
  { title: 'Scoring', items: [
    'Base scoring: 1 per run, 10 per wicket, catch, run-out or stumping, 5 per maiden and a 10-point not-out bonus.',
    'Batting milestones are exclusive: 50-99 runs adds 20; 100 or more adds 50. Bowling milestones are exclusive: 5-6 wickets adds 25; 7 or more adds 50.',
    'BAT runs score at 1.75x. AR runs and wickets score at 1.5x, with maidens unchanged. BOWL wickets score at 2x. WK runs and catches score at 1.5x, with stumpings and run-outs unchanged.',
    'There is no duck penalty and no player-of-the-match bonus. Captain or vice-captain doubling is applied after the assigned-role calculation.',
  ] },
  { title: 'Transfers and prices', items: [
    'Transfers are unlimited, free and carry no points penalty. The server-authoritative window is Monday 09:00 inclusive to Saturday 11:00 exclusive in Australia/Melbourne time.',
    'Opening prices use verified role-neutral 2025/2026 regular-season performance. Prices are frozen for rounds 1-4.',
    'From round 5, rolling performance is 50% prior baseline, 25% latest qualifying appearance and 25% second-latest qualifying appearance. A non-appearance does not advance that window.',
    'Each performance-point change moves price by 1,000 Dino Dollars. Finals score points but never affect prices.',
  ] },
  { title: 'Team names, prizes and ties', items: [
    'Team names must be suitable for a community cricket club. Names requiring review may be replaced and locked by the league manager.',
    'The round-robin leader prize is 500 Dino Dollars. The highest total squad-value prize label and description are published by the committee; no real-money value is implied.',
    'Leaderboard ties are resolved by total points, then current squad market value, then team name alphabetically.',
  ] },
];
