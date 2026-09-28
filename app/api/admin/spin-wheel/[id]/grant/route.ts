import { randomUUID } from 'node:crypto';
import { requirePermissionResult } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { readLimitedJsonObject } from '@/lib/order-input-validation';
import { scheduleAdminAudit } from '@/lib/revisions/server';
import { sanitiseInput, validateEmail } from '@/lib/utils';
import { hashSpinPassToken, spinPassToken, spinPassUrl } from '@/lib/spin-wheel/pass';
import { loadSpinWheel, sendSpinPassEmail, spinReply, spinSiteUrl, UUID_PATTERN } from '@/lib/spin-wheel/server';

export const dynamic = 'force-dynamic';

/** Grant spins to an email address: a new spin link, emailed to them. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermissionResult('raffle');
  if (!auth.user) return spinReply({ success: false, error: auth.error }, auth.status);
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return spinReply({ success: false, error: 'Wheel not found.' }, 404);
  const body = await readLimitedJsonObject(request, 2048);
  if (!body.ok) return spinReply({ success: false, error: body.error }, 400);
  const email = typeof body.value.email === 'string' ? body.value.email.trim() : '';
  const name = typeof body.value.name === 'string' ? body.value.name.trim().slice(0, 120) : '';
  const spins = Number(body.value.spins);
  if (!email || email.length > 254 || !validateEmail(email)) return spinReply({ success: false, error: 'Enter a valid email address.' }, 400);
  if (!Number.isInteger(spins) || spins < 1 || spins > 100) return spinReply({ success: false, error: 'Grant between 1 and 100 spins.' }, 400);
  try {
    const db = createServerClient();
    const wheel = await loadSpinWheel(db, id);
    if (!wheel) return spinReply({ success: false, error: 'Wheel not found.' }, 404);
    const passId = randomUUID();
    const token = spinPassToken(passId);
    const pass = await db.from('spin_wheel_passes').insert({ id: passId, wheel_id: id, token_hash: hashSpinPassToken(token), email: sanitiseInput(email), name: name ? sanitiseInput(name) : null });
    if (pass.error) return spinReply({ success: false, error: 'The spins could not be granted.' }, 503);
    const rows = Array.from({ length: spins }, () => ({ wheel_id: id, pass_id: passId, source: 'admin_grant', granted_by: auth.user!.id }));
    const granted = await db.from('spin_wheel_entitlements').insert(rows);
    if (granted.error) {
      await db.from('spin_wheel_passes').delete().eq('id', passId);
      return spinReply({ success: false, error: 'The spins could not be granted.' }, 503);
    }
    const emailed = await sendSpinPassEmail(db, passId, wheel.name, spins);
    scheduleAdminAudit({ actor: auth.user, action: 'grant', resource: 'spin_wheel_entitlements', recordId: id, summary: `${spins} spins to ${email}` });
    return spinReply({ success: true, emailed, link: spinPassUrl(spinSiteUrl(), token) });
  } catch {
    return spinReply({ success: false, error: 'The spins could not be granted.' }, 503);
  }
}
