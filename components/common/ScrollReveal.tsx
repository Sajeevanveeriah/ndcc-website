'use client';

import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

type ScrollRevealProps = {
  children: ReactNode;
  className?: string;
  /** Delay in seconds before the reveal starts. */
  delay?: number;
  /** Animate immediately on mount instead of waiting for viewport entry (hero content). */
  onMount?: boolean;
  /** Stagger direct children (use with <ScrollRevealItem> wrappers). */
  stagger?: boolean;
  /** Direction the content reveals from. Defaults to 'up'. */
  direction?: 'up' | 'left' | 'right';
  as?: 'div' | 'section' | 'span' | 'ul' | 'li' | 'header';
  role?: string;
  'aria-label'?: string;
};

const EASE = [0.21, 0.47, 0.32, 0.98] as const;

export default function ScrollReveal({
  children,
  className,
  delay = 0,
  onMount = false,
  stagger = false,
  direction = 'up',
  as = 'div',
  ...rest
}: ScrollRevealProps) {
  const reduceMotion = useReducedMotion();
  const Tag = m[as];

  if (reduceMotion) {
    const Plain = as;
    return <Plain className={className} {...rest}>{children}</Plain>;
  }

  const DIRECTION_MAP = {
    up:    { hidden: { opacity: 0, y: 24 },  visible: { opacity: 1, y: 0 } },
    left:  { hidden: { opacity: 0, x: -32 }, visible: { opacity: 1, x: 0 } },
    right: { hidden: { opacity: 0, x: 32 },  visible: { opacity: 1, x: 0 } },
  } as const;
  const directionBase = DIRECTION_MAP[direction];

  const variants = {
    hidden: directionBase.hidden,
    visible: {
      ...directionBase.visible,
      transition: stagger
        ? { duration: 0.5, ease: EASE, delay, staggerChildren: 0.08, delayChildren: delay }
        : { duration: 0.55, ease: EASE, delay },
    },
  };

  return (
    <LazyMotion features={domAnimation} strict>
      <Tag
        className={className}
        {...rest}
        variants={variants}
        initial="hidden"
        {...(onMount
          ? { animate: 'visible' }
          : { whileInView: 'visible', viewport: { once: true, margin: '0px 0px -60px 0px' } })}
      >
        {children}
      </Tag>
    </LazyMotion>
  );
}

export function ScrollRevealItem({
  children,
  className,
  as = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'li' | 'span';
}) {
  const reduceMotion = useReducedMotion();
  const Tag = m[as];

  if (reduceMotion) {
    const Plain = as;
    return <Plain className={className}>{children}</Plain>;
  }

  return (
    <Tag
      className={className}
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
      }}
    >
      {children}
    </Tag>
  );
}
