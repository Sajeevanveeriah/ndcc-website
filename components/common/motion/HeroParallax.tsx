'use client';

import { LazyMotion, domAnimation, m, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DURATION, EASE_CINEMATIC, HERO_PARALLAX_MAX_PX } from '@/lib/motion-tokens';

/**
 * Cinematic depth wrapper for the homepage hero imagery. The server-rendered
 * <Image> passes through as children so CMS/asset behaviour is untouched.
 *
 * - Entrance: the image settles from a restrained 1.06 scale (no opacity
 *   animation so the LCP paint is never delayed).
 * - Scroll: the frame drifts down by at most HERO_PARALLAX_MAX_PX as the hero
 *   leaves the viewport. The frame is oversized vertically by the same amount
 *   so travel can never expose an edge — no layout shift, no crop change at rest.
 * - Mobile (<768px) keeps the entrance but skips per-frame scroll transforms.
 * - Reduced motion renders a plain static frame.
 */
export default function HeroParallax({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [depthEnabled, setDepthEnabled] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 768px)');
    const update = () => setDepthEnabled(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [0, HERO_PARALLAX_MAX_PX]);

  if (reduceMotion) {
    // Identical DOM structure to the animated branch (frame + plane) so a
    // reduced-motion client hydrates the server HTML without a tree mismatch.
    return (
      <div className="absolute inset-x-0 -top-10 -bottom-10">
        <div className="absolute inset-0">{children}</div>
      </div>
    );
  }

  return (
    <LazyMotion features={domAnimation} strict>
      {/* Oversized frame: extra bleed above/below equals the max scroll travel. */}
      <m.div
        ref={ref}
        className="absolute inset-x-0 -top-10 -bottom-10"
        style={depthEnabled ? { y } : undefined}
      >
        <m.div
          className="absolute inset-0"
          initial={{ scale: 1.06 }}
          animate={{ scale: 1 }}
          transition={{ duration: DURATION.settle, ease: EASE_CINEMATIC }}
        >
          {children}
        </m.div>
      </m.div>
    </LazyMotion>
  );
}
