import { normalisePublicLinkUrl } from './public-link-url';

export type PlayerSponsor = {
  id: string;
  player_name: string;
  player_image_url: string;
  sponsor_name: string;
  logo_url: string;
  website: string;
  sort_order: number;
  active: boolean;
};

export function validatePlayerSponsor(payload: Record<string, unknown>, isCreate: boolean): string | null {
  for (const field of ['player_name', 'sponsor_name'] as const) {
    if (isCreate || field in payload) {
      if (typeof payload[field] !== 'string' || !payload[field].trim() || payload[field].length > 160) return `${field === 'player_name' ? 'Player' : 'Sponsor'} name is required (maximum 160 characters).`;
    }
  }
  for (const field of ['player_image_url', 'logo_url', 'website']) {
    if (payload[field] !== undefined && payload[field] !== '' && !normalisePublicLinkUrl(payload[field])) return 'Use an HTTPS URL or a site image path.';
  }
  if ('sort_order' in payload && (!Number.isInteger(payload.sort_order) || Math.abs(Number(payload.sort_order)) > 100000)) return 'Display order must be a whole number between -100000 and 100000.';
  if ('active' in payload && typeof payload.active !== 'boolean') return 'Visibility must be true or false.';
  return null;
}
