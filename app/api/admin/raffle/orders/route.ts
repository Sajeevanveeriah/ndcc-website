import { NextResponse } from 'next/server';
import { requirePermissionResult } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { fetchAllPages } from '@/lib/supabase-paginate';

export const dynamic = 'force-dynamic';
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function GET() {
  const auth = await requirePermissionResult('raffle');
  if (!auth.user) return reply({ success: false, error: auth.error }, auth.status);
  try {
    const db = createServerClient();
    const { data, error } = await fetchAllPages((from, to) => db.from('raffle_orders')
      .select('id,campaign_id,payment_reference,customer_name,customer_email,customer_phone,quantity,amount_cents,status,payment_method,created_at,paid_at,cash_received_at,cash_received_by_member,cash_handed_in_at,customer_email_sent_at,member:club_members!cash_received_by_member(full_name),staff:committee_users!cash_received_by(full_name),raffle_tickets(ticket_number,ticket_reference),receipt_delivery_jobs(status)')
      .order('created_at', { ascending: false }).order('id').range(from, to));
    if (error) return reply({ success: false, error: 'Raffle sales could not be loaded. Please retry.' }, 503);
    return reply({ success: true, orders: data });
  } catch {
    return reply({ success: false, error: 'Raffle sales could not be loaded. Please retry.' }, 503);
  }
}
