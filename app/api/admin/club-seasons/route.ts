import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/guard';
import { CLUB_ADMIN_ROLES } from '@/lib/auth/config';
import { CLUB_SEASON_COLUMNS, slugifySeasonName } from '@/lib/club-seasons';
import { createServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store', Vary: 'Cookie' } as const;
const STATUSES = ['draft', 'upcoming', 'active', 'completed', 'archived'];

export async function GET() {
  const user = await requireSession(CLUB_ADMIN_ROLES);
  if (!user) return NextResponse.json({ success: false, error: 'Admin sign in is required.' }, { status: 403, headers: noStore });
  const supabase = createServerClient();
  const { data: seasons, error } = await supabase.from('club_seasons').select(CLUB_SEASON_COLUMNS).order('start_date', { ascending: false });
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: noStore });
  return NextResponse.json({ success: true, seasons }, { headers: noStore });
}

export async function POST(request: Request) {
  const user = await requireSession(CLUB_ADMIN_ROLES);
  if (!user) return NextResponse.json({ success: false, error: 'Admin sign in is required.' }, { status: 403, headers: noStore });
  const body = await request.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  const slug = slugifySeasonName(String(body.slug || name));
  const startDate = String(body.startDate || '').trim();
  const endDate = String(body.endDate || '').trim();
  if (!name || !slug || !startDate || !endDate) return NextResponse.json({ success: false, error: 'Season name, slug, start date and end date are required.' }, { status: 400, headers: noStore });
  const status = STATUSES.includes(body.status) ? body.status : 'draft';
  const supabase = createServerClient();
  const { data: season, error } = await supabase.from('club_seasons').insert({
    name,
    slug,
    start_date: startDate,
    end_date: endDate,
    status,
    is_current: false,
    // Every new season starts closed. Registration links are managed only in
    // the dedicated seasonal registration CMS after review.
    registration_status: 'closed',
    registration_url: null,
    playhq_season_id: String(body.playhqSeasonId || '').trim() || null,
    source_season_id: String(body.sourceSeasonId || '').trim() || null,
    scheduled_activation_at: body.scheduledActivationAt || null,
    created_by: user.email,
    updated_by: user.email,
  }).select(CLUB_SEASON_COLUMNS).single();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400, headers: noStore });
  return NextResponse.json({ success: true, season }, { headers: noStore });
}
