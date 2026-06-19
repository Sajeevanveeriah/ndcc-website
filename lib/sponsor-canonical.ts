import sponsorAliases from '@/data/sponsors/canonical-sponsor-aliases.json';

export const CANONICAL_SPONSOR_NAMES = Object.keys(sponsorAliases);

export function normalizeSponsorName(value: string | null | undefined) {
  return String(value || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const sponsorAliasLookup = new Map<string, string>();
for (const [canonicalName, aliases] of Object.entries(sponsorAliases)) {
  sponsorAliasLookup.set(normalizeSponsorName(canonicalName), canonicalName);
  for (const alias of aliases) sponsorAliasLookup.set(normalizeSponsorName(alias), canonicalName);
}

export function canonicalSponsorName(value: string | null | undefined) {
  const normalized = normalizeSponsorName(value);
  return sponsorAliasLookup.get(normalized) || String(value || '').trim();
}

export function canonicalSponsorKey(value: string | null | undefined) {
  return normalizeSponsorName(canonicalSponsorName(value));
}
