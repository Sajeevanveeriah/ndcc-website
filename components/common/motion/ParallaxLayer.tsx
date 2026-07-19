'use client';

import { LazyMotion, domAnimation, m, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Scroll-linked drift wrapper for decorative section elements (background
 * typography, brand geometry). The layer travels between +drift and -drift px
 * as the section crosses the viewport — transform-only, driven by motion
 * values, no React state per scroll event.
 *
 * Static on mobile (<768px) and in reduced-motion mode.
 */
export default function ParallaxLayer({
  children,
  className,
  drift = 24,
}: {
  children: ReactNode;
  className?: string;
  drift?: number;
}) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 768px)');
    const update = () => setEnabled(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [drift, -drift]);

  if (reduceMotion) {
    return (
      <div className={className} aria-hidden="true">
        {children}
      </div>
    );
  }

  return (
    <LazyMotion features={domAnimation} strict>
      <m.div ref={ref} className={className} style={enabled ? { y } : undefined} aria-hidden="true">
        {children}
      </m.div>
    </LazyMotion>
  );
}
