import { createServerClient } from '@/lib/supabase-server';
import { loadSpinSegments, spinReply } from '@/lib/spin-wheel/server';
import { getPublicSpinWheel } from '@/lib/spin-wheel/visibility';
import { publicSegments, spinWheelPhase } from '@/lib/spin-wheel/rules';

export const dynamic = 'force-dynamic';

/** The current public wheel. Never returns odds weights or stock counts. */
export async function GET() {
  const wheel = await getPublicSpinWheel();
  if (!wheel) return spinReply({ success: false, error: 'There is no wheel to spin right now.' }, 404);
  const segments = await loadSpinSegments(createServerClient(), wheel.id);
  if (!segments) return spinReply({ success: false, error: 'The wheel could not be loaded.' }, 503);
  return spinReply({
    success: true,
    wheel: {
      id: wheel.id, name: wheel.name, description: wheel.description, phase: spinWheelPhase(wheel),
      starts_at: wheel.starts_at, ends_at: wheel.ends_at, free_spins_per_account: wheel.free_spins_per_account,
      spin_price_cents: wheel.spin_price_cents, max_spins_per_order: wheel.max_spins_per_order,
    },
    segments: publicSegments(segments),
  });
}
