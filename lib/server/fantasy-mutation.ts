import 'server-only';
import { NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/server/request-guards';

const MAX_BODY_BYTES = 64 * 1024;
const WINDOW_MS = 60_000;
const LIMITS = { profile: 20, squad: 60, transfers: 30, chips: 10, rules: 20, carryover: 10, leagues: 20 } as const;

function reject(error: string, status: number) {
  return { response: NextResponse.json({ success: false, error }, {
    status,
    headers: { 'Cache-Control': 'no-store', ...(status === 429 ? { 'Retry-After': '60' } : {}) },
  }) } as const;
}

/** Call only after authentication; the actor must come from the verified session. */
export async function readFantasyMutation(request: Request, actorId: string, action: keyof typeof LIMITS) {
  if (!await enforceRateLimit(`fantasy-write-${action}:${actorId}`, LIMITS[action], WINDOW_MS)) {
    return reject('Too many changes. Please wait a minute and try again.', 429);
  }
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) {
    return reject('The request is too large.', 413);
  }
  const reader = request.body?.getReader();
  if (!reader) return reject('Send a JSON object.', 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return reject('The request is too large.', 413);
      }
      chunks.push(value);
    }
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) return reject('Send a JSON object.', 400);
    return { body: body as Record<string, unknown> } as const;
  } catch {
    return reject('Send a valid JSON object.', 400);
  } finally {
    reader.releaseLock();
  }
}
