import { NextResponse } from 'next/server';
import { resolveFantasyManagerAuth } from '@/lib/fantasy-manager-auth';
import { resolveRequestSeason } from '@/lib/fantasy-seasons';
import { getDinoCoachSettings } from '@/lib/dino-coach/server';
import { createServerClient } from '@/lib/supabase-server';

export async function POST(request: Request) {
  const { auth, errorMessage, errorStatus } = await resolveFantasyManagerAuth(request);
  if (!auth) return NextResponse.json({ success: false, error: errorMessage }, { status: errorStatus });
  const body = await request.json().catch(() => ({}));
  const season = await resolveRequestSeason(request, body);
  if (!season) return NextResponse.json({ success: false, error: 'No Dino Coach season is available.' }, { status: 404 });
  const settings = await getDinoCoachSettings(season.id);
  if (body?.rulesAccepted !== true || body.rulesVersion !== settings.rules_version) {
    return NextResponse.json({ success: false, error: 'Read and accept the current Dino Coach rules. Reload if the version has changed.' }, { status: 400 });
  }
  const { data, error } = await createServerClient().from('fantasy_managers')
    .update({ rules_version_accepted: settings.rules_version, rules_accepted_at: new Date().toISOString() })
    .eq('id', auth.manager.id).eq('is_active', true).is('deleted_at', null)
    .select('id').maybeSingle();
  if (error || !data) return NextResponse.json({ success: false, error: 'Could not save rules acceptance. Please try again.' }, { status: 503 });
  return NextResponse.json({ success: true });
}
