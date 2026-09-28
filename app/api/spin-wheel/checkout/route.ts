import { randomUUID } from 'node:crypto';
import { createServerClient } from '@/lib/supabase-server';
import { enforceHoneypotAndTiming, enforceRateLimit, getClientIp } from '@/lib/server/request-guards';
import { readLimitedJsonObject, PUBLIC_ORDER_LIMITS } from '@/lib/order-input-validation';
import { deriveCapabilities, loadMerchPaymentSettings } from '@/lib/payments/capabilities';
import { generateUniquePaymentReference } from '@/lib/payments/reference';
import { sanitiseInput, validateEmail, validatePhone } from '@/lib/utils';
import { getAuthUserFromRequest } from '@/lib/fantasy-manager-auth';
import { hashSpinPassToken, spinPassToken } from '@/lib/spin-wheel/pass';
import { isSpinCheckoutOpen, isSpinWheelLive, SPIN_CHECKOUT_CLOSE_MINUTES, SPIN_ORDER_CATEGORY, validSpinQuantity } from '@/lib/spin-wheel/rules';
import { spinDailyCapacity, spinReply } from '@/lib/spin-wheel/server';
import { getPublicSpinWheel } from '@/lib/spin-wheel/visibility';

export const dynamic = 'force-dynamic';

/**
 * Creates a public.orders row (order_category 'spin_wheel') for N spins. The
 * browser then pays it through /api/payments/checkout-session like any other
 * order, so settlement, the ledger, receipts, refunds and disputes use the
 * existing order flow. Spins are granted by the database only once the order
 * is fully paid (see sync_spin_wheel_order_entitlements).
 *
 * Signed-in buyers get the spins on their account. Guests get a new spin
 * pass; its link token is returned to this browser only, and emailed to the
 * order email once paid.
 */
export async function POST(request: Request) {
  if (!await enforceRateLimit(`spin-checkout:${getClientIp(request)}`, 6, 60_000)) {
    return spinReply({ success: false, error: 'Too many checkout attempts. Please wait a minute and try again.' }, 429);
  }
  const parsed = await readLimitedJsonObject(request, 4096);
  if (!parsed.ok) return spinReply({ success: false, error: parsed.error }, 400);
  const body = parsed.value;
  if (!enforceHoneypotAndTiming(body.hp_field as string, body.submitted_at as number)) {
    return spinReply({ success: false, error: 'Please refresh the page and try again.' }, 400);
  }
  const wheel = await getPublicSpinWheel();
  if (!wheel || !isSpinWheelLive(wheel) || !wheel.spin_price_cents) {
    return spinReply({ success: false, error: 'Spins are not on sale right now.' }, 409);
  }
  // A card checkout stays open for up to an hour: never sell spins that could
  // be paid for after the wheel closes.
  if (!isSpinCheckoutOpen(wheel)) {
    return spinReply({ success: false, error: `Spin sales close ${SPIN_CHECKOUT_CLOSE_MINUTES} minutes before the wheel closes.` }, 409);
  }
  const quantity = Number(body.quantity);
  if (!validSpinQuantity(quantity, wheel.max_spins_per_order)) {
    return spinReply({ success: false, error: `Choose between 1 and ${wheel.max_spins_per_order} spins.` }, 400);
  }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  if (!name || name.length > PUBLIC_ORDER_LIMITS.nameLength || !email || email.length > PUBLIC_ORDER_LIMITS.emailLength || !validateEmail(email)) {
    return spinReply({ success: false, error: 'Enter your name and a valid email address.' }, 400);
  }
  if (phone && (phone.length > PUBLIC_ORDER_LIMITS.phoneLength || !validatePhone(phone))) {
    return spinReply({ success: false, error: 'Enter a valid phone number, or leave it blank.' }, 400);
  }

  let authUserId: string | null = null;
  if (request.headers.get('authorization')) {
    const user = await getAuthUserFromRequest(request);
    if (!user) return spinReply({ success: false, error: 'Your sign in has expired. Please sign in again.' }, 401);
    if (!user.email_confirmed_at) return spinReply({ success: false, error: 'Confirm your email address first, or sign out to buy as a guest.' }, 403);
    authUserId = user.id;
  }

  try {
    const db = createServerClient();
    if (!deriveCapabilities(await loadMerchPaymentSettings(db)).card) {
      return spinReply({ success: false, error: 'Card payments are not currently available.' }, 503);
    }
    // Daily limit (advisory here; spinning enforces it): do not sell more
    // spins than this person can still use today.
    if (wheel.max_spins_per_day) {
      const daily = await spinDailyCapacity(db, wheel.id, { userId: authUserId }, email);
      if (!daily || daily.remaining === null) return spinReply({ success: false, error: 'Your spins for today could not be checked. Please try again.' }, 503);
      if (quantity > daily.remaining) {
        return spinReply({
          success: false,
          error: daily.remaining > 0
            ? `Each person can spin ${wheel.max_spins_per_day} times a day. You can buy ${daily.remaining} more ${daily.remaining === 1 ? 'spin' : 'spins'} today.`
            : `Each person can spin ${wheel.max_spins_per_day} times a day, counting spins you already hold. Please use those first, or come back tomorrow (Melbourne time).`,
        }, 409);
      }
    }
    const reference = await generateUniquePaymentReference('general');
    const unit = wheel.spin_price_cents as number;
    const totalAmount = (quantity * unit) / 100;
    const { data: order, error: orderError } = await db.from('orders').insert({
      customer_name: sanitiseInput(name),
      customer_email: sanitiseInput(email),
      customer_phone: phone ? sanitiseInput(phone) : '',
      items: [{ name: `Spin the Wheel - ${wheel.name}`, quantity, price: unit / 100 }],
      total_amount: totalAmount,
      order_category: SPIN_ORDER_CATEGORY,
      order_status: 'submitted',
      bank_transfer_selected_at: null,
      payment_status: 'pending_bank_transfer',
      payment_reference: reference,
      processed: false,
    }).select('id').single();
    if (orderError || !order) throw new Error('order');

    let passId: string | null = null;
    let passToken: string | null = null;
    if (!authUserId) {
      passId = randomUUID();
      passToken = spinPassToken(passId);
      const pass = await db.from('spin_wheel_passes').insert({
        id: passId, wheel_id: wheel.id, token_hash: hashSpinPassToken(passToken), email: sanitiseInput(email), name: sanitiseInput(name),
      });
      if (pass.error) passId = null;
    }
    const link = (authUserId || passId)
      ? await db.from('spin_wheel_orders').insert({
        wheel_id: wheel.id, order_id: order.id, auth_user_id: authUserId, pass_id: passId, quantity, unit_price_cents: unit,
      }).select('id').single()
      : null;
    if (!link || link.error || !link.data) {
      // Nothing can be paid for without the spin link row: cancel the order
      // and remove the unused guest pass (a stray pass would block deleting
      // an otherwise unused wheel).
      await db.from('orders').update({ order_status: 'cancelled' }).eq('id', order.id);
      if (passId) await db.from('spin_wheel_passes').delete().eq('id', passId);
      throw new Error('link');
    }
    return spinReply({ success: true, order_id: order.id, spin_order_id: link.data.id, payment_reference: reference, pass_token: passToken });
  } catch {
    return spinReply({ success: false, error: 'Checkout could not be started. Please try again shortly.' }, 503);
  }
}
