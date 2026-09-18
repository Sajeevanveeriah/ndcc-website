import { NextResponse, after } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { readLimitedJsonObject } from '@/lib/order-input-validation';
import { enforceHoneypotAndTiming, enforceRateLimit, getClientIp } from '@/lib/server/request-guards';
import { validateDinoFeedback } from '@/lib/dino-coach/feedback-input';
import { processDinoFeedback } from '@/lib/dino-coach/feedback-delivery';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const headers = { 'Cache-Control': 'no-store' };
const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status, headers });

export async function POST(request: Request) {
  const started = Date.now();
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) return fail('Please submit feedback using the form on this site.', 403);
    if (!await enforceRateLimit(`dino-feedback:${getClientIp(request)}`, 5, 10 * 60_000)) return fail('Too many submissions. Please wait ten minutes and try again.', 429);
    const parsed = await readLimitedJsonObject(request, 24 * 1024);
    if (!parsed.ok) return fail(parsed.error, parsed.error === 'Request body is too large.' ? 413 : 400);
    const input = validateDinoFeedback(parsed.value);
    if (!input.ok) return fail(input.error, 400);
    const { id, name, email, kind, message, hpField, submittedAt } = input.value;
    if (!enforceHoneypotAndTiming(hpField, submittedAt)) return fail('Please take a moment to complete the form and try again.', 400);
    const db = createServerClient({ fetchTimeoutMs: 8000 });
    const saved = await db.rpc('submit_dino_feedback', { p_id: id, p_request: { name, email, kind, message } });
    if (saved.error) {
      if (saved.error.code === '23505') return fail('This submission has changed. Please reload the form before sending it again.', 409);
      console.error(JSON.stringify({ event: 'dino_feedback_save_failed', code: saved.error.code }));
      return fail('We could not save your feedback right now. Please try again shortly.', 503);
    }
    after(() => processDinoFeedback(db, Date.now() + 20_000, id).catch(() => console.error(JSON.stringify({ event: 'dino_feedback_delivery_pending', id }))));
    console.info(JSON.stringify({ event: 'dino_feedback_received', id, duration_ms: Date.now() - started }));
    return NextResponse.json({ success: true, reference: id, message: 'Thanks, we have received your feedback.' }, { status: 202, headers });
  } catch {
    console.error(JSON.stringify({ event: 'dino_feedback_failed', duration_ms: Date.now() - started }));
    return fail('We could not save your feedback right now. Please try again shortly.', 503);
  }
}
