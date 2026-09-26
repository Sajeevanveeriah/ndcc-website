import { requirePermissionResult } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { readLimitedJsonObject } from '@/lib/order-input-validation';
import { emailHtml, getTransactionalReplyTo, sendEmail } from '@/lib/email';
import { adminReply, loadWheelAdminDetail, UUID_PATTERN } from '@/lib/prize-wheel/admin';
import { wheelDrawState } from '@/lib/prize-wheel/rules';
import { winnerEmailBody, winnerEmailSubject } from '@/lib/prize-wheel/winner-email';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermissionResult('raffle');
  if (!auth.user) return adminReply({ success: false, error: auth.error }, auth.status);
  const { id } = await params;
  const body = await readLimitedJsonObject(request, 4 * 1024);
  if (!body.ok) return adminReply({ success: false, error: body.error }, 400);
  const drawId = body.value.drawId;
  if (!UUID_PATTERN.test(id) || typeof drawId !== 'string' || !UUID_PATTERN.test(drawId)) return adminReply({ success: false, error: 'Invalid draw.' }, 400);
  try {
    const db = createServerClient();
    const detail = await loadWheelAdminDetail(db, id);
    if (!detail) return adminReply({ success: false, error: 'Prize wheel campaign not found.' }, 404);
    const state = wheelDrawState(detail.prizes, detail.draws).prizes.find(item => item.latest?.id === drawId);
    const ticket = state?.latest?.ticket_id ? detail.tickets.find(item => item.id === state.latest!.ticket_id) : null;
    if (!state || !ticket?.order?.customer_email) return adminReply({ success: false, error: 'Only the current winner of a prize can be emailed.' }, 409);
    const input = {
      customerName: ticket.order.customer_name, campaignName: detail.campaign.name, prizePosition: state.prize.position,
      prizeName: state.prize.name, ticketNumber: ticket.ticket_number, ticketReference: ticket.ticket_reference,
      drawLabel: detail.campaign.draw_label, collected: detail.collections.some(item => item.draw_id === drawId),
    };
    const result = await sendEmail({
      to: ticket.order.customer_email, replyTo: getTransactionalReplyTo(), subject: winnerEmailSubject(input),
      html: emailHtml('Prize wheel winner', winnerEmailBody(input)), idempotencyKey: `prize-wheel-winner-${drawId}`,
    });
    if (result.status !== 'sent' && result.status !== 'simulated') return adminReply({ success: false, error: 'The winner email could not be sent. Check email diagnostics and try again.' }, 502);
    const recorded = await db.rpc('record_wheel_winner_email', { target_draw: drawId, actor_id: auth.user.id });
    if (recorded.error) console.error('[prize-wheel] Winner email sent but not recorded', { code: recorded.error.code });
    return adminReply({ success: true, status: result.status });
  } catch {
    return adminReply({ success: false, error: 'The winner email could not be sent.' }, 500);
  }
}
