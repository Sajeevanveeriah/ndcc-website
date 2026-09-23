import 'server-only';
import { createServerClient, isServerSupabaseConfigured } from '@/lib/supabase-server';
import { fallbackMembershipAddons, fallbackMembershipPlans } from '@/lib/fallback-content';

// Server-side reads for the option lists on the public /join and /volunteer
// forms. They mirror the GET handlers of /api/memberships and
// /api/volunteer-positions (same tables, filters, ordering and fallbacks) so
// the server-rendered pages show exactly what the client used to fetch.

export type MembershipPlanOption = { id: string; name: string; description: string; price: number };
export type MembershipAddonOption = { id: string; name: string; description: string; price: number; usage_limit: number | null };

type MembershipRow = { id: string; name: string; description: string; price: number; usage_limit?: number | null };

// Only the fields the join form renders are passed to the client island.
function toPlan(row: MembershipRow): MembershipPlanOption {
  return { id: row.id, name: row.name, description: row.description, price: row.price };
}
function toAddon(row: MembershipRow): MembershipAddonOption {
  return { id: row.id, name: row.name, description: row.description, price: row.price, usage_limit: row.usage_limit ?? null };
}

export async function getMembershipOptions(): Promise<{ plans: MembershipPlanOption[]; addons: MembershipAddonOption[] }> {
  const fallback = { plans: fallbackMembershipPlans.map(toPlan), addons: fallbackMembershipAddons.map(toAddon) };
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return fallback;

  try {
    const supabase = createServerClient({ publicReadCache: true });
    const [{ data: plans }, { data: addons }] = await Promise.all([
      supabase.from('social_membership_plans').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
      supabase.from('social_membership_addons').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
    ]);
    return {
      plans: plans?.length ? (plans as MembershipRow[]).map(toPlan) : fallback.plans,
      addons: addons?.length ? (addons as MembershipRow[]).map(toAddon) : fallback.addons,
    };
  } catch {
    return fallback;
  }
}

// Active volunteer position titles in CMS order. An empty list (unconfigured
// or failed read) means the form falls back to the static VOLUNTEER_ROLES.
export async function getVolunteerPositionTitles(): Promise<string[]> {
  if (!isServerSupabaseConfigured()) return [];
  try {
    const supabase = createServerClient({ publicReadCache: true });
    const { data, error } = await supabase
      .from('volunteer_positions')
      .select('id, title, description')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) {
      console.error('Volunteer positions lookup failed', { code: error.code, message: error.message });
      return [];
    }
    return (data || []).map((position: { title: string }) => position.title);
  } catch {
    return [];
  }
}
