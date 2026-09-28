import { createServerClient } from '@/lib/supabase-server';
import { enforceRateLimit } from '@/lib/server/request-guards';
import { pickWeightedSegment, spinResultReference } from '@/lib/spin-wheel/random';
import { isSpinWheelLive, spinErrorMessage } from '@/lib/spin-wheel/rules';
import { loadSpinSegments, resolveSpinner, sendSpinWinnerEmail, spinReply } from '@/lib/spin-wheel/server';
import { getPublicSpinWheel } from '@/lib/spin-wheel/visibility';

export const dynamic = 'force-dynamic';

const MAX_ATTEMPTS = 3;

/**
 * The server picks the segment with node:crypto and records the result
 * through record_spin_wheel_result() BEFORE replying. The browser then turns
 * the wheel to the recorded segment; the animation is presentation only.
 */
export async function POST(request: Request) {
  const wheel = await getPublicSpinWheel();
  if (!wheel || !isSpinWheelLive(wheel)) return spinReply({ success: false, error: 'This wheel is not open for spins right now.' }, 409);
  try {
    const db = createServerClient();
    const { spinner, error, status } = await resolveSpinner(request, db, wheel.id);
    if (error) return spinReply({ success: false, error }, status);
    if (!spinner) return spinReply({ success: false, error: 'Sign in or open your spin link to spin.' }, 401);
    const who = spinner.kind === 'user' ? `u:${spinner.userId}` : `p:${spinner.passId}`;
    if (!await enforceRateLimit(`spin-wheel:${who}`, 10, 60_000)) return spinReply({ success: false, error: 'Please wait a moment before spinning again.' }, 429);
    if (spinner.kind === 'user' && wheel.free_spins_per_account > 0) {
      const topUp = await db.rpc('ensure_spin_wheel_free_entitlements', { target_wheel: wheel.id, target_user: spinner.userId });
      if (topUp.error) return spinReply({ success: false, error: 'Your spins could not be checked. Please retry.' }, 503);
    }
    const exclude = new Set<string>();
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const segments = await loadSpinSegments(db, wheel.id);
      if (!segments) return spinReply({ success: false, error: 'The wheel could not be loaded. Nothing was used.' }, 503);
      let picked;
      try {
        picked = pickWeightedSegment(segments, exclude);
      } catch {
        return spinReply({ success: false, error: 'Every prize on this wheel has run out. Nothing was used.' }, 409);
      }
      const { data, error: rpcError } = await db.rpc('record_spin_wheel_result', {
        target_wheel: wheel.id,
        target_user: spinner.kind === 'user' ? spinner.userId : null,
        target_pass: spinner.kind === 'pass' ? spinner.passId : null,
        target_segment: picked.segment.id,
        random_source: picked.randomSource,
        result_reference: spinResultReference(),
        spinner_email: spinner.email,
        spinner_name: spinner.name,
      });
      if (!rpcError && data) {
        const result = data as { id: string; is_prize: boolean; spins_left: number } & Record<string, unknown>;
        // A failed email never undoes the spin; the daily cron retries it.
        const emailed = result.is_prize ? await sendSpinWinnerEmail(db, result.id, spinner, wheel).catch(() => false) : false;
        const { id: _id, spins_left: left, ...view } = result;
        void _id;
        return spinReply({ success: true, result: view, spinsLeft: left, emailed });
      }
      const mapped = spinErrorMessage(rpcError?.message);
      if (mapped.retrySegment) { exclude.add(picked.segment.id); continue; }
      return spinReply({ success: false, error: mapped.message }, mapped.status);
    }
    return spinReply({ success: false, error: 'The prizes are changing quickly. Nothing was used. Please spin again.' }, 409);
  } catch {
    return spinReply({ success: false, error: 'The spin could not be recorded. Nothing was used. Please try again.' }, 503);
  }
}
