import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requirePermissionResult } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { DEFAULT_POT_CLUB_PRODUCT_CODE, isValidProductCode, resolvePotClubProductCode } from '@/lib/pot-club';

export const dynamic = 'force-dynamic';

const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const unavailable = () => reply({ success: false, error: 'Pot Club settings are temporarily unavailable. Please retry.' }, 503);

/** Plans with a product code, and the code the public Pot Club page uses. */
export async function GET() {
  const access = await requirePermissionResult('memberships');
  if (!access.user) return reply({ success: false, error: access.error }, access.status);
  const client = createServerClient({ actorId: access.user.id });
  const [plans, settings] = await Promise.all([
    client.from('social_membership_plans').select('id,name,price,is_active,product_code').not('product_code', 'is', null).order('sort_order', { ascending: true }),
    client.from('club_settings').select('pot_club_product_code').eq('id', 'default').maybeSingle(),
  ]);
  if (plans.error) return unavailable();
  return reply({
    success: true,
    plans: plans.data || [],
    product_code: settings.error ? DEFAULT_POT_CLUB_PRODUCT_CODE : resolvePotClubProductCode(settings.data?.pot_club_product_code),
    default_product_code: DEFAULT_POT_CLUB_PRODUCT_CODE,
    configurable: !settings.error,
  });
}

/** Choose which membership plan (by product code) the Pot Club page sells. Prices are edited in Memberships. */
export async function PUT(request: Request) {
  const access = await requirePermissionResult('memberships');
  if (!access.user) return reply({ success: false, error: access.error }, access.status);
  const body = await request.json().catch(() => null) as { product_code?: unknown } | null;
  if (!isValidProductCode(body?.product_code)) return reply({ success: false, error: 'Choose a membership plan with a product code.' }, 400);
  const client = createServerClient({ actorId: access.user.id });
  const plan = await client.from('social_membership_plans').select('id').eq('product_code', body.product_code).maybeSingle();
  if (plan.error) return unavailable();
  if (!plan.data) return reply({ success: false, error: 'No membership plan uses that product code.' }, 400);
  const saved = await client.from('club_settings').update({ pot_club_product_code: body.product_code }).eq('id', 'default').select('pot_club_product_code').maybeSingle();
  if (saved.error) return reply({ success: false, error: 'Pot Club selection needs the latest database update before it can be changed.' }, 503);
  if (!saved.data) return reply({ success: false, error: 'Club settings were not found.' }, 404);
  try { revalidatePath('/pot-club'); } catch { /* best-effort */ }
  return reply({ success: true, product_code: saved.data.pot_club_product_code });
}
