// Pure sponsor-logo pixel classifier. Given sampled RGBA pixels it suggests a
// logo_surface_mode for the admin form. Deliberately dependency-free and pure
// so it is unit-testable; the admin page feeds it ImageData from a canvas.
//
// Heuristics (mirrors the manual 2026-07 production audit):
//  - a fully opaque image with matching opaque corners has a built-in
//    rectangle -> 'neutral'
//  - predominantly transparent artwork classifies by the mean luminance of
//    its opaque pixels: very light -> 'dark' plate, very dark -> 'light'
//    plate, mid-tone -> 'light' (safe default)
// Never applies CSS inversion; only suggests a plate. Admins can override.

export type SponsorLogoPixelSample = {
  width: number;
  height: number;
  /** RGBA bytes, 4 per pixel (canvas ImageData.data layout). */
  data: Uint8ClampedArray | number[];
};

export type SponsorLogoAnalysis = {
  suggestedMode: 'light' | 'dark' | 'neutral' | 'transparent';
  opaqueCoverage: number;
  meanOpaqueLuminance: number;
  hasBuiltInBackground: boolean;
  reason: string;
};

function luminance(r: number, g: number, b: number) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function analyseSponsorLogoPixels(sample: SponsorLogoPixelSample): SponsorLogoAnalysis {
  const { width, height, data } = sample;
  const total = width * height;
  if (!total || data.length < total * 4) {
    return { suggestedMode: 'light', opaqueCoverage: 0, meanOpaqueLuminance: 0, hasBuiltInBackground: false, reason: 'No pixel data; defaulting to the safe light plate.' };
  }

  let opaque = 0;
  let lumSum = 0;
  for (let i = 0; i < total; i += 1) {
    const offset = i * 4;
    if (data[offset + 3] > 128) {
      opaque += 1;
      lumSum += luminance(data[offset], data[offset + 1], data[offset + 2]);
    }
  }
  const coverage = opaque / total;
  const meanLum = opaque ? lumSum / opaque : 0;

  const cornerOffsets = [0, (width - 1) * 4, (width * (height - 1)) * 4, (total - 1) * 4];
  const opaqueCorners = cornerOffsets.filter((offset) => data[offset + 3] > 128).length;
  const hasBuiltInBackground = coverage > 0.98 && opaqueCorners === 4;

  if (hasBuiltInBackground) {
    return {
      suggestedMode: 'neutral',
      opaqueCoverage: coverage,
      meanOpaqueLuminance: meanLum,
      hasBuiltInBackground,
      reason: 'Artwork carries its own full background rectangle; a neutral framed plate separates it from the card.',
    };
  }
  if (meanLum >= 200) {
    return {
      suggestedMode: 'dark',
      opaqueCoverage: coverage,
      meanOpaqueLuminance: meanLum,
      hasBuiltInBackground,
      reason: 'Transparent artwork is predominantly white/very light; it needs a persistent dark plate.',
    };
  }
  return {
    suggestedMode: 'light',
    opaqueCoverage: coverage,
    meanOpaqueLuminance: meanLum,
    hasBuiltInBackground,
    reason: meanLum <= 80
      ? 'Transparent artwork is predominantly dark; it needs a persistent light plate.'
      : 'Mid-tone transparent artwork; the light plate is the safe default.',
  };
}
