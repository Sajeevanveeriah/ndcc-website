import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

const ADMIN_DASHBOARD_TIMEOUT_MS = 5_000;

function adminJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' } });
}

export async function GET() {
  const user = await requirePermission('dashboard');
  if (!user) return adminJson({ success: false, error: 'Forbidden.' }, 403);

  try {
    const supabase = createServerClient({ fetchTimeoutMs: ADMIN_DASHBOARD_TIMEOUT_MS });

    const [
      { count: volunteers, error: volunteersError },
      { count: pendingOrders, error: ordersError },
      { count: unreadEnquiries, error: enquiriesError },
      { count: publishedEvents, error: eventsError },
      { count: totalNews, error: newsError },
      { count: activeSponsors, error: sponsorsError },
    ] = await Promise.all([
      supabase.from('volunteers').select('id', { count: 'exact', head: true }),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('processed', false),
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
    });
  } catch {
    return adminJson({ success: false, error: 'Admin dashboard data is temporarily unavailable.' }, 503);
  }
}
