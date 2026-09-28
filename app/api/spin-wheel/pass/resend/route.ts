import { createServerClient } from '@/lib/supabase-server';
import { enforceRateLimit, getClientIp } from '@/lib/server/request-guards';
import { readLimitedJsonObject } from '@/lib/order-input-validation';
import { validateEmail } from '@/lib/utils';
import { sendSpinPassEmail, spinReply } from '@/lib/spin-wheel/server';
import { getPublicSpinWheel } from '@/lib/spin-wheel/visibility';

export const dynamic = 'force-dynamic';

const GENERIC = 'If that email has spins waiting on this wheel, we have sent the link to it.';

/** Re-sends spin links for the email's passes that still have spins. Same reply either way. */
export async function POST(request: Request) {
  const parsed = await readLimitedJsonObject(request, 1024);
  if (!parsed.ok) return spinReply({ success: false, error: parsed.error }, 400);
  const email = typeof parsed.value.email === 'string' ? parsed.value.email.trim() : '';
  if (!email || email.length > 254 || !validateEmail(email)) return spinReply({ success: false, error: 'Enter a valid email address.' }, 400);
  const ip = getClientIp(request);
  if (!await enforceRateLimit(`spin-resend:${ip}`, 5, 60 * 60_000) || !await enforceRateLimit(`spin-resend-email:${email.toLowerCase()}`, 3, 60 * 60_000)) {
    return spinReply({ success: false, error: 'Please wait before asking again.' }, 429);
  }
  const wheel = await getPublicSpinWheel();
  if (!wheel) return spinReply({ success: true, message: GENERIC });
  try {
    const db = createServerClient();
    const { data: passes } = await db.from('spin_wheel_passes').select('id').eq('wheel_id', wheel.id).ilike('email', email.replace(/[%_\\]/g, '\\$&'));
    for (const pass of passes || []) {
      const { count } = await db.from('spin_wheel_entitlements').select('id', { count: 'exact', head: true })
        .eq('pass_id', pass.id).is('used_at', null).is('revoked_at', null);
      if (count && count > 0) await sendSpinPassEmail(db, pass.id, wheel.name, count);
    }
  } catch {
    // Same reply either way; nothing about the email is revealed.
  }
  return spinReply({ success: true, message: GENERIC });
}
