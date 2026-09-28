import 'server-only';
import type { createServerClient } from '@/lib/supabase-server';
import type { SpinWheelInput } from '@/lib/spin-wheel/rules';

type Db = ReturnType<typeof createServerClient>;

/** RPC payload for save_spin_wheel (segments in display order). */
export function saveSpinWheelPayload(input: SpinWheelInput, id: string | null) {
  return {
    id: id || '',
    name: input.name,
    description: input.description || '',
    status: input.status,
    starts_at: input.starts_at ? new Date(input.starts_at).toISOString() : '',
    ends_at: input.ends_at ? new Date(input.ends_at).toISOString() : '',
    free_spins_per_account: input.free_spins_per_account,
    spin_price_cents: input.spin_price_cents === null ? '' : input.spin_price_cents,
    max_spins_per_order: input.max_spins_per_order,
    claim_instructions: input.claim_instructions || '',
    public_visibility_mode: input.public_visibility_mode,
    public_opens_at: input.public_opens_at ? new Date(input.public_opens_at).toISOString() : '',
    segments: input.segments.map(segment => ({
      id: segment.id || '',
      label: segment.label,
      prize_name: segment.prize_name || '',
      prize_description: segment.prize_description || '',
      is_prize: segment.is_prize,
      weight: segment.weight,
      stock: segment.stock === null ? '' : segment.stock,
      colour: segment.colour,
    })),
  };
}

export function spinAdminDatabaseMessage(message: string | undefined, fallback: string): string {
  const text = String(message || '');
  if (text.includes('spin_wheel:segment_count')) return 'The wheel needs 2 to 48 segments.';
  if (text.includes('spin_wheels_single_live')) return 'Only one wheel can be live at a time. Pause or end the other live wheel first.';
  if (text.includes('spin_wheel:not_found')) return 'That wheel no longer exists. Reload the page.';
  if (text.includes('spin_wheel:segment_not_found')) return 'A segment was removed by someone else. Reload the page and try again.';
  if (text.includes('violates check constraint')) return 'One of the values is outside what the wheel allows. Check the highlighted fields.';
  return fallback;
}

export type SpinWheelStats = { spins: number; prizes: number; unclaimed: number; paidOrders: number; openSpins: number };

export async function loadSpinWheelStats(db: Db, wheelId: string): Promise<SpinWheelStats | null> {
  const [spins, prizes, unclaimed, paidOrders, openSpins] = await Promise.all([
    db.from('spin_wheel_results').select('id', { count: 'exact', head: true }).eq('wheel_id', wheelId).is('voided_at', null),
    db.from('spin_wheel_results').select('id', { count: 'exact', head: true }).eq('wheel_id', wheelId).is('voided_at', null).eq('is_prize', true),
    db.from('spin_wheel_results').select('id', { count: 'exact', head: true }).eq('wheel_id', wheelId).is('voided_at', null).eq('is_prize', true).is('claimed_at', null),
    db.from('spin_wheel_orders').select('id', { count: 'exact', head: true }).eq('wheel_id', wheelId).not('paid_at', 'is', null),
    db.from('spin_wheel_entitlements').select('id', { count: 'exact', head: true }).eq('wheel_id', wheelId).is('used_at', null).is('revoked_at', null),
  ]);
  if ([spins, prizes, unclaimed, paidOrders, openSpins].some(result => result.error)) return null;
  return { spins: spins.count || 0, prizes: prizes.count || 0, unclaimed: unclaimed.count || 0, paidOrders: paidOrders.count || 0, openSpins: openSpins.count || 0 };
}

const csvCell = (value: unknown) => {
  const text = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export type SpinAdminResult = {
  id: string; reference: string; segment_position: number; segment_label: string; prize_name: string | null;
  is_prize: boolean; spinner_email: string | null; spinner_name: string | null; auth_user_id: string | null; pass_id: string | null;
  created_at: string; claimed_at: string | null; voided_at: string | null; void_reason: string | null; winner_emailed_at: string | null;
};

export function spinResultsCsv(rows: readonly SpinAdminResult[]): string {
  const header = ['Reference', 'Spun (Melbourne)', 'Name', 'Email', 'Via', 'Segment', 'Label', 'Prize', 'Claimed (Melbourne)', 'Voided', 'Void reason'];
  const when = (value: string | null) => (value ? new Date(value).toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' }) : '');
  const lines = rows.map(row => [
    row.reference, when(row.created_at), row.spinner_name || '', row.spinner_email || '', row.auth_user_id ? 'Club account' : 'Spin link',
    row.segment_position, row.segment_label, row.is_prize ? row.prize_name || '' : '', when(row.claimed_at), row.voided_at ? 'Yes' : '', row.void_reason || '',
  ].map(csvCell).join(','));
  return [header.join(','), ...lines].join('\r\n') + '\r\n';
}
