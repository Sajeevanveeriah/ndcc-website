import { createPublicServerClient, isPublicSupabaseConfigured } from '@/lib/supabase-server';
import { fallbackClubSettings, type ClubSettings } from '@/lib/club-settings-types';
import { normaliseSponsorMarqueeSpeed } from '@/lib/sponsor-marquee';
import { resolveGoogleMapsEmbedUrl } from '@/lib/google-maps-embed';
import { resolvePublicLinkUrl } from '@/lib/public-link-url';

function textOrFallback(value: unknown, fallback: string | null) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function nullableText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberOrFallback(value: unknown, fallback: number | null) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

export function normalizeClubSettings(row: Partial<ClubSettings> | null | undefined): ClubSettings {
  if (!row) return fallbackClubSettings;

  return {
    id: 'default',
    donations_enabled: row.donations_enabled === true,
    club_name: textOrFallback(row.club_name, fallbackClubSettings.club_name) || fallbackClubSettings.club_name,
    club_short: textOrFallback(row.club_short, fallbackClubSettings.club_short) || fallbackClubSettings.club_short,
    club_nickname: textOrFallback(row.club_nickname, fallbackClubSettings.club_nickname) || fallbackClubSettings.club_nickname,
    established_year: numberOrFallback(row.established_year, fallbackClubSettings.established_year),
    email: textOrFallback(row.email, fallbackClubSettings.email),
    phone: textOrFallback(row.phone, fallbackClubSettings.phone),
    ground_name: textOrFallback(row.ground_name, fallbackClubSettings.ground_name),
    address: textOrFallback(row.address, fallbackClubSettings.address),
    association_name: textOrFallback(row.association_name, fallbackClubSettings.association_name),
    association_short: textOrFallback(row.association_short, fallbackClubSettings.association_short),
    facebook_url: resolvePublicLinkUrl(row.facebook_url, fallbackClubSettings.facebook_url),
    instagram_url: resolvePublicLinkUrl(row.instagram_url, fallbackClubSettings.instagram_url),
    instagram_handle: textOrFallback(row.instagram_handle, fallbackClubSettings.instagram_handle),
    playhq_url: resolvePublicLinkUrl(row.playhq_url, fallbackClubSettings.playhq_url),
    google_maps_embed_url: resolveGoogleMapsEmbedUrl(
      row.google_maps_embed_url,
      fallbackClubSettings.google_maps_embed_url,
    ),
    sponsor_marquee_speed: normaliseSponsorMarqueeSpeed(row.sponsor_marquee_speed),
    updated_at: nullableText(row.updated_at),
  };
}

async function getClubSettingsUncached(): Promise<ClubSettings> {
  if (!isPublicSupabaseConfigured()) {
    return fallbackClubSettings;
  }

  try {
    const supabase = createPublicServerClient();
    const { data, error } = await supabase
      .from('club_settings')
      .select('donations_enabled,id,club_name,club_short,club_nickname,established_year,email,phone,ground_name,address,association_name,association_short,facebook_url,instagram_url,instagram_handle,playhq_url,google_maps_embed_url,sponsor_marquee_speed,updated_at')
      .eq('id', 'default')
      .maybeSingle();

    if (error || !data) {
      if (error) console.warn('Public club settings query failed; using fallback.');
      return fallbackClubSettings;
    }
    return normalizeClubSettings(data as Partial<ClubSettings>);
  } catch {
    console.warn('Public club settings query timed out or failed; using fallback.');
    return fallbackClubSettings;
  }
}

// Uncached live read: club settings are edited through admin, so they must be
// queried at request time rather than served from the build/Data Cache.
export const getClubSettings = getClubSettingsUncached;
