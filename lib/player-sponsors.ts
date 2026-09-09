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

/** Sponsor destinations may use HTTP; image sources retain the HTTPS-only policy. */
export function normaliseSponsorWebsite(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  if (/^http:\/\//i.test(candidate)) {
    // Reuse all existing URL safety checks, then restore the supplied protocol.
    const validated = normalisePublicLinkUrl(candidate.replace(/^http:/i, 'https:'));
    return validated ? validated.replace(/^https:/, 'http:') : null;
  }
  return normalisePublicLinkUrl(value);
}

/** Normalise optional CMS values consistently before browser and server validation. */
export function normalisePlayerSponsor(payload: Record<string, unknown>) {
  const result = { ...payload };
  for (const field of ['player_image_url', 'logo_url', 'website']) {
    if (!(field in result)) continue;
    const raw = result[field];
    if (raw === null || raw === undefined) { result[field] = ''; continue; }
    if (typeof raw !== 'string') continue;
    let value = raw.trim();
    if (field !== 'website' && /^(?:\/?public\/)?images\//.test(value)) value = '/' + value.replace(/^\/?public\//, '');
    if (field === 'website' && /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::\d+)?(?:[/?#]|$)/i.test(value)) value = 'https://' + value;
    const normalise = field === 'website' ? normaliseSponsorWebsite : normalisePublicLinkUrl;
    result[field] = value ? normalise(value) ?? value : '';
  }
  return result;
}

export function validatePlayerSponsor(payload: Record<string, unknown>, isCreate: boolean): string | null {
  for (const field of ['player_name', 'sponsor_name'] as const) {
    if (isCreate || field in payload) {
      if (typeof payload[field] !== 'string' || !payload[field].trim() || payload[field].length > 160) return `${field === 'player_name' ? 'Player' : 'Sponsor'} name is required (maximum 160 characters).`;
    }
  }
  for (const field of ['player_image_url', 'logo_url', 'website']) {
    const normalise = field === 'website' ? normaliseSponsorWebsite : normalisePublicLinkUrl;
    if (payload[field] !== undefined && payload[field] !== '' && !normalise(payload[field])) {
      const label = field === 'website' ? 'Sponsor website' : field === 'logo_url' ? 'Sponsor logo' : 'Player photo';
      return field === 'website'
        ? 'Sponsor website: enter an HTTP or HTTPS website address, or leave this optional field blank.'
        : `${label}: use a valid HTTPS URL or an image path beginning with /images/.`;
    }
  }
  if ('sort_order' in payload && (!Number.isInteger(payload.sort_order) || Math.abs(Number(payload.sort_order)) > 100000)) return 'Display order must be a whole number between -100000 and 100000.';
  if ('active' in payload && typeof payload.active !== 'boolean') return 'Visibility must be true or false.';
  return null;
}

/** Group partnerships by player name, ignoring accidental spacing and case. */
export function groupPlayerSponsors(rows: PlayerSponsor[]) {
  const groups = new Map<string, { key: string; player_name: string; player_image_url: string; sponsors: PlayerSponsor[] }>();
  for (const row of rows) {
    const name = row.player_name.trim().replace(/\s+/g, ' ');
    const key = name.toLocaleLowerCase('en-AU');
    const group = groups.get(key);
    if (group) {
      group.sponsors.push(row);
      if (!group.player_image_url && row.player_image_url) group.player_image_url = row.player_image_url;
    } else groups.set(key, { key, player_name: name, player_image_url: row.player_image_url, sponsors: [row] });
  }
  return [...groups.values()];
}
