import type { NormalisedFantasyPlayer, PlayHqPlayerInput, PlayHqPlayerRole } from './types';
const defaultPrices: Record<PlayHqPlayerRole, number> = { BAT: 7.0, BOWL: 7.0, AR: 8.0, WK: 6.5 };
export function normaliseRole(value?: string): PlayHqPlayerRole { const role = String(value || '').toUpperCase(); return role === 'BOWL' || role === 'AR' || role === 'WK' ? role : 'BAT'; }
export function defaultFantasyPrice(role: PlayHqPlayerRole) { return defaultPrices[role]; }
export function normalisePlayHqPlayer(input: PlayHqPlayerInput, source = 'playhq'): NormalisedFantasyPlayer {
  const first = String(input.firstName || '').trim(); const last = String(input.lastName || '').trim(); const display = String(input.displayName || `${first} ${last}`).trim();
  const role = normaliseRole(input.role);
  return { display_name: display, first_name: first, last_name: last, team_name: String(input.teamName || '').trim(), grade_name: String(input.gradeName || '').trim(), role, price_million: defaultFantasyPrice(role), active: true, is_published: false, status: 'available', source, source_url: String(input.sourceUrl || ''), external_id: input.id || null, last_synced_at: new Date().toISOString(), manual_override: false, notes: '' };
}
