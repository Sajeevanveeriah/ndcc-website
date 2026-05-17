export type FantasyModuleStatus = 'available' | 'planned';

export type FantasyModule = {
  title: string;
  description: string;
  href: string;
  status: FantasyModuleStatus;
};

export const FANTASY_MODULES: FantasyModule[] = [
  { title: 'Rules', description: 'Read the club-first rules for NDCC Fantasy Cricket.', href: '/fantasy/rules', status: 'available' },
  { title: 'Player Leaderboard', description: 'View published-only player scoring from approved imports.', href: '/fantasy/leaderboard', status: 'available' },
  { title: 'Register / Login', description: 'Create or access your public fantasy manager account.', href: '/fantasy/register', status: 'available' },
  { title: 'My Squad', description: 'Pick a 15-player squad with captain, vice-captain, bench order and budget checks.', href: '/fantasy/squad', status: 'available' },
  { title: 'Transfers', description: 'Make audited player transfers and use MVP fantasy chips.', href: '/fantasy/transfers', status: 'available' },
  { title: 'Leagues', description: 'Create or join private classic leagues by code.', href: '/fantasy/leagues', status: 'available' },
  { title: 'Manager Leaderboard', description: 'View manager rankings from saved round scores.', href: '/fantasy/manager-leaderboard', status: 'available' },
];

export const FANTASY_RULE_SECTIONS = [
  {
    title: 'Competition intent',
    items: [
      'NDCC Fantasy Cricket is a club engagement game for Newcomb and District Cricket Club members, players, families, and supporters.',
      'Manager accounts use public Supabase Auth and are separate from committee admin accounts.',
      'Public scoring is based on published fantasy match-stat imports only.',
    ],
  },
  {
    title: 'Squad selection',
    items: [
      'Each manager selects a 15-player squad with 11 starters and 4 bench players.',
      'Squads must include exactly 2 WK, 5 BAT, 3 AR and 5 BOWL players unless admins change role limits in settings.',
      'The Starting XI must include at least 1 WK, 3 BAT, 1 AR and 3 BOWL players.',
      'The squad must stay within the active fantasy budget and use active fantasy players only.',
      'One captain and one vice-captain are required, and they cannot be the same player.',
      'Bench players need a unique bench order from 1 to 4.',
    ],
  },
  {
    title: 'Transfers and chips',
    items: [
      'Transfers swap one current squad player for one active fantasy player and are saved to an audit trail.',
      'One free transfer is available by default each round; additional transfers receive the configured points penalty.',
      'Wildcard removes transfer penalties for the round in which it is used.',
      'Bench Boost includes bench player points for that round.',
      'Triple Captain makes the captain score triple points for that round.',
      'Free Hit can be recorded in this MVP for audit purposes, but temporary squad restoration is not automated yet.',
    ],
  },
  {
    title: 'Scores, leagues and leaderboards',
    items: [
      'Current enabled fantasy scoring rules are applied when admins calculate manager round scores.',
      'Captain points are doubled unless Triple Captain is active for the round.',
      'Manager leaderboard standings use saved manager round scores after transfer penalties.',
      'Private classic leagues rank members by total net points. Head-to-head leagues are not part of this MVP.',
    ],
  },
];
