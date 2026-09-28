import { createServerClient } from '@/lib/supabase-server';
import { enforceRateLimit, getClientIp } from '@/lib/server/request-guards';
import { resolveSpinner, spinnerResults, spinReply, spinsLeft } from '@/lib/spin-wheel/server';
import { getPublicSpinWheel } from '@/lib/spin-wheel/visibility';

export const dynamic = 'force-dynamic';

/** Spins left and past results for the signed-in account or spin link. */
export async function GET(request: Request) {
  if (!await enforceRateLimit(`spin-me:${getClientIp(request)}`, 60, 60_000)) return spinReply({ success: false, error: 'Please wait a moment and try again.' }, 429);
  const wheel = await getPublicSpinWheel();
  if (!wheel) return spinReply({ success: false, error: 'There is no wheel to spin right now.' }, 404);
  try {
    const db = createServerClient();
    const { spinner, error, status } = await resolveSpinner(request, db, wheel.id);
    if (error) return spinReply({ success: false, error }, status);
    if (!spinner) return spinReply({ success: true, signedIn: false, spinsLeft: 0, results: [] });
    const [left, results] = await Promise.all([spinsLeft(db, wheel, spinner), spinnerResults(db, wheel.id, spinner)]);
    if (left === null || results === null) return spinReply({ success: false, error: 'Your spins could not be loaded. Please retry.' }, 503);
    return spinReply({ success: true, signedIn: true, via: spinner.kind, email: spinner.email, spinsLeft: left, results });
  } catch {
    return spinReply({ success: false, error: 'Your spins could not be loaded. Please retry.' }, 503);
  }
}
