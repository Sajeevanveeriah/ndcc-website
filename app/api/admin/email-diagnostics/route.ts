import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/guard';
import { emailHtml, getEmailConfigStatus, sendEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

function cleanEmail(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function safeFailureReason(reason: string) {
  return reason.replace(/re_[A-Za-z0-9_\-]+/g, '[redacted]').slice(0, 240);
}

export async function GET() {
  const user = await requireSession(['admin', 'president', 'secretary', 'committee']);
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  return NextResponse.json({ success: true, data: getEmailConfigStatus() });
}

export async function POST(request: Request) {
  const user = await requireSession(['admin', 'president', 'secretary', 'committee']);
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const to = cleanEmail(body.to);
  if (!to || !/^\S+@\S+\.\S+$/.test(to)) {
    return NextResponse.json({ success: false, error: 'Enter a valid recipient email address.' }, { status: 400 });
  }

  const result = await sendEmail({
    to,
    subject: 'NDCC website email diagnostics test',
    html: emailHtml(
      'NDCC website email diagnostics test',
      `<p style="font-size:15px;color:#374151;line-height:1.6;">This is a test email sent from the NDCC website admin diagnostics screen.</p><p style="font-size:13px;color:#6b7280;">Requested by ${user.full_name}.</p>`
    ),
  });

  if (result.status !== 'sent') {
    return NextResponse.json({ success: false, status: result.status, error: safeFailureReason(result.reason) }, { status: result.status === 'skipped' ? 503 : 502 });
  }

  return NextResponse.json({ success: true, status: result.status, id: result.id });
}
