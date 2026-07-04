import { canonicalSponsorKey } from '@/lib/sponsor-canonical';

const darkSurfaceSponsorKeys = new Set([
  canonicalSponsorKey('Bennett Racing'),
  canonicalSponsorKey('MBR Cricket'),
]);

// Both surfaces are pinned to the same colours in dark mode (dark:* beats the
// global dark compatibility layer): a dark-text logo needs the white plate and a
// light-text logo needs the dark plate regardless of the page theme.
export function sponsorLogoSurfaceClass(name: string | null | undefined) {
  return darkSurfaceSponsorKeys.has(canonicalSponsorKey(name))
    ? 'border-maroon-900/30 bg-gradient-to-br from-maroon-950 via-maroon-900 to-blue-950 p-5 shadow-maroon-950/15'
    : 'border-sky-100 bg-white dark:bg-white dark:border-sky-100 p-5';
}
