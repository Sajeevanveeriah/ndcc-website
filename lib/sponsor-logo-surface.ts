import { canonicalSponsorKey } from '@/lib/sponsor-canonical';

const darkSurfaceSponsorKeys = new Set([
  canonicalSponsorKey('Bennett Racing'),
  canonicalSponsorKey('MBR Cricket'),
]);

export function sponsorLogoSurfaceClass(name: string | null | undefined) {
  return darkSurfaceSponsorKeys.has(canonicalSponsorKey(name))
    ? 'border-maroon-900/30 bg-gradient-to-br from-maroon-950 via-maroon-900 to-blue-950 p-5 shadow-maroon-950/15'
    : 'border-sky-100 bg-white p-5';
}
