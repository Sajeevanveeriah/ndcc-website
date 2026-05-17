export type FantasyModuleStatus = 'available' | 'planned';

export type FantasyModule = {
  title: string;
  description: string;
  href: string;
  status: FantasyModuleStatus;
};

export const FANTASY_MODULES: FantasyModule[] = [
  {
    title: 'Rules',
    description: 'Read the club-first rules framework for the NDCC fantasy cricket competition.',
    href: '/fantasy/rules',
    status: 'available',
  },
  {
    title: 'Squad',
    description: 'Future squad selection tools will live inside the fantasy cricket area once competition settings are approved.',
    href: '/fantasy/squad',
    status: 'planned',
  },
  {
    title: 'Transfers',
    description: 'Future transfer controls will be added after NDCC confirms the season format and timing.',
    href: '/fantasy/transfers',
    status: 'planned',
  },
  {
    title: 'Leagues',
    description: 'Future private and club league tools will be added without changing the main website routes.',
    href: '/fantasy/leagues',
    status: 'planned',
  },
  {
    title: 'Leaderboard',
    description: 'Future leaderboard views will be separated from rules and squad-management foundations.',
    href: '/fantasy/leaderboard',
    status: 'planned',
  },
];

export const FANTASY_RULE_SECTIONS = [
  {
    title: 'Competition intent',
    items: [
      'NDCC Fantasy Cricket is a club engagement initiative for Newcomb and District Cricket Club members, players, families, and supporters.',
      'The competition should celebrate participation, teamwork, and match-day involvement across the club.',
      'Final season settings must be confirmed by NDCC before any squad, transfer, league, or leaderboard feature is opened.',
    ],
  },
  {
    title: 'Team selection foundation',
    items: [
      'Managers should only be able to select from approved NDCC player lists when the squad feature is introduced.',
      'Squad limits, player categories, and scoring eligibility must be configurable before launch.',
      'No public squad data is published on this foundation release.',
    ],
  },
  {
    title: 'Transfers foundation',
    items: [
      'Transfer windows and limits must be set by NDCC before transfer controls are enabled.',
      'Future transfers should keep an audit trail so competition administrators can review changes.',
      'No transfer action is available in this foundation release.',
    ],
  },
  {
    title: 'Leagues and leaderboard foundation',
    items: [
      'League entry, league visibility, and leaderboard timing must be approved before public launch.',
      'Leaderboard data should come from verified scoring inputs only.',
      'No rankings, scores, or sample league data are published on this foundation release.',
    ],
  },
];
