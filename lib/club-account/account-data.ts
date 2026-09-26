import type { MemberPurchase } from './purchases';

// "Download my data": the member's own profile, preferences and purchases.
// Internal identifiers (auth ids, committee reviewer ids, staff notes) are
// never included.
export type AccountExport = {
  format: 'ndcc-club-account-export';
  version: 1;
  exported_at: string;
  account: { email: string };
  profile: null | { full_name: string; email: string; phone: string; member_type: string; membership_status: string; privacy_accepted_at: string | null; updated_at: string | null };
  preferences: null | { interests: string[]; volunteering: string[]; email_updates: boolean; updated_at: string | null };
  purchases: MemberPurchase[];
  purchases_truncated: boolean;
};

const text = (value: unknown) => typeof value === 'string' ? value : '';
const optionalText = (value: unknown) => typeof value === 'string' && value ? value : null;
const list = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

export function buildAccountExport(input: {
  email: string; exportedAt: Date; profile: Record<string, unknown> | null; preferences: Record<string, unknown> | null;
  purchases: MemberPurchase[]; truncated?: boolean;
}): AccountExport {
  const { profile, preferences } = input;
  return {
    format: 'ndcc-club-account-export',
    version: 1,
    exported_at: input.exportedAt.toISOString(),
    account: { email: input.email },
    profile: profile ? {
      full_name: text(profile.full_name), email: text(profile.email), phone: text(profile.phone),
      member_type: text(profile.member_type), membership_status: text(profile.membership_status),
      privacy_accepted_at: optionalText(profile.privacy_accepted_at), updated_at: optionalText(profile.updated_at),
    } : null,
    preferences: preferences ? {
      interests: list(preferences.interests), volunteering: list(preferences.volunteering),
      email_updates: preferences.email_updates === true, updated_at: optionalText(preferences.updated_at),
    } : null,
    purchases: [...input.purchases].sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id)),
    purchases_truncated: input.truncated === true,
  };
}

export const DELETION_REASON_MAX_LENGTH = 1000;

// A deletion request needs an explicit confirmation. The reason is optional
// free text; control characters other than line breaks are removed.
export function parseDeletionRequest(value: Record<string, unknown>): { reason: string | null } | null {
  if (value.confirm !== true) return null;
  if (value.reason !== undefined && value.reason !== null && typeof value.reason !== 'string') return null;
  const reason = typeof value.reason === 'string' ? value.reason.replace(/[\x00-\x09\x0b-\x1f\x7f]/g, '').trim() : '';
  if (reason.length > DELETION_REASON_MAX_LENGTH) return null;
  return { reason: reason || null };
}

export type DeletionRequestSummary = { id: string; status: 'pending' | 'actioned'; created_at: string; actioned_at: string | null };
