import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermissionResult } from '@/lib/auth/guard';
import { isFullAccessRole } from '@/lib/auth/permissions';
import { attentionDefinitionsFor, sumCounts, type AttentionItem, type AttentionKey } from '@/lib/admin-dashboard-attention';

export const dynamic = 'force-dynamic';

const ADMIN_DASHBOARD_TIMEOUT_MS = 15_000;

function adminJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' } });
}

type ServerClient = ReturnType<typeof createServerClient>;
type CountQuery = PromiseLike<{ count: number | null; error: unknown }>;

async function safeCount(query: () => CountQuery): Promise<number | null> {
  try {
    const { count, error } = await query();
    return error ? null : count ?? 0;
  } catch {
    return null;
  }
}

// Each count is independent: a missing column or a slow table shows as
// "unavailable" for that item only and never breaks the dashboard.
const ATTENTION_COUNTS: Record<AttentionKey, (supabase: ServerClient) => Promise<number | null>> = {
  pendingMemberships: (supabase) => safeCount(() => supabase.from('club_members').select('id', { count: 'exact', head: true }).eq('membership_status', 'pending')),
  // Same filters as /api/admin/payments/bank-transfers.
  unconfirmedBankDeposits: async (supabase) => sumCounts(await Promise.all([
    safeCount(() => supabase.from('orders').select('id', { count: 'exact', head: true }).not('bank_transfer_selected_at', 'is', null).is('deleted_at', null).neq('order_status', 'cancelled').in('payment_status', ['unpaid', 'pending', 'pending_bank_transfer', 'part_paid']).gt('balance_due', 0)),
    safeCount(() => supabase.from('raffle_orders').select('id', { count: 'exact', head: true }).not('bank_transfer_selected_at', 'is', null).eq('status', 'pending_payment').eq('payment_method', 'bank_transfer')),
    safeCount(() => supabase.from('fantasy_entries').select('id', { count: 'exact', head: true }).not('bank_transfer_selected_at', 'is', null).in('status', ['payment_required', 'pending', 'failed', 'expired']).eq('is_demo', false).eq('fee_waived', false)),
  ])),
  // Same filters as /api/admin/raffle/cash-collections.
  raffleCashNotHandedIn: (supabase) => safeCount(() => supabase.from('raffle_orders').select('id', { count: 'exact', head: true }).eq('payment_method', 'cash').eq('status', 'paid').not('cash_received_by_member', 'is', null).is('cash_handed_in_at', null)),
  fantasySyncExceptions: (supabase) => safeCount(() => supabase.from('fantasy_seasons').select('id', { count: 'exact', head: true }).not('sync_exception', 'is', null)),
  receiptDeliveryProblems: (supabase) => safeCount(() => supabase.from('receipt_delivery_jobs').select('id', { count: 'exact', head: true }).in('status', ['dead_letter', 'retry'])),
  unreadEnquiries: (supabase) => safeCount(() => supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('responded', false)),
};

async function loadAttention(supabase: ServerClient, user: Parameters<typeof attentionDefinitionsFor>[0]): Promise<AttentionItem[]> {
  return Promise.all(attentionDefinitionsFor(user).map(async (definition) => ({
    key: definition.key,
    label: definition.label,
    href: definition.href,
    count: await ATTENTION_COUNTS[definition.key](supabase).catch(() => null),
  })));
}

export async function GET() {
  const access = await requirePermissionResult('dashboard');
  if (!access.user) return adminJson({ success: false, error: access.error }, access.status);
  const user = access.user;

  try {
    const supabase = createServerClient({ fetchTimeoutMs: ADMIN_DASHBOARD_TIMEOUT_MS });
    const attentionPromise = loadAttention(supabase, user).catch(() => [] as AttentionItem[]);

    const [
      { count: volunteers, error: volunteersError },
      { count: pendingOrders, error: ordersError },
      { count: unreadEnquiries, error: enquiriesError },
      { count: publishedEvents, error: eventsError },
      { count: totalNews, error: newsError },
      { count: activeSponsors, error: sponsorsError },
    ] = await Promise.all([
      supabase.from('volunteers').select('id', { count: 'exact', head: true }),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('processed', false).is('deleted_at', null),
      supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('responded', false),
      supabase.from('events').select('id', { count: 'exact', head: true }).eq('published', true),
      supabase.from('news').select('id', { count: 'exact', head: true }),
      supabase.from('sponsors').select('id', { count: 'exact', head: true }).eq('active', true),
    ]);

    const firstError = volunteersError || ordersError || enquiriesError || eventsError || newsError || sponsorsError;
    if (firstError) return adminJson({ success: false, error: 'Admin dashboard data is temporarily unavailable.' }, 503);

    const recentItems: Array<{ type: string; message: string; date: string }> = [];

    const [{ data: recentVols }, { data: recentOrders }, { data: recentContacts }] = await Promise.all([
      supabase.from('volunteers').select('name, created_at').order('created_at', { ascending: false }).limit(2),
      supabase.from('orders').select('customer_name, created_at').order('created_at', { ascending: false }).limit(2),
      supabase.from('contacts').select('name, enquiry_type, created_at').order('created_at', { ascending: false }).limit(2),
    ]);

    recentVols?.forEach((v) => recentItems.push({ type: 'volunteer', message: `New volunteer registration - ${v.name}`, date: v.created_at }));
    recentOrders?.forEach((o) => recentItems.push({ type: 'order', message: `New order from ${o.customer_name}`, date: o.created_at }));
    recentContacts?.forEach((c) => recentItems.push({ type: 'enquiry', message: `New enquiry from ${c.name} - ${c.enquiry_type}`, date: c.created_at }));

    recentItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const countOrNull = async (query: PromiseLike<{ count: number | null; error: unknown }>) => {
      try {
        const { count, error } = await query;
        return error ? null : count ?? 0;
      } catch {
        return null;
      }
    };
    const [draftNews, unpublishedEvents, unpublishedGallery, missingAltText, draftFantasyImports] = await Promise.all([
      countOrNull(supabase.from('news').select('id', { count: 'exact', head: true }).eq('published', false)),
      countOrNull(supabase.from('events').select('id', { count: 'exact', head: true }).eq('published', false)),
      countOrNull(supabase.from('gallery_images').select('id', { count: 'exact', head: true }).eq('published', false)),
      countOrNull(supabase.from('gallery_images').select('id', { count: 'exact', head: true }).eq('published', true).or('alt_text.is.null,alt_text.eq.')),
      countOrNull(supabase.from('fantasy_import_batches').select('id', { count: 'exact', head: true }).in('status', ['draft', 'reviewed'])),
    ]);
    const playhqConfigured = Boolean(process.env.PLAYHQ_API_KEY && process.env.PLAYHQ_ORGANISATION_ID);

    return adminJson({
      canViewOperations: isFullAccessRole(user.role),
      success: true,
      stats: {
        volunteers: volunteers || 0,
        pendingOrders: pendingOrders || 0,
        unreadEnquiries: unreadEnquiries || 0,
        publishedEvents: publishedEvents || 0,
        totalNews: totalNews || 0,
        activeSponsors: activeSponsors || 0,
      },
      health: {
        draftNews,
        unpublishedEvents,
        unpublishedGallery,
        missingAltText,
        draftFantasyImports,
        playhqConfigured,
      },
      activity: recentItems.slice(0, 5),
      attention: await attentionPromise,
    });
  } catch {
    return adminJson({ success: false, error: 'Admin dashboard data is temporarily unavailable.' }, 503);
  }
}
