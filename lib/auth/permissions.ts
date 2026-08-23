import type { AuthRole } from './config';
import { FULL_ACCESS_ROLES } from './config';

export type PermissionScope = 'club' | 'fantasy' | 'administration';
export type PermissionGroupName =
  | 'Home'
  | 'Season'
  | 'Publish'
  | 'Club'
  | 'Community'
  | 'Commercial'
  | 'Fantasy'
  | 'Administration';

type PermissionDefinition = {
  group: PermissionGroupName;
  label: string;
  href: string;
  scope: PermissionScope;
  aliases?: readonly string[];
};

const registry = {
  dashboard: { group: 'Home', label: 'Dashboard', href: '/admin', scope: 'club' },
  'season.setup': { group: 'Season', label: 'Start New Season', href: '/admin/season/new', scope: 'club' },
  'season.registration': { group: 'Season', label: 'Player Registration', href: '/admin/season/registration', scope: 'club' },
  'club.details': { group: 'Season', label: 'Club Details / Contact Details', href: '/admin/club-details', scope: 'club', aliases: ['/admin/club-settings'] },
  teams: { group: 'Season', label: 'Teams', href: '/admin/teams', scope: 'club' },
  appointments: { group: 'Season', label: 'Appointments', href: '/admin/season-appointments', scope: 'club' },
  calendar: { group: 'Season', label: 'Training & Calendar', href: '/admin/calendar', scope: 'club' },
  news: { group: 'Publish', label: 'News', href: '/admin/news', scope: 'club' },
  publications: { group: 'Publish', label: 'Publications', href: '/admin/publications', scope: 'club' },
  events: { group: 'Publish', label: 'Events', href: '/admin/events', scope: 'club' },
  pages: { group: 'Publish', label: 'Pages & Links', href: '/admin/site-pages', scope: 'club' },
  content: { group: 'Publish', label: 'Page Sections', href: '/admin/content', scope: 'club', aliases: ['/admin/content-blocks'] },
  gallery: { group: 'Publish', label: 'Gallery', href: '/admin/gallery', scope: 'club' },
  history: { group: 'Club', label: 'History', href: '/admin/history', scope: 'club' },
  minutes: { group: 'Club', label: 'Minutes', href: '/admin/minutes', scope: 'club' },
  volunteers: { group: 'Community', label: 'Volunteers', href: '/admin/volunteers', scope: 'club' },
  memberships: { group: 'Community', label: 'Memberships', href: '/admin/memberships', scope: 'club' },
  enquiries: { group: 'Community', label: 'Enquiries', href: '/admin/enquiries', scope: 'club' },
  sponsors: { group: 'Commercial', label: 'Sponsors', href: '/admin/sponsors', scope: 'club' },
  merchandise: { group: 'Commercial', label: 'Merchandise', href: '/admin/apparel', scope: 'club' },
  kitchen: { group: 'Commercial', label: 'Kitchen', href: '/admin/kitchen', scope: 'club' },
  raffle: { group: 'Commercial', label: 'Raffle', href: '/admin/raffle', scope: 'club' },
  orders: { group: 'Commercial', label: 'Orders', href: '/admin/orders', scope: 'club' },
  payments: { group: 'Commercial', label: 'Payments', href: '/admin/payments', scope: 'club' },
  'fantasy.home': {
    group: 'Fantasy', label: 'Fantasy Home', href: '/admin/fantasy', scope: 'fantasy',
    aliases: ['/admin/fantasy/managers', '/admin/fantasy/rounds', '/admin/fantasy/scores', '/admin/fantasy/scoring', '/admin/fantasy/settings'],
  },
  'fantasy.seasons': { group: 'Fantasy', label: 'Seasons & PlayHQ', href: '/admin/fantasy/seasons', scope: 'fantasy' },
  'fantasy.players': { group: 'Fantasy', label: 'Players', href: '/admin/fantasy/players', scope: 'fantasy' },
  'fantasy.imports': { group: 'Fantasy', label: 'Imports', href: '/admin/fantasy/imports', scope: 'fantasy', aliases: ['/admin/fantasy/import'] },
  'fantasy.review': { group: 'Fantasy', label: 'Historical Review', href: '/admin/fantasy/reconciliation', scope: 'fantasy' },
  'fantasy.diagnostics': { group: 'Fantasy', label: 'PlayHQ Diagnostics', href: '/admin/playhq-diagnostics', scope: 'fantasy' },
  'diagnostics.email': { group: 'Administration', label: 'Email Diagnostics', href: '/admin/email-diagnostics', scope: 'administration' },
  'diagnostics.media': { group: 'Administration', label: 'Media Diagnostics', href: '/admin/media-diagnostics', scope: 'administration' },
} as const;

