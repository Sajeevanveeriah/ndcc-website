'use client';

import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion } from 'framer-motion';

interface AnimatedCounterProps {
  to: number;
  duration?: number;
  className?: string;
  suffix?: string;
  prefix?: string;
}

export default function AnimatedCounter({
  to,
  duration = 1.5,
  className,
  suffix = '',
  prefix = '',
}: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduceMotion = useReducedMotion();
  // Server and first client render both show the real value: the number stays
  // readable without JavaScript, and reduced-motion clients hydrate cleanly
  // (initialising from `reduceMotion` here mismatched the server HTML and
  // threw React #425/#422 for reduced-motion users).
  const [value, setValue] = useState(to);
  const [armed, setArmed] = useState(false);

  // Arm the count-up only on clients that will actually animate.
  useEffect(() => {
    if (reduceMotion) return;
    setValue(0);
    setArmed(true);
  }, [reduceMotion]);

  useEffect(() => {
    if (!armed || !inView || reduceMotion) return;
    let start = 0;
    const end = to;
    const frameCount = Math.max(end, 1);
    const stepMs = (duration * 1000) / frameCount;
    const timer = setInterval(() => {
      start = Math.min(start + 1, end);
      setValue(start);
      if (start >= end) clearInterval(timer);
    }, stepMs);
    return () => clearInterval(timer);
  }, [armed, inView, to, duration, reduceMotion]);

  return (
    <span ref={ref} className={className}>
      {prefix}{value}{suffix}
    </span>
  );
}
