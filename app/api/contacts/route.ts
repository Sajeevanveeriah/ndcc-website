import { createServerClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { enforceHoneypotAndTiming, enforceRateLimit, getClientIp } from '@/lib/server/request-guards';
import { sendEmail, emailHtml, getContactEmailRecipients } from '@/lib/email';

export const dynamic = 'force-dynamic';

function sanitiseInput(str: string): string {
  return str.replace(/<[^>]*>/g, '').trim();
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\n/g, '<br>');
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function safeFailureReason(reason?: string) {
  return (reason || 'Email was not sent.').replace(/re_[A-Za-z0-9_\-]+/g, '[redacted]').slice(0, 240);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const { name, email, message, enquiry_type, hp_field, submitted_at } = body;

    const ip = getClientIp(request);
    if (!enforceRateLimit(`contact:${ip}`, 8, 60_000)) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please wait a moment and try again.' },
        { status: 429 }
      );
    }

    if (!enforceHoneypotAndTiming(hp_field, submitted_at)) {
      return NextResponse.json({ success: false, error: 'Invalid form submission.' }, { status: 400 });
    }

    if (!name || !email || !message) {
      return NextResponse.json(
        { success: false, error: 'Name, email, and message are required.' },
        { status: 400 }
      );
    }

    const safeName = sanitiseInput(name);
    const safeEmail = sanitiseInput(email);
    const safeMessage = sanitiseInput(message);
    const safeEnquiryType = enquiry_type ? sanitiseInput(enquiry_type) : 'general';

    if (!isValidEmail(safeEmail)) {
      return NextResponse.json(
        { success: false, error: 'Please provide a valid email address.' },
        { status: 400 }
      );
    }

    let dbStatus: 'saved' | 'failed' = 'failed';
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Supabase contact insert skipped: server env is not configured.');
    } else {
      try {
        const supabase = createServerClient({ fetchTimeoutMs: 12_000 });
        const { error } = await supabase.from('contacts').insert({
          name: safeName,
          email: safeEmail,
          message: safeMessage,
          enquiry_type: safeEnquiryType,
          responded: false,
        });

        if (error) {
          console.error('Supabase contact insert failed', { code: error.code });
        } else {
          dbStatus = 'saved';
        }
      } catch (dbError) {
        console.error('Supabase contact insert unavailable', { message: dbError instanceof Error ? dbError.message : 'unknown' });
      }
    }

    const timestamp = new Date().toISOString();
    const contactConfig = getContactEmailRecipients();
    const adminResult = await sendEmail({
      to: contactConfig.effectiveContactRecipient,
      cc: contactConfig.cc.length > 0 ? contactConfig.cc : undefined,
      bcc: contactConfig.bcc.length > 0 ? contactConfig.bcc : undefined,
      replyTo: safeEmail,
      subject: `New website enquiry — ${safeEnquiryType} | NDCC Dinos`,
      tags: [{ name: 'category', value: 'contact-enquiry' }],
      html: emailHtml(
        'New website enquiry',
        `<p style="font-size:15px;color:#374151;line-height:1.6;">A new enquiry was submitted from the NDCC website.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;width:130px;">Name</td><td style="padding:6px 0;font-size:14px;">${escapeHtml(safeName)}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Email</td><td style="padding:6px 0;font-size:14px;"><a href="mailto:${escapeHtml(safeEmail)}" style="color:#800000;">${escapeHtml(safeEmail)}</a></td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Enquiry type</td><td style="padding:6px 0;font-size:14px;">${escapeHtml(safeEnquiryType)}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Timestamp</td><td style="padding:6px 0;font-size:14px;">${escapeHtml(timestamp)}</td></tr>
        </table>
        <div style="background:#f3f4f6;border-radius:6px;padding:16px;margin:16px 0;">
          <p style="margin:0 0 8px;font-size:13px;color:#6b7280;font-weight:bold;text-transform:uppercase;">Message</p>
          <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">${escapeHtml(safeMessage)}</p>
        </div>`
      ),
    });

    const acknowledgementResult = await sendEmail({
      to: safeEmail,
      subject: 'We received your message — NDCC Dinos',
      tags: [{ name: 'category', value: 'contact-acknowledgement' }],
      html: emailHtml(
        'Thanks for getting in touch',
        `<p style="font-size:15px;color:#374151;line-height:1.6;">Hi ${escapeHtml(safeName)},</p>
        <p style="font-size:15px;color:#374151;line-height:1.6;">We have received your message and will get back to you as soon as possible, usually within 1–2 business days.</p>
        <div style="background:#f3f4f6;border-radius:6px;padding:16px;margin:16px 0;">
          <p style="margin:0 0 8px;font-size:13px;color:#6b7280;font-weight:bold;text-transform:uppercase;">Your message</p>
          <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">${escapeHtml(safeMessage)}</p>
        </div>
        <p style="font-size:14px;color:#6b7280;">If your enquiry is urgent, you can also reach us directly at <a href="mailto:ndcc.secretary1@gmail.com" style="color:#800000;">ndcc.secretary1@gmail.com</a>.</p>`
      ),
    });

    if (adminResult.status !== 'sent') {
      console.warn('[contacts] Admin notification email did not send', {
        status: adminResult.status,
        reason: safeFailureReason(adminResult.reason),
        acknowledgementStatus: acknowledgementResult.status,
      });
      if (dbStatus === 'saved') {
        return NextResponse.json({
          success: true,
          dbStatus,
          emailStatus: 'failed',
          acknowledgementStatus: acknowledgementResult.status,
          message: 'Your enquiry was saved, but the email notification could not be sent. Please email ndsc.cricket@gmail.com if urgent.',
        }, { status: 202 });
      }

      return NextResponse.json({
        success: false,
        dbStatus,
        emailStatus: 'failed',
        acknowledgementStatus: acknowledgementResult.status,
        error: 'We could not send your enquiry right now. Please email ndsc.cricket@gmail.com directly.',
      }, { status: 503 });
    }

    if (acknowledgementResult.status !== 'sent') {
      console.warn('[contacts] Acknowledgement email did not send', {
        status: acknowledgementResult.status,
        reason: safeFailureReason(acknowledgementResult.reason),
      });
    }

    return NextResponse.json({
      success: true,
      dbStatus,
      emailStatus: 'sent',
      acknowledgementStatus: acknowledgementResult.status,
      message: dbStatus === 'saved' ? 'Message sent successfully!' : 'Your enquiry email was sent, but saving a copy failed. We will still receive your message.',
    });
  } catch (err) {
    console.error('Contact route error:', err);
    return NextResponse.json(
      { success: false, dbStatus: 'failed', emailStatus: 'failed', error: 'We could not process your enquiry right now. Please try again or email ndsc.cricket@gmail.com directly.' },
      { status: 500 }
    );
  }
}
