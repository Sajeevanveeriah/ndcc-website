import {
  CLUB_NAME,
  CLUB_SHORT,
  CLUB_NICKNAME,
  CLUB_ESTABLISHED,
  CLUB_EMAIL_USER,
  CLUB_EMAIL_DOMAIN,
  CLUB_GROUND,
  CLUB_ADDRESS,
  CLUB_ASSOCIATION,
  CLUB_ASSOCIATION_SHORT,
  CLUB_PHONE,
  FACEBOOK_URL,
  INSTAGRAM_URL,
  INSTAGRAM_HANDLE,
  PLAYHQ_ORG_URL,
  GOOGLE_MAPS_EMBED_URL,
} from '@/lib/constants';
import { assembleEmail } from '@/lib/utils';

export type ClubSettings = {
  id: 'default';
  donations_enabled: boolean;
  club_name: string;
  club_short: string;
  club_nickname: string;
  established_year: number | null;
  email: string | null;
  phone: string | null;
  ground_name: string | null;
  address: string | null;
  association_name: string | null;
  association_short: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  instagram_handle: string | null;
  playhq_url: string | null;
  google_maps_embed_url: string | null;
  sponsor_marquee_speed: 'slow' | 'very_slow';
  updated_at?: string | null;
};

const fallbackEmail = assembleEmail(CLUB_EMAIL_USER, CLUB_EMAIL_DOMAIN);

export const fallbackClubSettings: ClubSettings = {
  id: 'default',
  donations_enabled: false,
  club_name: CLUB_NAME,
  club_short: CLUB_SHORT,
  club_nickname: CLUB_NICKNAME,
  established_year: CLUB_ESTABLISHED,
  email: fallbackEmail,
  phone: CLUB_PHONE,
  ground_name: CLUB_GROUND,
  address: CLUB_ADDRESS,
  association_name: CLUB_ASSOCIATION,
  association_short: CLUB_ASSOCIATION_SHORT,
  facebook_url: FACEBOOK_URL,
  instagram_url: INSTAGRAM_URL,
  instagram_handle: INSTAGRAM_HANDLE,
  playhq_url: PLAYHQ_ORG_URL,
  google_maps_embed_url: GOOGLE_MAPS_EMBED_URL,
  sponsor_marquee_speed: 'slow',
};
