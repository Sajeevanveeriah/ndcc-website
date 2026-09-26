import { NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/account/server-auth';
import { createServerClient } from '@/lib/supabase-server';
import { enforceRateLimit } from '@/lib/server/request-guards';
import { exactEmailPattern, memberPurchase } from '@/lib/club-account/purchases';
import { buildAccountExport } from '@/lib/club-account/account-data';
export const dynamic = 'force-dynamic';
const LIMIT = 500;
const reply = (body: object, status = 200, extra: Record<string, string> = {}) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store', ...extra } });
const unavailable = () => reply({ success: false, error: 'Your data could not be prepared. Please retry.' }, 503);
export async function GET(request: Request) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user?.email_confirmed_at || !user.email) return reply({ success: false, error: 'Sign in with a confirmed email to download your data.' }, 401);
    if (!await enforceRateLimit(`club-export:${user.id}`, 5, 60_000)) return reply({ success: false, error: 'Please wait a minute before downloading again.' }, 429);
    const db = createServerClient();
    const profile = await db.from('club_members').select('id,full_name,email,phone,member_type,membership_status,privacy_accepted_at,updated_at').eq('auth_user_id', user.id).maybeSingle();
    if (profile.error) return unavailable();
    const memberId = (profile.data as { id?: string } | null)?.id;
    const email = exactEmailPattern(user.email);
    const [preferences, orders, raffle] = await Promise.all([
      memberId ? db.from('club_account_preferences').select('interests,volunteering,email_updates,updated_at').eq('member_id', memberId).maybeSingle() : Promise.resolve({ data: null, error: null }),
      db.from('orders').select('id,payment_reference,order_category,items,total_amount,amount_paid,balance_due,payment_status,order_status,processed,created_at,bank_transfer_selected_at', { count: 'exact' })
        .ilike('customer_email', email).is('deleted_at', null).order('created_at', { ascending: false }).range(0, LIMIT - 1),
      db.from('raffle_orders').select('id,payment_reference,quantity,amount_cents,status,created_at,bank_transfer_selected_at,raffle_tickets(ticket_number,ticket_reference)', { count: 'exact' })
        .ilike('customer_email', email).order('created_at', { ascending: false }).range(0, LIMIT - 1),
    ]);
    if (preferences.error || orders.error || raffle.error) return unavailable();
    const purchases = [
      ...(orders.data || []).map(row => memberPurchase(row as unknown as Record<string, unknown>)),
      ...(raffle.data || []).map(row => memberPurchase(row as unknown as Record<string, unknown>, true)),
    ];
    const exported = buildAccountExport({
      email: user.email, exportedAt: new Date(), profile: profile.data as Record<string, unknown> | null,
      preferences: preferences.data as Record<string, unknown> | null, purchases,
      truncated: (orders.count || 0) > LIMIT || (raffle.count || 0) > LIMIT,
    });
    return reply(exported, 200, { 'Content-Disposition': 'attachment; filename="NDCC-My-Club-Account.json"' });
  } catch { return unavailable(); }
}
