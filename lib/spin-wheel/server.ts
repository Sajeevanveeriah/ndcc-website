import 'server-only';
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getAuthUserFromRequest } from '@/lib/fantasy-manager-auth';
import { emailHtml, sendEmail } from '@/lib/email';
import { SITE_URL } from '@/lib/seo';
import { hashSpinPassToken, isSpinPassToken, spinPassToken, spinPassUrl } from '@/lib/spin-wheel/pass';
import { spinPassEmailBody, spinPassEmailSubject, spinWinnerEmailBody, spinWinnerEmailSubject } from '@/lib/spin-wheel/email';
import { type SpinResultView, type SpinSegmentRow, type SpinWheelRow } from '@/lib/spin-wheel/rules';
import { SPIN_WHEEL_COLUMNS } from '@/lib/spin-wheel/visibility';


// Server helpers for Spin the Wheel routes: loading, who is spinning,
// balances and emails. Visibility lives in lib/spin-wheel/visibility.ts.

type Db = ReturnType<typeof createServerClient>;

const SPIN_SEGMENT_COLUMNS = 'id,wheel_id,position,label,prize_name,prize_description,is_prize,weight,stock,colour';
const SPIN_PASS_HEADER = 'x-spin-pass';
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const spinReply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

export function spinSiteUrl(): string {
  const configured = String(process.env.NEXT_PUBLIC_SITE_URL || '').trim();
  try {
    if (configured) return new URL(configured).origin;
  } catch {
    // fall through to the canonical site
  }
  return SITE_URL;
}

export async function loadSpinWheel(db: Db, id: string): Promise<SpinWheelRow | null> {
  const { data, error } = await db.from('spin_wheels').select(SPIN_WHEEL_COLUMNS).eq('id', id).maybeSingle();
  return error || !data ? null : data as SpinWheelRow;
}

export async function loadSpinSegments(db: Db, wheelId: string): Promise<SpinSegmentRow[] | null> {
  const { data, error } = await db.from('spin_wheel_segments').select(SPIN_SEGMENT_COLUMNS).eq('wheel_id', wheelId).order('position');
  return error || !Array.isArray(data) ? null : data as SpinSegmentRow[];
}

export type Spinner =
  | { kind: 'user'; userId: string; email: string; name: string | null }
  | { kind: 'pass'; passId: string; email: string; name: string | null };

export type SpinnerResolution = { spinner: Spinner | null; error: string | null; status: number };

/**
 * Who is spinning: a spin link (X-Spin-Pass header) when one is sent,
 * otherwise a signed-in club account with a confirmed email address.
 */
export async function resolveSpinner(request: Request, db: Db, wheelId: string): Promise<SpinnerResolution> {
  const passToken = request.headers.get(SPIN_PASS_HEADER);
  if (passToken) {
    if (!isSpinPassToken(passToken)) return { spinner: null, error: 'This spin link is not valid.', status: 401 };
    const { data, error } = await db.from('spin_wheel_passes').select('id,email,name,wheel_id')
      .eq('token_hash', hashSpinPassToken(passToken)).maybeSingle();
    if (error) return { spinner: null, error: 'Your spin link could not be checked. Please retry.', status: 503 };
    if (!data || data.wheel_id !== wheelId) return { spinner: null, error: 'This spin link is not for the current wheel.', status: 401 };
    return { spinner: { kind: 'pass', passId: data.id, email: data.email, name: data.name }, error: null, status: 200 };
  }
  if (!request.headers.get('authorization')) return { spinner: null, error: null, status: 200 };
  const user = await getAuthUserFromRequest(request);
  if (!user) return { spinner: null, error: 'Your sign in has expired. Please sign in again.', status: 401 };
  if (!user.email || !user.email_confirmed_at) return { spinner: null, error: 'Confirm your email address before spinning.', status: 403 };
  const metadataName = typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : null;
  return { spinner: { kind: 'user', userId: user.id, email: user.email, name: metadataName }, error: null, status: 200 };
}

function spinnerColumn(spinner: Spinner): [string, string] {
  return spinner.kind === 'user' ? ['auth_user_id', spinner.userId] : ['pass_id', spinner.passId];
}

/** Tops up free spins for signed-in accounts, then counts unused, unrevoked spins. */
export async function spinsLeft(db: Db, wheel: SpinWheelRow, spinner: Spinner): Promise<number | null> {
  if (spinner.kind === 'user' && wheel.free_spins_per_account > 0) {
    const topUp = await db.rpc('ensure_spin_wheel_free_entitlements', { target_wheel: wheel.id, target_user: spinner.userId });
    if (topUp.error) return null;
  }
  const [column, value] = spinnerColumn(spinner);
  const { count, error } = await db.from('spin_wheel_entitlements').select('id', { count: 'exact', head: true })
    .eq('wheel_id', wheel.id).eq(column, value).is('used_at', null).is('revoked_at', null);
  return error ? null : count ?? 0;
}

