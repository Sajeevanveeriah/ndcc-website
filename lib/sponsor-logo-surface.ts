import { canonicalSponsorKey } from '@/lib/sponsor-canonical';

export const SPONSOR_LOGO_SURFACE_MODES = ['auto', 'light', 'dark', 'neutral', 'transparent'] as const;
export type SponsorLogoSurfaceMode = (typeof SPONSOR_LOGO_SURFACE_MODES)[number];

// Verified light-text-on-transparency artwork that needs a dark plate in both
// themes. Used only when a sponsor's stored mode is 'auto' (or absent).
const darkSurfaceSponsorKeys = new Set([
  canonicalSponsorKey('Bennett Racing'),
  canonicalSponsorKey('MBR Cricket'),
]);

export function normaliseSponsorLogoSurfaceMode(mode: string | null | undefined): SponsorLogoSurfaceMode {
  return (SPONSOR_LOGO_SURFACE_MODES as readonly string[]).includes(mode ?? '')
    ? (mode as SponsorLogoSurfaceMode)
    : 'auto';
}

/** Resolve the effective plate for a sponsor: explicit CMS mode wins, 'auto'
 *  falls back to the verified artwork allowlist. Deterministic — no runtime
 *  image inspection. */
export function resolveSponsorLogoSurface(
  name: string | null | undefined,
  mode?: string | null
): Exclude<SponsorLogoSurfaceMode, 'auto'> {
  const normalised = normaliseSponsorLogoSurfaceMode(mode);
  if (normalised !== 'auto') return normalised;
  return darkSurfaceSponsorKeys.has(canonicalSponsorKey(name)) ? 'dark' : 'light';
}

// Inner logo-plate classes. The plate exists only to keep the artwork legible,
// so 'light' and 'dark' are pinned in both themes (explicit dark:* utilities;
// nothing here relies on any global dark remapping). The inset keyline on the
// light plate keeps logos that ship their own white rectangle looking
// intentionally framed rather than pasted onto another white tile.
const plateClasses: Record<Exclude<SponsorLogoSurfaceMode, 'auto'>, string> = {
  light:
    'bg-white dark:bg-white border-slate-200 dark:border-slate-200 ring-1 ring-inset ring-gray-900/[0.06] dark:ring-gray-900/[0.06]',
  dark:
    'bg-gradient-to-br from-maroon-950 via-maroon-900 to-blue-950 border-maroon-900/30 dark:border-white/15 shadow-maroon-950/15',
  // Pale warm neutral in light; in dark the plate follows the theme but keeps
  // a clearly visible keyline so built-in rectangles never float unframed.
  neutral:
    'bg-[#f3f1ec] dark:bg-surface-muted border-edge-subtle ring-1 ring-inset ring-gray-900/[0.06] dark:ring-white/15',
  transparent: 'bg-transparent border-transparent',
};

export function sponsorLogoSurfaceClass(name: string | null | undefined, mode?: string | null) {
  return `${plateClasses[resolveSponsorLogoSurface(name, mode)]} p-5`;
}
