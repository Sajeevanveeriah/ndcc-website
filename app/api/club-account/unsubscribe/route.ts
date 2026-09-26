import { createServerClient } from '@/lib/supabase-server';
import { escapeEmailHtml } from '@/lib/email-html';
import { verifyUnsubscribeToken } from '@/lib/newsletter';
import { newsletterSigningKey } from '@/lib/server/newsletter';

export const dynamic = 'force-dynamic';

// Signed, per-member unsubscribe links from member newsletters. GET only
// shows a confirmation button (link scanners must not unsubscribe people);
// POST turns club_account_preferences.email_updates off.

function page(title: string, message: string, form?: string, status = 200) {
  const html = `<!DOCTYPE html>
<html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${escapeEmailHtml(title)} | NDCC</title></head>
<body style="margin:0;background:#FBF7F0;font-family:Arial,sans-serif;color:#162845;">
<main style="max-width:560px;margin:48px auto;padding:24px;background:#ffffff;border-top:6px solid #880000;border-radius:8px;">
<h1 style="margin:0 0 12px;font-size:24px;color:#4a0000;">${escapeEmailHtml(title)}</h1>
<p style="font-size:16px;line-height:1.6;">${escapeEmailHtml(message)}</p>
${form || ''}
<p style="margin-top:24px;font-size:14px;"><a href="/" style="color:#880000;">Return to the NDCC website</a></p>
</main></body></html>`;
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
}

const invalid = () => page('Link not valid', 'This unsubscribe link is not valid. You can change email updates from your club account, or contact the club.', undefined, 400);

function verified(token: unknown) {
  const key = newsletterSigningKey();
  return key ? verifyUnsubscribeToken(token, key) : null;
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') || '';
  if (!verified(token)) return invalid();
  const form = `<form method="post" action="/api/club-account/unsubscribe"><input type="hidden" name="token" value="${escapeEmailHtml(token)}">
<button type="submit" style="min-height:44px;padding:10px 18px;border:0;border-radius:6px;background:#880000;color:#ffffff;font-size:16px;font-weight:bold;cursor:pointer;">Unsubscribe</button></form>`;
  return page('Unsubscribe from club emails', 'Press the button below to stop receiving NDCC club email updates. Order receipts and other emails about your own purchases are not affected.', form);
}

export async function POST(request: Request) {
  let token: unknown = new URL(request.url).searchParams.get('token');
  try {
    const type = request.headers.get('content-type') || '';
    if (type.includes('application/x-www-form-urlencoded') || type.includes('multipart/form-data')) {
      const form = await request.formData();
      token = form.get('token') ?? token;
    }
  } catch { /* fall back to the query token */ }
  const memberId = verified(token);
  if (!memberId) return invalid();
  try {
    const { error } = await createServerClient().from('club_account_preferences')
      .update({ email_updates: false, updated_at: new Date().toISOString() })
      .eq('member_id', memberId);
    if (error) return page('Please try again', 'We could not update your email preference just now. Please try again shortly.', undefined, 503);
  } catch {
    return page('Please try again', 'We could not update your email preference just now. Please try again shortly.', undefined, 503);
  }
  console.info(JSON.stringify({ event: 'newsletter_unsubscribed' }));
  return page('You are unsubscribed', 'You will no longer receive NDCC club email updates. You can turn them back on at any time from your club account.');
}
