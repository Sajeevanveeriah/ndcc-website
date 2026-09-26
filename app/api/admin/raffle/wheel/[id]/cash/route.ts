import { requirePermissionResult } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { readLimitedJsonObject, validateRaffleCheckoutInput } from '@/lib/order-input-validation';
import { validateEmail, validatePhone } from '@/lib/utils';
import { enforceRateLimit } from '@/lib/server/request-guards';
import { enqueuePaymentReceiptJob, attemptPaymentReceiptDelivery } from '@/lib/payments/receipt-delivery';
import { adminReply, loadWheelCampaign, UUID_PATTERN, wheelDatabaseMessage } from '@/lib/prize-wheel/admin';
import { validWheelSelection } from '@/lib/prize-wheel/rules';

export const dynamic = 'force-dynamic';

const saleKeyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Staff cash sale for buyer-picked wheel numbers, using the same receipt
// outbox as trailer raffle cash sales.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermissionResult('raffle');
  if (!auth.user) return adminReply({ success: false, error: auth.error }, auth.status);
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return adminReply({ success: false, error: 'Invalid campaign.' }, 400);
  if (!await enforceRateLimit(`raffle-cash:${auth.user.id}`, 30, 60_000)) return adminReply({ success: false, error: 'Please wait a minute before recording another sale.' }, 429);
  const body = await readLimitedJsonObject(request, 16 * 1024);
  if (!body.ok) return adminReply({ success: false, error: body.error }, 400);
  const numbers = body.value.selectedNumbers;
  const parsed = validateRaffleCheckoutInput({ ...body.value, quantity: Array.isArray(numbers) ? numbers.length : 0 });
  if (!parsed.ok) return adminReply({ success: false, error: parsed.error }, 400);
  const { name, email, phone, quantity } = parsed.value;
  if (!validateEmail(email) || (phone && !validatePhone(phone)) || body.value.cashReceived !== true || body.value.adultConfirmed !== true
    || typeof body.value.saleKey !== 'string' || !saleKeyPattern.test(body.value.saleKey) || !Number.isSafeInteger(body.value.priceCents)) {
    return adminReply({ success: false, error: 'Enter valid purchaser details, confirm the buyer is 18 or older and that the exact cash total has been received.' }, 400);
  }
  try {
    const db = createServerClient();
    const campaign = await loadWheelCampaign(db, id);
    if (!campaign) return adminReply({ success: false, error: 'Prize wheel campaign not found.' }, 404);
    if (!validWheelSelection(numbers, quantity, campaign.wheel_divisions)) return adminReply({ success: false, error: 'Choose one different wheel number for each ticket.' }, 400);
    const { data, error } = await db.rpc('record_wheel_cash_sale', {
      sale_key: body.value.saleKey, target_campaign: campaign.id, actor_id: auth.user.id, buyer_name: name, buyer_email: email,
      buyer_phone: phone, numbers, quoted_price_cents: body.value.priceCents,
    });
    if (error) {
      console.error('[prize-wheel-cash] Sale could not be recorded', { code: error.code });
      return adminReply({ success: false, error: `Sale not confirmed. ${wheelDatabaseMessage(error.message, 'Check the numbers, sales window and current price.')} Retry the same sale to check its result before taking more cash.` }, 409);
    }
    let deliveryStatus = 'queued';
    try {
      const queued = await enqueuePaymentReceiptJob(db, 'raffle_order', data.orderId);
      if (queued.ok) deliveryStatus = (await attemptPaymentReceiptDelivery(db, queued.jobId)).status;
    } catch { /* The transaction already queued the receipt job. */ }
    return adminReply({ success: true, ...data, deliveryStatus });
  } catch {
    return adminReply({ success: false, error: 'Sale not confirmed. Retry the same sale to check its result.' }, 500);
  }
}
