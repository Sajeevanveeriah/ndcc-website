// Centralised motion vocabulary for the public site. Every Framer Motion
// island and CSS-side animation derives its numbers from here so the whole
// site moves as one system. Plain constants only — safe to import from both
// server and client modules.

/** House ease: settles fast then glides — matches the historical ScrollReveal curve. */
export const EASE_OUT = [0.21, 0.47, 0.32, 0.98] as const;

/** Long editorial reveals (hero image settle, masked title lines). */
export const EASE_CINEMATIC = [0.16, 1, 0.3, 1] as const;

export const DURATION = {
  /** Micro feedback: hovers, underline sweeps. */
  fast: 0.3,
  /** Standard section/card reveal. */
  base: 0.55,
  /** Hero copy entrances. */
  slow: 0.8,
  /** Hero image settle. */
  settle: 1.4,
} as const;

/** Entrance travel distances in px. */
export const DISTANCE = {
  sm: 16,
  base: 24,
  lg: 40,
} as const;

/** Delay between staggered children in seconds. */
export const STAGGER = {
  tight: 0.06,
  base: 0.08,
  relaxed: 0.12,
} as const;

/** Spring for interactive surfaces returning to neutral (card tilt). */
export const SPRING_SOFT = { stiffness: 180, damping: 24, mass: 0.8 } as const;

/** Default viewport margin: reveal starts slightly before entering the fold. */
export const VIEWPORT_MARGIN = '0px 0px -60px 0px';

/** Interaction limits. */
export const TILT_MAX_DEG = 2;

/** Scroll-linked hero depth: background may travel at most this many px. */
export const HERO_PARALLAX_MAX_PX = 40;

/** Hero image scroll scale range — deliberately tiny. */
export const HERO_SCALE_RANGE: readonly [number, number] = [1, 1.04];
