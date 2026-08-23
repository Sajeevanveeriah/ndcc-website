import 'server-only';
import { createServerClient } from '@/lib/supabase-server';
import { emailHtml, sendEmail } from '@/lib/email';
import { renderRaffleTicket } from '@/lib/raffle-ticket';

const STAFF = ['ndsc.cricket@gmail.com', 'ndcc.vicepres@gmail.com', 'ndcc.secretary1@gmail.com'];
const escape = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));

export async function sendPaidRaffleEmails(orderId: string, eventId: string) {
  const db = createServerClient();
  const { data: order, error } = await db.from('raffle_orders').select('*,raffle_tickets(ticket_reference,ticket_number)').eq('id', orderId).single();
  if (error || !order || order.status !== 'paid') throw new Error('Paid raffle order could not be loaded.');
  const references = (order.raffle_tickets || []).sort((a: { ticket_number: number }, b: { ticket_number: number }) => a.ticket_number - b.ticket_number).map((t: { ticket_reference: string }) => t.ticket_reference);
  if (references.length !== order.quantity) throw new Error('Raffle ticket allocation is incomplete.');
  if (!order.customer_email_sent_at) {
    const attachments = await Promise.all(references.map(async (reference: string) => ({
      filename: `${reference}.png`, content: (await renderRaffleTicket(reference)).toString('base64'), contentType: 'image/png',
    })));
    const result = await sendEmail({ to: order.customer_email, subject: `Your Dinos raffle ticket${references.length > 1 ? 's' : ''}: ${references.join(', ')}`,
      html: emailHtml('Your paid raffle tickets', `<p>Hi ${escape(order.customer_name)},</p><p>Stripe has confirmed your payment. Your ticket reference${references.length > 1 ? 's are' : ' is'}:</p><p style="font-size:18px;font-weight:bold;color:#800000">${references.map(escape).join('<br>')}</p><p>The raffle will be drawn on <strong>19 December 2026</strong> at the Christmas Party. Your ticket image${references.length > 1 ? 's are' : ' is'} attached.</p>`), attachments, idempotencyKey: `raffle-customer-${eventId}` });
    if (result.status === 'failed') throw new Error(result.reason);
    await db.from('raffle_orders').update({ customer_email_sent_at: new Date().toISOString() }).eq('id', orderId).is('customer_email_sent_at', null);
  }
  if (!order.staff_email_sent_at) {
    const result = await sendEmail({ to: STAFF, subject: `Paid raffle order - ${references.join(', ')}`,
      html: emailHtml('Paid raffle order', `<p>Payment has been confirmed by Stripe.</p><p><strong>Purchaser:</strong> ${escape(order.customer_name)}<br><strong>Email:</strong> ${escape(order.customer_email)}<br><strong>Quantity:</strong> ${order.quantity}<br><strong>Total:</strong> $${(order.amount_cents / 100).toFixed(2)} AUD<br><strong>Tickets:</strong><br>${references.map(escape).join('<br>')}</p>`), idempotencyKey: `raffle-staff-${eventId}` });
    if (result.status === 'failed') throw new Error(result.reason);
    await db.from('raffle_orders').update({ staff_email_sent_at: new Date().toISOString() }).eq('id', orderId).is('staff_email_sent_at', null);
  }
}
