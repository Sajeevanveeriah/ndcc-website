// "Needs attention" items for the admin dashboard. Pure description of which
// items a user may see; the count queries live in app/api/admin/dashboard.
import type { AuthRole } from '@/lib/auth/config';
import { hasPermission, isFullAccessRole, type PermissionKey } from '@/lib/auth/permissions';

export type AttentionKey =
  | 'pendingMemberships'
  | 'unconfirmedBankDeposits'
  | 'raffleCashNotHandedIn'
  | 'fantasySyncExceptions'
  | 'receiptDeliveryProblems'
  | 'unreadEnquiries';

export type AttentionItem = {
  key: AttentionKey;
  label: string;
  href: string;
  /** null when the count could not be read ("unavailable"). */
  count: number | null;
};

type AttentionDefinition = {
  key: AttentionKey;
  label: string;
  href: string;
  allowed: (user: { role: AuthRole; permissions: readonly PermissionKey[] }) => boolean;
};

// Access mirrors the page each item links to.
export const ATTENTION_DEFINITIONS: readonly AttentionDefinition[] = [
  { key: 'pendingMemberships', label: 'Membership accounts awaiting review', href: '/admin/memberships/directory', allowed: (user) => hasPermission(user, 'memberships') },
  // The bank deposit review page is limited to the administrator role.
  { key: 'unconfirmedBankDeposits', label: 'Bank deposits awaiting confirmation', href: '/admin/payments/bank-transfers', allowed: (user) => user.role === 'admin' },
  { key: 'raffleCashNotHandedIn', label: 'Raffle cash not yet handed in', href: '/admin/raffle', allowed: (user) => hasPermission(user, 'raffle') },
  { key: 'fantasySyncExceptions', label: 'Dino Coach seasons with a PlayHQ sync exception', href: '/admin/fantasy/seasons', allowed: (user) => hasPermission(user, 'fantasy.seasons') },
  // Website operations is a full-access page.
  { key: 'receiptDeliveryProblems', label: 'Payment receipt emails retrying or failed', href: '/admin/operations', allowed: (user) => isFullAccessRole(user.role) },
  { key: 'unreadEnquiries', label: 'Enquiries not yet responded to', href: '/admin/enquiries', allowed: (user) => hasPermission(user, 'enquiries') },
];

export function attentionDefinitionsFor(user: { role: AuthRole; permissions: readonly PermissionKey[] }) {
  return ATTENTION_DEFINITIONS.filter((definition) => definition.allowed(user));
}

/** Sum independent counts; any unreadable part makes the total unavailable. */
export function sumCounts(counts: ReadonlyArray<number | null>): number | null {
  let total = 0;
  for (const count of counts) {
    if (count === null) return null;
    total += count;
  }
  return total;
}
