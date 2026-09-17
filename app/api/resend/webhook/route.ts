import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
const EVENTS = new Set(['email.sent', 'email.delivered', 'email.delivery_delayed', 'email.bounced', 'email.complained', 'email.failed', 'email.suppressed']);

export async function POST(request: Request) {
  const id = request.headers.get('svix-id');
  const timestamp = request.headers.get('svix-timestamp');
  const signature = request.headers.get('svix-signature');
  if (!id || !timestamp || !signature) return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  if (Number(request.headers.get('content-length') || 0) > 262144) return new NextResponse(null, { status: 413 });
  try {
    const client = createServerClient();
    let secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) {
      const stored = await client.rpc('ndcc_resend_webhook_secret');
      if (stored.error || !stored.data) throw new Error('secret_unavailable');
      secret = String(stored.data);
    }
    const payload = await request.text();
    if (Buffer.byteLength(payload) > 262144) return new NextResponse(null, { status: 413 });
    let event;
    try {
      event = new Resend(process.env.RESEND_API_KEY || 'webhook-verification-only').webhooks.verify({
        payload, headers: { id, timestamp, signature }, webhookSecret: secret,
      });
    } catch { return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 }); }
    if (!EVENTS.has(event.type)) return NextResponse.json({ received: true });
    const messageId = 'email_id' in event.data ? event.data.email_id : null;
    if (!messageId || !Number.isFinite(Date.parse(event.created_at))) return NextResponse.json({ error: 'Invalid event.' }, { status: 400 });
    const { error } = await client.from('email_delivery_events').upsert({
      event_id: id, provider_message_id: messageId, event_type: event.type, occurred_at: event.created_at,
    }, { onConflict: 'event_id', ignoreDuplicates: true });
    if (error) throw new Error('event_record_failed');
    console.info(JSON.stringify({ event: 'email_delivery_observed', type: event.type }));
    return NextResponse.json({ received: true });
  } catch {
    console.error(JSON.stringify({ event: 'email_webhook_unavailable' }));
    return NextResponse.json({ error: 'Delivery event could not be recorded.' }, { status: 503 });
  }
}
