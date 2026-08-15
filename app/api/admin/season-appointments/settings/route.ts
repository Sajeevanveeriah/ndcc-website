import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store', Vary: 'Cookie' } as const;

export async function GET() {
  const user = await requirePermission('appointments');
  if (!user) return NextResponse.json({ success: false, error: 'Admin sign in is required.' }, { status: 403, headers: noStore });
  const supabase = createServerClient();
  const { data: season, error } = await supabase.from('club_seasons').select('id,name,slug,show_season_appointments').eq('is_current', true).limit(1).maybeSingle();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: noStore });
  return NextResponse.json({ success: true, season }, { headers: noStore });
}

export async function PATCH(request: Request) {
  const user = await requirePermission('appointments');
  if (!user) return NextResponse.json({ success: false, error: 'Admin sign in is required.' }, { status: 403, headers: noStore });
  const body = await request.json().catch(() => ({}));
  if (typeof body.showSeasonAppointments !== 'boolean') {
    return NextResponse.json({ success: false, error: 'showSeasonAppointments must be true or false.' }, { status: 400, headers: noStore });
  }
  const supabase = createServerClient();
  const { data: season, error } = await supabase
    .from('club_seasons')
    .update({ show_season_appointments: body.showSeasonAppointments, updated_by: user.email })
    .eq('is_current', true)
    .select('id,name,slug,show_season_appointments')
    .single();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: noStore });
  revalidatePath('/');
  return NextResponse.json({ success: true, season }, { headers: noStore });
}
