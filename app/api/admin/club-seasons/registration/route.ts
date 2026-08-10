import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guard';
import {
  createFutureSeasonRegistrationDraft,
  registrationEditorFromRow,
  toRegistrationSettingsDatabase,
  validateRegistrationSettings,
  type RegistrationEditorSettings,
  type StoredRegistrationRow,
} from '@/lib/player-registration';
import { PLAYER_REGISTRATION_SETTINGS_COLUMNS } from '@/lib/public-player-registration';
import { createServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const noStoreHeaders = { 'Cache-Control': 'no-store', Vary: 'Cookie' } as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SEASON_COLUMNS = 'id,name,slug,status,is_current,source_season_id,start_date,end_date';

type SeasonSummary = {
  id: string;
  name: string;
  slug: string;
  status: string;
  is_current: boolean;
  source_season_id: string | null;
  start_date: string;
  end_date: string;
};

function unavailableResponse() {
  return NextResponse.json(
    { success: false, error: 'Registration CMS is waiting for its additive database migration.' },
    { status: 503, headers: noStoreHeaders },
  );
}

export async function GET(request: Request) {
  const user = await requirePermission('season.registration');
  if (!user) {
    return NextResponse.json({ success: false, error: 'Committee sign in is required.' }, { status: 403, headers: noStoreHeaders });
  }

  const supabase = createServerClient();
  const { data: seasonRows, error: seasonsError } = await supabase
    .from('club_seasons')
    .select(SEASON_COLUMNS)
    .order('start_date', { ascending: false });
  if (seasonsError) return NextResponse.json({ success: false, error: 'Could not load club seasons.' }, { status: 500, headers: noStoreHeaders });

  const seasons = (seasonRows || []) as SeasonSummary[];
  const requestedSeasonId = new URL(request.url).searchParams.get('seasonId');
  const selectedSeason = requestedSeasonId
    ? seasons.find((season) => season.id === requestedSeasonId)
    : seasons.find((season) => season.is_current) || seasons[0];
  if (!selectedSeason) {
    return NextResponse.json({ success: true, seasons, selectedSeason: null, settings: null, isNewDraft: false }, { headers: noStoreHeaders });
  }

  const { data: settingsRow, error: settingsError } = await supabase
    .from('club_season_registration_settings')
    .select(PLAYER_REGISTRATION_SETTINGS_COLUMNS)
    .eq('club_season_id', selectedSeason.id)
    .limit(1)
    .maybeSingle();
  if (settingsError) return unavailableResponse();

  let settings: RegistrationEditorSettings;
  let isNewDraft = false;
  if (settingsRow) {
    settings = registrationEditorFromRow(settingsRow as unknown as StoredRegistrationRow, selectedSeason.name);
  } else {
    const sourceSeasonId = selectedSeason.source_season_id
      || seasons.find((season) => season.is_current && season.id !== selectedSeason.id)?.id
      || null;
    let sourceSettings: RegistrationEditorSettings | null = null;
    if (sourceSeasonId) {
      const sourceSeason = seasons.find((season) => season.id === sourceSeasonId);
      const { data: sourceRow } = await supabase
        .from('club_season_registration_settings')
        .select(PLAYER_REGISTRATION_SETTINGS_COLUMNS)
        .eq('club_season_id', sourceSeasonId)
        .limit(1)
        .maybeSingle();
      if (sourceRow) sourceSettings = registrationEditorFromRow(sourceRow as unknown as StoredRegistrationRow, sourceSeason?.name || '');
    }
    settings = createFutureSeasonRegistrationDraft(selectedSeason.name, sourceSettings);
    isNewDraft = true;
  }

  return NextResponse.json(
    { success: true, seasons, selectedSeason, settings, isNewDraft },
    { headers: noStoreHeaders },
  );
}

export async function PATCH(request: Request) {
  const user = await requirePermission('season.registration');
  if (!user) {
    return NextResponse.json({ success: false, error: 'Committee sign in is required.' }, { status: 403, headers: noStoreHeaders });
  }

  const body = await request.json().catch(() => ({}));
  const seasonId = typeof body.seasonId === 'string' ? body.seasonId.trim() : '';
  if (!UUID_PATTERN.test(seasonId)) {
    return NextResponse.json({ success: false, error: 'A valid club season is required.' }, { status: 400, headers: noStoreHeaders });
  }

  const validation = validateRegistrationSettings(body.settings);
  if (!validation.success) {
    return NextResponse.json(
      { success: false, error: validation.errors.join(' '), errors: validation.errors },
      { status: 400, headers: noStoreHeaders },
    );
  }

  const supabase = createServerClient();
  const { data: season, error: seasonError } = await supabase
    .from('club_seasons')
    .select('id,name')
    .eq('id', seasonId)
    .limit(1)
    .maybeSingle();
  if (seasonError || !season) {
    return NextResponse.json({ success: false, error: 'The selected club season was not found.' }, { status: 404, headers: noStoreHeaders });
  }

  const { data: savedRow, error: saveError } = await supabase
    .from('club_season_registration_settings')
    .upsert(
      { club_season_id: seasonId, ...toRegistrationSettingsDatabase(validation.data) },
      { onConflict: 'club_season_id' },
    )
    .select(PLAYER_REGISTRATION_SETTINGS_COLUMNS)
    .single();
  if (saveError || !savedRow) {
    console.error('[registration-cms] Save failed:', saveError?.code || 'unknown');
    return saveError?.code === '42703' || saveError?.code === 'PGRST204'
      ? unavailableResponse()
      : NextResponse.json({ success: false, error: 'Registration settings could not be saved.' }, { status: 500, headers: noStoreHeaders });
  }

  return NextResponse.json(
    { success: true, settings: registrationEditorFromRow(savedRow as unknown as StoredRegistrationRow, season.name), savedBy: user.email },
    { headers: noStoreHeaders },
  );
}
