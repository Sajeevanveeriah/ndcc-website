'use client';

import {
  LazyMotion,
  domAnimation,
  m,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'framer-motion';
import { useEffect, useState, type PointerEvent, type ReactNode } from 'react';
import { SPRING_SOFT, TILT_MAX_DEG } from '@/lib/motion-tokens';

/**
 * Pointer-capability-aware interactive card surface: a maximum ±2° tilt plus a
 * soft local spotlight that follows the pointer, springing back to neutral on
 * leave. Purely decorative — it wraps existing card content inside whatever
 * interactive element (usually a Link) already owns the click/focus behaviour,
 * and adds no interactive semantics of its own.
 *
 * Inert (plain div) on coarse pointers and in reduced-motion mode, and until
 * the fine-pointer check has run on the client, so touch and keyboard users
 * get exactly the pre-existing experience.
 */
export default function TiltCard({ children, className }: { children: ReactNode; className?: string }) {
  const reduceMotion = useReducedMotion();
  const [finePointer, setFinePointer] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(pointer: fine)');
    const update = () => setFinePointer(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  // Normalised pointer position within the card (0..1). Springs give the
  // return-to-neutral settle.
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const glow = useMotionValue(0);
  const sx = useSpring(px, SPRING_SOFT);
  const sy = useSpring(py, SPRING_SOFT);
  const glowSpring = useSpring(glow, { stiffness: 160, damping: 26 });
  const rotateX = useTransform(sy, [0, 1], [TILT_MAX_DEG, -TILT_MAX_DEG]);
  const rotateY = useTransform(sx, [0, 1], [-TILT_MAX_DEG, TILT_MAX_DEG]);
  const spotX = useTransform(sx, (v) => `${v * 100}%`);
  const spotY = useTransform(sy, (v) => `${v * 100}%`);
  const spotlight = useMotionTemplate`radial-gradient(320px circle at ${spotX} ${spotY}, rgba(255,255,255,0.14), transparent 65%)`;

  if (reduceMotion || !finePointer) {
    return <div className={className}>{children}</div>;
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    px.set((event.clientX - rect.left) / rect.width);
    py.set((event.clientY - rect.top) / rect.height);
    glow.set(1);
  };

  const handlePointerLeave = () => {
    px.set(0.5);
    py.set(0.5);
    glow.set(0);
  };

  return (
    <LazyMotion features={domAnimation} strict>
      <m.div
        className={className ? `relative ${className}` : 'relative'}
        style={{ rotateX, rotateY, transformPerspective: 900 }}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        {children}
        <m.div
          className="pointer-events-none absolute inset-0 rounded-[inherit]"
          style={{ background: spotlight, opacity: glowSpring }}
          aria-hidden="true"
        />
      </m.div>
    </LazyMotion>
  );
}