export async function spinnerResults(db: Db, wheelId: string, spinner: Spinner): Promise<SpinResultView[] | null> {
  const [column, value] = spinnerColumn(spinner);
  const { data, error } = await db.from('spin_wheel_results')
    .select('reference,segment_position,segment_label,prize_name,prize_description,is_prize,created_at,claimed_at,voided_at')
    .eq('wheel_id', wheelId).eq(column, value).order('created_at', { ascending: false }).limit(50);
  return error || !Array.isArray(data) ? null : data as SpinResultView[];
}

async function sendOrRelease(claim: () => Promise<boolean>, release: () => PromiseLike<unknown>, send: () => Promise<{ status: string }>): Promise<boolean> {
  if (!await claim()) return false;
  try {
    const result = await send();
    if (result.status === 'sent' || result.status === 'simulated') return true;
  } catch {
    // released below
  }
  await release();
  return false;
}

/**
 * Emails the spin link for a paid guest order once. The token is re-derived
 * from the pass id, so this can run again from the order status check or the
 * daily cron if an earlier attempt failed.
 */
export async function sendSpinOrderPassEmail(db: Db, spinOrderId: string): Promise<boolean> {
  const { data: order, error } = await db.from('spin_wheel_orders')
    .select('id,quantity,paid_at,pass_emailed_at,pass:spin_wheel_passes(id,email,name),wheel:spin_wheels(name)')
    .eq('id', spinOrderId).maybeSingle();
  if (error || !order || !order.paid_at || order.pass_emailed_at) return false;
  const pass = (Array.isArray(order.pass) ? order.pass[0] : order.pass) as { id: string; email: string; name: string | null } | null;
  const wheel = (Array.isArray(order.wheel) ? order.wheel[0] : order.wheel) as { name: string } | null;
  if (!pass || !wheel) return false;
  const link = spinPassUrl(spinSiteUrl(), spinPassToken(pass.id));
  return sendOrRelease(
    async () => {
      const claimed = await db.from('spin_wheel_orders').update({ pass_emailed_at: new Date().toISOString() })
        .eq('id', order.id).is('pass_emailed_at', null).select('id');
      return !claimed.error && (claimed.data?.length || 0) === 1;
    },
    () => db.from('spin_wheel_orders').update({ pass_emailed_at: null }).eq('id', order.id),
    () => sendEmail({
      to: pass.email,
      subject: spinPassEmailSubject({ wheelName: wheel.name }),
      html: emailHtml('Your spins', spinPassEmailBody({ name: pass.name, wheelName: wheel.name, spins: order.quantity, link })),
      idempotencyKey: `spin-wheel-pass-order-${order.id}`,
    }),
  );
}

/** Emails a spin link for a pass (admin grants and "email me my link"). */
export async function sendSpinPassEmail(db: Db, passId: string, wheelName: string, spins: number): Promise<boolean> {
  const { data: pass, error } = await db.from('spin_wheel_passes').select('id,email,name').eq('id', passId).maybeSingle();
  if (error || !pass) return false;
  const link = spinPassUrl(spinSiteUrl(), spinPassToken(pass.id));
  try {
    const result = await sendEmail({
      to: pass.email,
      subject: spinPassEmailSubject({ wheelName }),
      html: emailHtml('Your spins', spinPassEmailBody({ name: pass.name, wheelName, spins, link })),
    });
    return result.status === 'sent' || result.status === 'simulated';
  } catch {
    return false;
  }
}

/** Winner email, sent once per result. A failure never undoes the spin. */
export async function sendSpinWinnerEmail(db: Db, resultId: string, spinner: { email: string; name: string | null }, wheel: Pick<SpinWheelRow, 'name' | 'claim_instructions'>): Promise<boolean> {
  const { data: result, error } = await db.from('spin_wheel_results')
    .select('id,reference,prize_name,prize_description,is_prize,winner_emailed_at').eq('id', resultId).maybeSingle();
  if (error || !result || !result.is_prize || !result.prize_name || result.winner_emailed_at) return false;
  return sendOrRelease(
    async () => {
      const claimed = await db.from('spin_wheel_results').update({ winner_emailed_at: new Date().toISOString() })
        .eq('id', result.id).is('winner_emailed_at', null).select('id');
      return !claimed.error && (claimed.data?.length || 0) === 1;
    },
    () => db.from('spin_wheel_results').update({ winner_emailed_at: null }).eq('id', result.id),
    () => sendEmail({
      to: spinner.email,
      subject: spinWinnerEmailSubject({ wheelName: wheel.name, prizeName: result.prize_name }),
      html: emailHtml(wheel.name, spinWinnerEmailBody({
        name: spinner.name, wheelName: wheel.name, reference: result.reference, prizeName: result.prize_name,
        prizeDescription: result.prize_description, claimInstructions: wheel.claim_instructions,
      })),
      idempotencyKey: `spin-wheel-winner-${result.id}`,
    }),
  );
}
