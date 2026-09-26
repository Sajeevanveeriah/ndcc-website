import { NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/account/server-auth';
import { createServerClient } from '@/lib/supabase-server';
import { exactEmailPattern, memberPurchase } from '@/lib/club-account/purchases';
export const dynamic = 'force-dynamic';
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function GET(request: Request) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user?.email_confirmed_at || !user.email) return reply({ success: false, error: 'Sign in with a confirmed email to see your purchases.' }, 401);
    const params = new URL(request.url).searchParams;
    const page = Number(params.get('page') || 0);
    if (!Number.isSafeInteger(page) || page < 0 || page > 5000 || !['orders', 'raffle'].includes(params.get('kind') || 'orders')) return reply({ success: false, error: 'Choose a valid purchase page.' }, 400);
    const raffle = params.get('kind') === 'raffle';
    const fields = raffle ? 'id,payment_reference,quantity,amount_cents,status,created_at,bank_transfer_selected_at,raffle_tickets(ticket_number,ticket_reference)'
      : 'id,payment_reference,order_category,items,total_amount,amount_paid,balance_due,payment_status,order_status,processed,created_at,bank_transfer_selected_at';
    let query = createServerClient().from(raffle ? 'raffle_orders' : 'orders').select(fields, { count: 'exact' })
      .ilike('customer_email', exactEmailPattern(user.email));
    if (!raffle) query = query.is('deleted_at', null);
    const { data, error, count } = await query.order('created_at', { ascending: false }).order('id').range(page * 20, page * 20 + 19);
    if (error) return reply({ success: false, error: 'Your purchases could not be loaded. Please retry.' }, 503);
    return reply({ success: true, purchases: (data || []).map(row => memberPurchase(row as unknown as Record<string, unknown>, raffle)), total: count || 0, page });
  } catch { return reply({ success: false, error: 'Your purchases could not be loaded. Please retry.' }, 503); }
}
