// Official Newcomb and District Cricket Club colours for non-Tailwind uses
// (meta theme-color, inline styles). Tailwind exposes the same values as
// maroon-600/700, sky_accent, gold-400, navy and cream (tailwind.config.ts).
//
// Contrast rules: blue and gold are never text on white/cream and never sit
// behind white text; use navy or maroon text on them. Maroon text on dark
// surfaces uses the lighter maroon tint instead.
//
// Some server templates that are imported directly by Node test scripts
// (email HTML, receipt/ticket SVGs, calendar colours) inline these hex values
// instead of importing this module; scripts/test-brand-colours.mjs keeps them
// in step.
export const BRAND_COLOURS = {
  maroon: '#880000',
  blue: '#8cc6d1',
  gold: '#edc266',
  navy: '#162845',
  cream: '#FBF7F0',
} as const;
