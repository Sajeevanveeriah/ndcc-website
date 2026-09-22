import 'server-only';
import { createServerClient } from '@/lib/supabase-server';
import { emailHtml, escapeEmailHtml, getTransactionalReplyTo, sendEmail, type EmailPayload } from '@/lib/email';
import { getCheckoutSiteUrl } from '@/lib/payments/site-url';

export async function processBalanceReminders(request: Request) {
  const origin = getCheckoutSiteUrl(request);
  if (!origin) throw new Error('Secure payment URL is not configured.');
  const db = createServerClient();
  const result = {sent:0,failed:0,cancelled:0};
  const deadline=Date.now()+40_000;
  while(Date.now()<deadline && result.sent+result.failed+result.cancelled<30) {
    const claimed=await db.rpc('claim_apparel_balance_reminder');
    if(claimed.error) throw new Error(claimed.error.message);
    const job=claimed.data?.[0]; if(!job) break;
    const update=async(values:Record<string,unknown>)=>{
      const saved=await db.from('apparel_balance_reminders').update(values).eq('id',job.id).eq('lease_token',job.lease_token);
      if(saved.error) throw new Error(saved.error.message);
    };
    const {data:order,error}=await db.from('orders').select('payment_reference,customer_name,customer_email,total_amount,amount_paid,balance_due,payment_status,order_status,deleted_at').eq('id',job.order_id).single();
    if(error) throw new Error(error.message);
    const cents=Math.round(Number(order.balance_due)*100);
    if(order.deleted_at||order.order_status==='cancelled'||!['part_paid','unpaid','pending','pending_bank_transfer'].includes(order.payment_status)||cents<=0||(job.delivery&&job.balance_cents!==cents)) {
      await update({status:'cancelled',lease_until:null});result.cancelled++;continue;
    }
    const link=await db.from('apparel_balance_links').select('token').eq('order_id',job.order_id).single();
    if(link.error) throw new Error(link.error.message);
    const paymentUrl=`${origin}/pay-balance?token=${link.data.token}`;
    const delivery:EmailPayload=job.delivery||{
      to:order.customer_email,replyTo:getTransactionalReplyTo(),
      subject:`Apparel order ${order.payment_reference}: AUD ${(cents/100).toFixed(2)} balance due`,
      idempotencyKey:`apparel-balance-${job.id}`,
      tags:[{name:'category',value:'apparel-balance'}],
      html:emailHtml('Your apparel order balance',`<p>Hi ${escapeEmailHtml(order.customer_name)},</p><p>${Number(order.amount_paid)>0?'Thank you for your part payment towards apparel order':'Payment is still outstanding for apparel order'} <strong>${escapeEmailHtml(order.payment_reference)}</strong>.</p><table role="presentation"><tr><td>Order total</td><td>AUD ${Number(order.total_amount).toFixed(2)}</td></tr><tr><td>Paid so far</td><td>AUD ${Number(order.amount_paid).toFixed(2)}</td></tr><tr><td><strong>Balance due</strong></td><td><strong>AUD ${(cents/100).toFixed(2)}</strong></td></tr></table><p><strong>Full payment is required to process your order.</strong></p><p><a href="${escapeEmailHtml(paymentUrl)}">Pay your remaining balance securely with Stripe</a></p><p>The payment will be added to the same order reference. You can also choose Pay apparel balance under Shop on the club website and enter your order reference and email address.</p><p>We will remind you every three weeks from your order date while an outstanding balance remains. If you have just paid by bank transfer, please allow the club time to confirm it. Reply to this email if you need help.</p><p>Thank you,<br>Newcomb &amp; District Cricket Club</p>`),
    };
    if(!job.delivery) await update({delivery,balance_cents:cents});
    const sent=await sendEmail(delivery);
    if(sent.status==='sent') {
      await update({status:'sent',sent_at:new Date().toISOString(),provider_message_id:sent.id,lease_until:null,last_error:null});result.sent++;
    } else {
      await update({status:'queued',lease_until:null,next_attempt_at:new Date(Date.now()+15*60_000).toISOString(),last_error:sent.reason,...(sent.status==='skipped'||sent.status==='simulated'?{first_attempt_at:null}:{})});result.failed++;
    }
  }
  return result;
}
