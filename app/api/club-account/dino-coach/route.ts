import { NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/account/server-auth';
import { createServerClient } from '@/lib/supabase-server';
import { resolveRequestSeason } from '@/lib/fantasy-seasons';
import { getDinoManagerStandings } from '@/lib/dino-coach/standings';
export const dynamic = 'force-dynamic';
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
// Read-only Dino Coach summary for the club account hub. It never creates a
// manager profile, sends email or changes Dino Coach data.
export async function GET(request: Request) {
  const user = await getAuthUserFromRequest(request);
  if (!user?.email_confirmed_at || !user.email) return reply({ success: false, error: 'Sign in with a confirmed email.' }, 401);
  try {
    const { data, error } = await createServerClient().from('fantasy_managers')
      .select('id,team_name,is_active,deleted_at').eq('auth_user_id', user.id).maybeSingle();
    if (error) return reply({ success: false, error: 'Your Dino Coach summary could not be loaded. Please retry.' }, 503);
    const manager = data as { id: string; team_name: string | null; is_active: boolean; deleted_at: string | null } | null;
    if (!manager || manager.deleted_at || !manager.is_active) return reply({ success: true, manager: null, standing: null });
    let standing: { rank: number; points: number; managers: number } | null = null;
    try {
      const season = await resolveRequestSeason(request);
      const rows = await getDinoManagerStandings(season?.id ?? null);
      const own = rows.find(row => row.managerId === manager.id);
      if (own) standing = { rank: own.rank, points: own.totalPoints, managers: rows.length };
    } catch { standing = null; }
    return reply({ success: true, manager: { team_name: manager.team_name || '' }, standing });
  } catch { return reply({ success: false, error: 'Your Dino Coach summary could not be loaded. Please retry.' }, 503); }
}
