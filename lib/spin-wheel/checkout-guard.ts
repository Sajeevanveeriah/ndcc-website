import 'server-only';
import type { createServerClient } from '@/lib/supabase-server';
import { isSpinCheckoutOpen, SPIN_CHECKOUT_CLOSE_MINUTES, type SpinWheelRow } from '@/lib/spin-wheel/rules';

type Db = ReturnType<typeof createServerClient>;
type LinkedWheel = Pick<SpinWheelRow, 'status' | 'starts_at' | 'ends_at' | 'spin_price_cents' | 'public_visibility_mode' | 'public_opens_at'>;

/**
 * Re-checks a spin order's wheel each time a Stripe Checkout Session is
 * created for it, so an order id kept from earlier cannot be paid after spin
 * sales have closed. Returns an error message, or null when payment may go ahead.
 */
export async function spinOrderCheckoutFailure(db: Db, orderId: string): Promise<string | null> {
  const { data, error } = await db.from('spin_wheel_orders')
    .select('wheel:spin_wheels(status,starts_at,ends_at,spin_price_cents,public_visibility_mode,public_opens_at)').eq('order_id', orderId).maybeSingle();
  if (error) return 'Spin sales could not be checked. Please try again.';
  const wheel = (Array.isArray(data?.wheel) ? data?.wheel[0] : data?.wheel) as LinkedWheel | null | undefined;
  if (!wheel) return 'This spin order is not linked to a wheel.';
  if (!isSpinCheckoutOpen(wheel)) return `Spin sales for this wheel have closed (they close ${SPIN_CHECKOUT_CLOSE_MINUTES} minutes before the wheel does). No payment was taken.`;
  return null;
}
