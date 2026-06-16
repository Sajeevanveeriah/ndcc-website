import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requireSession } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireSession(['admin', 'president', 'secretary', 'committee']);
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const supabase = createServerClient();

  const [
    { count: volunteers },
    { count: pendingOrders },
    { count: unreadEnquiries },
    { count: publishedEvents },
    { count: totalNews },
    { count: activeSponsors },
  ] = await Promise.all([
    supabase.from('volunteers').select('*', { count: 'exact', head: true }),
    supabase.from('orders').select('*', { count: 'exact', head: true }).eq('processed', false),
    supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('responded', false),
    supabase.from('events').select('*', { count: 'exact', head: true }).eq('published', true),
    supabase.from('news').select('*', { count: 'exact', head: true }),
    supabase.from('sponsors').select('*', { count: 'exact', head: true }).eq('active', true),
  ]);

  const recentItems: Array<{ type: string; message: string; date: string }> = [];

  const { data: recentVols } = await supabase.from('volunteers').select('name, created_at').order('created_at', { ascending: false }).limit(2);
  recentVols?.forEach((v) => recentItems.push({ type: 'volunteer', message: `New volunteer registration — ${v.name}`, date: v.created_at }));

  const { data: recentOrders } = await supabase.from('orders').select('customer_name, created_at').order('created_at', { ascending: false }).limit(2);
  recentOrders?.forEach((o) => recentItems.push({ type: 'order', message: `New order from ${o.customer_name}`, date: o.created_at }));

  const { data: recentContacts } = await supabase.from('contacts').select('name, enquiry_type, created_at').order('created_at', { ascending: false }).limit(2);
  recentContacts?.forEach((c) => recentItems.push({ type: 'enquiry', message: `New enquiry from ${c.name} — ${c.enquiry_type}`, date: c.created_at }));

  recentItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return NextResponse.json({
    success: true,
    stats: {
      volunteers: volunteers || 0,
      pendingOrders: pendingOrders || 0,
      unreadEnquiries: unreadEnquiries || 0,
      publishedEvents: publishedEvents || 0,
      totalNews: totalNews || 0,
      activeSponsors: activeSponsors || 0,
    },
    activity: recentItems.slice(0, 5),
  });
}