export type PermissionKey = keyof typeof registry;
export const PERMISSION_REGISTRY: Readonly<Record<PermissionKey, PermissionDefinition>> = registry;
export const ALL_PERMISSIONS = Object.keys(PERMISSION_REGISTRY) as PermissionKey[];
export const FANTASY_PERMISSIONS = ALL_PERMISSIONS.filter((key) => PERMISSION_REGISTRY[key].scope === 'fantasy');
export const PERMISSION_GROUP_ORDER: readonly PermissionGroupName[] = ['Home', 'Season', 'Publish', 'Club', 'Community', 'Commercial', 'Fantasy', 'Administration'];
export const PERMISSION_GROUPS = PERMISSION_GROUP_ORDER.map((group) => ({
  group,
  permissions: ALL_PERMISSIONS.filter((key) => PERMISSION_REGISTRY[key].group === group).map((key) => ({
    key,
    label: PERMISSION_REGISTRY[key].label,
  })),
}));

export const isFullAccessRole = (role: AuthRole) => FULL_ACCESS_ROLES.includes(role);
export const canManageUsers = (role: AuthRole) => isFullAccessRole(role);

export function normaliseStoredPermissions(role: AuthRole, value: unknown): PermissionKey[] {
  if (isFullAccessRole(role) || role === 'fantasy_manager') return [];
  if (!Array.isArray(value)) throw new Error('Permissions must be an array.');

  const supplied = value.map(String);
  const allowed = role === 'fantasy_support'
    ? FANTASY_PERMISSIONS
    : role === 'committee'
      ? ALL_PERMISSIONS
      : [];

  if (new Set(supplied).size !== supplied.length) {
    throw new Error('Duplicate permissions are not allowed.');
  }
  if (supplied.some((key) => !allowed.includes(key as PermissionKey))) {
    throw new Error('One or more permissions are invalid for this role.');
  }
  return supplied as PermissionKey[];
}

export function getEffectivePermissions(role: AuthRole, stored: readonly string[] = []): PermissionKey[] {
  if (isFullAccessRole(role)) return [...ALL_PERMISSIONS];
  if (role === 'fantasy_manager') return [...FANTASY_PERMISSIONS];

  const allowed = role === 'fantasy_support'
    ? FANTASY_PERMISSIONS
    : role === 'committee'
      ? ALL_PERMISSIONS
      : [];

  return Array.from(new Set(stored.filter((key): key is PermissionKey => allowed.includes(key as PermissionKey))));
}

export function getLegacyEffectivePermissions(role: AuthRole): PermissionKey[] {
  if (role === 'committee') return [...ALL_PERMISSIONS];
  return getEffectivePermissions(role, []);
}

export const hasPermission = (
  user: { permissions: readonly PermissionKey[] },
  permission: PermissionKey,
) => user.permissions.includes(permission);

const routePermissions: Array<[string, PermissionKey]> = ALL_PERMISSIONS.flatMap((permission) => {
  const definition = PERMISSION_REGISTRY[permission];
  return [definition.href, ...(definition.aliases || [])].map((path) => [path, permission] as [string, PermissionKey]);
}).sort(([a], [b]) => b.length - a.length);

export function permissionForAdminPath(pathname: string): PermissionKey | null {
  return routePermissions.find(([path]) => (
    pathname === path || (path !== '/admin' && pathname.startsWith(`${path}/`))
  ))?.[1] ?? null;
}

export function getDefaultAdminHref(user: { role: AuthRole; permissions: readonly PermissionKey[] }): string {
  if (isFullAccessRole(user.role) || user.permissions.includes('dashboard')) return '/admin';
  const first = ALL_PERMISSIONS.find((permission) => user.permissions.includes(permission));
  return first ? PERMISSION_REGISTRY[first].href : '/admin/change-password';
}

export const RESOURCE_PERMISSIONS: Readonly<Record<string, PermissionKey>> = {
  volunteers: 'volunteers',
  orders: 'orders',
  merchPaymentSettings: 'merchandise',
  enquiries: 'enquiries',
  events: 'events',
  calendarEvents: 'calendar',
  eventRegistrations: 'events',
  publications: 'publications',
  news: 'news',
  seasonAppointments: 'appointments',
  teams: 'teams',
  fantasyPlayers: 'fantasy.players',
  fantasyRounds: 'fantasy.home',
  fantasyScoringRules: 'fantasy.home',
  sponsors: 'sponsors',
  membershipPlans: 'memberships',
  membershipAddons: 'memberships',
  membershipApplications: 'memberships',
  volunteerPositions: 'volunteers',
  volunteerExpressions: 'volunteers',
  galleryImages: 'gallery',
  apparelProducts: 'merchandise',
  apparelProductOptions: 'merchandise',
  pageLinkCards: 'pages',
  facilityFeatures: 'pages',
  historyLineage: 'history',
  historyPremierships: 'history',
  historyCompetitions: 'history',
  committeeMembers: 'club.details',
  merchWindows: 'merchandise',
  kitchenMenus: 'kitchen',
  kitchenItems: 'kitchen',
  kitchenOrders: 'kitchen',
  raffleCampaigns: 'raffle',
  raffleOrders: 'raffle',
  contentBlocks: 'content',
  clubSettings: 'club.details',
};

export const MEDIA_UPLOAD_PERMISSIONS: readonly PermissionKey[] = [
  'teams', 'news', 'content', 'kitchen', 'events', 'appointments', 'sponsors',
  'merchandise', 'publications', 'calendar', 'gallery',
];
