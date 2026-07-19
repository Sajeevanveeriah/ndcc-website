'use client';

import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { EASE_CINEMATIC } from '@/lib/motion-tokens';

/**
 * Masked line reveal: the child rises out of an overflow-hidden wrapper, the
 * classic editorial title treatment. Children stay server-rendered, so CMS
 * text and heading semantics are untouched (spans inside the existing h1).
 *
 * The wrapper carries a small padding/negative-margin cancel so descenders and
 * italic overhangs are never clipped at rest.
 */
export default function MaskReveal({
  children,
  className,
  delay = 0,
  duration = 0.9,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
}) {
  const reduceMotion = useReducedMotion();
  const wrapperClass = `block overflow-hidden pb-[0.12em] -mb-[0.12em] ${className ?? ''}`;

  if (reduceMotion) {
    // Identical wrapper + inner span structure to the animated branch so a
    // reduced-motion client hydrates the server HTML without a tree mismatch.
    return (
      <span className={wrapperClass}>
        <span className="block">{children}</span>
      </span>
    );
  }

  return (
    <LazyMotion features={domAnimation} strict>
      <span className={wrapperClass}>
        <m.span
          className="block"
          initial={{ y: '110%' }}
          animate={{ y: '0%' }}
          transition={{ duration, ease: EASE_CINEMATIC, delay }}
        >
          {children}
        </m.span>
      </span>
    </LazyMotion>
  );
}
