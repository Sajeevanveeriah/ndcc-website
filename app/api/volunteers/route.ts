import { createServerClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { enforceHoneypotAndTiming, enforceRateLimit, getClientIp } from '@/lib/server/request-guards';
import { sendEmail, emailHtml, escapeEmailHtml } from '@/lib/email';
import { readLimitedJsonObject, validateVolunteerFormInput } from '@/lib/order-input-validation';

export const dynamic = 'force-dynamic';

function sanitiseInput(str: string): string {
  return str.replace(/<[^>]*>/g, '').trim();
}

export async function POST(request: Request) {
  try {
    const parsedBody = await readLimitedJsonObject(request, 16 * 1024);
    if (!parsedBody.ok) {
      return NextResponse.json(
        { success: false, error: parsedBody.error },
        { status: parsedBody.error === 'Request body is too large.' ? 413 : 400 },
      );
    }
    const input = validateVolunteerFormInput(parsedBody.value);
    if (!input.ok) {
      return NextResponse.json({ success: false, error: input.error }, { status: 400 });
    }
    const {
      name,
      email,
      role,
      phone,
      availability,
      notes,
      hpField,
      submittedAt,
    } = input.value;

    const ip = getClientIp(request);
    if (!enforceRateLimit(`volunteer:${ip}`, 8, 60_000)) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please wait a moment and try again.' },
        { status: 429 }
      );
    }

    if (!enforceHoneypotAndTiming(hpField, submittedAt)) {
      return NextResponse.json({ success: false, error: 'Invalid form submission.' }, { status: 400 });
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { success: false, error: 'Service not configured.' },
        { status: 503 }
      );
    }

    const supabase = createServerClient();

    const safeRole = sanitiseInput(role);
    const { data: position, error: positionError } = await supabase
      .from('volunteer_positions')
      .select('id')
      .eq('title', safeRole)
      .eq('is_active', true)
      .maybeSingle();

    if (positionError) {
      console.error('Supabase volunteer position lookup error:', positionError);
      return NextResponse.json(
        { success: false, error: 'Volunteer roles are temporarily unavailable.' },
        { status: 503 },
      );
    }
    if (!position) {
      return NextResponse.json(
        { success: false, error: 'The selected volunteer role is no longer available.' },
        { status: 409 },
      );
    }

    const { data: expression, error: expressionError } = await supabase.from('volunteer_expressions').insert({
      full_name: sanitiseInput(name),
      email: sanitiseInput(email),
      phone: sanitiseInput(phone),
      volunteer_position_id: position.id,
      availability: sanitiseInput(availability),
      notes: sanitiseInput(notes),
      status: 'new',
    }).select('id').single();

    if (expressionError || !expression) {
      console.error('Supabase volunteer expression insert error:', expressionError);
      return NextResponse.json(
        { success: false, error: 'Failed to submit volunteer registration.' },
        { status: 500 }
      );
    }

    const { error } = await supabase.from('volunteers').insert({
      name: sanitiseInput(name),
      email: sanitiseInput(email),
      phone: sanitiseInput(phone),
      role: safeRole,
      availability: sanitiseInput(availability),
      processed: false,
    });

    if (error) {
      await supabase.from('volunteer_expressions').delete().eq('id', expression.id);
      console.error('Supabase volunteer insert error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to submit volunteer registration.' },
        { status: 500 }
      );
    }

    void sendEmail({
      to: sanitiseInput(email),
      subject: 'Volunteer expression of interest received — NDCC Dinos',
      html: emailHtml(
        'Thanks for volunteering',
        `<p style="font-size:15px;color:#374151;line-height:1.6;">Hi ${escapeEmailHtml(sanitiseInput(name))},</p>
        <p style="font-size:15px;color:#374151;line-height:1.6;">Thank you for expressing interest in volunteering with the Newcomb and District Cricket Club. We really appreciate your support.</p>
        <div style="background:#f3f4f6;border-radius:6px;padding:16px;margin:16px 0;">
          <p style="margin:0 0 6px;font-size:13px;color:#6b7280;font-weight:bold;">Role of interest</p>
          <p style="margin:0;font-size:14px;color:#374151;">${escapeEmailHtml(safeRole)}</p>
        </div>
        <p style="font-size:15px;color:#374151;line-height:1.6;">A committee member will be in touch with you shortly to discuss next steps.</p>
        <p style="font-size:13px;color:#6b7280;">Questions? Contact us at <a href="mailto:ndcc.secretary1@gmail.com" style="color:#800000;">ndcc.secretary1@gmail.com</a>.</p>`
      ),
    });
    return NextResponse.json({
      success: true,
      message: 'Thank you for your volunteer expression of interest. We will contact you soon.',
    });
  } catch (err) {
    console.error('Volunteer route error:', err);
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}
